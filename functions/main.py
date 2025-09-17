from firebase_functions import firestore_fn, options, scheduler_fn
from firebase_admin import initialize_app, firestore
from datetime import datetime, timedelta

# Initialize Firebase Admin SDK
initialize_app()
db = firestore.client()
options.set_global_options(region="us-central1")


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

@firestore_fn.on_document_created(document="leads/{leadId}")
def onLeadCreate(event: firestore_fn.Event[firestore_fn.Change]) -> None:
    """
    Initializes the Automated Follow-up Cycle (AFC) for a new lead.
    """
    lead_id = event.params.get("leadId")
    lead_data = event.data.to_dict()
    lead_name = lead_data.get("name")
    
    if not lead_id or not lead_name:
        print("Lead data is missing ID or name. Aborting AFC initiation.")
        return
        
    print(f"New lead created: {lead_name} ({lead_id}). Initializing AFC.")
    
    # Set initial AFC step and schedule the first follow-up.
    event.data.reference.update({"afc_step": 1})
    due_date = datetime.now() + timedelta(days=AFC_SCHEDULE[1])
    create_task(lead_id, lead_name, f"Day {AFC_SCHEDULE[1]} Follow-up", "Interactive", due_date)
    print(f"AFC initialized for lead {lead_name}. Day 1 follow-up task created.")


@firestore_fn.on_document_updated(document="tasks/{taskId}")
def onTaskUpdate(event: firestore_fn.Event[firestore_fn.Change]) -> None:
    """
    Triggers when a task is updated, specifically to handle AFC advancement
    when a follow-up task is marked as complete.
    """
    before_data = event.data.before.to_dict()
    after_data = event.data.after.to_dict()

    # Check if the task was just marked as completed
    if before_data.get("completed") == False and after_data.get("completed") == True:
        task_desc = after_data.get("description", "")
        # Check if it was an interactive follow-up task
        if "Follow-up" in task_desc and after_data.get("nature") == "Interactive":
            lead_id = after_data.get("leadId")
            if lead_id:
                print(f"Follow-up task '{task_desc}' completed for lead {lead_id}. Logging interaction to advance AFC.")
                # Log a "Followup" interaction to trigger the logProcessor
                interaction = {
                    "leadId": lead_id,
                    "createdAt": firestore.SERVER_TIMESTAMP,
                    "quickLogType": "Followup",
                    "notes": f"System generated: Completed task '{task_desc}'.",
                }
                db.collection("interactions").add(interaction)


