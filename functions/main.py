from firebase_functions import firestore_fn, options, scheduler_fn
from firebase_admin import initialize_app, firestore
from datetime import datetime, timedelta

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

    # --- AFC Reset Logic for "Unchanged" or other responsive logs ---
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


@scheduler_fn.on_schedule(schedule="0 9-20 * * *", timezone="Asia/Dubai")
def afcEngine(event: scheduler_fn.ScheduledEvent) -> None:
    """
    Safety net to initialize AFC for new leads or catch any orphaned Active leads.
    """
    print("Running afcEngine safety net...")
    now = datetime.now()
    one_day_ago = now - timedelta(days=1)

    # Find active leads with no interaction history (brand new)
    new_leads_query = db.collection("leads").where("status", "==", "Active").where("last_interaction_date", "==", None)
    for lead in new_leads_query.stream():
        tasks_query = db.collection("tasks").where("leadId", "==", lead.id).limit(1).stream()
        if not any(tasks_query):
            print(f"New lead {lead.id} has no tasks. Initializing AFC.")
            lead.reference.update({"afc_step": 1})
            due_date = now + timedelta(days=AFC_SCHEDULE[1])
            create_task(lead.id, lead.to_dict()['name'], f"Day {AFC_SCHEDULE[1]} Follow-up", "Interactive", due_date)

    # Find active leads who were missed by the system somehow
    active_leads_query = db.collection("leads").where("status", "==", "Active").where("last_interaction_date", "<", one_day_ago)
    for lead in active_leads_query.stream():
        tasks_query = db.collection("tasks").where("leadId", "==", lead.id).where("completed", "==", False).limit(1).stream()
        if not any(tasks_query):
            print(f"Orphaned lead {lead.id} has no tasks. Resetting AFC.")
            lead.reference.update({"afc_step": 1})
            due_date = now + timedelta(days=AFC_SCHEDULE[1])
            create_task(lead.id, lead.to_dict()['name'], f"Day {AFC_SCHEDULE[1]} Follow-up", "Interactive", due_date)


@scheduler_fn.on_schedule(schedule="every 24 hours")
def relationshipEngine(event: scheduler_fn.ScheduledEvent) -> None:
    """
    Nurtures leads on the follow list by creating Reconnect tasks.
    """
    print("Running relationshipEngine...")
    now = datetime.now()
    thirty_days_ago = now - timedelta(days=30)
    
    follow_leads_query = db.collection("leads").where("onFollowList", "==", True)

    for lead in follow_leads_query.stream():
        lead_data = lead.to_dict()
        last_interaction = lead_data.get("last_interaction_date")
        
        # Check if last interaction was more than 30 days ago
        if not last_interaction or last_interaction.replace(tzinfo=None) < thirty_days_ago:
            # Check if a "Reconnect" task already exists
            reconnect_task_query = db.collection("tasks").where("leadId", "==", lead.id).where("completed", "==", False)
            if not any(task.to_dict().get("description") == "Reconnect" for task in reconnect_task_query.stream()):
                 print(f"Creating Reconnect task for lead {lead.id}")
                 create_task(lead.id, lead_data['name'], "Reconnect", "Procedural")

# Note: The AI-powered Trait Suggester is a future enhancement.
# It would require a Genkit flow and is not included in this initial backend refactor.
