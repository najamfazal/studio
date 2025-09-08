export type Lead = {
  id: string;
  name: string;
  email: string;
  phone: string;
  additionalInformation?: string;
  lastEnriched?: string; // ISO date string
  createdAt?: string; // ISO date string
};

export type Task = {
  id: string;
  leadId: string;
  leadName: string;
  description: string;
  completed: boolean;
  createdAt: string; // ISO date string
};
