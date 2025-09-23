
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, query, where, getDocs, orderBy, limit, startAfter, QueryDocumentSnapshot, DocumentData, addDoc, writeBatch, doc, updateDoc } from 'firebase/firestore';
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
import { LeadLogView } from './lead-log-view';

const INTERACTION_PAGE_SIZE = 5;
const TASK_PAGE_SIZE = 5;

// Helper to safely convert Firestore Timestamps or strings to Date objects
const toDate = (dateValue: any): Date | null => {
  if (!dateValue) return null;
  if (typeof dateValue === "string") return parseISO(dateValue);
  if (dateValue.toDate) return dateValue.toDate(); // Firestore Timestamp
  return null;
};

type FeedbackCategory = keyof InteractionFeedback;
type QuickLogStep = 'initial' | 'withdrawn';

const quickLogOptions: { value: QuickLogType; label: string, multistep: QuickLogStep | null }[] = [
  { value: "Followup", label: "Followup", multistep: null },
  { value: "Initiated", label: "Initiated", multistep: null },
  { value: "Unresponsive", label: "Unresponsive", multistep: null },
  { value: "Unchanged", label: "Unchanged", multistep: null },
  { value: "Withdrawn", label: "Withdrawn", multistep: 'withdrawn' },
  { value: "Enrolled", label: "Enrolled", multistep: null },
];

const eventTypes = ["Online Meet", "Online Demo", "Physical Demo", "Visit"];
const popularTimes = ["12:00", "15:00", "17:00", "19:00"];

interface LeadViewProps {
    lead: Lead;
    appSettings: AppSettings;
    onUpdate: (field: keyof Lead | string, value: any) => Promise<void>;
}

