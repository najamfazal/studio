
"use server";

import { enrichLeadProfile } from "@/ai/flows/enrich-lead-profile";

export async function enrichLeadAction(lead: {name: string, email: string, phone: string}) {
  try {
    const enrichedData = await enrichLeadProfile({
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
    });
    return {
      success: true,
      additionalInformation: enrichedData.additionalInformation,
    };
  } catch (error) {
    console.error("Error enriching lead:", error);
    return {
      success: false,
      error: "Failed to enrich lead information. Please try again.",
    };
  }
}
