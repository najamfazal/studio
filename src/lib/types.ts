export type Lead = {
  id: string;
  name: string;
  email: string;
  phone: string;
  additionalInformation?: string;
  lastEnriched?: string; // ISO date string
  createdAt?: string; // ISO date string
};
