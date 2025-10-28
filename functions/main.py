
from firebase_functions import firestore_fn, options, scheduler_fn, https_fn
from firebase_admin import initialize_app, firestore, get_app
from datetime import datetime, timedelta, timezone
import json
import io
import csv
import re
# import google.generativeai as genai
import os
from google.cloud import secretmanager

# --- Environment Setup ---
# Initialize Firebase Admin SDK
initialize_app()
db = firestore.client()

def access_secret_version(secret_id, version_id="latest"):
    """
    Access the payload for the given secret version and return it.
    The project ID is retrieved dynamically from the initialized Firebase app.
    """
    try:
        project_id = get_app().project_id
        client = secretmanager.SecretManagerServiceClient()
        name = f"projects/{project_id}/secrets/{secret_id}/versions/{version_id}"
        response = client.access_secret_version(request={"name": name})
        payload = response.payload.data.decode("UTF-8")
        if not payload:
             print(f"Warning: Secret {secret_id} found but payload is empty. This may cause issues.")
             return None
        return payload
    except Exception as e:
        print(f"Error accessing secret {secret_id}: {e}. This function may fail if the secret is required.")
        return None


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

def normalize_phone(phone_number) -> str:
    """Strips all non-digit characters from a phone number string."""
    if not phone_number:
        return ""
    # Explicitly cast to string first to handle integer inputs from JSON
    return re.sub(r'\D', '', str(phone_number))

def generate_search_keywords(name, phones, quote_lines):
    """Generates a map of n-grams for a lead's name, phones, and courses."""
    keywords = set()
    MAX_KEYWORD_LENGTH = 100  # Prevent Firestore field path errors

    def add_ngrams(text):
        lower_text = str(text).lower() # Ensure text is a string
        for i in range(len(lower_text)):
            for j in range(i + 1, min(i + MAX_KEYWORD_LENGTH, len(lower_text)) + 1):
                ngram = lower_text[i:j]
                if len(ngram) <= MAX_KEYWORD_LENGTH:
                    keywords.add(ngram)

    # Add name n-grams
    if name:
        add_ngrams(name)
    
    # Add phone n-grams
    for phone in phones:
        if phone.get('number'):
            add_ngrams(str(phone['number']))
    
    # Add course n-grams from quote lines
    for quote_line in quote_lines:
        for course in quote_line.get('courses', []):
            if course:
                add_ngrams(course)

    return {kw: True for kw in keywords}

