
import { z } from "zod";

export const phoneSchema = z.object({
  number: z.string().min(10, { message: "Phone number must be at least 10 digits." }),
  type: z.enum(["calling", "chat", "both"]),
});

export const leadSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  email: z.string().email({ message: "Please enter a valid email." }),
  phones: z.array(phoneSchema).min(1, { message: "At least one phone number is required." }),
  course: z.string().optional(),
});

export type LeadFormValues = z.infer<typeof leadSchema>;
