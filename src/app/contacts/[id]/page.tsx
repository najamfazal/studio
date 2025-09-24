

"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, orderBy, arrayUnion } from 'firebase/firestore';
import { useParams, useRouter } from 'next/navigation';
import { produce } from 'immer';
import { ArrowLeft, Users, Mail, Phone, User, Briefcase, Clock, Radio, Plus, Trash2, Check, Loader2, ChevronRight, Info, CalendarClock, CalendarPlus, Send, ThumbsDown, ThumbsUp, X, BookOpen, Calendar as CalendarIcon, Settings } from 'lucide-react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { addDays, format, formatDistanceToNowStrict, parseISO } from 'date-fns';

import { db } from '@/lib/firebase';
import type { AppSettings, Lead, CourseSchedule, SessionGroup, Interaction, Task, InteractionFeedback, QuickLogType, OutcomeType } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Logo } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EditableField } from '@/components/editable-field';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from '@/components/ui/alert-dialog';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { SidebarTrigger } from '@/components/ui/sidebar';


const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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

export default function ContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { toast } = useToast();

  const [lead, setLead] = useState<Lead | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Schedule Management State
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<SessionGroup | null>(null);
  const [currentSchedule, setCurrentSchedule] = useState<CourseSchedule | null>(null);

  // Interactions state
  const [interactions, setInteractions] = useState<Interaction[]>([]);

  // Tasks state
  const [activeTasks, setActiveTasks] = useState<Task[]>([]);
  const [pastTasks, setPastTasks] = useState<Task[]>([]);
  const [isTasksLoading, setIsTasksLoading] = useState(false);
  const [lastActiveTask, setLastActiveTask] = useState<any | null>(null);
  const [lastPastTask, setLastPastTask] = useState<any | null>(null);
  const [hasMoreActiveTasks, setHasMoreActiveTasks] = useState(true);
  const [hasMorePastTasks, setHasMorePastTasks] = useState(true);
  const [tasksTabLoaded, setTasksTabLoaded] = useState(false);
  
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

  const fetchInitialData = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const leadDocRef = doc(db, 'leads', id);
      const leadDoc = await getDoc(leadDocRef);

      if (leadDoc.exists()) {
        const leadData = { id: leadDoc.id, ...leadDoc.data() } as Lead;
        setLead(leadData);
        setCurrentSchedule(leadData.courseSchedule || { sessionGroups: [] });
        setInteractions((leadData.interactions || []).sort((a,b) => toDate(b.createdAt)!.getTime() - toDate(a.createdAt)!.getTime()));
      } else {
        toast({ variant: 'destructive', title: 'Contact not found.' });
        router.push('/contacts');
        return;
      }
      
      const settingsDocRef = doc(db, 'settings', 'appConfig');
      const settingsDoc = await getDoc(settingsDocRef);
      if(settingsDoc.exists()) {
        setAppSettings(settingsDoc.data() as AppSettings);
      }
    } catch (error) {
      console.error('Error fetching initial data:', error);
      toast({ variant: 'destructive', title: 'Failed to load contact data.' });
    } finally {
        setIsLoading(false);
    }
  }, [id, router, toast]);

  const scheduledEvents = useMemo(() => {
    return (lead?.interactions || [])
      .filter(i => i.outcome === 'Event Scheduled' && i.eventDetails?.status === 'Scheduled')
      .sort((a,b) => toDate(a.eventDetails!.dateTime)!.getTime() - toDate(b.eventDetails!.dateTime)!.getTime());
  }, [lead?.interactions]);


  const fetchTasks = useCallback(async (type: 'active' | 'past', loadMore = false) => {
    if (!id) return;
    if (!loadMore) setIsTasksLoading(true);
    
    try {
      const isCompleted = type === 'past';
      const qConstraints: any[] = [
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, toast]);


  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);
  
  useEffect(() => {
    if (tasksTabLoaded) {
      setHasMoreActiveTasks(true);
      setHasMorePastTasks(true);
      setLastActiveTask(null);
      setLastPastTask(null);
      fetchTasks('active');
      fetchTasks('past');
    }
  }, [tasksTabLoaded, fetchTasks]);

  const handleUpdate = async (field: keyof Lead | string, value: any) => {
    if (!lead) return;
    
    const updatePayload: { [key: string]: any } = {};
    updatePayload[field] = value;
    
    const originalLead = { ...lead };
    
    const updatedLead = produce(lead, draft => {
        const keys = field.split('.');
        let current: any = draft;
        keys.slice(0, -1).forEach(key => {
            if (!current[key]) current[key] = {};
            current = current[key];
        });
        current[keys[keys.length - 1]] = value;
    });
    setLead(updatedLead);
    
    try {
      const leadRef = doc(db, 'leads', id);
      await updateDoc(leadRef, updatePayload);
      toast({ title: 'Contact Updated' });
    } catch (error) {
      console.error('Error updating contact:', error);
      toast({ variant: 'destructive', title: 'Update failed' });
      setLead(originalLead); // Revert on failure
    }
  };

  const generateScheduleSummary = (schedule: CourseSchedule | null | undefined): string => {
    if (!schedule || !schedule.sessionGroups || schedule.sessionGroups.length === 0) {
      return 'Not set.';
    }
  
    const mode = schedule.sessionGroups[0]?.mode || '';
    const format = schedule.sessionGroups[0]?.format || '';

    const summaryParts = schedule.sessionGroups.map(group => {
      const days = group.schedule.map(s => s.day.substring(0, 3)).join(', ');
      const times = [...new Set(group.schedule.map(s => s.timeSlot.replace(/\s/g, '')))].join(', ');
      const sections = group.sections.join(', ');
      
      let part = `${group.trainer} (${sections}): ${days} ${times}`;
      return part;
    });
  
    return `${mode}, ${format} | ${summaryParts.join(' | ')}`;
  };
  
  const handleScheduleSave = async (newSchedule: CourseSchedule) => {
    if (!lead) return;
    const summary = generateScheduleSummary(newSchedule);
    
    const updatePayload = {
      courseSchedule: newSchedule,
      'commitmentSnapshot.schedule': summary
    };

    setLead(prev => prev ? produce(prev, draft => {
      draft.courseSchedule = newSchedule;
      if (draft.commitmentSnapshot) {
        draft.commitmentSnapshot.schedule = summary;
      }
    }) : null);

    setCurrentSchedule(newSchedule);
    
    try {
      const leadRef = doc(db, 'leads', id);
      await updateDoc(leadRef, updatePayload);
      toast({ title: 'Schedule Updated' });
      setIsScheduleModalOpen(false);
      setEditingGroup(null);
    } catch (error) {
      console.error('Error updating schedule:', error);
      toast({ variant: 'destructive', title: 'Failed to save schedule.' });
    }
  };

  const handleTabChange = (value: string) => {
    if (value === 'tasks' && !tasksTabLoaded) {
      setTasksTabLoaded(true);
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
    handleUpdate(type, newList);

    if (type === 'insights') {
      setNewInsight("");
    }
  };
  
  const handleRemoveChip = (type: 'traits' | 'insights', value: string) => {
    if (!lead) return;
    const newList = (lead[type] || []).filter(item => item !== value);
    handleUpdate(type, newList);
  };

  const handleLogInteraction = async (interactionData: Partial<Interaction>) => {
    if (!lead) return;

    const leadRef = doc(db, 'leads', id);
    const newInteraction: Interaction = {
      id: `new-${Date.now()}`,
      ...interactionData,
      createdAt: new Date().toISOString(),
    } as Interaction;
    
    // Optimistic UI Update
    const optimisticLead = produce(lead, draft => {
      if (!draft.interactions) draft.interactions = [];
      draft.interactions.push(newInteraction);
    });
    setLead(optimisticLead);
    setInteractions(optimisticLead.interactions.sort((a,b) => toDate(b.createdAt)!.getTime() - toDate(a.createdAt)!.getTime()));
    
    try {
      await updateDoc(leadRef, {
        interactions: arrayUnion(newInteraction)
      });
      toast({ title: 'Interaction Logged' });
      // Re-fetch lead to get latest server state (including what cloud functions might do)
      fetchInitialData(); 
    } catch (error) {
      console.error("Error logging interaction:", error);
      toast({ variant: "destructive", title: "Failed to log interaction." });
      setLead(lead); // Revert on failure
      setInteractions(lead.interactions || []);
    }
  }
  
  const handleQuickLog = async () => {
    if (!selectedQuickLog || !lead) return;
    
    if (quickLogStep === 'withdrawn' && withdrawalReasons.length === 0) {
        toast({ variant: 'destructive', title: "Please select a reason for withdrawal."});
        return;
    }

    setSubmissionState('submitting');
    
    let interaction: Partial<Interaction> = {
        quickLogType: selectedQuickLog,
    };

    if (selectedQuickLog === 'Withdrawn') {
        interaction.withdrawalReasons = withdrawalReasons;
    }

    await handleLogInteraction(interaction);
    
    setSubmissionState('submitted');
    setTimeout(() => {
        setSubmissionState('idle');
        setSelectedQuickLog(null);
        setQuickLogStep('initial');
        setWithdrawalReasons([]);
    }, 1000);
  }

  const handleLogFeedback = async () => {
    if (Object.keys(feedback).length === 0 || !lead) {
        toast({ variant: 'destructive', title: "Nothing to log", description: "Please select a perception first." });
        return;
    }
    setIsLoggingFeedback(true);
    
    const interactionPayload = { feedback };
    await handleLogInteraction(interactionPayload);

    setFeedback({});
    setActiveChipCategory(null);
    setIsLoggingFeedback(false);
  }

  const handleLogOutcome = async () => {
    if (!selectedOutcome || !lead) return;
    setIsLoggingOutcome(true);

    let interactionPayload: Partial<Interaction> = {
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

    await handleLogInteraction(interactionPayload);

    setSelectedOutcome(null);
    setOutcomeNotes('');
    setFollowUpDate(undefined);
    setEventDetails({ type: '', dateTime: undefined });
    setIsLoggingOutcome(false);
  };
  
  const handleEventManagement = async (action: 'Completed' | 'Cancelled' | 'Rescheduled') => {
    if (!eventToManage || !lead) return;
    setIsEventActionLoading(true);

    try {
        let newInteraction: Partial<Interaction>;
        let interactionToUpdateId: string = eventToManage.id;

        if (action === 'Rescheduled') {
            if (!rescheduleDate) { toast({variant: 'destructive', title: 'Please select a new date.'}); setIsEventActionLoading(false); return; }
            
            newInteraction = {
                outcome: 'Event Scheduled',
                eventDetails: {
                    type: eventToManage.eventDetails?.type,
                    dateTime: rescheduleDate.toISOString(),
                    status: 'Scheduled',
                    rescheduledFrom: eventToManage.eventDetails?.dateTime,
                },
                notes: `Rescheduled from ${format(toDate(eventToManage.eventDetails!.dateTime)!, 'PPp')}`
            };
            await handleLogInteraction(newInteraction);
            
            // Mark original as cancelled
            const updatedLead = produce(lead, draft => {
                const interaction = draft.interactions?.find(i => i.id === interactionToUpdateId);
                if (interaction && interaction.eventDetails) {
                    interaction.eventDetails.status = 'Cancelled';
                }
            });
            await updateDoc(doc(db, 'leads', id), { interactions: updatedLead.interactions });

            toast({title: 'Event Rescheduled'});

        } else { // Completed or Cancelled
            const updatedLead = produce(lead, draft => {
                const interaction = draft.interactions?.find(i => i.id === interactionToUpdateId);
                if (interaction && interaction.eventDetails) {
                    interaction.eventDetails.status = action;
                }
            });
            await updateDoc(doc(db, 'leads', id), { interactions: updatedLead.interactions });
            
            newInteraction = {
                notes: `Event ${eventToManage.eventDetails?.type} marked as ${action}.`
            };
            await handleLogInteraction(newInteraction);

            toast({title: `Event ${action}`});
        }
        
        fetchInitialData(); // Refresh all data
        setEventToManage(null);
        setRescheduleDate(undefined);
    } catch (error) {
        console.error(`Error handling event ${action}:`, error);
        toast({variant: 'destructive', title: `Failed to update event.`});
        fetchInitialData(); // Revert on error
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

  const handleScheduleChange = (value: string, type: 'mode' | 'format') => {
    if (value === undefined || !lead) return;

    if(value === '' && lead.courseSchedule?.sessionGroups?.[0]?.[type]){
        // It's a deselect, do nothing if there is a value already
        return;
    }
    
    if(!value && !lead.courseSchedule?.sessionGroups?.[0]?.[type]){
        // It's a deselect but there's no value, so do nothing.
        return;
    }

    const newSchedule = produce(lead.courseSchedule || { sessionGroups: [] }, draft => {
        if (!draft.sessionGroups) draft.sessionGroups = [];
        if (draft.sessionGroups.length === 0) { // If no groups, create one
          draft.sessionGroups.push({
            groupId: `group_${Date.now()}`,
            trainer: '',
            sections: [],
            schedule: [],
            mode: 'Online',
            format: '1-1',
          });
        }
        draft.sessionGroups.forEach(g => { 
            if (type === 'mode') g.mode = value as 'Online' | 'In-person';
            if (type === 'format') g.format = value as '1-1' | 'Batch';
        });
    });
    handleScheduleSave(newSchedule);
  };

  const handleSessionGroupDelete = (groupId: string) => {
      if (!lead) return;
      const newSchedule = produce(lead.courseSchedule, draft => {
          if (draft && draft.sessionGroups) {
              draft.sessionGroups = draft.sessionGroups.filter(g => g.groupId !== groupId);
          }
      });
      if (newSchedule) handleScheduleSave(newSchedule);
  };

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

  const isLearner = useMemo(() => lead?.relationship?.toLowerCase() === 'learner', [lead]);

  if (isLoading || !lead || !appSettings) {
    return <div className="flex h-screen items-center justify-center"><Logo className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="bg-card border-b p-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <SidebarTrigger />
                <Button variant="ghost" size="icon" asChild className="hidden sm:inline-flex">
                    <Link href="/contacts"><ArrowLeft/></Link>
                </Button>
                <div>
                    <h1 className="text-xl font-bold tracking-tight">{lead.name}</h1>
                    <div className="flex items-center gap-2">
                        <Badge variant={lead.status === 'Active' ? 'default' : 'secondary'}>{lead.status}</Badge>
                        <Separator orientation="vertical" className="h-4"/>
                        <p className="text-sm text-muted-foreground">{lead.relationship}</p>
                    </div>
                </div>
            </div>
             <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" asChild>
                    <Link href="/settings"><Settings/></Link>
                </Button>
            </div>
        </div>
      </header>
      
      <main className="flex-1 p-4 sm:p-6 md:p-8">
        <Tabs defaultValue="overview" onValueChange={handleTabChange} className="w-full">
            <TabsList className={cn("grid w-full grid-cols-3", isLearner && "grid-cols-4")}>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              {isLearner && <TabsTrigger value="schedule">Schedule</TabsTrigger>}
              <TabsTrigger value="logs">Logs</TabsTrigger>
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
            </TabsList>
            
            <TabsContent value="overview" className="space-y-4 mt-4">
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
                      <EditableField label="Course" value={lead.commitmentSnapshot?.course || ""} onSave={(val) => handleUpdate('commitmentSnapshot.course', val)} type="select" selectOptions={appSettings.courseNames || []} placeholder="Select a course"/>
                      </div>
                      <div className="flex-grow-[1]">
                      <EditableField label="Price" value={lead.commitmentSnapshot?.price || ""} onSave={(val) => handleUpdate('commitmentSnapshot.price', val)} inputType="number" placeholder="Enter price"/>
                      </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Schedule</Label>
                    <p className="text-sm min-h-[20px] flex items-center">
                        {lead.commitmentSnapshot?.schedule || "Not set. Manage in Schedule tab."}
                    </p>
                  </div>
                  <div>
                      <EditableField label="Key Notes" value={lead.commitmentSnapshot?.keyNotes || ""} onSave={(val) => handleUpdate('commitmentSnapshot.keyNotes', val)} type="textarea" placeholder="Add key negotiation points..."/>
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

            {isLearner && (
              <TabsContent value="schedule" className="mt-4">
                <Card>
                   <CardHeader>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <CardTitle className="text-lg lg:text-xl">Training Schedule</CardTitle>
                        <Button onClick={() => setIsScheduleModalOpen(true)} size="sm">
                            <Plus className="mr-2 h-4 w-4"/> 
                            <span className="sm:hidden md:inline">Add Session Group</span>
                            <span className="hidden sm:inline md:hidden">Add Group</span>
                        </Button>
                      </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-md border p-4">
                          <div className="flex items-center space-x-2">
                              <Label className="flex-shrink-0">Mode:</Label>
                                <ToggleGroup 
                                    type="single" 
                                    variant="outline"
                                    size="sm"
                                    value={lead.courseSchedule?.sessionGroups?.[0]?.mode || ''}
                                    onValueChange={(value) => handleScheduleChange(value, 'mode')}
                                    >
                                  <ToggleGroupItem value="Online">Online</ToggleGroupItem>
                                  <ToggleGroupItem value="In-person">In-person</ToggleGroupItem>
                                </ToggleGroup>
                          </div>
                          <Separator orientation="vertical" className="h-6 hidden sm:block"/>
                          <div className="flex items-center space-x-2">
                              <Label className="flex-shrink-0">Format:</Label>
                                <ToggleGroup 
                                    type="single" 
                                    variant="outline"
                                    size="sm"
                                    value={lead.courseSchedule?.sessionGroups?.[0]?.format || ''}
                                    onValueChange={(value) => handleScheduleChange(value, 'format')}
                                    >
                                  <ToggleGroupItem value="1-1">1-on-1</ToggleGroupItem>
                                  <ToggleGroupItem value="Batch">Batch</ToggleGroupItem>
                                </ToggleGroup>
                          </div>
                      </div>

                      {lead.courseSchedule?.sessionGroups && lead.courseSchedule.sessionGroups.length > 0 ? (
                      lead.courseSchedule.sessionGroups.map((group) => (
                          <Card key={group.groupId} className="overflow-hidden">
                          <CardHeader className="bg-muted/50 p-4">
                              <div className="flex items-center justify-between">
                              <div className="grid gap-0.5">
                                  <CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground"/> {group.trainer}</CardTitle>
                                  {group.sections && group.sections.length > 0 && (
                                    <CardDescription className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-muted-foreground"/>{group.sections.join(', ')}</CardDescription>
                                  )}
                              </div>
                              <div className="flex items-center gap-2">
                                  <Button variant="ghost" size="sm" onClick={() => { setEditingGroup(group); setIsScheduleModalOpen(true); }}>Edit</Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleSessionGroupDelete(group.groupId)}>
                                      <Trash2 className="h-4 w-4"/>
                                  </Button>
                              </div>
                              </div>
                          </CardHeader>
                          <CardContent className="p-4 text-sm">
                              <ul className="space-y-2">
                                  {group.schedule.map((s, i) => (
                                  <li key={i} className="flex items-center gap-2">
                                      <Clock className="h-4 w-4 text-muted-foreground"/> <span>{s.day} @ {s.timeSlot}</span>
                                  </li>
                                  ))}
                              </ul>
                          </CardContent>
                          </Card>
                      ))
                      ) : (
                      <div className="text-center text-muted-foreground py-10">No schedule set up for this learner yet.</div>
                      )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            <TabsContent value="logs" className="space-y-4 mt-4">
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
                            <Button onClick={handleQuickLog} size="icon" variant="ghost" disabled={isSubmitDisabled()}>
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
                                <Button onClick={handleQuickLog} size="icon" variant="ghost" disabled={isSubmitDisabled()}>
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

                <Card>
                  <CardHeader className="p-4">
                      <CardTitle className="text-lg font-normal">Log History</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 p-4 pt-0">
                      <TooltipProvider>
                      {interactions.length > 0 ? (
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
                                                  {interactionDate ? formatRelativeTime(interactionDate) : ''}
                                              </p>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                              <p className="text-xs">{interactionDate ? format(interactionDate, 'PP p'): ''}</p>
                                          </TooltipContent>
                                      </Tooltip>
                                  </div>
                                  <p className="text-muted-foreground capitalize text-xs">
                                  {interaction.feedback ? formatFeedbackLog(interaction.feedback) 
                                  : interaction.eventDetails ? `${interaction.eventDetails.type} at ${format(toDate(interaction.eventDetails.dateTime)!, 'PPp')}`
                                  : interaction.withdrawalReasons ? `Reasons: ${interaction.withdrawalReasons.join(', ')}`
                                  : interaction.notes}
                                  </p>
                              </div>
                              )
                          })}
                          </div>
                      ) : (
                          <p className="text-sm text-center text-muted-foreground p-4">No interactions have been logged yet.</p>
                      )}
                      </TooltipProvider>
                  </CardContent>
                </Card>
            </TabsContent>
            
            <TabsContent value="tasks" className="space-y-4 mt-4">
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
      </main>
      
       {isScheduleModalOpen && appSettings && (
          <ScheduleEditorModal
            isOpen={isScheduleModalOpen}
            onClose={() => { setIsScheduleModalOpen(false); setEditingGroup(null); }}
            onSave={handleScheduleSave}
            appSettings={appSettings}
            learnerSchedule={currentSchedule}
            editingGroup={editingGroup}
          />
       )}

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
    </div>
  );
}

interface ScheduleEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (schedule: CourseSchedule) => void;
  appSettings: AppSettings;
  learnerSchedule: CourseSchedule | null | undefined;
  editingGroup: SessionGroup | null;
}

function ScheduleEditorModal({ isOpen, onClose, onSave, appSettings, learnerSchedule, editingGroup }: ScheduleEditorModalProps) {
  const [sessionGroup, setSessionGroup] = useState<Partial<SessionGroup>>({});
  const { toast } = useToast();
  
  useEffect(() => {
    if (editingGroup) {
      setSessionGroup(editingGroup);
    } else {
      setSessionGroup({
        groupId: `group_${Date.now()}`,
        sections: [],
        schedule: [],
        mode: learnerSchedule?.sessionGroups?.[0]?.mode || 'Online',
        format: learnerSchedule?.sessionGroups?.[0]?.format || '1-1',
      });
    }
  }, [editingGroup, isOpen, learnerSchedule]);

  const handleSave = () => {
    const finalGroup = sessionGroup as SessionGroup;
    if (!finalGroup.trainer || !finalGroup.schedule?.length) {
      toast({ variant: "destructive", title: "Trainer and at least one schedule entry are required." });
      return;
    }
    
    // Ensure sections is an array, even if empty
    if (!finalGroup.sections) {
      finalGroup.sections = [];
    }

    const newSchedule = produce(learnerSchedule || { sessionGroups: [] }, draft => {
        if (!draft.sessionGroups) draft.sessionGroups = [];
        const overallMode = draft.sessionGroups[0]?.mode || finalGroup.mode;
        const overallFormat = draft.sessionGroups[0]?.format || finalGroup.format;

        finalGroup.mode = overallMode;
        finalGroup.format = overallFormat;

       const existingGroupIndex = draft.sessionGroups.findIndex(g => g.groupId === finalGroup.groupId);
       if (existingGroupIndex > -1) {
          draft.sessionGroups[existingGroupIndex] = finalGroup;
       } else {
          draft.sessionGroups.push(finalGroup);
       }
    });

    onSave(newSchedule);
  };
  
  const handleDayTimeChange = (index: number, day: string, time: string) => {
    const newSchedule = produce(sessionGroup.schedule || [], draft => {
      draft[index] = { day, timeSlot: time };
    });
    setSessionGroup(prev => ({ ...prev, schedule: newSchedule }));
  };

  const addDayTime = () => {
    const newSchedule = produce(sessionGroup.schedule || [], draft => {
        draft.push({ day: 'Monday', timeSlot: appSettings.timeSlots?.[0] || ''});
    });
    setSessionGroup(prev => ({...prev, schedule: newSchedule }));
  };
  
  const removeDayTime = (index: number) => {
    const newSchedule = produce(sessionGroup.schedule || [], draft => {
        draft.splice(index, 1);
    });
    setSessionGroup(prev => ({ ...prev, schedule: newSchedule }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingGroup ? 'Edit' : 'Add'} Session Group</DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div>
            <Label>Trainer</Label>
            <Select 
              value={sessionGroup.trainer} 
              onValueChange={trainer => setSessionGroup(prev => ({...prev, trainer}))}>
              <SelectTrigger>
                <SelectValue placeholder="Select a trainer..." />
              </SelectTrigger>
              <SelectContent>
                {appSettings?.trainers?.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Sections/Subjects (Optional)</Label>
            <Input 
              placeholder="e.g. Power BI, Excel"
              value={sessionGroup.sections?.join(', ')}
              onChange={e => setSessionGroup(prev => ({...prev, sections: e.target.value.split(',').map(s => s.trim())}))} />
          </div>
          <div className="space-y-2">
            <Label>Schedule</Label>
            {sessionGroup.schedule?.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select value={s.day} onValueChange={day => handleDayTimeChange(i, day, s.timeSlot)}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>
                        {daysOfWeek.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={s.timeSlot} onValueChange={time => handleDayTimeChange(i, s.day, time)}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>
                        {appSettings?.timeSlots?.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" onClick={() => removeDayTime(i)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addDayTime}><Plus className="mr-2 h-4 w-4"/> Add Day/Time</Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

    