@https_fn.on_call(region="us-central1", timeout_sec=540, memory=options.MemoryOption.MB_1024)
def importContactsJson(req: https_fn.CallableRequest) -> dict:
    """
    Imports contacts from JSON. Supports a dry run mode for previewing changes.
    """
    try:
        if not req.data:
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="Request payload is missing.")

        json_data_string = req.data.get('jsonData')
        is_new_mode = req.data.get('isNew', True)
        is_dry_run = req.data.get('dryRun', False)
        default_relationship = "Lead"

        if not json_data_string:
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="No JSON data provided.")
        
        try:
            contacts = json.loads(json_data_string)
            if not isinstance(contacts, list):
                raise ValueError("JSON data must be an array of contact objects.")
        except (json.JSONDecodeError, ValueError) as e:
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message=f"Invalid JSON format: {e}")
            
        leads_ref = db.collection("leads")
        
        created_count = 0
        updated_count = 0
        skipped_count = 0
        preview_data = []
        skipped_data = []

        if not is_dry_run:
            batch = db.batch()
            batch_count = 0
            BATCH_LIMIT = 499

        for row in contacts:
            # --- CORE FIELDS ---
            name = str(row.get("name", row.get("Name", ""))).strip()
            email = str(row.get("email", row.get("Email", ""))).strip().lower()
            relationship = str(row.get("relationship", default_relationship))
            if not relationship:
                relationship = default_relationship
            relationship = relationship.strip()


            if not name:
                skipped_count += 1
                if is_dry_run:
                    skipped_record = row.copy()
                    skipped_record['reason'] = 'Missing name'
                    skipped_data.append(skipped_record)
                continue

            # --- PHONE & EMAIL PARSING (MANDATORY) ---
            phones = []
            phone1_num = normalize_phone(row.get("Phone1", row.get("phone1")))
            if phone1_num:
                phone1_type_raw = str(row.get("Phone1 Type", row.get("phone1_type", "both"))).strip().lower()
                phone1_type = phone1_type_raw if phone1_type_raw in ["calling", "chat", "both"] else "both"
                phones.append({"number": phone1_num, "type": phone1_type})

            phone2_num = normalize_phone(row.get("Phone2", row.get("phone2")))
            if phone2_num:
                phone2_type_raw = str(row.get("Phone2 Type", row.get("phone2_type", "both"))).strip().lower()
                phone2_type = phone2_type_raw if phone2_type_raw in ["calling", "chat", "both"] else "both"
                phones.append({"number": phone2_num, "type": phone2_type})
            
            if not phones:
                phone_generic = normalize_phone(row.get("phone", row.get("Phone", "")))
                if phone_generic:
                    phones.append({"number": phone_generic, "type": "both"})
            
            # --- DYNAMIC QUOTE LINE MAPPING ---
            quote_lines = []
            deal_data = {}
            for key, value in row.items():
                match = re.match(r'd(\d+)(.*)', key, re.IGNORECASE)
                if match:
                    deal_num = match.group(1)
                    prop_name = match.group(2).lower()
                    if deal_num not in deal_data:
                        deal_data[deal_num] = {}
                    deal_data[deal_num][prop_name] = value

            for deal_num in sorted(deal_data.keys()):
                data = deal_data[deal_num]
                price_str = str(data.get('price', '0')).strip()
                try:
                    price = float(price_str) if price_str else 0.0
                except ValueError:
                    price = 0.0
                
                variant = {
                    "id": f"v_{deal_num}_{int(datetime.now().timestamp())}",
                    "mode": str(data.get('mode', 'Online')).strip(),
                    "format": str(data.get('format', '1-1')).strip(),
                    "price": price,
                }
                
                quote_line = {
                    "id": f"ql_{deal_num}_{int(datetime.now().timestamp())}",
                    "courses": [c.strip() for c in str(data.get('courses', '')).split(',')] if data.get('courses') else [],
                    "variants": [variant] # The old deal format becomes a single variant
                }
                quote_lines.append(quote_line)

            # --- OPTIONAL FIELDS ---
            notes = str(row.get("notes", row.get("Notes", ""))).strip()
            price = str(row.get("price", "")).strip()
            has_engaged = row.get("hasEngaged", False)
            has_conversations = row.get("hasConversations", False)
            on_follow_list = row.get("onFollowList", False)
            traits = row.get("traits", [])
            insights = row.get("insights", [])
            inquired_for = str(row.get("inquiredFor", "")).strip()
            
            # --- NEW SOURCE AND ASSIGNEDAT FIELDS ---
            source = str(row.get("source", row.get("Source", ""))).strip()
            assigned_at_raw = row.get("assignedAt", row.get("Assigned", ""))
            assigned_at = None
            if assigned_at_raw:
                # Add multiple date formats to try
                date_formats = [
                    '%Y-%m-%d',          # 2025-09-08
                    '%d-%b-%Y',          # 08-Sep-2025
                    '%d/%m/%Y',          # 08/09/2025
                    '%m/%d/%Y',          # 09/08/2025
                ]
                date_str = str(assigned_at_raw)
                for fmt in date_formats:
                    try:
                        assigned_at = datetime.strptime(date_str, fmt).isoformat()
                        break 
                    except ValueError:
                        continue
                
                if not assigned_at:
                    try:
                       assigned_at = datetime.fromisoformat(date_str.replace("Z", "+00:00")).isoformat()
                    except (ValueError, TypeError):
                        print(f"Could not parse date: {assigned_at_raw}")
                        assigned_at = None


            # --- STATUS MAPPING ---
            status = str(row.get("status", "")).strip()
            if not status:
                if relationship.lower() == "learner":
                    status = "Enrolled"
                else:
                    status = "Active"

            search_keywords = generate_search_keywords(name, phones, quote_lines)
            
            lead_data = {
                "name": name, "email": email, "phones": phones,
                "relationship": relationship,
                "commitmentSnapshot": {
                    "quoteLines": quote_lines,
                    "keyNotes": notes,
                    "inquiredFor": inquired_for,
                },
                "status": status, "afc_step": 0, "hasEngaged": has_engaged,
                "hasConversations": has_conversations,
                "onFollowList": on_follow_list, "traits": traits, "insights": insights, 
                "interactions": [],
                "createdAt": firestore.SERVER_TIMESTAMP,
                "search_keywords": search_keywords,
                "source": source,
                "assignedAt": assigned_at if assigned_at else datetime.now(timezone.utc).isoformat(),
            }
            
            # --- RELATIONSHIP-BASED LOGIC ---
            if relationship.lower() == "lead":
                afc_stage_day = row.get("autoLogInitiated")
                if isinstance(afc_stage_day, int) and afc_stage_day in AFC_SCHEDULE:
                    lead_data["afc_step"] = afc_stage_day
                    lead_data["autoLogInitiated"] = True # For preview
                else:
                    now_iso = datetime.now(timezone.utc).isoformat()
                    initiated_log = {
                        "id": f"import_init_{int(datetime.now().timestamp())}",
                        "createdAt": now_iso,
                        "quickLogType": "Initiated",
                        "notes": "Automatically logged upon import.",
                    }
                    lead_data["interactions"].append(initiated_log)

            elif relationship.lower() == "learner":
                # Task creation will happen post-import if it's a new learner
                pass
                
            # For 'trainer' and 'other', no special logic is needed, they are just copied.

            # --- DATABASE OPERATIONS ---
            existing_doc_ref = None
            
            # Prioritize email check as it's more likely to be unique
            if email:
                existing_docs_query = leads_ref.where("email", "==", email).limit(1).stream()
                for doc in existing_docs_query:
                    existing_doc_ref = doc.reference
                    break
            
            # If not found by email, check by phone number
            if not existing_doc_ref and phones:
                first_phone_number = phones[0]['number']
                phone_query = leads_ref.where("phones", "array_contains_any", [
                    {"number": first_phone_number, "type": "both"},
                    {"number": first_phone_number, "type": "calling"},
                    {"number": first_phone_number, "type": "chat"},
                ]).limit(1)
                existing_docs_stream = phone_query.stream()
                for doc in existing_docs_stream:
                    existing_doc_ref = doc.reference
                    break


            if is_dry_run:
                if existing_doc_ref and is_new_mode:
                    skipped_count += 1
                    skipped_record = row.copy()
                    skipped_record['reason'] = 'Contact with same email or phone already exists'
                    skipped_data.append(skipped_record)
                elif existing_doc_ref:
                    updated_count += 1
                else:
                    created_count += 1

                if len(preview_data) < 3 and not (existing_doc_ref and is_new_mode):
                    preview_lead_data = lead_data.copy()
                    preview_lead_data.pop("createdAt", None)
                    preview_lead_data.pop("search_keywords", None) 
                    preview_data.append(preview_lead_data)
            else: # Not a dry run
                if existing_doc_ref:
                    if is_new_mode:
                        skipped_count += 1
                    else:
                        updated_count += 1
                        batch.update(existing_doc_ref, lead_data)
                        batch_count += 1
                else: # New contact
                    created_count += 1
                    new_doc_ref = leads_ref.document()
                    batch.set(new_doc_ref, lead_data)
                    
                    if relationship.lower() == "lead" and lead_data.get("afc_step") in AFC_SCHEDULE:
                        afc_day = AFC_SCHEDULE[lead_data["afc_step"]]
                        due_date = datetime.now() + timedelta(days=afc_day)
                        create_task(new_doc_ref.id, name, f"Day {afc_day} Follow-up", "Interactive", due_date)
                    elif relationship.lower() == "learner":
                         create_task(new_doc_ref.id, name, f"set schedule and plan for {name}", "Procedural", datetime.now())

                    batch_count += 1

                if batch_count >= BATCH_LIMIT:
                    batch.commit()
                    batch = db.batch()
                    batch_count = 0
        
        if is_dry_run:
            return {
                "message": "Dry run completed successfully.",
                "created": created_count,
                "updated": updated_count,
                "skipped": skipped_count,
                "previewData": preview_data,
                "skippedData": skipped_data
            }
        else:
            if batch_count > 0:
                batch.commit()
            return {
                "message": "Import completed successfully.",
                "created": created_count,
                "updated": updated_count,
                "skipped": skipped_count
            }

    except https_fn.HttpsError as e:
        raise e
    except Exception as e:
        print(f"Error during JSON import: {e}")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=f"An internal error occurred: {e}")


