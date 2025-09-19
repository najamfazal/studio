
from firebase_functions import firestore_fn, options, scheduler_fn, https_fn
from firebase_admin import initialize_app, firestore
from datetime import datetime, timedelta
import json

# Initialize Firebase Admin SDK
initialize_app()
db = firestore.client()

# --- AFC (Automated Follow-up Cycle) Configuration ---
AFC_SCHEDULE = {
    1: 1,  # 1st follow-up on Day 1
    2: 3,  # 2nd on Day 3
    3: 5,  # 3rd on Day 5
    4: 7,  # 4th on Day 7
    5: 15, # 5th (Final) on Day 15
}

def create_task(lead_id, lead_name, description, nature, due_date=None):
    """Helper function to create a new task."""
    task = {
        "leadId": lead_id,
        "leadName": lead_name,
        "description": description,
        "completed": False,
        "createdAt": firestore.SERVER_TIMESTAMP,
        "nature": nature,
        "dueDate": due_date
    }
    db.collection("tasks").add(task)
    print(f"Task created for lead {lead_name} ({lead_id}): {description}")

@https_fn.on_request(region="us-central1", cors=True)
def importContactsJson(req: https_fn.Request) -> https_fn.Response:
    """
    An HTTP-triggered function to import contacts from a JSON payload.
    CORS is handled by the `cors=True` parameter in the decorator.
    """
    try:
        req_data = req.get_json(silent=True)
        if not req_data:
             return https_fn.Response(
                {"error": "Invalid JSON payload."},
                status=400
            )

        json_data_string = req_data.get('jsonData')
        is_new_mode = req_data.get('isNew', True)
        default_relationship = "Lead" # Hardcoded default relationship

        if not json_data_string:
            return https_fn.Response(
                {"error": "No JSON data provided."},
                status=400
            )
        
        try:
            contacts = json.loads(json_data_string)
            if not isinstance(contacts, list):
                 return https_fn.Response({"error": "JSON data must be an array of contact objects."}, status=400)
        except json.JSONDecodeError:
            return https_fn.Response({"error": "Invalid JSON format."}, status=400)
            
        leads_ref = db.collection("leads")
        
        created_count = 0
        updated_count = 0
        skipped_count = 0
        batch = db.batch()
        batch_count = 0
        BATCH_LIMIT = 499 # Firestore batch limit is 500

        for row in contacts:
            name = row.get("name", "").strip()
            email = row.get("email", "").strip()

            if not name:
                skipped_count += 1
                continue
            
            # --- Prepare Lead Data ---
            phones = []
            if row.get("phone1", "").strip():
                phones.append({"number": row.get("phone1").strip(), "type": row.get("phone1Type", "both").strip().lower() or "both"})
            if row.get("phone2", "").strip():
                phones.append({"number": row.get("phone2").strip(), "type": row.get("phone2Type", "both").strip().lower() or "both"})

            lead_data = {
                "name": name,
                "email": email,
                "phones": phones,
                "relationship": row.get("relationship", "").strip() or default_relationship,
                "commitmentSnapshot": {
                    "course": row.get("courseName", "").strip() or ""
                },
                "status": "Active",
                "afc_step": 0,
                "hasEngaged": False,
                "onFollowList": False,
                "traits": [],
                "insights": [],
                "createdAt": firestore.SERVER_TIMESTAMP,
            }
            
            # --- DB Operation ---
            existing_doc_ref = None
            if email:
                existing_docs_query = leads_ref.where("email", "==", email).limit(1).stream()
                for doc in existing_docs_query:
                    existing_doc_ref = doc.reference

            if existing_doc_ref and not is_new_mode:
                # Update existing contact
                batch.update(existing_doc_ref, lead_data)
                updated_count += 1
                batch_count += 1
            elif not existing_doc_ref:
                # Create new contact
                new_doc_ref = leads_ref.document()
                batch.set(new_doc_ref, lead_data)
                created_count += 1
                batch_count += 1
            else:
                # Skip existing contact in 'new only' mode
                skipped_count +=1
            
            # Commit batch if limit is reached
            if batch_count >= BATCH_LIMIT:
                batch.commit()
                batch = db.batch()
                batch_count = 0
        
        # Commit any remaining operations in the last batch
        if batch_count > 0:
            batch.commit()
        
        return https_fn.Response({
            "message": "Import completed successfully.",
            "created": created_count,
            "updated": updated_count,
            "skipped": skipped_count
        }, status=200)

    except Exception as e:
        print(f"Error during JSON import: {e}")
        return https_fn.Response({"error": str(e)}, status=500)


