
'use server';
/**
 * @fileOverview An AI flow to analyze a lead's potential based on their data.
 *
 * - analyzeLead - A function that handles the lead analysis process.
 * - LogAnalysisInput - The input type for the analyzeLead function.
 * - LogAnalysisOutput - The return type for the analyzeLead function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

export const LogAnalysisInputSchema = z.object({
  insights: z.array(z.string()).describe("A list of AI-generated insights about the lead."),
  traits: z.array(z.string()).describe("A list of personality or behavioral traits observed in the lead."),
  notes: z.string().describe("General notes about the lead, usually from the commitment snapshot."),
  interactions: z.array(z.any()).describe("A chronological list of all interactions with the lead."),
  customPrompt: z.string().optional().describe("An optional user-provided prompt to override the default behavior."),
});
export type LogAnalysisInput = z.infer<typeof LogAnalysisInputSchema>;

export const LogAnalysisOutputSchema = z.object({
  potential: z.enum(["High", "Low"]).describe("The assessed potential of the lead."),
  actions: z.string().describe("A concise 2-3 line summary of recommended next actions for the user to take to move the lead forward."),
});
export type LogAnalysisOutput = z.infer<typeof LogAnalysisOutputSchema>;

export async function analyzeLead(input: LogAnalysisInput): Promise<LogAnalysisOutput> {
  return logAnalysisFlow(input);
}

const defaultPrompt = `You are an expert sales assistant tasked with analyzing a lead to determine their potential.
  
Your goal is to classify the lead as either 'High' or 'Low' potential and provide concrete, actionable next steps for the salesperson.

Analyze the following lead data:
- Traits: {{traits}}
- Insights: {{insights}}
- Key Notes: {{notes}}
- Interaction History: {{jsonStringify interactions}}

A HIGH potential lead is someone who shows clear buying signals: they are responsive, have few major objections (especially regarding price), and seem genuinely interested in the course content.
A LOW potential lead is someone who is unresponsive, raises significant objections that haven't been resolved, or seems indecisive or uninterested.

Based on your analysis, set the 'potential' field.

Then, provide a short, actionable 2-3 line recommendation in the 'actions' field. The recommendation should be a concrete next step for the salesperson. For example: "The lead seems concerned about the schedule. Send them two alternative timings for the demo call." or "They are very interested in the content. Send them the advanced course module breakdown and suggest a call to discuss it."
`;

export const logAnalysisFlow = ai.defineFlow(
  {
    name: 'logAnalysisFlow',
    inputSchema: LogAnalysisInputSchema,
    outputSchema: LogAnalysisOutputSchema,
  },
  async (input) => {
    const promptTemplate = input.customPrompt || defaultPrompt;

    const prompt = ai.definePrompt({
      name: 'logAnalysisDynamicPrompt',
      input: { schema: LogAnalysisInputSchema },
      output: { schema: LogAnalysisOutputSchema },
      prompt: promptTemplate,
    });
    
    const { output } = await prompt(input);
    return output!;
  }
);

    