@firestore_fn.on_document_created(document="leads/{leadId}", region="us-central1")
def onLeadCreate(event: firestore_fn.Event[firestore_fn.Change]) -> None:
    """
    Handles task creation for new leads.
    - For imported leads, creates an immediate "Send initial contact" task.
    - For manually created leads, initializes the AFC cycle.
    """
    lead_id = event.params.get("leadId")
    lead_data = event.data.to_dict()
    lead_name = lead_data.get("name")
    
    if not lead_id or not lead_name:
        print("Lead data is missing ID or name. Aborting task creation.")
        return

    # If lead has afc_step > 0, it was imported with a specific stage.
    if lead_data.get("afc_step", 0) > 0:
        # The task for this is now handled during the import transaction itself.
        print(f"Imported lead {lead_name} created with AFC step {lead_data['afc_step']}. Task created during import.")
        return
    
    # If lead has a status, it's from an import without a specific AFC stage.
    if lead_data.get("status"):
        if lead_data.get("relationship", "Lead").lower() == "lead":
            print(f"Imported lead created: {lead_name} ({lead_id}). Creating initial contact task.")
            due_date = datetime.now() # Due today
            create_task(lead_id, lead_name, "Send initial contact", "Interactive", due_date)
        
    # If no status, it's a manually created lead.
    else:
        print(f"New lead created manually: {lead_name} ({lead_id}). Initializing AFC.")
        # Set initial AFC step and schedule the first follow-up.
        event.data.reference.update({"afc_step": 1, "status": "Active"})
        due_date = datetime.now() + timedelta(days=AFC_SCHEDULE[1])
        create_task(lead_id, lead_name, f"Day {AFC_SCHEDULE[1]} Follow-up", "Interactive", due_date)
        print(f"AFC initialized for lead {lead_name}. Day 1 follow-up task created.")