@firestore_fn.on_document_created(document="leads/{leadId}", region="us-central1")
def onLeadCreate(event: firestore_fn.Event[firestore_fn.Change]) -> None:
    """
    Initializes the Automated Follow-up Cycle (AFC) for a new lead.
    """
    lead_id = event.params.get("leadId")
    lead_data = event.data.to_dict()
    lead_name = lead_data.get("name")
    
    # Do not run for imported leads that already have status, etc.
    if lead_data.get("status"):
        print(f"Lead {lead_name} ({lead_id}) is imported or already initialized. Skipping AFC initiation.")
        return

    if not lead_id or not lead_name:
        print("Lead data is missing ID or name. Aborting AFC initiation.")
        return
        
    print(f"New lead created: {lead_name} ({lead_id}). Initializing AFC.")
    
    # Set initial AFC step and schedule the first follow-up.
    event.data.reference.update({"afc_step": 1, "status": "Active"})
    due_date = datetime.now() + timedelta(days=AFC_SCHEDULE[1])
    create_task(lead_id, lead_name, f"Day {AFC_SCHEDULE[1]} Follow-up", "Interactive", due_date)
    print(f"AFC initialized for lead {lead_name}. Day 1 follow-up task created.")


@firestore_fn.on_document_created(document="interactions/{interactionId}", region="us-central1")
def logProcessor(event: firestore_fn.Event[firestore_fn.Change]) -> None:
    """
    The 'brain' of the application. Processes new interactions, completes
    old tasks, and schedules the next appropriate follow-up.
    """
    interaction_data = event.data.to_dict()
    lead_id = interaction_data.get("leadId")

    if not lead_id:
        print("Interaction is missing a leadId. Aborting.")
        return

    lead_ref = db.collection("leads").document(lead_id)
    lead_doc = lead_ref.get()
    if not lead_doc.exists:
        print(f"Lead {lead_id} not found. Aborting.")
        return
    lead_data = lead_doc.to_dict()
    lead_name = lead_data.get("name")
    
    # --- Shared Logic: Update last interaction date for ALL logs ---
    lead_ref.update({"last_interaction_date": firestore.SERVER_TIMESTAMP})

    # --- Type-Specific Logic ---
    quick_log_type = interaction_data.get("quickLogType")
    feedback_log = interaction_data.get("feedback")
    outcome = interaction_data.get("outcome")

    # --- 1. Feedback Log Processing (AFC Reset) ---
    if feedback_log:
        print(f"Processing feedback log for lead {lead_id}.")
        if not lead_data.get("hasEngaged"):
            lead_ref.update({"hasEngaged": True})
        # This interaction implies engagement, so reset AFC
        reset_afc_for_engagement(lead_id, lead_name)
        return

    # --- 2. Outcome Log Processing ---
    if outcome:
        print(f"Processing outcome log for lead {lead_id}: {outcome}")
        if not lead_data.get("hasEngaged"):
            lead_ref.update({"hasEngaged": True})
            
        if outcome == "Info":
            # Create a procedural task and pause AFC
            notes = interaction_data.get("notes", "Provide requested information.")
            due_date = datetime.now() + timedelta(days=1)
            create_task(lead_id, lead_name, notes, "Procedural", due_date)
            lead_ref.update({"afc_step": 0}) # Pause AFC
            print(f"Paused AFC and created 'Info' task for lead {lead_id}")
            
        elif outcome == "Later":
            # Snooze AFC and create a future follow-up task
            follow_up_date_str = interaction_data.get("followUpDate")
            if follow_up_date_str:
                follow_up_date = datetime.fromisoformat(follow_up_date_str.replace("Z", "+00:00"))
                create_task(lead_id, lead_name, "Scheduled Follow-up", "Interactive", follow_up_date)
                lead_ref.update({"afc_step": 0}) # Pause AFC
                print(f"Paused AFC and created 'Later' follow-up for lead {lead_id} on {follow_up_date_str}")

        elif outcome == "Event Scheduled":
            event_details = interaction_data.get("eventDetails", {})
            event_type = event_details.get("type", "Event")
            event_time_str = event_details.get("dateTime")
            
            # If this is a reschedule, delete old event tasks first.
            if event_details.get("rescheduledFrom"):
                old_event_type = event_details.get("type")
                delete_event_tasks(lead_id, old_event_type)

            # Pause AFC by completing open interactive tasks
            complete_open_interactive_tasks(lead_id)

            if event_time_str:
                event_time = datetime.fromisoformat(event_time_str.replace("Z", "+00:00"))
                # Confirmation task for the day of the event
                confirm_due_date = event_time.replace(hour=6, minute=0, second=0, microsecond=0)
                create_task(lead_id, lead_name, f"Confirm attendance for {event_type}", "Procedural", confirm_due_date)

                # Reminder task if event is 3+ days away
                if (event_time - datetime.now()).days >= 3:
                     reminder_due_date = event_time - timedelta(days=1)
                     create_task(lead_id, lead_name, f"Remind about {event_type}", "Procedural", reminder_due_date)
                print(f"Created event tasks for lead {lead_id}")
        
        # This handles logs like 'Event Completed' or 'Event Cancelled'
        elif "Event" in interaction_data.get("notes", "") and "marked as Cancelled" in interaction_data.get("notes", ""):
            # Note: This logic is brittle. A better approach would be a dedicated field.
            event_details = interaction_data.get("eventDetails", {})
            event_type_from_log = interaction_data.get("notes", "").split(" ")[1]
            delete_event_tasks(lead_id, event_type_from_log)
            print(f"Deleted tasks for cancelled event for lead {lead_id}")
            
        return # End processing for outcomes

    # --- 3. Quick-Log & Standard Engagement Processing (AFC Logic) ---
    # Any other log type implies engagement and will affect the AFC.
    
    # Mark open Interactive tasks as complete
    complete_open_interactive_tasks(lead_id)

    # Set hasEngaged to true
    if not lead_data.get("hasEngaged"):
        lead_ref.update({"hasEngaged": True})
        print(f"Lead {lead_id} hasEngaged set to true.")

    # Process Quick Log specific state changes
    if quick_log_type:
        if quick_log_type in ["Enrolled", "Withdrawn"]:
            new_status = "Enrolled" if quick_log_type == "Enrolled" else "Withdrawn"
            lead_ref.update({"status": new_status, "afc_step": 0}) # End AFC
            print(f"Lead {lead_id} status set to {new_status}. Ending AFC process.")
            # Delete any pending follow-ups for this now-closed lead
            delete_pending_followups(lead_id)
            return
            
        elif quick_log_type == "Unresponsive":
            # This is triggered by afcDailyAdvancer, advance the step
            current_step = lead_data.get("afc_step", 0)
            next_step = current_step + 1
            if next_step in AFC_SCHEDULE:
                lead_ref.update({"afc_step": next_step})
                due_date = datetime.now() + timedelta(days=AFC_SCHEDULE[next_step])
                create_task(lead_id, lead_name, f"Day {AFC_SCHEDULE[next_step]} Follow-up", "Interactive", due_date)
            else: # After 5th attempt
                has_engaged = lead_data.get("hasEngaged", False)
                new_status = "Cooling" if has_engaged else "Dormant"
                lead_ref.update({"status": new_status, "afc_step": 0})
                print(f"AFC cycle complete for {lead_id}. Status set to {new_status}.")
            return # End here for unresponsive, don't schedule 1st follow-up

    # --- AFC Reset Logic for "Followup", "Unchanged", or other responsive logs ---
    reset_afc_for_engagement(lead_id, lead_name)


