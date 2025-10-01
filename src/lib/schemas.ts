
import { z } from "zod";

export const phoneSchema = z.object({
  number: z.string().min(1, { message: "Phone number is required." }),
  type: z.enum(["calling", "chat", "both"]),
});

export const leadSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  email: z.string().email({ message: "Please enter a valid email." }),
  phones: z.array(phoneSchema).min(1, { message: "At least one phone number is required." }).superRefine((phones, ctx) => {
    if (phones.some(p => !p.number)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Phone number cannot be empty.",
        path: [`${phones.findIndex(p => !p.number)}.number`],
      });
    }
  }),
  courses: z.array(z.string()).optional(),
  relationship: z.string().min(1, { message: "Relationship type is required." }),
});

export type LeadFormValues = z.infer<typeof leadSchema>;