@firestore_fn.on_document_updated(document="leads/{leadId}", region="us-central1")
def logProcessor(event: firestore_fn.Event[firestore_fn.Change]) -> None:
    """
    The 'brain' of the application. Processes new interactions and payment plans,
    completes old tasks, and schedules the next appropriate follow-up.
    Triggers when the `interactions` or `paymentPlan` field is updated.
    """
    data_after = event.data.after.to_dict()
    data_before = event.data.before.to_dict()
    lead_id = event.params.get("leadId")
    lead_name = data_after.get("name")
    lead_ref = event.data.after.reference

    # --- Payment Plan Task Processing ---
    plan_after = data_after.get("paymentPlan")
    plan_before = data_before.get("paymentPlan")

    if plan_after != plan_before:
        print(f"Payment plan updated for lead {lead_id}. Syncing tasks.")
        sync_payment_plan_tasks(lead_id, lead_name, plan_before, plan_after)


    # --- Interaction Processing ---
    interactions_after = data_after.get("interactions", [])
    interactions_before = data_before.get("interactions", [])

    # Check if a new interaction was added.
    if len(interactions_after) <= len(interactions_before):
        return
    
    # The new interaction is the last one in the array.
    interaction_data = interactions_after[-1]
    
    if not lead_id or not lead_name:
        print("Interaction is missing a leadId or leadName. Aborting.")
        return

    # --- Shared Logic: Update last interaction date for ALL logs ---
    lead_ref.update({"last_interaction_date": firestore.SERVER_TIMESTAMP})

    # --- Type-Specific Logic ---
    quick_log_type = interaction_data.get("quickLogType")
    feedback_log = interaction_data.get("feedback")
    outcome = interaction_data.get("outcome")
    info_logs = interaction_data.get("infoLogs")

    # --- 1. Informational Log Processing (No AFC Change) ---
    if feedback_log or info_logs:
        print(f"Processing informational log for lead {lead_id}.")
        if not data_after.get("hasEngaged"):
            lead_ref.update({"hasEngaged": True})
        # This type of interaction is purely for insight, it does not reset the AFC.
        return

    # --- 2. Outcome Log Processing ---
    if outcome:
        print(f"Processing outcome log for lead {lead_id}: {outcome}")
        if not data_after.get("hasEngaged"):
            lead_ref.update({"hasEngaged": True})
            
        if outcome == "Info":
            # Create a procedural task and pause AFC
            notes = interaction_data.get("notes", "Provide requested information.")
            due_date = datetime.now() + timedelta(days=1)
            create_task(lead_id, lead_name, notes, "Procedural", due_date)
            lead_ref.update({"afc_step": 0}) # Pause AFC
            print(f"Paused AFC and created 'Info' task for lead {lead_id}")
            
        elif outcome == "Later":
            # If lead is new (afc_step 0), mark as engaged first.
            if data_after.get("afc_step", 0) == 0 and not data_after.get("hasEngaged"):
                lead_ref.update({"hasEngaged": True})
            
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
    if not data_after.get("hasEngaged"):
        lead_ref.update({"hasEngaged": True})
        print(f"Lead {lead_id} hasEngaged set to true.")

    # Process Quick Log specific state changes
    if quick_log_type:
        if quick_log_type in ["Enrolled", "Withdrawn", "Invalid"]:
            if quick_log_type == "Enrolled":
                new_status = "Enrolled"
                lead_ref.update({"status": new_status, "afc_step": 0, "relationship": "Learner"})
                # Create a task to set up the new learner
                due_date = datetime.now() + timedelta(days=1)
                create_task(lead_id, lead_name, f"For {lead_name} create schedule, trainer and payplan", "Procedural", due_date)
            else:
                new_status = "Withdrawn" if quick_log_type == "Withdrawn" else "Invalid"
                lead_ref.update({"status": new_status, "afc_step": 0})
            
            print(f"Lead {lead_id} status set to {new_status}. Ending AFC process.")
            # Delete any pending follow-ups for this now-closed lead
            delete_pending_followups(lead_id)
            return
            
        elif quick_log_type == "Unresponsive":
            current_step = data_after.get("afc_step", 0)
            has_engaged = data_after.get("hasEngaged", False)
            
            # If lead was engaged and unresponsive on Day 3 follow-up, set to Cooling
            if current_step == 2 and has_engaged:
                lead_ref.update({"status": "Cooling", "afc_step": 0})
                print(f"Engaged lead {lead_id} unresponsive on Day 3. Status set to Cooling.")
                return

            next_step = current_step + 1
            if next_step in AFC_SCHEDULE:
                lead_ref.update({"afc_step": next_step})
                due_date = datetime.now() + timedelta(days=AFC_SCHEDULE[next_step])
                create_task(lead_id, lead_name, f"Day {AFC_SCHEDULE[next_step]} Follow-up", "Interactive", due_date)
            else: # After final attempt
                new_status = "Cooling" if has_engaged else "Dormant"
                lead_ref.update({"status": new_status, "afc_step": 0})
                print(f"AFC cycle complete for {lead_id}. Status set to {new_status}.")
            return

    # --- AFC Reset Logic for "Followup", "Unchanged", or other responsive logs ---
    reset_afc_for_engagement(lead_id, lead_name, lead_ref)


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
            "id": f"sys_{task.id}",
            "createdAt": firestore.SERVER_TIMESTAMP,
            "quickLogType": "Unresponsive",
            "notes": f"System generated: No response to overdue task '{task_data.get('description')}'.",
        }
        
        # Add interaction to the lead's array
        lead_ref = db.collection("leads").document(lead_id)
        lead_ref.update({
            "interactions": firestore.ArrayUnion([interaction])
        })
        
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
                    "id": f"sys_task_{task_id}",
                    "createdAt": firestore.SERVER_TIMESTAMP,
                    "quickLogType": "Followup",
                    "notes": f"System generated: AFC reset after completion of task '{data_after.get('description')}'.",
                }
                
                lead_ref = db.collection("leads").document(lead_id)
                lead_ref.update({
                    "interactions": firestore.ArrayUnion([interaction])
                })


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