@scheduler_fn.on_schedule(schedule="30 9,18 * * *", timezone="Asia/Dubai", region="us-central1")
def afcDailyAdvancer(event: scheduler_fn.ScheduledEvent) -> None:
    """
    Runs daily to advance the AFC for leads with overdue tasks, signifying
    that a follow-up was attempted but the lead was unresponsive.
    """
    print("Running daily AFC advancer for unresponsive leads...")
    now = datetime.now()
    
    tasks_ref = db.collection("tasks")
    overdue_tasks_query = tasks_ref.where("completed", "==", False) \
                                   .where("nature", "==", "Interactive") \
                                   .where("dueDate", "<", now) \
                                   .stream()
                                   
    for task in overdue_tasks_query:
        task_data = task.to_dict()
        lead_id = task_data.get("leadId")
        
        if not lead_id:
            continue

        print(f"Processing overdue task {task.id} for lead {lead_id}.")
        
        # 1. Mark the overdue task as complete
        task.reference.update({"completed": True})
        
        # 2. Log an "Unresponsive" interaction to trigger the AFC advancement
        interaction = {
            "leadId": lead_id,
            "createdAt": firestore.SERVER_TIMESTAMP,
            "quickLogType": "Unresponsive",
            "notes": f"System generated: No response to overdue task '{task_data.get('description')}'.",
        }
        db.collection("interactions").add(interaction)
        
        print(f"Logged 'Unresponsive' for lead {lead_id} to advance AFC.")

