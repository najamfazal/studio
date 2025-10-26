

export type ThemeSettings = {
  primary: string;
  background: string;
  accent: string;
}

export type LeadStatus =
  | 'Active'
  | 'Paused'
  | 'Snoozed'
  | 'Cooling'
  | 'Dormant'
  | 'Enrolled'
  | 'Withdrawn'
  | 'Archived'
  | 'Graduated'
  | 'Invalid';

// New, more flexible structure for quotes
export type PriceVariant = {
  id: string;
  mode: 'Online' | 'In-person';
  format: '1-1' | 'Batch';
  price: number;
}

export type QuoteLine = {
  id: string;
  courses: string[]; // e.g., ["PowerBI", "SQL"] or just ["Data Analytics"]
  variants: PriceVariant[];
}


export type CommitmentSnapshot = {
  inquiredFor?: string;
  // `deals` is deprecated, will be migrated to `quoteLines`
  deals?: Deal[]; 
  quoteLines?: QuoteLine[];
  schedule?: string;
  keyNotes?: string;
  paymentPlan?: string;
};

// Deprecated, will be removed after migration
export type Deal = {
  id: string;
  courses: string[];
  price: number;
  mode: 'Online' | 'In-person';
  format: '1-1' | 'Batch';
}

export type PhoneNumber = {
  number: string;
  type: 'calling' | 'chat' | 'both';
}

export type DayTime = {
  day: string;
  timeSlot: string;
};

export type SessionGroup = {
  groupId: string;
  trainer: string;
  sections: string[];
  mode: 'Online' | 'In-person';
  format: '1-1' | 'Batch';
  schedule: DayTime[];
};

export type CourseSchedule = {
  sessionGroups: SessionGroup[];
};


export type PaymentInstallment = {
  id: string;
  dueDate: string; // ISO String
  amount: number;
  status: 'Paid' | 'Unpaid';
}

export type PaymentPlan = {
  totalPrice: number;
  installments: PaymentInstallment[];
}

export type InteractionFeedback = {
    content?: { perception: 'positive' | 'negative', objections?: string[] };
    schedule?: { perception: 'positive' | 'negative', objections?: string[] };
    price?: { perception: 'positive' | 'negative', objections?: string[] };
}

export type InteractionEventDetails = { 
  type?: string;
  dateTime: string; // ISO date string
  status?: 'Scheduled' | 'Completed' | 'Cancelled';
  rescheduledFrom?: string; // ISO string of original date
};

export type QuickLogType = 'Initiated' | 'Enrolled' | 'Withdrawn' | 'Unresponsive' | 'Unchanged' | 'Followup' | 'Invalid';

export type OutcomeType = 'Info' | 'Later' | 'Event Scheduled';

export type Interaction = {
  id: string;
  createdAt: string; // ISO date string
  
  quickLogType?: QuickLogType;
  withdrawalReasons?: string[];
  invalidReasons?: string[];

  feedback?: InteractionFeedback;
  outcome?: OutcomeType;
  followUpDate?: string; // For 'Later' outcome
  eventDetails?: InteractionEventDetails;
  notes?: string;

  infoLogs?: string[]; // For informational logs like "Sent brochure"
};


export type Lead = {
  id:string;
  name: string;
  email: string;
  phones: PhoneNumber[];
  additionalInformation?: string;
  lastEnriched?: string; // ISO date string
  createdAt?: string; // ISO date string
  
  // New Fields
  status: LeadStatus;
  relationship: string; // e.g. Lead, Learner
  afc_step: number; // 0-5
  last_interaction_date?: string; // ISO date string
  hasEngaged: boolean;
  hasConversations: boolean;
  onFollowList: boolean;
  traits: string[];
  insights: string[];
  commitmentSnapshot: CommitmentSnapshot;
  interactions?: Interaction[];
  search_keywords?: { [key: string]: boolean };
  source?: string;
  assignedAt?: string; // ISO date string
  
  // Temporary state for event logging
  eventDetails?: InteractionEventDetails;

  // --- Fields for "Learner" ---
  enrolledDate?: string;
  estCompletionDate?: string;
  courseSchedule?: CourseSchedule;
  paymentPlan?: PaymentPlan;
};

export type TaskNature = 'Procedural' | 'Interactive';

export type Task = {
  id:string;
  leadId: string | null; // Can be null for manual tasks
  leadName: string;
  description: string;
  completed: boolean;
  createdAt: any; // Can be Date, string, or Firestore Timestamp
  dueDate?: any; // Can be Date, string, or Firestore Timestamp
  nature: TaskNature;
};

// Main application settings, stored in `settings/appConfig`
export type AppSettings = {
  id?: string;
  relationshipTypes: string[];
  courseNames: string[];
  commonTraits: string[];
  withdrawalReasons: string[];
  invalidReasons: string[];
  trainers: string[];
  timeSlots: string[];
  infoLogOptions: string[];
  feedbackChips: {
    content: string[];
    schedule: string[];
    price: string[];
  };
  theme?: ThemeSettings;
  logAnalysisPrompt?: string;
}

// New type for the Sales Catalog
export type CatalogCourse = {
  id: string;
  name: string; // e.g. "Data Analytics"
  isBundle: boolean; // Is this a package of other courses?
  includedCourses: string[]; // e.g. ["PowerBI", "SQL", "Python"]
  valueProposition: string;
  standardPrices: PriceVariant[];
}

export type SalesCatalog = {
  id?: string;
  courses: CatalogCourse[];
}

export type CourseRevenueData = {
    courseName: string;
    enrolledRevenue: number;
    opportunityRevenue: number;
}

export type CourseRevenueReport = {
    id: string; // e.g., CR-2024-09
    generatedAt: any; // Firestore Timestamp
    courses: CourseRevenueData[];
}

// ---- Log Analysis Types ----
export type AnalyzedLead = {
  leadId: string;
  leadName: string;
  course: string;
  price: number;
  aiActions: string; // The 2-3 line recommendation
};

export type LogAnalysisReport = {
  id: 'high-potential-leads' | 'low-potential-leads';
  generatedAt: any; // Firestore Timestamp
  leads: AnalyzedLead[];
};