def reset_afc_for_engagement(lead_id: str, lead_name: str, lead_ref):
    """Resets the AFC cycle for an engaged lead."""
    # Delete any other pending "Follow-up" tasks to avoid duplicates
    delete_pending_followups(lead_id)
        
    # Reset AFC step and create a new 1st follow-up task for tomorrow
    lead_ref.update({"afc_step": 1}) # Start at step 1
    due_date = datetime.now() + timedelta(days=AFC_SCHEDULE[1])
    create_task(lead_id, lead_name, f"Day {AFC_SCHEDULE[1]} Follow-up", "Interactive", due_date)
    print(f"AFC reset for lead {lead_id}. New Day 1 follow-up task created.")


def sync_payment_plan_tasks(lead_id: str, lead_name: str, plan_before, plan_after):
    """
    Creates, updates, or deletes tasks based on changes to a lead's payment plan.
    """
    installments_before = {inst['id']: inst for inst in plan_before.get('installments', [])} if plan_before else {}
    installments_after = {inst['id']: inst for inst in plan_after.get('installments', [])} if plan_after else {}
    
    batch = db.batch()
    tasks_ref = db.collection("tasks")

    # --- Create or Update tasks ---
    for inst_id, inst_after in installments_after.items():
        inst_before = installments_before.get(inst_id)
        
        # Only create reminder for unpaid installments
        if inst_after.get('status') == 'Unpaid':
            due_date_str = inst_after.get('dueDate')
            if not due_date_str:
                continue

            reminder_due_date = datetime.fromisoformat(due_date_str.replace("Z", "+00:00")) - timedelta(days=1)
            amount = inst_after.get('amount', 0)
            desc = f"Payment reminder: installment of {amount} due tomorrow."
            
            # Find existing task for this installment
            task_query = tasks_ref.where("leadId", "==", lead_id).where("description", "==", desc).limit(1).stream()
            existing_task = next(task_query, None)
            
            if existing_task:
                # Update due date if it changed
                task_data = existing_task.to_dict()
                if task_data.get('dueDate').date() != reminder_due_date.date():
                    batch.update(existing_task.reference, {"dueDate": reminder_due_date})
                    print(f"Updating task for installment {inst_id}")
            else:
                 # Create new task
                new_task_ref = tasks_ref.document()
                batch.set(new_task_ref, {
                    "leadId": lead_id,
                    "leadName": lead_name,
                    "description": desc,
                    "completed": False,
                    "createdAt": firestore.SERVER_TIMESTAMP,
                    "nature": "Procedural",
                    "dueDate": reminder_due_date
                })
                print(f"Creating task for installment {inst_id}")
    
    # --- Delete tasks for removed or paid installments ---
    for inst_id, inst_before in installments_before.items():
        inst_after = installments_after.get(inst_id)
        
        is_removed = not inst_after
        is_paid = inst_after and inst_after.get('status') == 'Paid'
        
        if is_removed or is_paid:
            amount = inst_before.get('amount', 0)
            desc = f"Payment reminder: installment of {amount} due tomorrow."
            task_query = tasks_ref.where("leadId", "==", lead_id).where("description", "==", desc).stream()
            for task in task_query:
                batch.delete(task.reference)
                print(f"Deleting task for installment {inst_id} (Reason: {'Paid' if is_paid else 'Removed'})")
    
    batch.commit()


@firestore_fn.on_document_deleted(document="leads/{leadId}", region="us-central1")
def onLeadDelete(event: firestore_fn.Event[firestore_fn.Change]) -> None:
    """
    Handles the cascading deletion of a lead's associated tasks.
    """
    lead_id = event.params.get("leadId")
    print(f"Lead {lead_id} deleted. Cleaning up associated tasks...")
    
    # --- Task Deletion ---
    batch = db.batch()
    deleted_tasks_count = 0
    tasks_ref = db.collection("tasks")
    tasks_query = tasks_ref.where("leadId", "==", lead_id).stream()
    for task in tasks_query:
        batch.delete(task.reference)
        deleted_tasks_count += 1
    
    if deleted_tasks_count > 0:
        batch.commit()
        print(f"Cleanup for lead {lead_id} complete. Deleted {deleted_tasks_count} tasks.")
    else:
        print(f"No associated tasks found for lead {lead_id}.")
    
