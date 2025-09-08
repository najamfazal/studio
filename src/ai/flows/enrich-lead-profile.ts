'use server';

/**
 * @fileOverview Enriches lead profiles with AI-suggested data.
 *
 * - enrichLeadProfile - A function that enriches a lead profile using AI.
 * - EnrichLeadProfileInput - The input type for the enrichLeadProfile function.
 * - EnrichLeadProfileOutput - The return type for the enrichLeadProfile function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const EnrichLeadProfileInputSchema = z.object({
  name: z.string().describe('The name of the lead.'),
  phone: z.string().describe('The phone number of the lead.'),
  email: z.string().email().describe('The email address of the lead.'),
});
export type EnrichLeadProfileInput = z.infer<typeof EnrichLeadProfileInputSchema>;

const EnrichLeadProfileOutputSchema = z.object({
  additionalInformation: z
    .string()
    .describe(
      'Additional relevant information about the lead, extracted from publicly available web data.'
    ),
});
export type EnrichLeadProfileOutput = z.infer<typeof EnrichLeadProfileOutputSchema>;

export async function enrichLeadProfile(input: EnrichLeadProfileInput): Promise<EnrichLeadProfileOutput> {
  return enrichLeadProfileFlow(input);
}

const prompt = ai.definePrompt({
  name: 'enrichLeadProfilePrompt',
  input: {schema: EnrichLeadProfileInputSchema},
  output: {schema: EnrichLeadProfileOutputSchema},
  prompt: `You are an AI assistant helping to enrich lead profiles with publicly available information.

  Given the following lead information, search for additional relevant details from the web to help qualify the lead.

  Name: {{{name}}}
  Phone: {{{phone}}}
  Email: {{{email}}}

  Provide a summary of the information you found.`,
});

const enrichLeadProfileFlow = ai.defineFlow(
  {
    name: 'enrichLeadProfileFlow',
    inputSchema: EnrichLeadProfileInputSchema,
    outputSchema: EnrichLeadProfileOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
