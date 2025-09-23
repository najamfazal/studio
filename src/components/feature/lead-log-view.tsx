
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, query, where, getDocs, orderBy, limit, startAfter, QueryDocumentSnapshot, DocumentData, addDoc, writeBatch, doc } from 'firebase/firestore';
import { produce } from 'immer';
import { addDays, format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { ArrowLeft, Calendar as CalendarIcon, Check, ChevronRight, Info, CalendarPlus, CalendarClock, Loader2, Mail, Phone, Plus, Send, ThumbsDown, ThumbsUp, Trash2, X, Users, BookOpen, User, Briefcase, Clock, ToggleLeft, ToggleRight, Radio } from 'lucide-react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';

import { db } from '@/lib/firebase';
import type { AppSettings, Interaction, Lead, CourseSchedule, PaymentInstallment, InteractionFeedback, QuickLogType, Task, InteractionEventDetails, OutcomeType, DayTime, SessionGroup } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { EditableField } from '@/components/editable-field';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Calendar } from '@/components/ui/calendar';

const INTERACTION_PAGE_SIZE = 10;
const TASK_PAGE_SIZE = 5;

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

  // Tasks state
  const [activeTasks, setActiveTasks] = useState<Task[]>([]);
  const [pastTasks, setPastTasks] = useState<Task[]>([]);
  const [isTasksLoading, setIsTasksLoading] = useState(false);
  const [lastActiveTask, setLastActiveTask] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [lastPastTask, setLastPastTask] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreActiveTasks, setHasMoreActiveTasks] = useState(true);
  const [hasMorePastTasks, setHasMorePastTasks] = useState(true);

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
  }, [id, toast]);

  const fetchTasks = useCallback(async (type: 'active' | 'past', loadMore = false) => {
    if (!loadMore) setIsTasksLoading(true);
    
    try {
      const isCompleted = type === 'past';
      let qConstraints: any[] = [
        where('leadId', '==', id),
        where('completed', '==', isCompleted),
        orderBy('createdAt', 'desc'),
        limit(TASK_PAGE_SIZE)
      ];

      if (loadMore) {
        const lastVisible = type === 'active' ? lastActiveTask : lastPastTask;
        if (lastVisible) {
          qConstraints.push(startAfter(lastVisible));
        }
      }

      const q = query(collection(db, 'tasks'), ...qConstraints);
      const snapshot = await getDocs(q);
      const newTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
      
      const newLastVisible = snapshot.docs[snapshot.docs.length - 1] || null;

      if (type === 'active') {
        setHasMoreActiveTasks(newTasks.length === TASK_PAGE_SIZE);
        setLastActiveTask(newLastVisible);
        setActiveTasks(prev => loadMore ? [...prev, ...newTasks] : newTasks);
      } else {
        setHasMorePastTasks(newTasks.length === TASK_PAGE_SIZE);
        setLastPastTask(newLastVisible);
        setPastTasks(prev => loadMore ? [...prev, ...newTasks] : newTasks);
      }
    } catch (error) {
      console.error(`Error fetching ${type} tasks:`, error);
      toast({ variant: "destructive", title: `Failed to load ${type} tasks.` });
    } finally {
      setIsTasksLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    fetchInteractions();
    fetchTasks('active');
    fetchTasks('past');
  }, [fetchInteractions, fetchTasks]);
  
  const handleTaskCompletion = async (task: Task, isCompleted: boolean) => {
    try {
      await updateDoc(doc(db, 'tasks', task.id), { completed: isCompleted });
      
      if (isCompleted) {
        setActiveTasks(prev => prev.filter(t => t.id !== task.id));
        setPastTasks(prev => [{...task, completed: true}, ...prev]);
      } else {
        setPastTasks(prev => prev.filter(t => t.id !== task.id));
        setActiveTasks(prev => [{...task, completed: false}, ...prev]);
      }
      toast({title: `Task marked as ${isCompleted ? 'complete' : 'active'}.`});
    } catch (e) {
      toast({variant: 'destructive', title: 'Failed to update task status.'});
    }
  }

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
    <div className="space-y-4">
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
        <Card>
            <CardHeader className="p-4"><CardTitle className="text-lg">Active Tasks</CardTitle></CardHeader>
            <CardContent className="p-4 pt-0">
            {isTasksLoading && activeTasks.length === 0 && <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div>}
            {activeTasks.length > 0 && (
                <div className="space-y-2">
                {activeTasks.map(task => (
                    <div key={task.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                    <button onClick={() => handleTaskCompletion(task, true)} className="flex items-center justify-center h-5 w-5 rounded-full border-2 border-muted-foreground/50 hover:border-primary shrink-0" />
                    <p className="flex-1 text-sm">{task.description}</p>
                    {task.dueDate && <p className="text-xs text-muted-foreground">{format(toDate(task.dueDate)!, 'MMM d')}</p>}
                    </div>
                ))}
                </div>
            )}
            {!isTasksLoading && activeTasks.length === 0 && <p className="text-sm text-center text-muted-foreground p-4">No active tasks.</p>}
            {hasMoreActiveTasks && !isTasksLoading && (
                <div className="flex justify-center mt-4">
                <Button variant="outline" size="sm" onClick={() => fetchTasks('active', true)} disabled={isTasksLoading}>
                    Load More
                </Button>
                </div>
            )}
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="p-4"><CardTitle className="text-lg">Past Tasks</CardTitle></CardHeader>
            <CardContent className="p-4 pt-0">
            {isTasksLoading && pastTasks.length === 0 && <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div>}
            {pastTasks.length > 0 && (
                <div className="space-y-2">
                {pastTasks.map(task => (
                    <div key={task.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                    <button onClick={() => handleTaskCompletion(task, false)} className="flex items-center justify-center h-5 w-5 rounded-full border-2 bg-primary border-primary text-primary-foreground shrink-0">
                        <Check className="h-4 w-4"/>
                    </button>
                    <p className="flex-1 text-sm text-muted-foreground line-through">{task.description}</p>
                    {task.dueDate && <p className="text-xs text-muted-foreground">{format(toDate(task.dueDate)!, 'MMM d')}</p>}
                    </div>
                ))}
                </div>
            )}
            {!isTasksLoading && pastTasks.length === 0 && <p className="text-sm text-center text-muted-foreground p-4">No past tasks.</p>}
            {hasMorePastTasks && !isTasksLoading && (
                <div className="flex justify-center mt-4">
                <Button variant="outline" size="sm" onClick={() => fetchTasks('past', true)} disabled={isTasksLoading}>
                    Load More
                </Button>
                </div>
            )}
            </CardContent>
        </Card>
    </div>
  );
}