@firestore_fn.on_document_updated(document="tasks/{taskId}", region="us-central1")
def onTaskUpdate(event: firestore_fn.Event[firestore_fn.Change]) -> None:
    """
    Triggers when a task is updated, specifically to handle AFC logic
    when an 'Info' task is completed.
    """
    task_id = event.params.get("taskId")
    data_after = event.data.after.to_dict()
    data_before = event.data.before.to_dict()

    # Check if the task was just marked as completed
    if data_before.get('completed') == False and data_after.get('completed') == True:
        # Check if it's a procedural task from an 'Info' outcome
        if data_after.get('nature') == 'Procedural':
            lead_id = data_after.get('leadId')
            lead_name = data_after.get('leadName')
            
            # A simple way to identify 'Info' tasks is by their description. This could be more robust.
            # Assuming 'Info' tasks don't use the standard "Follow-up" description.
            if lead_id and "Follow-up" not in data_after.get('description', '') and "Confirm" not in data_after.get('description', '') and "Remind" not in data_after.get('description', ''):
                print(f"Procedural task {task_id} for lead {lead_id} completed. Resetting AFC.")
                
                # Log a "Followup" interaction to reset the AFC
                interaction = {
                    "leadId": lead_id,
                    "createdAt": firestore.SERVER_TIMESTAMP,
                    "quickLogType": "Followup",
                    "notes": f"System generated: AFC reset after completion of task '{data_after.get('description')}'.",
                }
                db.collection("interactions").add(interaction)


# --- Helper Functions ---
def complete_open_interactive_tasks(lead_id: str):
    """Marks all open 'Interactive' tasks for a lead as complete."""
    tasks_ref = db.collection("tasks")
    open_tasks_query = tasks_ref.where("leadId", "==", lead_id) \
                                .where("completed", "==", False) \
                                .where("nature", "==", "Interactive").stream()
    for task in open_tasks_query:
        task.reference.update({"completed": True})
        print(f"Completed interactive task {task.id} for lead {lead_id}")

def delete_pending_followups(lead_id: str):
    """Deletes pending 'Follow-up' tasks for a lead."""
    tasks_ref = db.collection("tasks")
    pending_tasks_query = tasks_ref.where("leadId", "==", lead_id) \
                                   .where("completed", "==", False).stream()
    for task in pending_tasks_query:
         if "Follow-up" in task.to_dict().get("description", ""):
            task.reference.delete()
            print(f"Deleted pending follow-up task {task.id} for lead {lead_id}")

def delete_event_tasks(lead_id: str, event_type: str):
    """Deletes reminder and confirmation tasks for a given event."""
    if not event_type:
        print(f"Cannot delete event tasks for lead {lead_id}: event_type is missing.")
        return
        
    tasks_ref = db.collection("tasks")
    q = tasks_ref.where("leadId", "==", lead_id).where("completed", "==", False)
    
    reminder_desc = f"Remind about {event_type}"
    confirm_desc = f"Confirm attendance for {event_type}"

    for task in q.stream():
        task_data = task.to_dict()
        description = task_data.get("description", "")
        if description == reminder_desc or description == confirm_desc:
            task.reference.delete()
            print(f"Deleted event-related task {task.id} for lead {lead_id}: {description}")


def reset_afc_for_engagement(lead_id: str, lead_name: str):
    """Resets the AFC cycle for an engaged lead."""
    lead_ref = db.collection("leads").document(lead_id)
    # Delete any other pending "Follow-up" tasks to avoid duplicates
    delete_pending_followups(lead_id)
        
    # Reset AFC step and create a new 1st follow-up task for tomorrow
    lead_ref.update({"afc_step": 1}) # Start at step 1
    due_date = datetime.now() + timedelta(days=AFC_SCHEDULE[1])
    create_task(lead_id, lead_name, f"Day {AFC_SCHEDULE[1]} Follow-up", "Interactive", due_date)
    print(f"AFC reset for lead {lead_id}. New Day 1 follow-up task created.")


# --- New Function for Cascading Deletes ---
@firestore_fn.on_document_deleted(document="leads/{leadId}", region="us-central1")
def onLeadDelete(event: firestore_fn.Event[firestore_fn.Change]) -> None:
    """
    Handles the cascading deletion of a lead's associated data (tasks and interactions).
    """
    lead_id = event.params.get("leadId")
    print(f"Lead {lead_id} deleted. Cleaning up associated data...")

    batch = db.batch()
    deleted_tasks_count = 0
    deleted_interactions_count = 0

    # Delete associated tasks
    tasks_ref = db.collection("tasks")
    tasks_query = tasks_ref.where("leadId", "==", lead_id).stream()
    for task in tasks_query:
        batch.delete(task.reference)
        deleted_tasks_count += 1

    # Delete associated interactions (logs, events, etc.)
    interactions_ref = db.collection("interactions")
    interactions_query = interactions_ref.where("leadId", "==", lead_id).stream()
    for interaction in interactions_query:
        batch.delete(interaction.reference)
        deleted_interactions_count += 1
    
    # Commit the batched deletions
    if deleted_tasks_count > 0 or deleted_interactions_count > 0:
        batch.commit()
        print(f"Cleanup for lead {lead_id} complete. Deleted {deleted_tasks_count} tasks and {deleted_interactions_count} interactions.")
    else:
        print(f"No associated tasks or interactions found for lead {lead_id}.")
    

    




    

    

    

    

    