@firestore_fn.on_document_created(document="interactions/{interactionId}")
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
    
    # --- Shared Logic: Update last interaction date for ALL logs ---
    lead_ref.update({"last_interaction_date": firestore.SERVER_TIMESTAMP})

    # --- Type-Specific Logic ---
    quick_log_type = interaction_data.get("quickLogType")
    feedback_log = interaction_data.get("feedback")
    outcome = interaction_data.get("outcome")

    # --- 1. Feedback Log Processing (No AFC change) ---
    if feedback_log:
        print(f"Processing feedback log for lead {lead_id}. No tasks created.")
        # Mark open interactive tasks as complete since feedback implies engagement
        tasks_ref = db.collection("tasks")
        open_tasks_query = tasks_ref.where("leadId", "==", lead_id).where("completed", "==", False).stream()
        for task in open_tasks_query:
            if task.to_dict().get("nature") == "Interactive":
                task.reference.update({"completed": True})
                print(f"Completed interactive task {task.id} for lead {lead_id} due to new feedback.")
        if not lead_data.get("hasEngaged"):
            lead_ref.update({"hasEngaged": True})
        return # End processing here

    # --- 2. Event Scheduled Log Processing (No AFC change) ---
    if outcome == "Event Scheduled":
        create_task(lead_id, lead_data['name'], "Send calendar invite", "Procedural")
        create_task(lead_id, lead_data['name'], "Confirm attendance 1 day prior", "Procedural")
        # Mark open interactive tasks as complete
        tasks_ref = db.collection("tasks")
        open_tasks_query = tasks_ref.where("leadId", "==", lead_id).where("completed", "==", False).stream()
        for task in open_tasks_query:
            if task.to_dict().get("nature") == "Interactive":
                task.reference.update({"completed": True})
                print(f"Completed interactive task {task.id} for lead {lead_id} due to event scheduling.")
        if not lead_data.get("hasEngaged"):
            lead_ref.update({"hasEngaged": True})
        return # End processing here

    # --- 3. Quick-Log & Standard Engagement Processing (AFC Logic) ---
    # Any other log type implies engagement and will affect the AFC.
    
    # Mark open Interactive tasks as complete
    tasks_ref = db.collection("tasks")
    open_tasks_query = tasks_ref.where("leadId", "==", lead_id).where("completed", "==", False).stream()
    for task in open_tasks_query:
        if task.to_dict().get("nature") == "Interactive":
            task.reference.update({"completed": True})
            print(f"Completed interactive task {task.id} for lead {lead_id}")

    # Set hasEngaged to true
    if not lead_data.get("hasEngaged"):
        lead_ref.update({"hasEngaged": True})
        print(f"Lead {lead_id} hasEngaged set to true.")

    # Process Quick Log specific state changes
    if quick_log_type:
        if quick_log_type in ["Enrolled", "Withdrawn"]:
            new_status = "Enrolled" if quick_log_type == "Enrolled" else "Withdrawn"
            lead_ref.update({"status": new_status, "afc_step": 0})
            print(f"Lead {lead_id} status set to {new_status}. Ending AFC process.")
            # Delete any pending follow-ups for this now-closed lead
            pending_tasks_query = tasks_ref.where("leadId", "==", lead_id).where("completed", "==", False).stream()
            for task in pending_tasks_query:
                 if "Follow-up" in task.to_dict().get("description", ""):
                    task.reference.delete()
            return
            
        elif quick_log_type == "Unresponsive":
            current_step = lead_data.get("afc_step", 0)
            next_step = current_step + 1
            if next_step in AFC_SCHEDULE:
                lead_ref.update({"afc_step": next_step})
                due_date = datetime.now() + timedelta(days=AFC_SCHEDULE[next_step])
                create_task(lead_id, lead_data['name'], f"Day {AFC_SCHEDULE[next_step]} Follow-up", "Interactive", due_date)
            else: # After 5th attempt
                has_engaged = lead_data.get("hasEngaged", False)
                new_status = "Cooling" if has_engaged else "Dormant"
                lead_ref.update({"status": new_status, "afc_step": 0})
                print(f"AFC cycle complete for {lead_id}. Status set to {new_status}.")
            return # End here for unresponsive, don't schedule 1st follow-up

    # --- AFC Reset Logic for "Followup", "Unchanged", or other responsive logs ---
    # Delete any other pending "Follow-up" tasks to avoid duplicates
    pending_follow_ups_query = tasks_ref.where("leadId", "==", lead_id).where("completed", "==", False).stream()
    for task in pending_follow_ups_query:
        task_data = task.to_dict()
        if "Follow-up" in task_data.get("description", "") and task_data.get("nature") == "Interactive":
            print(f"Deleting pending follow-up task {task.id} to reset AFC.")
            task.reference.delete()
        
    # Reset AFC step and create a new 1st follow-up task for tomorrow
    lead_ref.update({"afc_step": 1}) # Start at step 1
    due_date = datetime.now() + timedelta(days=AFC_SCHEDULE[1])
    create_task(lead_id, lead_data['name'], f"Day {AFC_SCHEDULE[1]} Follow-up", "Interactive", due_date)
    print(f"AFC reset for lead {lead_id}. New Day 1 follow-up task created.")


@scheduler_fn.on_schedule(schedule="30 9,18 * * *", timezone="Asia/Dubai")
def afcDailyAdvancer(event: scheduler_fn.ScheduledEvent) -> None:
    """
    Runs daily to advance the AFC for leads with overdue tasks, signifying
    that a follow-up was attempted but the lead was unresponsive.
    """
    print("Running daily AFC advancer for unresponsive leads...")
    now = datetime.now()
    
    # Find all open, interactive tasks that are overdue
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
        # The logProcessor function will handle the rest.
        interaction = {
            "leadId": lead_id,
            "createdAt": firestore.SERVER_TIMESTAMP,
            "quickLogType": "Unresponsive",
            "notes": f"System generated: No response to overdue task '{task_data.get('description')}'.",
        }
        db.collection("interactions").add(interaction)
        
        print(f"Logged 'Unresponsive' for lead {lead_id} to advance AFC.")

    
