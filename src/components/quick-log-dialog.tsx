
"use client"

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { collection, query, getDocs, doc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { produce } from 'immer';
import { Loader2, ArrowLeft, Send, ThumbsDown, ThumbsUp, Info, CalendarClock, CalendarPlus, X, Calendar as CalendarIcon, ChevronsUpDown, CheckIcon, NotebookPen, User, Search } from 'lucide-react';
import { format } from 'date-fns';

import { db } from '@/lib/firebase';
import type { AppSettings, Lead, Interaction, Task, InteractionFeedback, QuickLogType, OutcomeType } from '@/lib/types';
import { useQuickLog } from '@/hooks/use-quick-log';
import { useToast } from '@/hooks/use-toast';
import { useDebounce } from '@/hooks/use-debounce';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { DateTimePicker } from '@/components/date-time-picker';
import { ScrollArea } from './ui/scroll-area';
import { searchLeadsAction } from '@/app/actions';

type LogStep = "contact" | "log";
type QuickLogStep = 'initial' | 'withdrawn';
type FeedbackCategory = keyof InteractionFeedback;

const quickLogOptions: { value: QuickLogType; label: string, multistep: 'initial' | 'withdrawn' | null }[] = [
  { value: "Followup", label: "Followup", multistep: null },
  { value: "Initiated", label: "Initiated", multistep: null },
  { value: "Unresponsive", label: "Unresponsive", multistep: null },
  { value: "Unchanged", label: "Unchanged", multistep: null },
  { value: "Withdrawn", label: "Withdrawn", multistep: 'withdrawn' },
  { value: "Enrolled", label: "Enrolled", multistep: null },
];
const eventTypes = ["Online Meet", "Online Demo", "Physical Demo", "Visit"];

export function QuickLogDialog() {
    const { isOpen, closeQuickLog } = useQuickLog();
    const { toast } = useToast();
    
    // --- Global State ---
    const [step, setStep] = useState<LogStep>('contact');
    const [isSubmitting, setIsSubmitting] = useState<string | false>(false);

    // --- Contact Selection State ---
    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearchTerm = useDebounce(searchTerm, 300);
    const [searchResults, setSearchResults] = useState<Lead[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

    // --- App Settings ---
    const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

    // --- Logging State ---
    const [feedback, setFeedback] = useState<InteractionFeedback>({});
    const [activeChipCategory, setActiveChipCategory] = useState<FeedbackCategory | null>(null);
    
    const [quickLogStep, setQuickLogStep] = useState<QuickLogStep>('initial');
    const [selectedQuickLog, setSelectedQuickLog] = useState<QuickLogType | null>(null);
    const [withdrawalReasons, setWithdrawalReasons] = useState<string[]>([]);
    
    const [selectedOutcome, setSelectedOutcome] = useState<OutcomeType | null>(null);
    const [outcomeNotes, setOutcomeNotes] = useState("");
    const [isDateTimePickerOpen, setIsDateTimePickerOpen] = useState(false);
    const [dateTimePickerValue, setDateTimePickerValue] = useState<Date | undefined>(undefined);
    const [dateTimePickerCallback, setDateTimePickerCallback] = useState<(date: Date) => void>(() => {});

    const [selectedInfoLogs, setSelectedInfoLogs] = useState<string[]>([]);

    useEffect(() => {
        if (isOpen && !appSettings) {
            getDoc(doc(db, "settings", "appConfig")).then(docSnap => {
                if (docSnap.exists()) {
                    setAppSettings(docSnap.data() as AppSettings);
                }
            })
        }
    }, [isOpen, appSettings]);

    useEffect(() => {
        const search = async () => {
            if (debouncedSearchTerm) {
                setIsSearching(true);
                try {
                    const { success, leads, error } = await searchLeadsAction(debouncedSearchTerm);
                    if (success) {
                        setSearchResults(leads as Lead[]);
                    } else {
                        throw new Error(error);
                    }
                } catch (error) {
                    toast({ variant: 'destructive', title: 'Search failed' });
                } finally {
                    setIsSearching(false);
                }
            } else {
                setSearchResults([]);
            }
        };
        search();
    }, [debouncedSearchTerm, toast]);

    const resetState = () => {
        setStep('contact');
        setSelectedLead(null);
        setSearchTerm('');
        setSearchResults([]);
        setFeedback({});
        setActiveChipCategory(null);
        setQuickLogStep('initial');
        setSelectedQuickLog(null);
        setWithdrawalReasons([]);
        setSelectedOutcome(null);
        setOutcomeNotes("");
        setDateTimePickerValue(undefined);
        setSelectedInfoLogs([]);
        setIsSubmitting(false);
    };

    const handleClose = () => {
        closeQuickLog();
        // Delay reset to allow for closing animation
        setTimeout(resetState, 300);
    };

    const handleContactSelect = (leadInfo: Lead) => {
        setSelectedLead(leadInfo);
        setStep('log');
    };
    
    const handleLogInteraction = async (interactionData: Partial<Interaction>, logType: string) => {
        if (!selectedLead) return;
        setIsSubmitting(logType);
    
        const leadRef = doc(db, 'leads', selectedLead.id);
        const newInteraction: Interaction = {
          id: `new-${Date.now()}`,
          ...interactionData,
          createdAt: new Date().toISOString(),
        } as Interaction;
    
        try {
          await updateDoc(leadRef, { interactions: arrayUnion(newInteraction) });
          toast({ title: `Log saved for ${selectedLead.name}` });

          // Reset the specific part of the form that was submitted
           if (logType === 'QuickLog') {
                setSelectedQuickLog(null);
                setQuickLogStep('initial');
                setWithdrawalReasons([]);
            } else if (logType === 'Feedback') {
                setFeedback({});
                setActiveChipCategory(null);
            } else if (logType === 'Outcome') {
                setSelectedOutcome(null);
                setOutcomeNotes('');
                setDateTimePickerValue(undefined);
            } else if (logType === 'Info') {
                setSelectedInfoLogs([]);
            }
        } catch (error) {
          console.error("Error logging interaction:", error);
          toast({ variant: "destructive", title: "Failed to log interaction." });
        } finally {
          setIsSubmitting(false);
        }
    };

     const handleGenericLog = (logType: 'QuickLog' | 'Feedback' | 'Outcome' | 'Info') => {
        if (logType === 'Info') {
            if (selectedInfoLogs.length === 0) return;
            handleLogInteraction({ infoLogs: selectedInfoLogs }, 'Info');
        }
        else if (logType === 'QuickLog') {
            if (!selectedQuickLog || (selectedQuickLog === 'Withdrawn' && withdrawalReasons.length === 0)) {
                toast({ variant: 'destructive', title: 'Please complete the log.'});
                return;
            }
            let interaction: Partial<Interaction> = { quickLogType: selectedQuickLog };
            if (selectedQuickLog === 'Withdrawn') interaction.withdrawalReasons = withdrawalReasons;
            handleLogInteraction(interaction, logType);
        }
        else if (logType === 'Feedback') {
            if (Object.keys(feedback).length === 0) {
                 toast({ variant: 'destructive', title: 'Please select a perception.'});
                return;
            }
             handleLogInteraction({ feedback }, logType);
        }
        else if (logType === 'Outcome') {
            if (!selectedOutcome) return;
            let payload: Partial<Interaction> = { outcome: selectedOutcome };
            if (selectedOutcome === 'Info') {
                if (!outcomeNotes) { toast({ variant: 'destructive', title: 'Info notes cannot be empty.' }); return; }
                payload.notes = outcomeNotes;
            } else if (selectedOutcome === 'Later') {
                const date = dateTimePickerValue?.toISOString();
                if (!date) { toast({ variant: 'destructive', title: 'Please select a date.' }); return; }
                payload.followUpDate = date;
            } else if (selectedOutcome === 'Event Scheduled') {
                const date = dateTimePickerValue?.toISOString();
                if (!selectedLead?.eventDetails?.type || !date) { toast({ variant: 'destructive', title: 'Please select event type and date.' }); return; }
                payload.eventDetails = { ...selectedLead.eventDetails, dateTime: date, status: 'Scheduled' };
            }
             handleLogInteraction(payload, logType);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="max-w-lg">
                {(isSearching || !!isSubmitting) && <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-20"><Loader2 className="animate-spin h-8 w-8 text-primary"/></div>}
                
                {step === 'contact' && (
                    <>
                    <DialogHeader>
                        <DialogTitle>Quick Log</DialogTitle>
                        <DialogDescription>Select a contact to log an interaction for.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by name or phone..."
                                className="pl-9"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                autoFocus
                            />
                        </div>
                        <ScrollArea className="h-60 mt-2">
                             <div className="space-y-2 pr-4">
                                {searchResults.length > 0 ? (
                                    searchResults.map(hit => (
                                        <button key={hit.id} onClick={() => handleContactSelect(hit)} className="w-full text-left p-3 rounded-md border bg-background hover:bg-muted">
                                            <p className="font-semibold">{hit.name}</p>
                                            <p className="text-sm text-muted-foreground">{(hit.commitmentSnapshot?.deals?.[0]?.courses || []).join(', ') || 'No course specified'}</p>
                                        </button>
                                    ))
                                ) : (
                                    debouncedSearchTerm && !isSearching && <p className="text-center text-sm text-muted-foreground pt-10">No results found.</p>
                                )}
                            </div>
                        </ScrollArea>
                    </div>
                    </>
                )}

                {step === 'log' && selectedLead && appSettings && (
                    <>
                    <DialogHeader>
                        <DialogTitle>Log for: {selectedLead.name}</DialogTitle>
                         <div className="flex items-center justify-between">
                            <DialogDescription>Log interactions, then close when done.</DialogDescription>
                            <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setStep('contact')}>Change Contact</Button>
                         </div>
                    </DialogHeader>
                    <div className="py-4 space-y-3 max-h-[60vh] overflow-y-auto pr-3">
                         <Card>
                            <CardHeader className="flex-row items-center justify-between p-2">
                                <CardTitle className="text-sm font-medium">Log Info</CardTitle>
                                <Button onClick={() => handleGenericLog('Info')} disabled={!!isSubmitting || selectedInfoLogs.length === 0} size="icon" variant="ghost" className="h-7 w-7">
                                {isSubmitting === 'Info' ? <Loader2 className="animate-spin h-4 w-4" /> : <Send className="h-4 w-4" />}
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
                                <Button onClick={() => handleGenericLog('QuickLog')} size="icon" variant="ghost" disabled={!!isSubmitting || !selectedQuickLog} className="h-7 w-7">
                                    {isSubmitting === 'QuickLog' ? <Loader2 className="animate-spin h-4 w-4" /> : <Send className="h-4 w-4" />}
                                </Button>
                            </CardHeader>
                            {quickLogStep === 'initial' && (
                            <CardContent className="flex flex-wrap gap-2 p-2 pt-0">
                                {quickLogOptions.map(opt => (
                                <Button key={opt.value} variant={selectedQuickLog === opt.value ? 'default' : 'outline'} size="xs" onClick={() => { setSelectedQuickLog(opt.value); if(opt.multistep) setQuickLogStep(opt.multistep); }} disabled={!!isSubmitting}>{opt.label}</Button>
                                ))}
                            </CardContent>
                            )}
                            {quickLogStep === 'withdrawn' && (
                                <CardContent className="p-2 pt-0 space-y-2">
                                    <Button variant="ghost" size="sm" className="text-muted-foreground h-auto p-0 mb-2" onClick={() => {setQuickLogStep('initial'); setSelectedQuickLog(null);}}><ArrowLeft className="h-3 w-3 mr-1"/>Back</Button>
                                    <div className="flex flex-wrap gap-1">
                                    {(appSettings.withdrawalReasons || []).map(reason => (
                                        <Badge key={reason} variant={withdrawalReasons.includes(reason) ? 'default' : 'secondary'} onClick={() => setWithdrawalReasons(p => p.includes(reason) ? p.filter(r => r !== reason) : [...p, reason])} className="cursor-pointer">{reason}</Badge>
                                    ))}
                                    </div>
                                </CardContent>
                            )}
                        </Card>
                        
                        <Card>
                            <CardHeader className="flex-row items-center justify-between p-2">
                                <CardTitle className="text-sm font-medium">Log Feedback</CardTitle>
                                <Button onClick={() => handleGenericLog('Feedback')} disabled={!!isSubmitting || Object.keys(feedback).length === 0} size="icon" variant="ghost" className="h-7 w-7">
                                {isSubmitting === 'Feedback' ? <Loader2 className="animate-spin h-4 w-4" /> : <Send className="h-4 w-4" />}
                                </Button>
                            </CardHeader>
                             <CardContent className="space-y-3 p-2 pt-0">
                                <div className="grid grid-cols-3 gap-2 text-center">
                                {(['content', 'schedule', 'price'] as FeedbackCategory[]).map(category => (
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
                                        <Badge key={objection} variant={feedback[activeChipCategory]?.objections?.includes(objection) ? "default" : "secondary"} onClick={() => setFeedback(p => produce(p, d => { if(!d[activeChipCategory]!.objections) d[activeChipCategory]!.objections = []; const idx = d[activeChipCategory]!.objections!.indexOf(objection); if(idx > -1) d[activeChipCategory]!.objections!.splice(idx,1); else d[activeChipCategory]!.objections!.push(objection); }))} className="cursor-pointer">{objection}</Badge>
                                    ))}
                                    </div>
                                </div>
                                )}
                            </CardContent>
                        </Card>

                         <Card>
                            <CardHeader className="flex-row items-center justify-between p-2">
                                <CardTitle className="text-sm font-medium">Log Outcome</CardTitle>
                                <Button onClick={() => handleGenericLog('Outcome')} disabled={!!isSubmitting || !selectedOutcome} size="icon" variant="ghost" className="h-7 w-7">
                                    {isSubmitting === 'Outcome' ? <Loader2 className="animate-spin h-4 w-4" /> : <Send className="h-4 w-4" />}
                                </Button>
                            </CardHeader>
                            <CardContent className="space-y-3 p-2 pt-0">
                                <div className="flex items-center justify-center gap-2">
                                    {(['Info', 'Later', 'Event Scheduled'] as OutcomeType[]).map(outcome => (
                                        <Button key={outcome} variant={selectedOutcome === outcome ? 'default' : 'outline'} size="xs" onClick={() => setSelectedOutcome(o => o === outcome ? null : outcome)}>{outcome === 'Event Scheduled' ? 'Event' : outcome}</Button>
                                    ))}
                                </div>
                                {selectedOutcome === 'Info' && <Textarea placeholder="Enter info/details..." value={outcomeNotes} onChange={e => setOutcomeNotes(e.target.value)} />}
                                {selectedOutcome === 'Later' && <Button variant="outline" className="w-full" onClick={() => { setDateTimePickerCallback(() => setDateTimePickerValue); setIsDateTimePickerOpen(true);}}><CalendarIcon className="mr-2 h-4 w-4" />{dateTimePickerValue ? format(dateTimePickerValue, 'PPP p') : 'Select follow-up date'}</Button>}
                                {selectedOutcome === 'Event Scheduled' && (
                                    <div className="space-y-2">
                                        <Select value={selectedLead.eventDetails?.type || ''} onValueChange={val => setSelectedLead(p => p && produce(p, d => { if(!d.eventDetails) d.eventDetails = {type:'', dateTime:''}; d.eventDetails.type = val; }))}>
                                            <SelectTrigger><SelectValue placeholder="Select event type..." /></SelectTrigger>
                                            <SelectContent>{eventTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
                                        </Select>
                                        <Button variant="outline" className="w-full" onClick={() => {setDateTimePickerCallback(() => setDateTimePickerValue); setIsDateTimePickerOpen(true);}}><CalendarClock className="mr-2 h-4 w-4" />{dateTimePickerValue ? format(dateTimePickerValue, 'PPP p') : 'Select date & time'}</Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                     <DialogFooter>
                        <Button variant="outline" onClick={handleClose}>Done</Button>
                    </DialogFooter>
                    </>
                )}
                <DateTimePicker isOpen={isDateTimePickerOpen} onClose={() => setIsDateTimePickerOpen(false)} onSelect={dateTimePickerCallback} initialDate={dateTimePickerValue} />
            </DialogContent>
        </Dialog>
    )
}