export function LeadView({ lead, appSettings, onUpdate }: LeadViewProps) {
  const { toast } = useToast();
  const id = lead.id;

  // Interactions state
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [scheduledEvents, setScheduledEvents] = useState<Interaction[]>([]);
  const [isInteractionsLoading, setIsInteractionsLoading] = useState(true);
  const [lastInteraction, setLastInteraction] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreInteractions, setHasMoreInteractions] = useState(true);

  // Tasks state
  const [activeTasks, setActiveTasks] = useState<Task[]>([]);
  const [pastTasks, setPastTasks] = useState<Task[]>([]);
  const [isTasksLoading, setIsTasksLoading] = useState(false);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [lastActiveTask, setLastActiveTask] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [lastPastTask, setLastPastTask] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreActiveTasks, setHasMoreActiveTasks] = useState(true);
  const [hasMorePastTasks, setHasMorePastTasks] = useState(true);
  
  const [newInsight, setNewInsight] = useState("");
  const [feedback, setFeedback] = useState<InteractionFeedback>({});
  const [isLoggingFeedback, setIsLoggingFeedback] = useState(false);
  const [activeChipCategory, setActiveChipCategory] = useState<FeedbackCategory | null>(null);
  
  // Quick Log State
  const [quickLogStep, setQuickLogStep] = useState<QuickLogStep>('initial');
  const [selectedQuickLog, setSelectedQuickLog] = useState<QuickLogType | null>(null);
  const [submissionState, setSubmissionState] = useState<'idle' | 'submitting' | 'submitted'>('idle');
  const [withdrawalReasons, setWithdrawalReasons] = useState<string[]>([]);

  // Outcome Log State
  const [selectedOutcome, setSelectedOutcome] = useState<OutcomeType | null>(null);
  const [isLoggingOutcome, setIsLoggingOutcome] = useState(false);
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>(undefined);
  const [eventDetails, setEventDetails] = useState<{ type: string, dateTime: Date | undefined }>({ type: "", dateTime: undefined });
  
  // Event Management State
  const [eventToManage, setEventToManage] = useState<Interaction | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>(undefined);
  const [isEventActionLoading, setIsEventActionLoading] = useState(false);

  const fetchEvents = useCallback(async () => {
    const eventsQuery = query(
      collection(db, "interactions"), 
      where("leadId", "==", id), 
      where("outcome", "==", "Event Scheduled"),
      where("eventDetails.status", "==", "Scheduled")
    );
    const eventsSnapshot = await getDocs(eventsQuery);
    const eventData = eventsSnapshot.docs.map(d => ({id: d.id, ...d.data()} as Interaction));
    setScheduledEvents(eventData);
  }, [id]);

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
  }, [id, toast, lastActiveTask, lastPastTask]);

  useEffect(() => {
    fetchEvents();
    fetchInteractions();
  }, [fetchEvents, fetchInteractions]);

  useEffect(() => {
    if (tasksLoaded) {
        setActiveTasks([]);
        setPastTasks([]);
        setLastActiveTask(null);
        setLastPastTask(null);
        setHasMoreActiveTasks(true);
        setHasMorePastTasks(true);
        fetchTasks('active');
        fetchTasks('past');
    }
  }, [tasksLoaded, fetchTasks]);
  
  const handleTabChange = (value: string) => {
    if (value === 'tasks' && !tasksLoaded) {
      setTasksLoaded(true);
    }
  };
  
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
  
  const handleAddChip = (type: 'traits' | 'insights', value: string) => {
    if (!value || !lead) return;

    const chipValue = value.trim();
    const currentList = lead[type] || [];
    if (currentList.includes(chipValue)) {
        toast({ variant: 'destructive', title: 'Item already exists' });
        return;
    }
    
    const newList = [...currentList, chipValue];
    onUpdate(type, newList);

    if (type === 'insights') {
      setNewInsight("");
    }
  };
  
  const handleRemoveChip = (type: 'traits' | 'insights', value: string) => {
    if (!lead) return;
    const newList = (lead[type] || []).filter(item => item !== value);
    onUpdate(type, newList);
  };
  
  const handleLogInteraction = async () => {
    if (!selectedQuickLog) return;
    
    if (quickLogStep === 'withdrawn' && withdrawalReasons.length === 0) {
        toast({ variant: 'destructive', title: "Please select a reason for withdrawal."});
        return;
    }

    setSubmissionState('submitting');
    
    let interaction: Partial<Interaction> = {
        quickLogType: selectedQuickLog,
        leadId: id,
        createdAt: new Date().toISOString(),
    };

    if (selectedQuickLog === 'Withdrawn') {
        interaction.withdrawalReasons = withdrawalReasons;
    }

    const optimisticInteraction: Interaction = { id: `optimistic-${Date.now()}`, ...interaction } as Interaction;
    setInteractions(prev => [optimisticInteraction, ...prev]);

    try {
        const docRef = await addDoc(collection(db, 'interactions'), interaction);
        setInteractions(prev => prev.map(i => i.id === optimisticInteraction.id ? { ...i, id: docRef.id } : i));
        setSubmissionState('submitted');
        toast({title: "Interaction logged successfully."});
        // After log, refresh related data
        fetchEvents();
        fetchTasks('active', false);
        fetchTasks('past', false);
    } catch (error) {
        setInteractions(prev => prev.filter(i => i.id !== optimisticInteraction.id));
        console.error("Error logging interaction:", error);
        toast({variant: "destructive", title: "Failed to log interaction."});
        setSubmissionState('idle');
    } finally {
        setTimeout(() => {
            setSubmissionState('idle');
            setSelectedQuickLog(null);
            setQuickLogStep('initial');
            setWithdrawalReasons([]);
        }, 1000);
    }
  }

  const handlePerceptionChange = (category: FeedbackCategory, perception: 'positive' | 'negative') => {
    setFeedback(produce(draft => {
        const currentPerception = draft[category]?.perception;
        
        if (currentPerception === perception) {
            delete draft[category];
            setActiveChipCategory(null);
        } else {
            draft[category] = { perception, objections: [] };
            if (perception === 'negative') {
                setActiveChipCategory(category);
            } else {
                if (activeChipCategory === category) {
                    setActiveChipCategory(null);
                }
            }
        }
    }));
  };

  const handleObjectionToggle = (category: FeedbackCategory, objection: string) => {
    setFeedback(produce(draft => {
        const categoryFeedback = draft[category];
        if (categoryFeedback) {
            const objections = categoryFeedback.objections || [];
            const index = objections.indexOf(objection);
            if (index > -1) {
                objections.splice(index, 1);
            } else {
                objections.push(objection);
            }
            categoryFeedback.objections = objections;
        }
    }));
  };
  
  const handleLogFeedback = async () => {
    if (Object.keys(feedback).length === 0) {
        toast({ variant: 'destructive', title: "Nothing to log", description: "Please select a perception first." });
        return;
    }
    setIsLoggingFeedback(true);

    const interactionPayload = { feedback, leadId: id, createdAt: new Date().toISOString() };
    const optimisticInteraction: Interaction = { id: `optimistic-${Date.now()}`, ...interactionPayload } as Interaction;
    setInteractions(prev => [optimisticInteraction, ...prev]);

    try {
      const docRef = await addDoc(collection(db, "interactions"), interactionPayload);
      setInteractions(prev => prev.map(i => i.id === optimisticInteraction.id ? { ...i, id: docRef.id } : i));
      setFeedback({});
      setActiveChipCategory(null);
      toast({ title: "Feedback logged" });
    } catch (e) {
      setInteractions(prev => prev.filter(i => i.id !== optimisticInteraction.id));
      toast({variant: 'destructive', title: 'Failed to log feedback.'})
    } finally {
      setIsLoggingFeedback(false);
      fetchInteractions(false);
    }
  }

  const handleLogOutcome = async () => {
    if (!selectedOutcome) return;
    setIsLoggingOutcome(true);

    let interactionPayload: Partial<Interaction> = {
      leadId: id,
      createdAt: new Date().toISOString(),
      outcome: selectedOutcome,
    };

    if (selectedOutcome === 'Info') {
      if (!outcomeNotes) { toast({ variant: 'destructive', title: 'Info notes cannot be empty.' }); setIsLoggingOutcome(false); return; }
      interactionPayload.notes = outcomeNotes;
    } else if (selectedOutcome === 'Later') {
      if (!followUpDate) { toast({ variant: 'destructive', title: 'Please select a follow-up date.' }); setIsLoggingOutcome(false); return; }
      interactionPayload.followUpDate = followUpDate.toISOString();
    } else if (selectedOutcome === 'Event Scheduled') {
      if (!eventDetails.type || !eventDetails.dateTime) { toast({ variant: 'destructive', title: 'Please select event type and date/time.' }); setIsLoggingOutcome(false); return; }
      interactionPayload.eventDetails = { type: eventDetails.type, dateTime: eventDetails.dateTime.toISOString(), status: 'Scheduled' };
    }

    const optimisticInteraction: Interaction = { id: `optimistic-${Date.now()}`, ...interactionPayload } as Interaction;
    setInteractions(prev => [optimisticInteraction, ...prev]);
    
    const prevSelectedOutcome = selectedOutcome;
    setSelectedOutcome(null);
    setOutcomeNotes('');
    setFollowUpDate(undefined);
    setEventDetails({ type: '', dateTime: undefined });

    try {
      const docRef = await addDoc(collection(db, 'interactions'), interactionPayload);
      setInteractions(prev => prev.map(i => i.id === optimisticInteraction.id ? { ...i, id: docRef.id } : i));
      toast({ title: 'Outcome logged successfully.' });

      if (prevSelectedOutcome === "Event Scheduled") { fetchEvents(); }
      fetchTasks('active', false);
    } catch (error) {
      setInteractions(prev => prev.filter(i => i.id !== optimisticInteraction.id));
      console.error("Error logging outcome:", error);
      toast({ variant: 'destructive', title: 'Failed to log outcome.' });
    } finally {
      setIsLoggingOutcome(false);
    }
  };
  
  const handleEventManagement = async (action: 'Completed' | 'Cancelled' | 'Rescheduled') => {
    if (!eventToManage) return;
    setIsEventActionLoading(true);

    const batch = writeBatch(db);

    try {
        const originalEventRef = doc(db, 'interactions', eventToManage.id);
        if (action === 'Rescheduled') {
            if (!rescheduleDate) { toast({variant: 'destructive', title: 'Please select a new date.'}); setIsEventActionLoading(false); return; }
            
            const rescheduleLogRef = doc(collection(db, 'interactions'));
            batch.set(rescheduleLogRef, {
                leadId: id,
                createdAt: new Date().toISOString(),
                outcome: 'Event Scheduled',
                eventDetails: {
                    type: eventToManage.eventDetails?.type,
                    dateTime: rescheduleDate.toISOString(),
                    status: 'Scheduled',
                    rescheduledFrom: eventToManage.eventDetails?.dateTime,
                },
                notes: `Rescheduled from ${format(toDate(eventToManage.eventDetails!.dateTime)!, 'PPp')}`
            });
            batch.update(originalEventRef, { 'eventDetails.status': 'Cancelled' });
            toast({title: 'Event Rescheduled'});

        } else { // Completed or Cancelled
            batch.update(originalEventRef, { 'eventDetails.status': action });
            const actionLogRef = doc(collection(db, 'interactions'));
            batch.set(actionLogRef, {
                leadId: id,
                createdAt: new Date().toISOString(),
                notes: `Event ${eventToManage.eventDetails?.type} marked as ${action}.`
            });
            toast({title: `Event ${action}`});
        }
        
        await batch.commit();

        fetchEvents();
        fetchInteractions(false);
        setEventToManage(null);
        setRescheduleDate(undefined);
    } catch (error) {
        console.error(`Error handling event ${action}:`, error);
        toast({variant: 'destructive', title: `Failed to update event.`});
    } finally {
        setIsEventActionLoading(false);
    }
  };

  const availableTraits = useMemo(() => {
    if (!appSettings?.commonTraits || !lead?.traits) return [];
    return appSettings.commonTraits.filter(trait => !lead.traits.includes(trait));
  }, [appSettings?.commonTraits, lead?.traits]);

  const handleQuickLogChipClick = (logType: QuickLogType) => {
    setSelectedQuickLog(logType);
    const option = quickLogOptions.find(o => o.value === logType);
    if (option?.multistep) { setQuickLogStep(option.multistep); }
  };

  const handleToggleWithdrawalReason = (reason: string) => {
    setWithdrawalReasons(prev => prev.includes(reason) ? prev.filter(r => r !== reason) : [...prev, reason]);
  };

  const handleBackFromMultistep = () => {
    setQuickLogStep('initial');
    setSelectedQuickLog(null);
    setWithdrawalReasons([]);
  }
  
  const isSubmitDisabled = () => {
    if (submissionState !== 'idle' || !selectedQuickLog) return true;
    if (quickLogStep === 'withdrawn' && withdrawalReasons.length === 0) return true;
    return false;
  }
  
  const setEventTime = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const newDateTime = eventDetails.dateTime ? new Date(eventDetails.dateTime) : new Date();
    newDateTime.setHours(hours, minutes, 0, 0);
    setEventDetails(prev => ({...prev, dateTime: newDateTime}));
  }

  const upcomingEvent = scheduledEvents.length > 0 ? scheduledEvents[0] : null;

    return (
        <>
            <Tabs defaultValue="overview" onValueChange={handleTabChange}>
                <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="logs">Logs</TabsTrigger>
                <TabsTrigger value="tasks">Tasks/Events</TabsTrigger>
                </TabsList>
                
                <TabsContent value="overview" className="space-y-4">
                {upcomingEvent && (
                    <Card>
                    <CardContent className="p-3">
                        <p className="text-sm font-semibold text-center">
                        Upcoming: {upcomingEvent.eventDetails?.type} on {format(toDate(upcomingEvent.eventDetails!.dateTime)!, 'MMM d @ p')}
                        </p>
                    </CardContent>
                    </Card>
                )}

                <Card>
                    <CardHeader className="p-4"><CardTitle className="text-lg">Contact Details</CardTitle></CardHeader>
                    <CardContent className="p-4 pt-0 space-y-2">
                        {lead.email && (
                        <div className="flex items-center gap-3">
                            <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <a href={`mailto:${lead.email}`} className="text-sm hover:underline">
                            {lead.email}
                            </a>
                        </div>
                        )}
                        {(lead.phones || []).map((phone, index) => (
                            <div key={index} className="flex items-center gap-3">
                                <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                <a href={`tel:${phone.number}`} className="text-sm">
                                {phone.number}
                                </a>
                                {phone.type !== 'both' && <Badge variant="secondary" className="text-xs capitalize">{phone.type}</Badge>}
                            </div>
                        ))}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="p-4"><CardTitle className="text-lg">Commitment Snapshot</CardTitle></CardHeader>
                    <CardContent className="p-4 pt-0 space-y-4">
                    <div className="flex items-start gap-4">
                        <div className="flex-grow-[3]">
                        <EditableField label="Course" value={lead.commitmentSnapshot?.course || ""} onSave={(val) => onUpdate('commitmentSnapshot.course', val)} type="select" selectOptions={appSettings.courseNames || []} placeholder="Select a course"/>
                        </div>
                        <div className="flex-grow-[1]">
                        <EditableField label="Price" value={lead.commitmentSnapshot?.price || ""} onSave={(val) => onUpdate('commitmentSnapshot.price', val)} inputType="number" placeholder="Enter price"/>
                        </div>
                    </div>
                    <div>
                        <EditableField label="Schedule" value={lead.commitmentSnapshot?.schedule || ""} onSave={(val) => onUpdate('commitmentSnapshot.schedule', val)} placeholder="Enter schedule"/>
                    </div>
                    <div>
                        <EditableField label="Key Notes" value={lead.commitmentSnapshot?.keyNotes || ""} onSave={(val) => onUpdate('commitmentSnapshot.keyNotes', val)} type="textarea" placeholder="Add key negotiation points..."/>
                    </div>
                    </CardContent>
                </Card>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                    <CardHeader className="p-4"><CardTitle className="text-lg">Traits</CardTitle></CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                            {(lead.traits || []).map(trait => <Badge key={trait} variant="secondary">{trait} <button onClick={() => handleRemoveChip('traits', trait)} className="ml-2 p-0.5 rounded-full hover:bg-destructive/20"><X className="h-3 w-3 text-destructive"/></button></Badge>)}
                        </div>
                        <Select onValueChange={(value) => handleAddChip('traits', value)} value="">
                            <SelectTrigger>
                                <SelectValue placeholder="Add a trait..." />
                            </SelectTrigger>
                            <SelectContent>
                                {availableTraits.length > 0 ? (
                                    availableTraits.map(trait => (
                                        <SelectItem key={trait} value={trait}>{trait}</SelectItem>
                                    ))
                                ) : (
                                    <div className="p-2 text-sm text-muted-foreground text-center">No more traits to add.</div>
                                )}
                            </SelectContent>
                        </Select>
                        </div>
                    </CardContent>
                    </Card>
                    <Card>
                    <CardHeader className="p-4"><CardTitle className="text-lg">Insights</CardTitle></CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="space-y-4">
                            <div className="flex flex-wrap gap-2">
                                {(lead.insights || []).map(insight => <Badge key={insight} variant="outline">{insight} <button onClick={() => handleRemoveChip('insights', insight)} className="ml-2 p-0.5 rounded-full hover:bg-destructive/20"><X className="h-3 w-3 text-destructive"/></button></Badge>)}
                            </div>
                            <div className="flex gap-2">
                                <Input value={newInsight} onChange={e => setNewInsight(e.target.value)} placeholder="Add an insight..."/>
                                <Button size="icon" onClick={() => handleAddChip('insights', newInsight)}><Plus/></Button>
                            </div>
                        </div>
                    </CardContent>
                    </Card>
                </div>
                </TabsContent>
                
                <TabsContent value="logs" className="space-y-4">
                    <Card className="relative overflow-hidden min-h-[148px]">
                    <AnimatePresence initial={false}>
                        <motion.div
                        key={quickLogStep}
                        className="w-full"
                        initial={{ opacity: 0, x: quickLogStep === 'initial' ? 0 : 300 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -300, position: 'absolute', top: 0, left: 0, right: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        >
                        {quickLogStep === 'initial' && (
                            <>
                            <CardHeader className="flex-row items-center justify-between p-4">
                                <CardTitle className="text-lg font-normal">Quick Log</CardTitle>
                                <Button onClick={handleLogInteraction} size="icon" variant="ghost" disabled={isSubmitDisabled()}>
                                    {submissionState === 'submitting' ? <Loader2 className="animate-spin" /> : <Send />}
                                </Button>
                            </CardHeader>
                            <CardContent className="flex flex-wrap gap-2 p-4 pt-0">
                                {quickLogOptions.map(opt => (
                                <Button 
                                    key={opt.value} 
                                    variant={selectedQuickLog === opt.value ? 'default' : 'outline'} 
                                    size="sm" 
                                    onClick={() => handleQuickLogChipClick(opt.value)} 
                                    disabled={submissionState !== 'idle'}>
                                        {opt.label}
                                </Button>
                                ))}
                            </CardContent>
                            </>
                        )}
                        {quickLogStep === 'withdrawn' && (
                            <>
                            <CardHeader className="p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleBackFromMultistep}><ArrowLeft/></Button>
                                    <div>
                                        <CardDescription>Quick Log - Withdrawn</CardDescription>
                                        <CardTitle className="text-lg font-normal">Select Reason</CardTitle>
                                    </div>
                                    </div>
                                    <Button onClick={handleLogInteraction} size="icon" variant="ghost" disabled={isSubmitDisabled()}>
                                        {submissionState === 'submitting' ? <Loader2 className="animate-spin" /> : <Send />}
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="p-4 pt-0">
                                <div className="flex flex-wrap gap-2">
                                {(appSettings.withdrawalReasons || []).map(reason => (
                                    <Badge key={reason} variant={withdrawalReasons.includes(reason) ? 'default' : 'secondary'} onClick={() => handleToggleWithdrawalReason(reason)} className="cursor-pointer text-sm">{reason}</Badge>
                                ))}
                                </div>
                            </CardContent>
                            </>
                        )}
                        </motion.div>
                    </AnimatePresence>
                    <AnimatePresence>
                        {submissionState !== 'idle' && (
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center"
                        >
                            {submissionState === 'submitting' && <p>Submitting...</p>}
                            {submissionState === 'submitted' && <p className="text-primary">Submitted</p>}
                        </motion.div>
                        )}
                    </AnimatePresence>
                    </Card>

                    <Card>
                    <CardHeader className="flex flex-row items-center justify-between p-4">
                        <CardTitle className="text-lg font-normal">Log Feedback</CardTitle>
                        <Button onClick={handleLogFeedback} disabled={isLoggingFeedback || Object.keys(feedback).length === 0} size="icon" variant="ghost">
                        {isLoggingFeedback ? <Loader2 className="animate-spin" /> : <Send />}
                        </Button>
                    </CardHeader>
                    <CardContent className="space-y-4 p-4 pt-0">
                        <div className="grid grid-cols-3 gap-4 text-center">
                        {(['content', 'schedule', 'price'] as (keyof InteractionFeedback)[]).map(category => (
                            <div key={category}>
                            <h4 className="font-semibold capitalize mb-2">{category}</h4>
                            <div className="flex items-center justify-center gap-3">
                                <Button variant="ghost" size="icon" onClick={() => handlePerceptionChange(category, 'positive')} className={cn(feedback[category]?.perception === 'positive' && 'bg-green-100 dark:bg-green-900')}>
                                <ThumbsUp className="h-5 w-5 text-green-600" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => handlePerceptionChange(category, 'negative')} className={cn(feedback[category]?.perception === 'negative' && 'bg-red-100 dark:bg-red-900')}>
                                <ThumbsDown className="h-5 w-5 text-red-600" />
                                </Button>
                            </div>
                            </div>
                        ))}
                        </div>

                        {activeChipCategory && (
                        <div>
                            <Separator className="my-4" />
                            <div className="flex flex-wrap gap-2 justify-center">
                            {(appSettings.feedbackChips[activeChipCategory] || []).map(objection => (
                                <Badge
                                key={objection}
                                variant={feedback[activeChipCategory]?.objections?.includes(objection) ? "default" : "secondary"}
                                onClick={() => handleObjectionToggle(activeChipCategory, objection)}
                                className="cursor-pointer"
                                >
                                {objection}
                                </Badge>
                            ))}
                            {(appSettings.feedbackChips[activeChipCategory] || []).length === 0 && (
                                <p className="text-xs text-muted-foreground">No objection reasons configured for &quot;{activeChipCategory}&quot;.</p>
                            )}
                            </div>
                        </div>
                        )}
                    </CardContent>
                    </Card>
                    
                    <Card>
                    <CardHeader className="flex flex-row items-center justify-between p-4">
                        <CardTitle className="text-lg font-normal">Log Outcome</CardTitle>
                        <Button onClick={handleLogOutcome} disabled={isLoggingOutcome || !selectedOutcome} size="icon" variant="ghost">
                            {isLoggingOutcome ? <Loader2 className="animate-spin" /> : <Send />}
                        </Button>
                    </CardHeader>
                    <CardContent className="space-y-4 p-4 pt-0">
                        <div className="flex items-center justify-center gap-2">
                            {(['Info', 'Later', 'Event Scheduled'] as OutcomeType[]).map(outcome => (
                                <Button key={outcome} variant={selectedOutcome === outcome ? 'default' : 'outline'} onClick={() => setSelectedOutcome(o => o === outcome ? null : outcome)}>
                                    {outcome === 'Info' && <Info className="mr-2 h-4 w-4"/>}
                                    {outcome === 'Later' && <CalendarClock className="mr-2 h-4 w-4"/>}
                                    {outcome === 'Event Scheduled' && <CalendarPlus className="mr-2 h-4 w-4"/>}
                                    {outcome === 'Event Scheduled' ? 'Event' : outcome}
                                </Button>
                            ))}
                        </div>

                        {selectedOutcome && <Separator />}

                        {selectedOutcome === 'Info' && (
                            <Textarea placeholder="Enter info/details to be sent to the lead..." value={outcomeNotes} onChange={e => setOutcomeNotes(e.target.value)} />
                        )}

                        {selectedOutcome === 'Later' && (
                            <div className="space-y-2">
                                <p className="text-sm font-medium text-center">When to follow up?</p>
                                <div className="flex justify-center">
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline">
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {followUpDate ? format(followUpDate, 'PPP') : 'Select a date'}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0">
                                            <Calendar mode="single" selected={followUpDate} onSelect={setFollowUpDate} initialFocus />
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                <div className="flex justify-center gap-2">
                                    <Button size="sm" variant="ghost" onClick={() => setFollowUpDate(addDays(new Date(), 1))}>Tomorrow</Button>
                                    <Button size="sm" variant="ghost" onClick={() => setFollowUpDate(addDays(new Date(), 2))}>Day-after</Button>
                                    <Button size="sm" variant="ghost" onClick={() => setFollowUpDate(addDays(new Date(), 7))}>Next Week</Button>
                                </div>
                            </div>
                        )}

                        {selectedOutcome === 'Event Scheduled' && (
                            <div className="space-y-4">
                                <Select value={eventDetails.type} onValueChange={val => setEventDetails(prev => ({...prev, type: val}))}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select event type..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {eventTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <div className="flex items-center justify-center gap-2">
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" className="w-full justify-start font-normal">
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {eventDetails.dateTime ? format(eventDetails.dateTime, 'PPP') : 'Select date'}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0">
                                            <Calendar mode="single" selected={eventDetails.dateTime} onSelect={d => setEventDetails(prev => ({...prev, dateTime: d}))} initialFocus />
                                        </PopoverContent>
                                    </Popover>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" className="w-full justify-start font-normal">
                                                <CalendarClock className="mr-2 h-4 w-4" />
                                                {eventDetails.dateTime ? format(eventDetails.dateTime, 'p') : 'Select time'}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-2">
                                            <div className="grid grid-cols-2 gap-2">
                                                {popularTimes.map(time => <Button key={time} variant="ghost" size="sm" onClick={() => setEventTime(time)}>{time}</Button>)}
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </div>
                        )}
                    </CardContent>
                    </Card>

                    <LeadLogView lead={lead} appSettings={appSettings} />
                </TabsContent>
                
                <TabsContent value="tasks" className="space-y-4">
                {scheduledEvents.length > 0 && (
                    <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-muted-foreground px-1">Upcoming Events</h3>
                    {scheduledEvents.map(event => (
                        <Button key={event.id} variant="outline" className="w-full justify-between h-auto py-2" onClick={() => setEventToManage(event)}>
                        <div className="text-left">
                            <p className="font-semibold">{event.eventDetails?.type}</p>
                            <p className="text-xs text-muted-foreground">{format(toDate(event.eventDetails!.dateTime)!, 'PP @ p')}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground"/>
                        </Button>
                    ))}
                    </div>
                )}
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
                </TabsContent>
            </Tabs>
            <AlertDialog open={!!eventToManage} onOpenChange={(open) => {if (!open) setEventToManage(null)}}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Manage Event: {eventToManage?.eventDetails?.type}</AlertDialogTitle>
                        <AlertDialogDescription>
                            What would you like to do with this event?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="py-4 space-y-4">
                        <Button variant="outline" className="w-full" onClick={() => handleEventManagement('Completed')}>Mark as Completed</Button>
                        <Button variant="outline" className="w-full" onClick={() => handleEventManagement('Cancelled')}>Cancel Event</Button>
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-center">Or reschedule:</p>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-full">
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {rescheduleDate ? format(rescheduleDate, 'PPP p') : 'Select new date & time'}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar mode="single" selected={rescheduleDate} onSelect={setRescheduleDate} />
                                    <div className="p-2 border-t grid grid-cols-2 gap-2">
                                        {popularTimes.map(time => {
                                            const [h,m] = time.split(':').map(Number);
                                            return <Button key={time} variant="ghost" size="sm" onClick={() => setRescheduleDate(d => { const newD = d || new Date(); newD.setHours(h,m,0,0); return new Date(newD); })}>{time}</Button>
                                        })}
                                    </div>
                                </PopoverContent>
                            </Popover>
                            <Button className="w-full" onClick={() => handleEventManagement('Rescheduled')} disabled={!rescheduleDate || isEventActionLoading}>
                                {isEventActionLoading && <Loader2 className="animate-spin mr-2"/>} Reschedule
                            </Button>
                        </div>
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setEventToManage(null)}>Close</AlertDialogCancel>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
