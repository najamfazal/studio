from firebase_functions import firestore_fn, options
from firebase_admin import initialize_app, firestore

# Initialize Firebase Admin SDK
initialize_app()


@firestore_fn.on_document_created(document="leads/{leadId}")
def create_task_on_new_lead(event: firestore_fn.Event[firestore_fn.Change]) -> None:
    """
    Creates a new task when a new lead document is created.
    """
    lead_id = event.params["leadId"]
    data = event.data.to_dict()
    lead_name = data.get("name")

    if not lead_name:
        print(f"Lead {lead_id} is missing a name. Task not created.")
        return

    task = {
        "leadId": lead_id,
        "leadName": lead_name,
        "description": f"Initiate contact with {lead_name}",
        "completed": False,
        "createdAt": firestore.SERVER_TIMESTAMP,
    }

    try:
        db = firestore.client()
        db.collection("tasks").add(task)
        print(f"Task created for lead {lead_name} ({lead_id})")
    except Exception as e:
        print(f"Error creating task for lead {lead_id}: {e}")