@https_fn.on_call(region="us-central1")
def mergeLeads(req: https_fn.CallableRequest) -> dict:
    """
    Merges two leads. The secondary lead's data is migrated to the primary
    lead, and the secondary lead is then deleted.
    """
    primary_lead_id = req.data.get("primaryLeadId")
    secondary_lead_id = req.data.get("secondaryLeadId")

    if not primary_lead_id or not secondary_lead_id:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="Both primaryLeadId and secondaryLeadId are required.",
        )

    if primary_lead_id == secondary_lead_id:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="Primary and secondary leads cannot be the same.",
        )

    try:
        # Get lead documents
        primary_lead_ref = db.collection("leads").document(primary_lead_id)
        secondary_lead_ref = db.collection("leads").document(secondary_lead_id)
        primary_lead_doc = primary_lead_ref.get()
        secondary_lead_doc = secondary_lead_ref.get()

        if not primary_lead_doc.exists or not secondary_lead_doc.exists:
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.NOT_FOUND,
                message="One or both leads could not be found.",
            )
        
        primary_lead_data = primary_lead_doc.to_dict()
        secondary_lead_data = secondary_lead_doc.to_dict()

        batch = db.batch()
        
        # Merge interactions from secondary to primary
        secondary_interactions = secondary_lead_data.get("interactions", [])
        if secondary_interactions:
            # Using ArrayUnion to merge the arrays of interactions
             batch.update(primary_lead_ref, {
                "interactions": firestore.ArrayUnion(secondary_interactions)
            })

        # Re-parent tasks from secondary to primary
        tasks_query = db.collection("tasks").where("leadId", "==", secondary_lead_id).stream()
        for task in tasks_query:
            batch.update(task.reference, {"leadId": primary_lead_id})
            
        # Create a log entry on the primary lead about the merge
        merge_note = (
            f"Merged with contact '{secondary_lead_data.get('name', 'N/A')}'. "
            f"Details: Email='{secondary_lead_data.get('email', 'N/A')}', "
            f"Phone(s)='{[p.get('number') for p in secondary_lead_data.get('phones', [])]}'."
        )
        merge_interaction = {
            "id": f"merge_{secondary_lead_id}",
            "createdAt": firestore.SERVER_TIMESTAMP,
            "notes": merge_note,
        }
        
        batch.update(primary_lead_ref, {
            "interactions": firestore.ArrayUnion([merge_interaction])
        })

        # Delete the secondary lead
        batch.delete(secondary_lead_ref)

        batch.commit()
        
        return {"message": f"Successfully merged {secondary_lead_data.get('name')} into {primary_lead_data.get('name')}."}

    except Exception as e:
        print(f"Error during lead merge: {e}")
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message=f"An internal error occurred during merge: {e}",
        )


@https_fn.on_call(region="us-central1")
def generateCourseRevenueReport(req: https_fn.CallableRequest) -> dict:
    """
    Analyzes leads to calculate enrolled and opportunity revenue per course
    and saves the result to a monthly report document in Firestore.
    """
    print("Starting Course Revenue report generation...")
    try:
        leads_ref = db.collection("leads")
        all_leads = leads_ref.stream()

        course_data = {}

        for lead in all_leads:
            lead_data = lead.to_dict()
            quote_lines = lead_data.get("commitmentSnapshot", {}).get("quoteLines", [])
            status = lead_data.get("status")

            if not quote_lines or not status:
                continue
            
            for line in quote_lines:
                courses = line.get('courses', [])
                if not courses:
                    continue
                
                # For revenue, we might take the first variant's price or an average.
                # Here, we'll take the first one for simplicity.
                price = line.get('variants', [{}])[0].get('price', 0)
                
                if not isinstance(price, (int, float)) or price <= 0:
                    continue

                # The revenue from this quote line is attributed to all courses in it.
                # This could be refined to split revenue if needed.
                for course_name in courses:
                    if not course_name:
                        continue
                    
                    if course_name not in course_data:
                        course_data[course_name] = {
                            "courseName": course_name,
                            "enrolledRevenue": 0,
                            "opportunityRevenue": 0
                        }
                    
                    if status == "Enrolled":
                        course_data[course_name]["enrolledRevenue"] += price
                    elif status == "Active":
                        course_data[course_name]["opportunityRevenue"] += price


        report_courses = list(course_data.values())

        report_id = f"CR-{datetime.now().strftime('%Y-%m')}"
        report_data = {
            "id": report_id,
            "generatedAt": firestore.SERVER_TIMESTAMP,
            "courses": report_courses
        }

        db.collection("reports").document(report_id).set(report_data, merge=True)
        
        print(f"Successfully generated and saved report {report_id}.")
        return {"message": f"Report {report_id} generated successfully."}

    except Exception as e:
        print(f"Error during course revenue report generation: {e}")
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message=f"An internal error occurred during report generation: {e}",
        )

# @https_fn.on_call(region="us-central1")
# def generateLogAnalysisReport(req: https_fn.CallableRequest) -> dict:
#     """
#     Analyzes active leads using an AI flow and categorizes them into
#     high and low potential buckets.
#     """
#     print("Starting Log Analysis report generation...")
#     try:
#         if not GEMINI_API_KEY:
#             raise https_fn.HttpsError(code=httpsfn.FunctionsErrorCode.FAILED_PRECONDITION,
#                                       message="Gemini API key is not configured.")
                                      
#         # 1. Fetch active leads in early AFC stages
#         leads_ref = db.collection("leads")
#         query = leads_ref.where("status", "==", "Active").where("afc_step", "in", [1, 2, 3])
#         active_leads = query.stream()

#         high_potential_leads = []
#         low_potential_leads = []
        
#         # 2. Fetch the custom prompt from settings
#         settings_doc = db.collection("settings").document("appConfig").get()
#         settings_data = settings_doc.to_dict() if settings_doc.exists else {}
#         custom_prompt_template = settings_data.get("logAnalysisPrompt")
        
