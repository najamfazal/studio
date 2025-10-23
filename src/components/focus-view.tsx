

"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { doc, updateDoc, arrayUnion, collection, query, where, orderBy, limit, startAfter, getDocs, getDoc } from 'firebase/firestore';
import { produce } from 'immer';
import { Loader2, ArrowLeft, Send, ThumbsDown, ThumbsUp, Info, CalendarClock, CalendarPlus, X, Calendar as CalendarIcon, Mail, Phone, Book, XIcon, Pencil, CheckIcon, Plus, Trash2, FileUp, Copy, CircleUser, Check, ListTodo, Clock, NotebookPen } from 'lucide-react';
import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';

import { db } from '@/lib/firebase';
import type { AppSettings, Lead, Interaction, Task, InteractionFeedback, QuickLogType, OutcomeType, Deal, SalesCatalog, QuoteLine, LeadStatus } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { DateTimePicker } from '@/components/date-time-picker';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { EditableField } from './editable-field';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from './ui/alert-dialog';
import { WhatsAppIcon } from './icons';
import { LeadDialog } from './lead-dialog';
import { LeadFormValues } from '@/lib/schemas';
import { Input } from './ui/input';
import { QuoteManager } from './quote-manager';
import { createLeadAction } from '@/app/actions';

const TASK_PAGE_SIZE = 5;

const quickLogOptions: { value: QuickLogType; label: string, multistep: 'initial' | 'withdrawn' | null }[] = [
    { value: "Followup", label: "Followup", multistep: null },
    { value: "Initiated", label: "Initiated", multistep: null },
    { value: "Unresponsive", label: "Unresponsive", multistep: null },
    { value: "Unchanged", label: "Unchanged", multistep: null },
    { value: "Withdrawn", label: "Withdrawn", multistep: 'withdrawn' },
    { value: "Enrolled", label: "Enrolled", multistep: null },
];

const eventTypes = ["Online Meet", "Online Demo", "Physical Demo", "Visit"];
type QuickLogStep = 'initial' | 'withdrawn';
type FeedbackCategory = keyof InteractionFeedback;

interface FocusViewProps {
    lead: Lead | null;
    task: Task;
    appSettings: AppSettings | null;
    onInteractionLogged: () => void;
    onLeadUpdate: (updatedLead: Lead) => void;
    onTaskUpdate: (updatedTask: Task) => void;
}

const toDate = (dateValue: any): Date | null => {
    if (!dateValue) return null;
    if (typeof dateValue === "string") return parseISO(dateValue);
    if (dateValue.toDate) return dateValue.toDate(); // Firestore Timestamp
    if (dateValue.seconds) return new Date(dateValue.seconds * 1000);
    return null;
};

