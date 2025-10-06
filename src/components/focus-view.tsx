
"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { produce } from 'immer';
import { Loader2, ArrowLeft, Send, ThumbsDown, ThumbsUp, Info, CalendarClock, CalendarPlus, X, Calendar as CalendarIcon, Mail, Phone, Book, XIcon, Pencil, CheckIcon, Plus, Trash2 } from 'lucide-react';
import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';

import { db } from '@/lib/firebase';
import type { AppSettings, Lead, Interaction, Task, InteractionFeedback, QuickLogType, OutcomeType, Deal } from '@/lib/types';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DealDialog } from './deal-dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from './ui/alert-dialog';


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
    task?: Task;
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
    
    const [currentLead, setCurrentLead] = useState(lead);
    useEffect(() => {
        if (lead) setCurrentLead(lead);
    }, [lead]);

    // Deal management
    const [isDealModalOpen, setIsDealModalOpen] = useState(false);
    const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
    const [dealToDelete, setDealToDelete] = useState<string | null>(null);
    
    // Logging states
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
    
    const handleUpdate = async (field: string, value: any, isDeal: boolean = false) => {
        if (!currentLead) return;
        
        let updatePayload: { [key: string]: any } = {};
        let updatedLead: Lead;

        if (isDeal) {
            const newDeals = produce(currentLead.commitmentSnapshot?.deals || [], draft => {
                const index = draft.findIndex(d => d.id === (value as Deal).id);
                if (index > -1) draft[index] = value;
                else draft.push(value);
            });
            updatePayload['commitmentSnapshot.deals'] = newDeals;
            updatedLead = produce(currentLead, draft => {
                if (!draft.commitmentSnapshot) draft.commitmentSnapshot = {};
                draft.commitmentSnapshot.deals = newDeals;
            });
        } else {
            updatePayload[field] = value;
            updatedLead = produce(currentLead, draft => {
                const keys = field.split('.');
                let current: any = draft;
                keys.slice(0, -1).forEach(key => {
                    if (!current[key]) current[key] = {};
                    current = current[key];
                });
                current[keys[keys.length - 1]] = value;
            });
        }

        setCurrentLead(updatedLead);
        onLeadUpdate(updatedLead);
        
        try {
          const leadRef = doc(db, 'leads', lead.id);
          await updateDoc(leadRef, updatePayload);
          toast({ title: isDeal ? 'Deal Saved' : 'Contact Updated' });
        } catch (error) {
          console.error('Error updating contact:', error);
          toast({ variant: 'destructive', title: 'Update failed' });
          setCurrentLead(lead);
          onLeadUpdate(lead);
        }
    };
    
    const handleSaveDeal = (deal: Deal) => {
        handleUpdate('commitmentSnapshot.deals', deal, true);
        setIsDealModalOpen(false);
        setEditingDeal(null);
    }
    const handleDeleteDeal = async () => {
        if (!dealToDelete || !currentLead) return;
        const newDeals = (currentLead.commitmentSnapshot?.deals || []).filter(d => d.id !== dealToDelete);
        await handleUpdate('commitmentSnapshot.deals', newDeals);
        toast({ title: "Deal removed" });
        setDealToDelete(null);
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
          onInteractionLogged();
        } catch (error) {
          console.error("Error logging interaction:", error);
          toast({ variant: "destructive", title: "Failed to log interaction." });
          setCurrentLead(lead);
          onLeadUpdate(lead);
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
    
    if (!currentLead) {
        return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin" /></div>
    }

    return (
        <div className="space-y-3">
             <div>
                <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-bold">{currentLead.name}</h2>
                    <Badge variant="secondary" className="text-xs">{currentLead.relationship}</Badge>
                    <Badge className="text-xs">{currentLead.status}</Badge>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                    {currentLead.email && <a href={`mailto:${currentLead.email}`} className="flex items-center gap-1.5 hover:text-foreground"><Mail className="h-3 w-3" /> {currentLead.email}</a>}
                    {(currentLead.phones || []).length > 0 && <a href={`tel:${currentLead.phones[0].number}`} className="flex items-center gap-1.5 hover:text-foreground"><Phone className="h-3 w-3" /> {currentLead.phones[0].number}</a>}
                </div>
            </div>
            
            {task && (
                 <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 flex items-baseline gap-2 text-primary text-sm">
                    <p className="text-xs font-semibold uppercase shrink-0">Task:</p>
                    <p className="font-medium">{task.description}</p>
                </div>
            )}
            
            <Tabs defaultValue="snapshot" className="w-full">
                <TabsList className="grid w-full grid-cols-3 h-9">
                    <TabsTrigger value="snapshot" className="h-7 text-xs">Snapshot</TabsTrigger>
                    <TabsTrigger value="log" className="h-7 text-xs">Log</TabsTrigger>
                    <TabsTrigger value="history" className="h-7 text-xs">History</TabsTrigger>
                </TabsList>
                
                <TabsContent value="snapshot" className="mt-3 space-y-3">
                    <Card>
                        <CardHeader className="p-2 flex-row items-center justify-between">
                            <CardTitle className="text-xs font-semibold text-muted-foreground">Deals</CardTitle>
                            <Button size="xs" onClick={() => { setEditingDeal(null); setIsDealModalOpen(true); }}><Plus className="mr-1 h-3 w-3"/>Add Deal</Button>
                        </CardHeader>
                        <CardContent className="p-2 pt-0">
                            {(currentLead.commitmentSnapshot?.deals || []).length > 0 ? (
                            <div className="space-y-2">
                                {(currentLead.commitmentSnapshot.deals || []).map((deal) => (
                                <Card key={deal.id} className="bg-muted/50">
                                    <CardHeader className="p-2">
                                    <div className="flex justify-between items-start">
                                        <div className="font-semibold text-sm">${deal.price.toLocaleString()}</div>
                                        <div className="flex gap-0.5">
                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingDeal(deal); setIsDealModalOpen(true);}}>
                                            <Pencil className="h-3 w-3" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setDealToDelete(deal.id)}>
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                        </div>
                                    </div>
                                    </CardHeader>
                                    <CardContent className="p-2 pt-0 text-xs text-muted-foreground">
                                        <p className="font-medium text-foreground">{(deal.courses || []).join(', ')}</p>
                                        <p>{deal.mode} &middot; {deal.format}</p>
                                    </CardContent>
                                </Card>
                                ))}
                            </div>
                            ) : (
                            <div className="text-center text-xs text-muted-foreground py-4">No deals added yet.</div>
                            )}
                        </CardContent>
                    </Card>
                    <Card>
                         <CardContent className="p-2">
                            <EditableField
                            label="Key Notes"
                            value={currentLead.commitmentSnapshot?.keyNotes || ""}
                            onSave={(val) => handleUpdate('commitmentSnapshot.keyNotes', val)}
                            type="textarea"
                            placeholder="Add key negotiation points..."
                            />
                         </CardContent>
                    </Card>
                </TabsContent>
                
                <TabsContent value="log" className="mt-3 space-y-3">
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
                        <CardHeader className="flex flex-row items-center justify-between p-2">
                            <CardTitle className="text-sm font-medium">Log Outcome</CardTitle>
                            <Button onClick={handleLogOutcome} disabled={isLoggingOutcome || !selectedOutcome} size="icon" variant="ghost" className="h-7 w-7">
                                {isLoggingOutcome ? <Loader2 className="animate-spin h-4 w-4" /> : <Send className="h-4 w-4" />}
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-2 p-2 pt-0">
                            <div className="flex items-center justify-center gap-2">
                                {(['Info', 'Later', 'Event Scheduled'] as OutcomeType[]).map(outcome => (
                                    <Button key={outcome} variant={selectedOutcome === outcome ? 'default' : 'outline'} size="xs" onClick={() => setSelectedOutcome(o => o === outcome ? null : outcome)}>
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
            </Tabs>

            <DateTimePicker isOpen={isDateTimePickerOpen} onClose={() => setIsDateTimePickerOpen(false)} onSelect={dateTimePickerCallback} initialDate={dateTimePickerValue} />
            
            {isDealModalOpen && appSettings && (
                <DealDialog
                    isOpen={isDealModalOpen}
                    onClose={() => { setIsDealModalOpen(false); setEditingDeal(null); }}
                    onSave={handleSaveDeal}
                    dealToEdit={editingDeal}
                    courseNames={appSettings.courseNames}
                />
            )}

            <AlertDialog open={!!dealToDelete} onOpenChange={(open) => !open && setDealToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Deal?</AlertDialogTitle>
                        <AlertDialogDescription>This will permanently remove this deal. Are you sure?</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <Button variant="destructive" onClick={handleDeleteDeal}>Delete</Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