#         # Define the default prompt
#         default_prompt_template = """You are an expert sales assistant tasked with analyzing a lead to determine their potential.
# Your goal is to classify the lead as either 'High' or 'Low' potential and provide concrete, actionable next steps for the salesperson.
# Analyze the following lead data:
# - Traits: {traits}
# - Insights: {insights}
# - Key Notes: {notes}
# - Interaction History: {interactions}

# A HIGH potential lead is someone who shows clear buying signals: they are responsive, have few major objections (especially regarding price), and seem genuinely interested in the course content.
# A LOW potential lead is someone who is unresponsive, raises significant objections that haven't been resolved, or seems indecisive or uninterested.

# Based on your analysis, provide a JSON response with two keys: "potential" (string, either "High" or "Low") and "actions" (a concise 2-3 line string of recommended next actions).
# """
        
#         prompt_to_use = custom_prompt_template or default_prompt_template
        
#         # Initialize the generative model
#         model = genai.GenerativeModel(
#             'gemini-1.5-flash-latest',
#             generation_config=genai.GenerationConfig(response_mime_type="application/json")
#         )

#         # 3. Analyze each lead with the GenAI model
#         for lead in active_leads:
#             lead_data = lead.to_dict()
#             lead_id = lead.id

#             # Prepare prompt by formatting the lead data
#             prompt = prompt_to_use.format(
#                 traits=lead_data.get("traits", []),
#                 insights=lead_data.get("insights", []),
#                 notes=lead_data.get("commitmentSnapshot", {}).get("keyNotes", ""),
#                 interactions=json.dumps(lead_data.get("interactions", []), default=str)
#             )

#             # Run the generation
#             response = model.generate_content(prompt)
            
#             try:
#                 result_json = json.loads(response.text)
#             except (json.JSONDecodeError, AttributeError):
#                 print(f"Skipping lead {lead_id} due to invalid AI response: {response.text}")
#                 continue

#             # Prepare the result object
#             analyzed_lead = {
#                 "leadId": lead_id,
#                 "leadName": lead_data.get("name"),
#                 "course": lead_data.get("commitmentSnapshot", {}).get("course"),
#                 "price": float(lead_data.get("commitmentSnapshot", {}).get("price", 0)),
#                 "aiActions": result_json.get("actions", "No actions suggested.")
#             }

#             # 4. Categorize the lead
#             if result_json.get("potential") == "High":
#                 high_potential_leads.append(analyzed_lead)
#             else:
#                 low_potential_leads.append(analyzed_lead)
        
#         # 5. Save the reports to Firestore, limiting to 50 each
#         batch = db.batch()
        
#         high_potential_doc_ref = db.collection("reports").document("high-potential-leads")
#         batch.set(high_potential_doc_ref, {
#             "id": "high-potential-leads",
#             "generatedAt": firestore.SERVER_TIMESTAMP,
#             "leads": high_potential_leads[:50]
#         }, merge=True)

#         low_potential_doc_ref = db.collection("reports").document("low-potential-leads")
#         batch.set(low_potential_doc_ref, {
#             "id": "low-potential-leads",
#             "generatedAt": firestore.SERVER_TIMESTAMP,
#             "leads": low_potential_leads[:50]
#         }, merge=True)

#         batch.commit()
        
#         print("Successfully generated and saved Log Analysis reports.")
#         return {"message": "Log Analysis report generated successfully."}

#     except Exception as e:
#         print(f"Error during log analysis report generation: {e}")
#         raise https_fn.HttpsError(
#             code=https_fn.FunctionsErrorCode.INTERNAL,
            # message=f"An internal error occurred during report generation: {e}",
#         )

@https_fn.on_call(region="us-central1")
def searchLeads(req: https_fn.CallableRequest) -> list:
    """
    Searches for leads based on a term using the search_keywords map.
    """
    term = req.data.get("term", "").lower().strip()
    if not term:
        return []

    try:
        leads_ref = db.collection("leads")
        # Firestore field paths cannot contain certain characters, but our term should be clean.
        # This query is highly efficient as it checks for key existence in a map.
        query = leads_ref.where(f"search_keywords.{term}", "==", True).limit(20)
        
        results = []
        for doc in query.stream():
            doc_data = doc.to_dict()
            # Don't need to send the giant keywords map to the client
            doc_data.pop("search_keywords", None)
            doc_data["id"] = doc.id
            results.append(doc_data)
            
        return results
    except Exception as e:
        print(f"Error during lead search: {e}")
        # Don't raise HttpsError to client, just return empty list on failure
        return []


