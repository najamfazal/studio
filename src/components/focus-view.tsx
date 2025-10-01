

"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { produce } from 'immer';
import { Loader2, ArrowLeft, Send, ThumbsDown, ThumbsUp, Info, CalendarClock, CalendarPlus, X, Calendar as CalendarIcon, Mail, Phone, Book, XIcon, Pencil } from 'lucide-react';
import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';

import { db } from '@/lib/firebase';
import type { AppSettings, Lead, Interaction, Task, InteractionFeedback, QuickLogType, OutcomeType } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { DateTimePicker } from '@/components/date-time-picker';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { EditableField } from './editable-field';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { CheckIcon } from 'lucide-react';


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
    lead: Lead;
    task: Task;
    appSettings: AppSettings;
    onInteractionLogged: () => void;
    onLeadUpdate: (updatedLead: Lead) => void;
}

const toDate = (dateValue: any): Date | null => {
  if (!dateValue) return null;
  if (typeof dateValue === "string") return parseISO(dateValue);
  if (dateValue.toDate) return dateValue.toDate(); // Firestore Timestamp
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


export function FocusView({ lead, task, appSettings, onInteractionLogged, onLeadUpdate }: FocusViewProps) {
    const { toast } = useToast();
    const [isCoursePopoverOpen, setIsCoursePopoverOpen] = useState(false);
    
    const [currentLead, setCurrentLead] = useState(lead);
    useEffect(() => {
        if (lead) {
            setCurrentLead(lead);
        }
    }, [lead]);
    
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

    const sortedInteractions = useMemo(() => {
        return (currentLead?.interactions || []).slice().sort((a,b) => toDate(b.createdAt)!.getTime() - toDate(a.createdAt)!.getTime());
    }, [currentLead]);
    
    const handleUpdate = async (field: string, value: any) => {
        if (!currentLead) return;
        
        const updatePayload: { [key: string]: any } = { [field]: value };
        
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
        onLeadUpdate(updatedLead);
        
        try {
          const leadRef = doc(db, 'leads', lead.id);
          await updateDoc(leadRef, updatePayload);
          toast({ title: 'Contact Updated' });
        } catch (error) {
          console.error('Error updating contact:', error);
          toast({ variant: 'destructive', title: 'Update failed' });
          setCurrentLead(lead); // Revert on failure
          onLeadUpdate(lead);
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
        onLeadUpdate(optimisticLead);
    
        try {
          await updateDoc(leadRef, { interactions: arrayUnion(newInteraction) });
          toast({ title: 'Interaction Logged' });
          
          // This will be handled by the parent component now
          onInteractionLogged();

        } catch (error) {
          console.error("Error logging interaction:", error);
          toast({ variant: "destructive", title: "Failed to log interaction." });
          setCurrentLead(lead);
          onLeadUpdate(lead);
        }
    }

    // --- Quick Log Handlers ---
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
    const isQuickLogSubmitDisabled = () => {
        if (submissionState !== 'idle' || !selectedQuickLog) return true;
        if (quickLogStep === 'withdrawn' && withdrawalReasons.length === 0) return true;
        return false;
    }

    // --- Feedback Log Handlers ---
    const handlePerceptionChange = (category: FeedbackCategory, perception: 'positive' | 'negative') => {
        setFeedback(prev => produce(prev, draft => {
            if (!draft[category]) {
                draft[category] = { perception };
            } else {
                draft[category]!.perception = draft[category]!.perception === perception ? undefined : perception;
            }
            if(draft[category]!.perception === undefined) { delete draft[category]; setActiveChipCategory(null); return; }
            if (perception === 'positive') draft[category]!.objections = [];
            setActiveChipCategory(perception === 'negative' ? category : null);
        }));
    };
    const handleObjectionToggle = (category: FeedbackCategory, objection: string) => {
        setFeedback(prev => produce(prev, draft => {
            if (!draft[category] || draft[category]!.perception !== 'negative') return;
            if (!draft[category]!.objections) draft[category]!.objections = [];
            const existingIndex = draft[category]!.objections!.indexOf(objection);
            if (existingIndex > -1) draft[category]!.objections!.splice(existingIndex, 1);
            else draft[category]!.objections!.push(objection);
        }));
    };
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
    
    // --- Outcome Log Handlers ---
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


    const handleCourseSelection = (course: string) => {
        if (!currentLead) return;
        const currentCourses = currentLead.commitmentSnapshot?.courses || [];
        const newCourses = currentCourses.includes(course)
            ? currentCourses.filter(c => c !== course)
            : [...currentCourses, course];
        handleUpdate('commitmentSnapshot.courses', newCourses);
    };
    
    if (!currentLead) {
        return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin" /></div>
    }

    return (
        <div className="max-w-4xl mx-auto space-y-4">
            {/* Contact Header */}
            <div>
                <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-2xl font-bold">{currentLead.name}</h2>
                    <Badge variant="secondary">{currentLead.relationship}</Badge>
                    <Badge>{currentLead.status}</Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                    {currentLead.email && (
                        <a href={`mailto:${currentLead.email}`} className="flex items-center gap-1.5 hover:text-foreground">
                            <Mail className="h-4 w-4" /> {currentLead.email}
                        </a>
                    )}
                    {(currentLead.phones || []).length > 0 && (
                        <a href={`tel:${currentLead.phones[0].number}`} className="flex items-center gap-1.5 hover:text-foreground">
                            <Phone className="h-4 w-4" /> {currentLead.phones[0].number}
                        </a>
                    )}
                </div>
            </div>
            
            {/* Task Context */}
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 flex items-baseline gap-2 text-primary">
                <p className="text-xs font-semibold uppercase shrink-0">Task:</p>
                <p className="font-medium text-sm">{task.description}</p>
            </div>

            {/* Commitment Snapshot */}
             <Card>
                <CardHeader className="p-2">
                    <CardTitle className="text-xs font-semibold text-muted-foreground">Commitment Snapshot</CardTitle>
                </CardHeader>
                <CardContent className="p-2 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                     <div className="space-y-1">
                        <div className="font-medium text-muted-foreground text-xs flex items-center justify-between cursor-pointer">
                            Courses
                            <Popover open={isCoursePopoverOpen} onOpenChange={setIsCoursePopoverOpen}>
                                <PopoverTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-6 w-6"><Pencil className="h-3 w-3" /></Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                                    <Command>
                                        <CommandInput placeholder="Search courses..." />
                                        <CommandList>
                                            <CommandEmpty>No course found.</CommandEmpty>
                                            <CommandGroup>
                                                {appSettings.courseNames.map(course => (
                                                    <CommandItem
                                                        key={course}
                                                        value={course}
                                                        onSelect={() => handleCourseSelection(course)}
                                                    >
                                                        <CheckIcon
                                                            className={cn(
                                                                "mr-2 h-4 w-4",
                                                                (currentLead.commitmentSnapshot?.courses || []).includes(course) ? "opacity-100" : "opacity-0"
                                                            )}
                                                        />
                                                        {course}
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="min-h-[2.25rem] flex items-center">
                            {(currentLead.commitmentSnapshot?.courses || []).length > 0 ? (
                                <div className="flex gap-1 flex-wrap">
                                    {currentLead.commitmentSnapshot.courses!.map(course => (
                                        <Badge key={course} variant="secondary" className="font-normal">{course}</Badge>
                                    ))}
                                </div>
                            ) : (
                                <span className="text-sm text-muted-foreground/80">No courses selected</span>
                            )}
                        </div>
                    </div>
                    <EditableField
                        label="Price"
                        value={currentLead.commitmentSnapshot?.price || ""}
                        onSave={(val) => handleUpdate('commitmentSnapshot.price', val)}
                        inputType="number"
                        placeholder="Enter price"
                    />
                    <div className="sm:col-span-2">
                        <EditableField
                          label="Key Notes"
                          value={currentLead.commitmentSnapshot?.keyNotes || ""}
                          onSave={(val) => handleUpdate('commitmentSnapshot.keyNotes', val)}
                          type="textarea"
                          placeholder="Add key negotiation points..."
                        />
                    </div>
                </CardContent>
            </Card>


            {/* Logging Tools */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-4">
                    {/* Quick Log */}
                    <Card className="relative overflow-hidden">
                        <div key={quickLogStep}>
                            {quickLogStep === 'initial' && (
                                <>
                                <CardHeader className="flex-row items-center justify-between p-2">
                                    <CardTitle className="text-sm font-medium">Quick Log</CardTitle>
                                    <Button onClick={handleQuickLog} size="icon" variant="ghost" disabled={isQuickLogSubmitDisabled()} className="h-7 w-7">
                                        {submissionState === 'submitting' ? <Loader2 className="animate-spin h-4 w-4" /> : <Send className="h-4 w-4" />}
                                    </Button>
                                </CardHeader>
                                <CardContent className="flex flex-wrap gap-2 p-2 pt-0">
                                    {quickLogOptions.map(opt => (
                                    <Button key={opt.value} variant={selectedQuickLog === opt.value ? 'default' : 'outline'} size="sm" onClick={() => handleQuickLogChipClick(opt.value)} disabled={submissionState !== 'idle'}>{opt.label}</Button>
                                    ))}
                                </CardContent>
                                </>
                            )}
                            {quickLogStep === 'withdrawn' && (
                                <>
                                <CardHeader className="p-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1">
                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleBackFromMultistep}><ArrowLeft className="h-4 w-4"/></Button>
                                            <CardTitle className="text-sm font-medium">Select Reason</CardTitle>
                                        </div>
                                        <Button onClick={handleQuickLog} size="icon" variant="ghost" disabled={isQuickLogSubmitDisabled()} className="h-7 w-7">
                                            {submissionState === 'submitting' ? <Loader2 className="animate-spin h-4 w-4" /> : <Send className="h-4 w-4" />}
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-2 pt-0">
                                    <div className="flex flex-wrap gap-2">
                                    {(appSettings.withdrawalReasons || []).map(reason => (
                                        <Badge key={reason} variant={withdrawalReasons.includes(reason) ? 'default' : 'secondary'} onClick={() => handleToggleWithdrawalReason(reason)} className="cursor-pointer text-sm">{reason}</Badge>
                                    ))}
                                    </div>
                                </CardContent>
                                </>
                            )}
                        </div>
                    </Card>

                     {/* Log Outcome */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between p-2">
                            <CardTitle className="text-sm font-medium">Log Outcome</CardTitle>
                            <Button onClick={handleLogOutcome} disabled={isLoggingOutcome || !selectedOutcome} size="icon" variant="ghost" className="h-7 w-7">
                                {isLoggingOutcome ? <Loader2 className="animate-spin h-4 w-4" /> : <Send className="h-4 w-4" />}
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-3 p-2 pt-0">
                            <div className="flex items-center justify-center gap-2">
                                {(['Info', 'Later', 'Event Scheduled'] as OutcomeType[]).map(outcome => (
                                    <Button key={outcome} variant={selectedOutcome === outcome ? 'default' : 'outline'} size="sm" onClick={() => setSelectedOutcome(o => o === outcome ? null : outcome)}>
                                        {outcome === 'Info' && <Info className="mr-1 h-4 w-4"/>}
                                        {outcome === 'Later' && <CalendarClock className="mr-1 h-4 w-4"/>}
                                        {outcome === 'Event Scheduled' && <CalendarPlus className="mr-1 h-4 w-4"/>}
                                        {outcome === 'Event Scheduled' ? 'Event' : outcome}
                                    </Button>
                                ))}
                            </div>

                            {selectedOutcome === 'Info' && <Textarea placeholder="Enter info/details..." value={outcomeNotes} onChange={e => setOutcomeNotes(e.target.value)} />}
                            {selectedOutcome === 'Later' && <Button variant="outline" className="w-full" onClick={() => openDateTimePicker(dateTimePickerValue, setDateTimePickerValue)}><CalendarIcon className="mr-2 h-4 w-4" />{dateTimePickerValue ? format(dateTimePickerValue, 'PPP p') : 'Select follow-up date'}</Button>}
                            {selectedOutcome === 'Event Scheduled' && (
                                <div className="space-y-2">
                                    <Select value={currentLead.eventDetails?.type || ''} onValueChange={val => setCurrentLead(prev => prev && produce(prev, draft => { if(!draft.eventDetails) draft.eventDetails = {type:'', dateTime:''}; draft.eventDetails.type = val; }))}>
                                        <SelectTrigger><SelectValue placeholder="Select event type..." /></SelectTrigger>
                                        <SelectContent>{eventTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
                                    </Select>
                                    <Button variant="outline" className="w-full" onClick={() => openDateTimePicker(dateTimePickerValue, setDateTimePickerValue)}><CalendarClock className="mr-2 h-4 w-4" />{dateTimePickerValue ? format(dateTimePickerValue, 'PPP p') : 'Select date & time'}</Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
                 <div className="space-y-4">
                     {/* Log Feedback */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between p-2">
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
                                    <Button variant="ghost" size="icon" onClick={() => handlePerceptionChange(category, 'positive')} className={cn("h-8 w-8", feedback[category]?.perception === 'positive' && 'bg-green-100 dark:bg-green-900')}>
                                    <ThumbsUp className="h-4 w-4 text-green-600" />
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => handlePerceptionChange(category, 'negative')} className={cn("h-8 w-8", feedback[category]?.perception === 'negative' && 'bg-red-100 dark:bg-red-900')}>
                                    <ThumbsDown className="h-4 w-4 text-red-600" />
                                    </Button>
                                </div>
                                </div>
                            ))}
                            </div>
                            {activeChipCategory && (
                            <div>
                                <Separator className="my-2" />
                                <div className="flex flex-wrap gap-1 justify-center">
                                {(appSettings.feedbackChips[activeChipCategory] || []).map(objection => (
                                    <Badge key={objection} variant={feedback[activeChipCategory]?.objections?.includes(objection) ? "default" : "secondary"} onClick={() => handleObjectionToggle(activeChipCategory, objection)} className="cursor-pointer">{objection}</Badge>
                                ))}
                                {(appSettings.feedbackChips[activeChipCategory] || []).length === 0 && <p className="text-xs text-muted-foreground">No objections configured.</p>}
                                </div>
                            </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Log History */}
                     <Card>
                        <CardHeader className="p-2">
                            <CardTitle className="text-sm font-medium">Log History</CardTitle>
                        </CardHeader>
                        <CardContent className="p-2 pt-0 space-y-2 max-h-60 overflow-y-auto">
                        <TooltipProvider>
                            {sortedInteractions.length > 0 ? (
                                sortedInteractions.map(interaction => {
                                    const interactionDate = toDate(interaction.createdAt)!;
                                    return (
                                        <div key={interaction.id} className="text-xs p-2 bg-muted/50 rounded-md">
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
                                                        <p className="text-muted-foreground hover:text-foreground cursor-default">
                                                            {interactionDate ? formatRelativeTime(interactionDate) : ''}
                                                        </p>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>{interactionDate ? format(interactionDate, 'PP p'): ''}</p>
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
                                })
                            ) : (
                                <p className="text-sm text-center text-muted-foreground py-4">No interactions yet.</p>
                            )}
                           </TooltipProvider>
                        </CardContent>
                     </Card>
                </div>
            </div>
             <DateTimePicker isOpen={isDateTimePickerOpen} onClose={() => setIsDateTimePickerOpen(false)} onSelect={dateTimePickerCallback} initialDate={dateTimePickerValue} />
        </div>
    );
}