const formatRelativeTime = (date: Date) => {
    const distance = formatDistanceToNowStrict(date, { addSuffix: true });
    return distance.replace(/ seconds?/, 's').replace(/ minutes?/, 'm').replace(/ hours?/, 'h').replace(/ days?/, 'd').replace(/ months?/, 'mo').replace(/ years?/, 'y');
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

export function FocusView({ lead, task, appSettings, onInteractionLogged, onLeadUpdate, onTaskUpdate }: FocusViewProps) {
    const { toast } = useToast();

    const [currentLead, setCurrentLead] = useState(lead);
    const [currentTask, setCurrentTask] = useState(task);
    const [salesCatalog, setSalesCatalog] = useState<SalesCatalog | null>(null);

    const [feedback, setFeedback] = useState<InteractionFeedback>({});
    const [isLoggingFeedback, setIsLoggingFeedback] = useState(false);
    const [activeChipCategory, setActiveChipCategory] = useState<FeedbackCategory | null>(null);

    const [quickLogStep, setQuickLogStep] = useState<QuickLogStep>('initial');
    const [selectedQuickLog, setSelectedQuickLog] = useState<QuickLogType | null>(null);
    const [submissionState, setSubmissionState] = useState<'idle' | 'submitting' | 'submitted'>('idle');
    const [withdrawalReasons, setWithdrawalReasons] = useState<string[]>([]);
    
    const [selectedOutcome, setSelectedOutcome] = useState<OutcomeType | null>(null);
    const [isLoggingOutcome, setIsLoggingOutcome] = useState(false);
    const [outcomeNotes, setOutcomeNotes] = useState("");
    const [isDateTimePickerOpen, setIsDateTimePickerOpen] = useState(false);
    const [dateTimePickerValue, setDateTimePickerValue] = useState<Date | undefined>(undefined);
    const [dateTimePickerCallback, setDateTimePickerCallback] = useState<(date: Date) => void>(() => {});
    
    const [isLoggingInfo, setIsLoggingInfo] = useState(false);
    const [selectedInfoLogs, setSelectedInfoLogs] = useState<string[]>([]);

    const [isLeadDialogOpen, setIsLeadDialogOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    
    const [newInsight, setNewInsight] = useState("");
    const [isTraitPopoverOpen, setIsTraitPopoverOpen] = useState(false);
    
    const [isUpdatingTask, setIsUpdatingTask] = useState(false);
    
    // Task Tab State
    const [tasksTabLoaded, setTasksTabLoaded] = useState(false);
    const [activeTasks, setActiveTasks] = useState<Task[]>([]);
    const [pastTasks, setPastTasks] = useState<Task[]>([]);
    const [isTasksLoading, setIsTasksLoading] = useState(false);
    const [lastActiveTask, setLastActiveTask] = useState<any | null>(null);
    const [lastPastTask, setLastPastTask] = useState<any | null>(null);
    const [hasMoreActiveTasks, setHasMoreActiveTasks] = useState(true);
    const [hasMorePastTasks, setHasMorePastTasks] = useState(true);

    useEffect(() => {
        if (!salesCatalog) {
            getDoc(doc(db, 'settings', 'salesCatalog')).then(docSnap => {
                if(docSnap.exists()) setSalesCatalog(docSnap.data() as SalesCatalog)
            });
        }
    }, [salesCatalog]);

    useEffect(() => {
        setCurrentLead(lead);
        // Reset tasks when lead changes
        setTasksTabLoaded(false);
        setActiveTasks([]);
        setPastTasks([]);
        setLastActiveTask(null);
        setLastPastTask(null);
        setHasMoreActiveTasks(true);
        setHasMorePastTasks(true);
    }, [lead]);
    
    useEffect(() => {
        setCurrentTask(task);
    }, [task]);

    const fetchTasks = useCallback(async (type: 'active' | 'past', loadMore = false) => {
        if (!currentLead?.id) return;
        if (!loadMore) setIsTasksLoading(true);
        
        try {
          const isCompleted = type === 'past';
          const qConstraints: any[] = [
            where('leadId', '==', currentLead.id),
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
      }, [currentLead?.id, toast, lastActiveTask, lastPastTask]);
    
    const refreshTasks = useCallback(() => {
        setLastActiveTask(null);
        setLastPastTask(null);
        fetchTasks('active');
        fetchTasks('past');
    }, [fetchTasks]);

    useEffect(() => {
        if (tasksTabLoaded) {
            refreshTasks();
        }
    }, [tasksTabLoaded, refreshTasks]);

    const handleTabChange = (value: string) => {
        if (value === 'tasks' && !tasksTabLoaded) {
          setTasksTabLoaded(true);
        }
    };

    const handleTaskCompletionInTab = async (task: Task, isCompleted: boolean) => {
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


    const sortedInteractions = useMemo(() => {
        if (!currentLead) return [];
        return (currentLead.interactions || []).slice().sort((a,b) => toDate(b.createdAt)!.getTime() - toDate(a.createdAt)!.getTime());
    }, [currentLead]);
    
    const handleUpdate = async (field: string, value: any) => {
        if (!currentLead) return;
        
        let updatePayload: { [key: string]: any } = {};
        updatePayload[field] = value;
        
        const updatedLead = produce(currentLead, draft => {
            const keys = field.split('.');
            let current: any = draft;
            keys.slice(0, -1).forEach(key => {
                if (!current[key]) current[key] = {};
                current = current[key];
            });
            current[keys[keys.length - 1]] = value;
        });
       
        setCurrentLead(updatedLead);
        if (onLeadUpdate) {
            onLeadUpdate(updatedLead);
        }
        
        try {
          const leadRef = doc(db, 'leads', currentLead.id);
          await updateDoc(leadRef, updatePayload);
          toast({ title: 'Contact Updated' });
        } catch (error) {
          console.error('Error updating contact:', error);
          toast({ variant: 'destructive', title: 'Update failed' });
          if (lead) {
            setCurrentLead(lead);
             if (onLeadUpdate) {
                onLeadUpdate(lead);
            }
          }
        }
    };

     const handleQuoteLinesUpdate = (newQuoteLines: QuoteLine[]) => {
      handleUpdate('commitmentSnapshot.quoteLines', newQuoteLines);
    }
    
    const handleDialogSave = async (values: LeadFormValues) => {
        setIsSaving(true);
        try {
            if (currentLead) { // Update existing lead
                const updatedLeadData: Partial<Lead> = {
                    name: values.name,
                    email: values.email,
                    phones: values.phones,
                    relationship: values.relationship,
                    status: values.status as LeadStatus,
                    source: values.source,
                    assignedAt: values.assignedAt,
                };
                await updateDoc(doc(db, 'leads', currentLead.id), updatedLeadData);
                const updatedLead = { ...currentLead, ...updatedLeadData };
                setCurrentLead(updatedLead);
                if (onLeadUpdate) onLeadUpdate(updatedLead);
                toast({ title: 'Contact Updated' });
            } else { // This case should ideally not be hit from FocusView, but as a fallback:
                const result = await createLeadAction(values);
                if (!result.success) throw new Error(result.error);
                const newLeadDoc = await getDoc(doc(db, 'leads', result.id!));
                if (newLeadDoc.exists()) {
                    const newLead = { id: newLeadDoc.id, ...newLeadDoc.data() } as Lead;
                    setCurrentLead(newLead);
                    if (onLeadUpdate) onLeadUpdate(newLead);
                }
                toast({ title: 'Contact Created' });
            }
            setIsLeadDialogOpen(false);
        } catch (error) {
            console.error("Error saving contact from dialog:", error);
            toast({ variant: 'destructive', title: 'Update failed' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleLogInteraction = async (interactionData: Partial<Interaction>) => {
        if (!currentLead) return;
    
        const leadRef = doc(db, 'leads', currentLead.id);
        const newInteraction: Interaction = {
          id: `new-${Date.now()}`,
          ...interactionData,
          createdAt: new Date().toISOString(),
        } as Interaction;
    
        const optimisticLead = produce(currentLead, draft => {
          draft.interactions = [newInteraction, ...(draft.interactions || [])];
        });
        setCurrentLead(optimisticLead);
        if (onLeadUpdate) {
            onLeadUpdate(optimisticLead);
        }
    
        try {
          await updateDoc(leadRef, { interactions: arrayUnion(newInteraction) });
          toast({ title: 'Interaction Logged' });
          if (onInteractionLogged) {
            onInteractionLogged();
          }
        } catch (error) {
          console.error("Error logging interaction:", error);
          toast({ variant: "destructive", title: "Failed to log interaction." });
          if(lead) {
            setCurrentLead(lead);
            if (onLeadUpdate) {
                onLeadUpdate(lead);
            }
          }
        }
    }

    const handleQuickLog = async () => {
        if (!selectedQuickLog || !currentLead) return;
        if (quickLogStep === 'withdrawn' && withdrawalReasons.length === 0) {
            toast({ variant: 'destructive', title: "Please select a reason for withdrawal."});
            return;
        }

        setSubmissionState('submitting');
        let interaction: Partial<Interaction> = { quickLogType: selectedQuickLog };
        if (selectedQuickLog === 'Withdrawn') interaction.withdrawalReasons = withdrawalReasons;

        await handleLogInteraction(interaction);
        
        setSubmissionState('submitted');
        setTimeout(() => {
            setSubmissionState('idle');
            setSelectedQuickLog(null);
            setQuickLogStep('initial');
            setWithdrawalReasons([]);
        }, 1000);
    }

    const handleInfoLog = async () => {
        if (selectedInfoLogs.length === 0) {
            toast({ variant: 'destructive', title: 'Please select an item to log.' });
            return;
        }
        setIsLoggingInfo(true);
        await handleLogInteraction({ infoLogs: selectedInfoLogs });
        setSelectedInfoLogs([]);
        setIsLoggingInfo(false);
    }

    const handleLogFeedback = async () => {
        if (Object.keys(feedback).length === 0 || !currentLead) {
            toast({ variant: 'destructive', title: "Nothing to log", description: "Please select a perception first." });
            return;
        }
        setIsLoggingFeedback(true);
        await handleLogInteraction({ feedback });
        setFeedback({});
        setActiveChipCategory(null);
        setIsLoggingFeedback(false);
    }
    
    const openDateTimePicker = (currentValue: Date | undefined, onSelect: (date: Date) => void) => {
        setDateTimePickerValue(currentValue);
        setDateTimePickerCallback(() => onSelect);
        setIsDateTimePickerOpen(true);
    };

    const handleLogOutcome = async () => {
        if (!selectedOutcome || !currentLead) return;
        setIsLoggingOutcome(true);

        let interactionPayload: Partial<Interaction> = { outcome: selectedOutcome };
        
        const getFollowUpDate = () => (dateTimePickerValue ? dateTimePickerValue.toISOString() : undefined);
        const getEventDateTime = () => (dateTimePickerValue ? dateTimePickerValue.toISOString() : undefined);

        if (selectedOutcome === 'Info') {
            if (!outcomeNotes) { toast({ variant: 'destructive', title: 'Info notes cannot be empty.' }); setIsLoggingOutcome(false); return; }
            interactionPayload.notes = outcomeNotes;
        } else if (selectedOutcome === 'Later') {
            const followUpDate = getFollowUpDate();
            if (!followUpDate) { toast({ variant: 'destructive', title: 'Please select a follow-up date.' }); setIsLoggingOutcome(false); return; }
            interactionPayload.followUpDate = followUpDate;
        } else if (selectedOutcome === 'Event Scheduled') {
            const eventDateTime = getEventDateTime();
            if (!currentLead.eventDetails?.type || !eventDateTime) { toast({ variant: 'destructive', title: 'Please select event type and date/time.' }); setIsLoggingOutcome(false); return; }
            interactionPayload.eventDetails = { ...currentLead.eventDetails, dateTime: eventDateTime, status: 'Scheduled' };
        }

        await handleLogInteraction(interactionPayload);

        setSelectedOutcome(null);
        setOutcomeNotes('');
        setDateTimePickerValue(undefined);
        setCurrentLead(prev => prev && produce(prev, draft => { if(draft.eventDetails) draft.eventDetails.type = '' }));
        setIsLoggingOutcome(false);
    };
    
    const handleCopyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast({ title: "Copied to clipboard", description: text });
    };

    const handleAddChip = (type: 'traits' | 'insights', value: string) => {
        if (!value || !currentLead) return;
    
        const chipValue = value.trim();
        const currentList = currentLead[type] || [];
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

    const handleAddMultipleTraits = (traitsToAdd: string[]) => {
        if (!currentLead) return;
        const currentTraits = currentLead.traits || [];
        const newTraits = [...new Set([...currentTraits, ...traitsToAdd])];
        handleUpdate('traits', newTraits);
    }
      
    const handleRemoveChip = (type: 'traits' | 'insights', value: string) => {
        if (!currentLead) return;
        const newList = (currentLead[type] || []).filter(item => item !== value);
        handleUpdate(type, newList);
    };
    
    const handleTaskCompletion = async () => {
        setIsUpdatingTask(true);
        try {
            const updatedTask = { ...currentTask, completed: true };
            await updateDoc(doc(db, 'tasks', currentTask.id), { completed: true });
            setCurrentTask(updatedTask);
            onTaskUpdate(updatedTask);
            toast({ title: 'Task Completed' });
        } catch (e) {
            toast({ variant: 'destructive', title: 'Failed to complete task' });
        } finally {
            setIsUpdatingTask(false);
        }
    }

    const availableTraits = useMemo(() => {
        if (!appSettings?.commonTraits || !currentLead?.traits) return [];
        return appSettings.commonTraits.filter(trait => !currentLead.traits.includes(trait));
    }, [appSettings?.commonTraits, currentLead?.traits]);
    
    if (!appSettings) {
        return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin" /></div>;
    }
    
    if (!currentLead) {
         if (task && task.leadId === null) {
             return (
                <div className="flex flex-col h-full items-center justify-center text-center max-w-md mx-auto">
                    <Card className="w-full">
                        <CardHeader>
                            <CardTitle className="flex items-start gap-2">
                                <NotebookPen className="h-5 w-5 mt-1 text-muted-foreground" /> 
                                <span>{task.description}</span>
                            </CardTitle>
                            {task.dueDate && <CardDescription>Due: {format(toDate(task.dueDate)!, 'PP')}</CardDescription>}
                        </CardHeader>
                        <CardFooter>
                            <Button className="w-full" onClick={handleTaskCompletion} disabled={isUpdatingTask}>
                                {isUpdatingTask && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                                Mark as Complete
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            )
        }
        return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin" /></div>;
    }

    return (
        <div className="space-y-3">
             <div>
                <div className="flex items-center gap-2 flex-wrap">
                    <h2 className={cn("text-xl font-bold", currentTask.completed && "line-through")}>{currentLead.name}</h2>
                    <Badge variant="secondary" className="text-xs">{currentLead.relationship}</Badge>
                    <Badge className="text-xs">{currentLead.status}</Badge>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsLeadDialogOpen(true)}>
                        <Pencil className="h-4 w-4" />
                    </Button>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1 flex-wrap">
                    {currentLead.source && <div className="flex items-center gap-1.5"><FileUp className="h-3 w-3" />{currentLead.source}</div>}
                    {currentLead.assignedAt && <div className="flex items-center gap-1.5"><CircleUser className="h-3 w-3" /> Assigned on {format(parseISO(currentLead.assignedAt), "MMM d, yyyy")}</div>}
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1 flex-wrap">
                    {currentLead.email && <a href={`mailto:${currentLead.email}`} className="flex items-center gap-1.5 hover:text-foreground"><Mail className="h-3 w-3" /> {currentLead.email}</a>}
                    {(currentLead.phones || []).map((phone, index) => {
                        const cleanNumber = phone.number.replace(/\D/g, '');
                        return (
                            <div key={index} className="flex items-center gap-1.5 group">
                                <Phone className="h-3 w-3" />
                                <a href={`tel:${cleanNumber}`} className="group-hover:underline">{phone.number}</a>
                                <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleCopyToClipboard(phone.number)}>
                                  <Copy className="h-3 w-3" />
                                </Button>
                                {(phone.type === 'chat' || phone.type === 'both') && 
                                    <a href={`https://wa.me/${cleanNumber}`} target="_blank" rel="noopener noreferrer"><WhatsAppIcon className="h-3 w-3" /></a>}
                            </div>
                        )
                    })}
                </div>
            </div>
            
            {task && (
                 <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 flex items-baseline gap-2 text-primary text-sm">
                    <p className="text-xs font-semibold uppercase shrink-0">Task:</p>
                    <p className={cn("font-medium", currentTask.completed && "line-through")}>{task.description}</p>
                </div>
            )}
            
            <Tabs defaultValue="snapshot" className="w-full" onValueChange={handleTabChange}>
                <TabsList className="grid w-full grid-cols-4 h-9">
                    <TabsTrigger value="snapshot" className="h-7 text-xs">Snapshot</TabsTrigger>
                    <TabsTrigger value="log" className="h-7 text-xs">Log</TabsTrigger>
                    <TabsTrigger value="history" className="h-7 text-xs">History</TabsTrigger>
                    <TabsTrigger value="tasks" className="h-7 text-xs">Tasks</TabsTrigger>
                </TabsList>
                
                <TabsContent value="snapshot" className="mt-3 space-y-3">
                     <QuoteManager 
                        lead={currentLead} 
                        salesCatalog={salesCatalog} 
                        onUpdate={handleQuoteLinesUpdate}
                        onFieldUpdate={handleUpdate}
                     />
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Card>
                            <CardHeader className="p-2"><CardTitle className="text-xs font-semibold text-muted-foreground">Insights</CardTitle></CardHeader>
                            <CardContent className="p-2 pt-0 space-y-2">
                                <div className="flex flex-wrap gap-1">
                                    {(currentLead.insights || []).map(insight => <Badge key={insight} variant="outline" className="text-xs">{insight} <button onClick={() => handleRemoveChip('insights', insight)} className="ml-1.5 p-0.5 rounded-full hover:bg-destructive/20"><X className="h-2.5 w-2.5 text-destructive"/></button></Badge>)}
                                </div>
                                <div className="flex gap-1">
                                    <Input value={newInsight} onChange={e => setNewInsight(e.target.value)} placeholder="Add an insight..." className="h-7 text-xs" onKeyDown={(e) => e.key === 'Enter' && handleAddChip('insights', newInsight)} />
                                    <Button size="icon" className="h-7 w-7" onClick={() => handleAddChip('insights', newInsight)}><Plus/></Button>
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="p-2 flex-row items-center justify-between">
                                <CardTitle className="text-xs font-semibold text-muted-foreground">Traits</CardTitle>
                                <Popover open={isTraitPopoverOpen} onOpenChange={setIsTraitPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-6 w-6"><Plus className="h-3.5 w-3.5" /></Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-56 p-0">
                                    <Command>
                                    <CommandInput placeholder="Select traits..." className="h-9" />
                                    <CommandList>
                                        <CommandEmpty>No traits found.</CommandEmpty>
                                        <CommandGroup>
                                        {availableTraits.map((trait) => (
                                            <CommandItem
                                                key={trait}
                                                value={trait}
                                                onSelect={(currentValue) => {
                                                    handleAddMultipleTraits([currentValue]);
                                                    setIsTraitPopoverOpen(false);
                                                }}
                                            >
                                                {trait}
                                            </CommandItem>
                                        ))}
                                        </CommandGroup>
                                    </CommandList>
                                    </Command>
                                </PopoverContent>
                                </Popover>
                            </CardHeader>
                            <CardContent className="p-2 pt-0">
                                <div className="flex flex-wrap gap-1">
                                    {(currentLead.traits || []).map(trait => <Badge key={trait} variant="secondary" className="text-xs">{trait} <button onClick={() => handleRemoveChip('traits', trait)} className="ml-1.5 p-0.5 rounded-full hover:bg-destructive/20"><X className="h-2.5 w-2.5 text-destructive"/></button></Badge>)}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
                
                <TabsContent value="log" className="mt-3 space-y-3">
                    <Card>
                        <CardHeader className="flex-row items-center justify-between p-2">
                            <CardTitle className="text-sm font-medium">Log Info</CardTitle>
                            <Button onClick={handleInfoLog} disabled={isLoggingInfo || selectedInfoLogs.length === 0} size="icon" variant="ghost" className="h-7 w-7">
                            {isLoggingInfo ? <Loader2 className="animate-spin h-4 w-4" /> : <Send className="h-4 w-4" />}
                            </Button>
                        </CardHeader>
                        <CardContent className="flex flex-wrap gap-2 p-2 pt-0">
                            {(appSettings.infoLogOptions || []).map(opt => (
                                <Badge
                                    key={opt}
                                    variant={selectedInfoLogs.includes(opt) ? 'default' : 'secondary'}
                                    onClick={() => setSelectedInfoLogs(prev => prev.includes(opt) ? prev.filter(i => i !== opt) : [...prev, opt])}
                                    className="cursor-pointer text-xs"
                                >
                                    {opt}
                                </Badge>
                            ))}
                        </CardContent>
                    </Card>
                     <Card>
                        <CardHeader className="flex-row items-center justify-between p-2">
                            <CardTitle className="text-sm font-medium">Quick Log</CardTitle>
                            <Button onClick={handleQuickLog} size="icon" variant="ghost" disabled={submissionState !== 'idle' || !selectedQuickLog} className="h-7 w-7">
                                {submissionState === 'submitting' ? <Loader2 className="animate-spin h-4 w-4" /> : <Send className="h-4 w-4" />}
                            </Button>
                        </CardHeader>
                         {quickLogStep === 'initial' ? (
                            <CardContent className="flex flex-wrap gap-2 p-2 pt-0">
                                {quickLogOptions.map(opt => (
                                <Button key={opt.value} variant={selectedQuickLog === opt.value ? 'default' : 'outline'} size="xs" onClick={() => { setSelectedQuickLog(opt.value); if(opt.multistep) setQuickLogStep(opt.multistep); }} disabled={submissionState !== 'idle'}>{opt.label}</Button>
                                ))}
                            </CardContent>
                            ) : (
                             <CardContent className="p-2 pt-0 space-y-2">
                                <Button variant="ghost" size="sm" className="text-muted-foreground h-auto p-0 mb-2" onClick={() => {setQuickLogStep('initial'); setSelectedQuickLog(null);}}><ArrowLeft className="h-3 w-3 mr-1"/>Back</Button>
                                <div className="flex flex-wrap gap-1">
                                {(appSettings.withdrawalReasons || []).map(reason => (
                                    <Badge key={reason} variant={withdrawalReasons.includes(reason) ? 'default' : 'secondary'} onClick={() => setWithdrawalReasons(p => p.includes(reason) ? p.filter(r => r !== reason) : [...p, reason])} className="cursor-pointer text-xs">{reason}</Badge>
                                ))}
                                </div>
                            </CardContent>
                            )}
                    </Card>
                    <Card>
                        <CardHeader className="flex-row items-center justify-between p-2">
                            <CardTitle className="text-sm font-medium">Log Feedback</CardTitle>
                            <Button onClick={handleLogFeedback} disabled={isLoggingFeedback || Object.keys(feedback).length === 0} size="icon" variant="ghost" className="h-7 w-7">
                            {isLoggingFeedback ? <Loader2 className="animate-spin h-4 w-4" /> : <Send className="h-4 w-4" />}
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-3 p-2 pt-0">
                            <div className="grid grid-cols-3 gap-2 text-center">
                            {(['content', 'schedule', 'price'] as (keyof InteractionFeedback)[]).map(category => (
                                <div key={category}>
                                <h4 className="font-semibold text-xs capitalize mb-1">{category}</h4>
                                <div className="flex items-center justify-center gap-2">
                                    <Button variant="ghost" size="icon" onClick={() => setFeedback(p => produce(p, d => { if (!d[category]) d[category] = {}; d[category]!.perception = d[category]!.perception === 'positive' ? undefined : 'positive'; if (d[category]!.perception) setActiveChipCategory(null); }))} className={cn("h-8 w-8", feedback[category]?.perception === 'positive' && 'bg-green-100 dark:bg-green-900')}><ThumbsUp className="h-4 w-4 text-green-600" /></Button>
                                    <Button variant="ghost" size="icon" onClick={() => setFeedback(p => produce(p, d => { if (!d[category]) d[category] = {}; d[category]!.perception = d[category]!.perception === 'negative' ? undefined : 'negative'; if (d[category]!.perception) setActiveChipCategory(category); else setActiveChipCategory(null); }))} className={cn("h-8 w-8", feedback[category]?.perception === 'negative' && 'bg-red-100 dark:bg-red-900')}><ThumbsDown className="h-4 w-4 text-red-600" /></Button>
                                </div>
                                </div>
                            ))}
                            </div>
                            {activeChipCategory && (
                            <div>
                                <Separator className="my-2" />
                                <div className="flex flex-wrap gap-1 justify-center">
                                {(appSettings.feedbackChips[activeChipCategory] || []).map(objection => (
                                    <Badge key={objection} variant={feedback[activeChipCategory]?.objections?.includes(objection) ? "default" : "secondary"} onClick={() => setFeedback(p => produce(p, d => { if(!d[activeChipCategory]!.objections) d[activeChipCategory]!.objections = []; const idx = d[activeChipCategory]!.objections!.indexOf(objection); if(idx > -1) d[activeChipCategory]!.objections!.splice(idx,1); else d[activeChipCategory]!.objections!.push(objection); }))} className="cursor-pointer text-xs">{objection}</Badge>
                                ))}
                                </div>
                            </div>
                            )}
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex-row items-center justify-between p-2">
                            <CardTitle className="text-sm font-medium">Log Outcome</CardTitle>
                            <Button onClick={handleLogOutcome} disabled={isLoggingOutcome || !selectedOutcome} size="icon" variant="ghost" className="h-7 w-7">
                                {isLoggingOutcome ? <Loader2 className="animate-spin h-4 w-4" /> : <Send className="h-4 w-4" />}
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-2 p-2 pt-0">
                            <div className="flex items-center justify-center gap-2">
                                {(['Info', 'Later', 'Event Scheduled'] as OutcomeType[]).map(outcome => (
                                    <Button key={outcome} variant={selectedOutcome === outcome ? 'default' : 'outline'} size="xs" onClick={() => setSelectedOutcome(o => o === outcome ? null : o)}>
                                        {outcome === 'Info' && <Info className="mr-1 h-3 w-3"/>}
                                        {outcome === 'Later' && <CalendarClock className="mr-1 h-3 w-3"/>}
                                        {outcome === 'Event Scheduled' && <CalendarPlus className="mr-1 h-3 w-3"/>}
                                        {outcome === 'Event Scheduled' ? 'Event' : outcome}
                                    </Button>
                                ))}
                            </div>
                            {selectedOutcome === 'Info' && <Textarea placeholder="Enter info/details..." value={outcomeNotes} onChange={e => setOutcomeNotes(e.target.value)} className="text-xs" />}
                            {selectedOutcome === 'Later' && <Button variant="outline" className="w-full h-8 text-xs" onClick={() => openDateTimePicker(dateTimePickerValue, setDateTimePickerValue)}><CalendarIcon className="mr-2 h-3 w-3" />{dateTimePickerValue ? format(dateTimePickerValue, 'PP p') : 'Select follow-up date'}</Button>}
                            {selectedOutcome === 'Event Scheduled' && (
                                <div className="space-y-2">
                                    <Select value={currentLead.eventDetails?.type || ''} onValueChange={val => setCurrentLead(p => p && produce(p, d => { if(!d.eventDetails) d.eventDetails = {type:'', dateTime:''}; d.eventDetails.type = val; }))}>
                                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select event type..." /></SelectTrigger>
                                        <SelectContent>{eventTypes.map(type => <SelectItem key={type} value={type} className="text-xs">{type}</SelectItem>)}</SelectContent>
                                    </Select>
                                    <Button variant="outline" className="w-full h-8 text-xs" onClick={() => openDateTimePicker(dateTimePickerValue, setDateTimePickerValue)}><CalendarClock className="mr-2 h-3 w-3" />{dateTimePickerValue ? format(dateTimePickerValue, 'PPP p') : 'Select date & time'}</Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="history" className="mt-3">
                     <Card>
                        <CardHeader className="p-2">
                            <CardTitle className="text-sm font-medium">Log History</CardTitle>
                        </CardHeader>
                        <CardContent className="p-2 pt-0 space-y-2 max-h-96 overflow-y-auto">
                        <TooltipProvider>
                            {sortedInteractions.length > 0 ? (
                                sortedInteractions.map(interaction => {
                                    const interactionDate = toDate(interaction.createdAt)!;
                                    return (
                                        <div key={interaction.id} className="text-xs p-2 bg-muted/50 rounded-md">
                                             <div className="flex justify-between items-center mb-1">
                                                <p className="font-semibold capitalize text-foreground">
                                                    {interaction.quickLogType ? `Quick Log: ${interaction.quickLogType}` :
                                                    interaction.feedback ? 'Feedback' :
                                                    interaction.outcome ? `Outcome: ${interaction.outcome}` : 
                                                    interaction.infoLogs ? 'Info' :
                                                    interaction.notes ? 'Note' :
                                                    'Interaction'}
                                                </p>
                                                <Tooltip delayDuration={300}>
                                                    <TooltipTrigger>
                                                        <p className="text-muted-foreground hover:text-foreground cursor-default">
                                                            {interactionDate ? formatRelativeTime(interactionDate) : ''}
                                                        </p>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>{interactionDate ? format(interactionDate, 'PP p'): ''}</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </div>
                                            <p className="text-muted-foreground capitalize text-[11px]">
                                                {interaction.feedback ? formatFeedbackLog(interaction.feedback) 
                                                : interaction.eventDetails ? `${interaction.eventDetails.type} at ${format(toDate(interaction.eventDetails.dateTime)!, 'PPp')}`
                                                : interaction.withdrawalReasons ? `Reasons: ${interaction.withdrawalReasons.join(', ')}`
                                                : interaction.infoLogs ? interaction.infoLogs.join(', ')
                                                : interaction.notes}
                                            </p>
                                        </div>
                                    )
                                })
                            ) : (
                                <p className="text-xs text-center text-muted-foreground py-4">No interactions yet.</p>
                            )}
                           </TooltipProvider>
                        </CardContent>
                     </Card>
                </TabsContent>
                <TabsContent value="tasks" className="mt-3 space-y-3">
                    <Card>
                        <CardHeader className="p-2"><CardTitle className="text-sm font-semibold">Active Tasks</CardTitle></CardHeader>
                        <CardContent className="p-2 pt-0">
                        {isTasksLoading && activeTasks.length === 0 && <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div>}
                        {activeTasks.length > 0 && (
                            <div className="space-y-2">
                            {activeTasks.map(task => (
                                <div key={task.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                                <button onClick={() => handleTaskCompletionInTab(task, true)} className="flex items-center justify-center h-5 w-5 rounded-full border-2 border-muted-foreground/50 hover:border-primary shrink-0" />
                                <p className="flex-1 text-sm">{task.description}</p>
                                {task.dueDate && <p className="text-xs text-muted-foreground">{format(toDate(task.dueDate)!, 'MMM d')}</p>}
                                </div>
                            ))}
                            </div>
                        )}
                        {!isTasksLoading && activeTasks.length === 0 && <p className="text-sm text-center text-muted-foreground p-4">No active tasks.</p>}
                        {hasMoreActiveTasks && !isTasksLoading && (
                            <div className="flex justify-center mt-4">
                            <Button variant="outline" size="sm" onClick={() => fetchTasks('active', true)} disabled={isTasksLoading}>Load More</Button>
                            </div>
                        )}
                        </CardContent>
                    </Card>
                     <Card>
                        <CardHeader className="p-2"><CardTitle className="text-sm font-semibold">Past Tasks</CardTitle></CardHeader>
                        <CardContent className="p-2 pt-0">
                        {isTasksLoading && pastTasks.length === 0 && <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div>}
                        {pastTasks.length > 0 && (
                            <div className="space-y-2">
                            {pastTasks.map(task => (
                                <div key={task.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                                <button onClick={() => handleTaskCompletionInTab(task, false)} className="flex items-center justify-center h-5 w-5 rounded-full border-2 bg-primary border-primary text-primary-foreground shrink-0"><Check className="h-4 w-4"/></button>
                                <p className="flex-1 text-sm text-muted-foreground line-through">{task.description}</p>
                                {task.dueDate && <p className="text-xs text-muted-foreground">{format(toDate(task.dueDate)!, 'MMM d')}</p>}
                                </div>
                            ))}
                            </div>
                        )}
                        {!isTasksLoading && pastTasks.length === 0 && <p className="text-sm text-center text-muted-foreground p-4">No past tasks.</p>}
                        {hasMorePastTasks && !isTasksLoading && (
                            <div className="flex justify-center mt-4">
                            <Button variant="outline" size="sm" onClick={() => fetchTasks('past', true)} disabled={isTasksLoading}>Load More</Button>
                            </div>
                        )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <DateTimePicker isOpen={isDateTimePickerOpen} onClose={() => setIsDateTimePickerOpen(false)} onSelect={dateTimePickerCallback} initialDate={dateTimePickerValue} />

            {isLeadDialogOpen && appSettings && (
                <LeadDialog
                    isOpen={isLeadDialogOpen}
                    setIsOpen={setIsLeadDialogOpen}
                    leadToEdit={currentLead}
                    onSave={handleDialogSave}
                    isSaving={isSaving}
                    relationshipTypes={appSettings.relationshipTypes}
                />
            )}
        </div>
    );
}
