from firebase_functions import firestore_fn, options, pubsub_fn
from firebase_admin import initialize_app, firestore
from datetime import datetime, timedelta

# Initialize Firebase Admin SDK
initialize_app()
db = firestore.client()

# --- AFC (Automated Follow-up Cycle) Configuration ---
AFC_SCHEDULE = {
    1: 1,  # 1st follow-up on Day 1
    2: 3,  # 2nd on Day 3
    3: 5,
    4: 7,
    5: 15,
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
    The 'brain' of the application, processing new interactions.
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
    
    # --- Shared Logic: Mark open Interactive tasks as complete ---
    tasks_ref = db.collection("tasks")
    open_interactive_tasks = tasks_ref.where("leadId", "==", lead_id).where("completed", "==", False).where("nature", "==", "Interactive").stream()
    for task in open_interactive_tasks:
        task.reference.update({"completed": True})
        print(f"Completed interactive task {task.id} for lead {lead_id}")

    # Update last_interaction_date for all logs
    lead_ref.update({"last_interaction_date": firestore.SERVER_TIMESTAMP})

    quick_log_type = interaction_data.get("quickLogType")
    
    # --- 1. Process Quick-Log Chips ---
    if quick_log_type:
        if quick_log_type in ["Enrolled", "Withdrawn"]:
            new_status = "Enrolled" if quick_log_type == "Enrolled" else "Withdrawn"
            lead_ref.update({"status": new_status})
            print(f"Lead {lead_id} status set to {new_status}. Ending process.")
            return
            
        elif quick_log_type == "Unresponsive":
            current_step = lead_data.get("afc_step", 0)
            next_step = current_step + 1
            if next_step <= 5:
                lead_ref.update({"afc_step": next_step})
                due_date = datetime.now() + timedelta(days=AFC_SCHEDULE[next_step])
                create_task(lead_id, lead_data['name'], f"{next_step}. Follow-up", "Interactive", due_date)
            else: # After 5th attempt
                has_engaged = lead_data.get("hasEngaged", False)
                new_status = "Cooling" if has_engaged else "Dormant"
                lead_ref.update({"status": new_status, "afc_step": 0})
                print(f"AFC cycle complete for {lead_id}. Status set to {new_status}.")

        elif quick_log_type == "Unchanged":
            lead_ref.update({"afc_step": 0})
            due_date = datetime.now() + timedelta(days=1)
            create_task(lead_id, lead_data['name'], "1. Follow-up", "Interactive", due_date)

    # --- 2. Process Detailed Logs ---
    else:
        # On any responsive log, set hasEngaged to true
        if not lead_data.get("hasEngaged"):
            lead_ref.update({"hasEngaged": True})
            print(f"Lead {lead_id} hasEngaged set to true.")

        outcome = interaction_data.get("outcome")
        if outcome == "Needs Info":
            lead_ref.update({"status": "Paused"})
            create_task(lead_id, lead_data['name'], "Send requested information", "Procedural")
            
        elif outcome == "Schedule Follow-up":
            follow_up_date_str = interaction_data.get("followUpDate")
            if follow_up_date_str:
                follow_up_date = datetime.fromisoformat(follow_up_date_str.replace('Z', '+00:00'))
                lead_ref.update({"status": "Snoozed"})
                create_task(lead_id, lead_data['name'], f"Follow-up on {follow_up_date.strftime('%Y-%m-%d')}", "Interactive", follow_up_date)
        
        elif outcome == "Event Scheduled":
            create_task(lead_id, lead_data['name'], "Send calendar invite", "Procedural")
            create_task(lead_id, lead_data['name'], "Confirm attendance 1 day prior", "Procedural")

@pubsub_fn.on_schedule(schedule="every 1 hours")
def afcEngine(event: pubsub_fn.CloudEvent) -> None:
    """
    Safety net to ensure follow-ups are created for active leads.
    """
    print("Running afcEngine...")
    now = datetime.now()
    one_day_ago = now - timedelta(days=1)

    active_leads = db.collection("leads").where("status", "==", "Active").stream()

    for lead in active_leads:
        lead_data = lead.to_dict()
        lead_id = lead.id
        
        last_interaction = lead_data.get("last_interaction_date")
        if last_interaction and last_interaction.replace(tzinfo=None) < one_day_ago:
            # Check for pending tasks
            tasks_query = db.collection("tasks").where("leadId", "==", lead_id).where("completed", "==", False).limit(1).stream()
            if not any(tasks_query):
                print(f"Lead {lead_id} is active, last contacted > 24h ago, and has no tasks. Creating 1st follow-up.")
                lead.reference.update({"afc_step": 0})
                due_date = now + timedelta(days=1)
                create_task(lead_id, lead_data['name'], "1. Follow-up", "Interactive", due_date)

@pubsub_fn.on_schedule(schedule="every 24 hours")
def relationshipEngine(event: pubsub_fn.CloudEvent) -> None:
    """
    Nurtures leads on the follow list.
    """
    print("Running relationshipEngine...")
    now = datetime.now()
    thirty_days_ago = now - timedelta(days=30)
    
    follow_leads = db.collection("leads").where("onFollowList", "==", True).stream()

    for lead in follow_leads:
        lead_data = lead.to_dict()
        last_interaction = lead_data.get("last_interaction_date")
        
        if not last_interaction or last_interaction.replace(tzinfo=None) < thirty_days_ago:
            tasks_query = db.collection("tasks").where("leadId", "==", lead.id).where("description", "==", "Reconnect").where("completed", "==", False).limit(1).stream()
            if not any(tasks_query):
                 create_task(lead.id, lead_data['name'], "Reconnect", "Procedural")

# Note: The AI-powered Trait Suggester is a future enhancement.
# It would require a Genkit flow and is not included in this initial backend refactor.
