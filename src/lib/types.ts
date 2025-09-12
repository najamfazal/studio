
export type LeadStatus =
  | 'Active'
  | 'Paused'
  | 'Snoozed'
  | 'Cooling'
  | 'Dormant'
  | 'Enrolled'
  | 'Withdrawn';

export type CommitmentSnapshot = {
  price?: string;
  schedule?: string;
  course?: string;
  keyNotes?: string;
};

export type Lead = {
  id: string;
  name: string;
  email: string;
  phone: string;
  additionalInformation?: string;
  lastEnriched?: string; // ISO date string
  createdAt?: string; // ISO date string
  
  // New Fields
  status: LeadStatus;
  afc_step: number; // 0-5
  last_interaction_date?: string; // ISO date string
  hasEngaged: boolean;
  onFollowList: boolean;
  traits: string[];
  insights: string[];
  commitmentSnapshot: CommitmentSnapshot;
};

export type TaskNature = 'Procedural' | 'Interactive';

export type Task = {
  id: string;
  leadId: string;
  leadName: string;
  description: string;
  completed: boolean;
  createdAt: string; // ISO date string
  dueDate?: string; // ISO date string for overdue checks
  nature: TaskNature;
};

export type InteractionFeedback = {
    content?: { perception: 'positive' | 'negative', objections?: string[] };
    schedule?: { perception: 'positive' | 'negative', objections?: string[] };
    price?: { perception: 'positive' | 'negative', objections?: string[] };
}

export type InteractionEventDetails = { 
  type: string;
  dateTime: string; // ISO date string
};

export type QuickLogType = 'Enrolled' | 'Withdrawn' | 'Unresponsive' | 'Unchanged';

export type Interaction = {
  id: string;
  leadId: string;
  createdAt: string; // ISO date string
  
  // For quick logs
  quickLogType?: QuickLogType;

  // For detailed logs from the lead page
  feedback?: InteractionFeedback;
  outcome?: string; // e.g. "Event Scheduled"
  eventDetails?: InteractionEventDetails;
  notes?: string;
};

export type AppSettings = {
  id?: string;
  courseNames: string[];
  commonTraits: string[];
  feedbackChips: {
    content: string[];
    schedule: string[];
    price: string[];
  }
}
