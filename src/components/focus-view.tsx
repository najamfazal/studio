
"use client";

import React, { useState, useMemo } from 'react';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { produce } from 'immer';
import { Loader2, ArrowLeft, Send, ThumbsDown, ThumbsUp, Info, CalendarClock, CalendarPlus, X, Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';

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
}

export function FocusView({ lead, task, appSettings, onInteractionLogged }: FocusViewProps) {
    const { toast } = useToast();
    
    // Internal state for managing the lead as it's modified by logging
    const [currentLead, setCurrentLead] = useState(lead);
    useEffect(() => setCurrentLead(lead), [lead]);
    
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

    const handleLogInteraction = async (interactionData: Partial<Interaction>) => {
        if (!currentLead) return;
    
        const leadRef = doc(db, 'leads', currentLead.id);
        const newInteraction: Interaction = {
          id: `new-${Date.now()}`,
          ...interactionData,
          createdAt: new Date().toISOString(),
        } as Interaction;
    
        // Optimistic UI Update
        const optimisticLead = produce(currentLead, draft => {
          draft.interactions = [newInteraction, ...(draft.interactions || [])];
        });
        setCurrentLead(optimisticLead);
    
        try {
          // Update lead with new interaction
          await updateDoc(leadRef, { interactions: arrayUnion(newInteraction) });
          
          // Mark the current task as complete
          await updateDoc(doc(db, 'tasks', task.id), { completed: true });

          toast({ title: 'Interaction Logged & Task Completed' });
          onInteractionLogged(); // Notify parent to move to next task

        } catch (error) {
          console.error("Error logging interaction:", error);
          toast({ variant: "destructive", title: "Failed to log interaction." });
          setCurrentLead(lead); // Rollback optimistic update
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


    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* Contact Header */}
            <div className="space-y-1">
                <h2 className="text-2xl font-bold">{currentLead.name}</h2>
                <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary">{currentLead.relationship}</Badge>
                    <Badge>{currentLead.status}</Badge>
                    {currentLead.email && <p className="text-sm text-muted-foreground">{currentLead.email}</p>}
                    {(currentLead.phones || []).length > 0 && <p className="text-sm text-muted-foreground">{currentLead.phones[0].number}</p>}
                </div>
            </div>
            
            {/* Task Context */}
            <Card className="bg-primary/10 border-primary">
                <CardHeader>
                    <CardTitle className="text-lg">Current Task</CardTitle>
                    <CardDescription>{task.description}</CardDescription>
                </CardHeader>
            </Card>

            {/* Logging Tools in a 3-column grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Column 1: Quick Log */}
                <Card className="relative overflow-hidden min-h-[148px]">
                    <div key={quickLogStep}>
                        {quickLogStep === 'initial' && (
                            <>
                            <CardHeader className="flex-row items-center justify-between p-3">
                                <CardTitle className="text-base font-medium">Quick Log</CardTitle>
                                <Button onClick={handleQuickLog} size="icon" variant="ghost" disabled={isQuickLogSubmitDisabled()} className="h-8 w-8">
                                    {submissionState === 'submitting' ? <Loader2 className="animate-spin" /> : <Send />}
                                </Button>
                            </CardHeader>
                            <CardContent className="flex flex-wrap gap-2 p-3 pt-0">
                                {quickLogOptions.map(opt => (
                                <Button key={opt.value} variant={selectedQuickLog === opt.value ? 'default' : 'outline'} size="sm" onClick={() => handleQuickLogChipClick(opt.value)} disabled={submissionState !== 'idle'}>{opt.label}</Button>
                                ))}
                            </CardContent>
                            </>
                        )}
                        {quickLogStep === 'withdrawn' && (
                            <>
                            <CardHeader className="p-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleBackFromMultistep}><ArrowLeft/></Button>
                                        <CardTitle className="text-base font-medium">Select Reason</CardTitle>
                                    </div>
                                    <Button onClick={handleQuickLog} size="icon" variant="ghost" disabled={isQuickLogSubmitDisabled()} className="h-8 w-8">
                                        {submissionState === 'submitting' ? <Loader2 className="animate-spin" /> : <Send />}
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="p-3 pt-0">
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

                {/* Column 2: Log Feedback */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between p-3">
                        <CardTitle className="text-base font-medium">Log Feedback</CardTitle>
                        <Button onClick={handleLogFeedback} disabled={isLoggingFeedback || Object.keys(feedback).length === 0} size="icon" variant="ghost" className="h-8 w-8">
                        {isLoggingFeedback ? <Loader2 className="animate-spin" /> : <Send />}
                        </Button>
                    </CardHeader>
                    <CardContent className="space-y-3 p-3 pt-0">
                        <div className="grid grid-cols-3 gap-2 text-center">
                        {(['content', 'schedule', 'price'] as (keyof InteractionFeedback)[]).map(category => (
                            <div key={category}>
                            <h4 className="font-semibold text-sm capitalize mb-1">{category}</h4>
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

                {/* Column 3: Log Outcome */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between p-3">
                        <CardTitle className="text-base font-medium">Log Outcome</CardTitle>
                        <Button onClick={handleLogOutcome} disabled={isLoggingOutcome || !selectedOutcome} size="icon" variant="ghost" className="h-8 w-8">
                            {isLoggingOutcome ? <Loader2 className="animate-spin" /> : <Send />}
                        </Button>
                    </CardHeader>
                    <CardContent className="space-y-3 p-3 pt-0">
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
             <DateTimePicker isOpen={isDateTimePickerOpen} onClose={() => setIsDateTimePickerOpen(false)} onSelect={dateTimePickerCallback} initialDate={dateTimePickerValue} />
        </div>
    );
}

    