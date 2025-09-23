
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, query, where, getDocs, orderBy, limit, startAfter, QueryDocumentSnapshot, DocumentData, addDoc, writeBatch, doc, updateDoc } from 'firebase/firestore';
import { produce } from 'immer';
import { addDays, format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { Loader2 } from 'lucide-react';

import { db } from '@/lib/firebase';
import type { AppSettings, Interaction, Lead, Task, InteractionFeedback } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const INTERACTION_PAGE_SIZE = 10;

// Helper to safely convert Firestore Timestamps or strings to Date objects
const toDate = (dateValue: any): Date | null => {
  if (!dateValue) return null;
  if (typeof dateValue === "string") return parseISO(dateValue);
  if (dateValue.toDate) return dateValue.toDate(); // Firestore Timestamp
  return null;
};


interface LeadLogViewProps {
    lead: Lead;
    appSettings: AppSettings;
}

export function LeadLogView({ lead, appSettings }: LeadLogViewProps) {
  const { toast } = useToast();
  const id = lead.id;

  // Interactions state
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [isInteractionsLoading, setIsInteractionsLoading] = useState(true);
  const [lastInteraction, setLastInteraction] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreInteractions, setHasMoreInteractions] = useState(true);

  const fetchInteractions = useCallback(async (loadMore = false) => {
    setIsInteractionsLoading(true);
    
    try {
      let qConstraints: any[] = [
        where('leadId', '==', id),
        orderBy('createdAt', 'desc'),
      ];

      if (loadMore && lastInteraction) {
          qConstraints.push(startAfter(lastInteraction));
      } 
      qConstraints.push(limit(loadMore ? 10 : INTERACTION_PAGE_SIZE));

      const q = query(collection(db, 'interactions'), ...qConstraints);
      const snapshot = await getDocs(q);
      const newInteractions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Interaction));

      const pageSize = loadMore ? 10 : INTERACTION_PAGE_SIZE;
      setHasMoreInteractions(newInteractions.length === pageSize);
      setLastInteraction(snapshot.docs[snapshot.docs.length - 1] || null);

      setInteractions(prev => loadMore ? [...prev, ...newInteractions] : newInteractions);
    } catch (error) {
      console.error("Error fetching interactions:", error);
      toast({ variant: "destructive", title: "Failed to load interactions." });
    } finally {
      setIsInteractionsLoading(false);
    }
  }, [id, toast, lastInteraction]);

  useEffect(() => {
    fetchInteractions();
  }, [fetchInteractions]);
  

  const formatFeedbackLog = (feedbackData: InteractionFeedback) => {
    return (Object.keys(feedbackData) as (keyof InteractionFeedback)[])
        .map(category => {
            const feedbackItem = feedbackData[category];
            if (!feedbackItem) return '';
            let part = `${category}: ${feedbackItem.perception}`;
            if (feedbackItem.objections && feedbackItem.objections.length > 0) {
                part += ` (${feedbackItem.objections.join(', ')})`;
            }
            return part;
        }).filter(Boolean).join('; ');
  };
  
  const formatRelativeTime = (date: Date) => {
    const distance = formatDistanceToNowStrict(date, { addSuffix: true });
    return distance.replace(/ seconds?/, 's').replace(/ minutes?/, 'm').replace(/ hours?/, 'h').replace(/ days?/, 'd').replace(/ months?/, 'mo').replace(/ years?/, 'y');
  };

  return (
    <Card>
        <CardHeader className="p-4">
            <CardTitle className="text-lg font-normal">Log History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-0">
            <TooltipProvider>
            {(isInteractionsLoading && interactions.length === 0) && (
                <div className="flex justify-center p-4">
                <Loader2 className="animate-spin" />
                </div>
            )}
            {interactions.length > 0 && (
                <div className="space-y-3">
                {interactions.map(interaction => {
                    const interactionDate = toDate(interaction.createdAt)!;
                    return (
                    <div key={interaction.id} className="text-sm p-3 bg-muted/50 rounded-lg">
                        <div className="flex justify-between items-center mb-1">
                            <p className="font-semibold capitalize">
                                {interaction.quickLogType ? `Quick Log: ${interaction.quickLogType}` :
                                interaction.feedback ? 'Feedback' :
                                interaction.outcome ? `Outcome: ${interaction.outcome}` : 
                                interaction.notes ? 'Note' :
                                'Interaction'}
                            </p>
                            <Tooltip delayDuration={300}>
                                <TooltipTrigger>
                                    <p className="text-xs text-muted-foreground hover:text-foreground cursor-default">
                                        {formatRelativeTime(interactionDate)}
                                    </p>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="text-xs">{format(interactionDate, 'PP p')}</p>
                                </TooltipContent>
                            </Tooltip>
                        </div>
                        <p className="text-muted-foreground capitalize text-xs">
                        {interaction.feedback ? formatFeedbackLog(interaction.feedback) 
                        : interaction.eventDetails ? `${interaction.eventDetails.type} at ${format(toDate(interaction.eventDetails.dateTime)!, 'PPp')}`
                        : interaction.notes}
                        </p>
                    </div>
                    )
                })}
                </div>
            )}
            {!isInteractionsLoading && interactions.length === 0 && (
                <p className="text-sm text-center text-muted-foreground p-4">No interactions have been logged yet.</p>
            )}
            {hasMoreInteractions && (
                <div className="flex justify-center">
                <Button variant="outline" onClick={() => fetchInteractions(true)} disabled={isInteractionsLoading}>
                    {isInteractionsLoading ? <Loader2 className="animate-spin" /> : 'Load More'}
                </Button>
                </div>
            )}
            </TooltipProvider>
        </CardContent>
    </Card>
  );
}
