import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";

admin.initializeApp();

export const createTaskOnNewLead = onDocumentCreated("leads/{leadId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) {
    logger.log("No data associated with the event");
    return;
  }
  const data = snapshot.data();
  const leadId = event.params.leadId;
  const leadName = data.name;

  const task = {
    leadId: leadId,
    leadName: leadName,
    description: `Initiate contact with ${leadName}`,
    completed: false,
    createdAt: new Date().toISOString(),
  };

  try {
    await admin.firestore().collection("tasks").add(task);
    logger.log(`Task created for lead ${leadName} (${leadId})`);
  } catch (error) {
    logger.error("Error creating task:", error);
  }
});