@https_fn.on_call(region="us-central1")
def reindexLeads(req: https_fn.CallableRequest) -> dict:
    """
    Goes through all leads and generates the search_keywords map for them.
    This is a one-time utility function to backfill search data.
    """
    print("Starting lead re-indexing for search...")
    try:
        leads_ref = db.collection("leads")
        all_leads_stream = leads_ref.stream()
        
        batch = db.batch()
        processed_count = 0
        BATCH_LIMIT = 499

        for lead_doc in all_leads_stream:
            lead_data = lead_doc.to_dict()
            name = lead_data.get("name", "")
            phones = lead_data.get("phones", [])
            quote_lines = lead_data.get("commitmentSnapshot", {}).get("quoteLines", [])
            
            # Generate keywords
            search_keywords = generate_search_keywords(name, phones, quote_lines)
            batch.update(lead_doc.reference, {"search_keywords": search_keywords})
            processed_count += 1
            
            if processed_count % BATCH_LIMIT == 0:
                batch.commit()
                batch = db.batch()
                print(f"Committed batch of {processed_count} updates.")
        
        # Commit any remaining updates
        if processed_count > 0 and (processed_count % BATCH_LIMIT != 0):
            batch.commit()

        print(f"Re-indexing complete. Processed {processed_count} leads.")
        return {"message": f"Re-indexing complete. Processed {processed_count} leads.", "processed": processed_count}

    except Exception as e:
        print(f"Error during lead re-indexing: {e}")
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message=f"An internal error occurred during re-indexing: {e}",
        )
      

@https_fn.on_call(region="us-central1")
def bulkDeleteLeads(req: https_fn.CallableRequest) -> dict:
    """
    Deletes a list of leads in batches. This will trigger onLeadDelete
    for each deleted lead to clean up associated data like tasks.
    """
    lead_ids = req.data.get("leadIds")
    if not lead_ids or not isinstance(lead_ids, list):
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="An array of lead IDs ('leadIds') is required.",
        )

    print(f"Starting bulk delete for {len(lead_ids)} leads.")
    deleted_count = 0
    try:
        batch = db.batch()
        BATCH_LIMIT = 500  # Firestore batch limit
        
        for i, lead_id in enumerate(lead_ids):
            lead_ref = db.collection("leads").document(lead_id)
            batch.delete(lead_ref)
            deleted_count += 1
            
            # Commit the batch when it's full or when it's the last item
            if (i + 1) % BATCH_LIMIT == 0 or (i + 1) == len(lead_ids):
                batch.commit()
                print(f"Committed batch of {deleted_count} deletions.")
                # Start a new batch for the next set
                batch = db.batch()

        return { "message": f"Successfully deleted {deleted_count} leads." }

    except Exception as e:
        print(f"Error during bulk lead deletion: {e}")
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message=f"An internal error occurred during deletion: {e}",
        )
    
@https_fn.on_call(region="us-central1")
def migrateDealsToQuotes(req: https_fn.CallableRequest) -> dict:
    """
    One-time migration script to convert the old 'deals' array to the new
    'quoteLines' array for all relevant leads.
    """
    print("Starting migration of deals to quote lines...")
    try:
        leads_ref = db.collection("leads")
        
        # This query is broad, but we will filter in the loop.
        # A more targeted query could be leads_ref.where("commitmentSnapshot.deals", "!=", [])
        # but that requires a composite index. We'll do it this way to avoid that requirement.
        leads_with_deals_query = leads_ref.where("commitmentSnapshot.deals", "!=", None)
        
        docs_stream = leads_with_deals_query.stream()
        
        batch = db.batch()
        migrated_count = 0
        BATCH_LIMIT = 400

        for doc in docs_stream:
            lead_data = doc.to_dict()
            deals = lead_data.get("commitmentSnapshot", {}).get("deals", [])

            if not deals or not isinstance(deals, list) or len(deals) == 0:
                continue

            # Check if all deals have a price > 0
            if not all(d.get('price', 0) > 0 for d in deals):
                continue

            print(f"Migrating lead: {doc.id}")

            new_quote_lines = []
            for deal in deals:
                variant = {
                    "id": f"v_{deal.get('id', int(datetime.now().timestamp()))}",
                    "mode": deal.get('mode', 'Online'),
                    "format": deal.get('format', '1-1'),
                    "price": deal.get('price', 0)
                }
                quote_line = {
                    "id": f"ql_{deal.get('id', int(datetime.now().timestamp()))}",
                    "courses": deal.get('courses', []),
                    "variants": [variant]
                }
                new_quote_lines.append(quote_line)
            
            # Prepare update payload
            update_payload = {
                "commitmentSnapshot.quoteLines": new_quote_lines,
                "commitmentSnapshot.deals": firestore.DELETE_FIELD
            }
            
            batch.update(doc.reference, update_payload)
            migrated_count += 1
            
            if migrated_count % BATCH_LIMIT == 0:
                batch.commit()
                batch = db.batch()
                print(f"Committed batch of {migrated_count} migrations.")

        if migrated_count > 0 and (migrated_count % BATCH_LIMIT != 0):
            batch.commit()
        
        print(f"Migration complete. Migrated {migrated_count} leads.")
        return {"message": f"Migration complete. Migrated {migrated_count} leads.", "migrated": migrated_count}

    except Exception as e:
        print(f"Error during deals to quotes migration: {e}")
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message=f"An internal error occurred during migration: {e}",
        )
# --- Algolia Sync Functions ---
# @firestore_fn.on_document_created(document="leads/{leadId}", region="us-central1", secrets=["ALGOLIA_APP_KEY"])
# @firestore_fn.on_document_updated(document="leads/{leadId}", region="us-central1", secrets=["ALGOLIA_APP_KEY"])
# @https_fn.on_call(region="us-central1", secrets=["ALGOLIA_APP_KEY"])
    






    



    

    




    

    

    



    


    

    

    

    

    

    

    

    