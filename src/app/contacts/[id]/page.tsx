
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, orderBy, limit, startAfter, QueryDocumentSnapshot, DocumentData, addDoc } from 'firebase/firestore';
import { useParams, useRouter } from 'next/navigation';
import { produce } from 'immer';
import { format, parseISO, formatDistanceToNowStrict } from 'date-fns';
import { ArrowLeft, Check, Loader2, Mail, Phone, Plus, Send, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import Link from 'next/link';

import { db } from '@/lib/firebase';
import type { AppSettings, Interaction, Lead, CourseSchedule, PaymentInstallment, InteractionFeedback, QuickLogType, Task } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Logo } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { EditableField } from '@/components/editable-field';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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

export default function ContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { toast } = useToast();

  const [lead, setLead] = useState<Lead | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Interactions state
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [isInteractionsLoading, setIsInteractionsLoading] = useState(true);
  const [lastInteraction, setLastInteraction] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreInteractions, setHasMoreInteractions] = useState(true);

  // Tasks state
  const [activeTasks, setActiveTasks] = useState<Task[]>([]);
  const [pastTasks, setPastTasks] = useState<Task[]>([]);
  const [isTasksLoading, setIsTasksLoading] = useState(true);
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
  
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const leadDocRef = doc(db, 'leads', id);
      const leadDoc = await getDoc(leadDocRef);
      if (leadDoc.exists()) {
        setLead({ id: leadDoc.id, ...leadDoc.data() } as Lead);
      } else {
        toast({ variant: 'destructive', title: 'Contact not found.' });
        router.push('/contacts');
      }

      const settingsDocRef = doc(db, 'settings', 'appConfig');
      const settingsDoc = await getDoc(settingsDocRef);
      if(settingsDoc.exists()) {
        setAppSettings(settingsDoc.data() as AppSettings);
      }

    } catch (error) {
      console.error('Error fetching data:', error);
      toast({ variant: 'destructive', title: 'Failed to load contact data.' });
    } finally {
      setIsLoading(false);
    }
  }, [id, router, toast]);

  const fetchInteractions = useCallback(async (loadMore = false) => {
    if (!id) return;
    setIsInteractionsLoading(true);
    
    try {
      const qConstraints = [
        where('leadId', '==', id),
        orderBy('createdAt', 'desc'),
        limit(loadMore ? 10 : INTERACTION_PAGE_SIZE)
      ];

      if (loadMore && lastInteraction) {
        qConstraints.push(startAfter(lastInteraction));
      }

      const q = query(collection(db, 'interactions'), ...qConstraints);
      const snapshot = await getDocs(q);
      const newInteractions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Interaction));

      setHasMoreInteractions(newInteractions.length === (loadMore ? 10 : INTERACTION_PAGE_SIZE));
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
    if (!id) return;
    setIsTasksLoading(true);
    
    try {
      const isCompleted = type === 'past';
      const lastVisible = type === 'active' ? lastActiveTask : lastPastTask;

      const qConstraints = [
        where('leadId', '==', id),
        where('completed', '==', isCompleted),
        orderBy('createdAt', 'desc'),
        limit(TASK_PAGE_SIZE)
      ];

      if (loadMore && lastVisible) {
        qConstraints.push(startAfter(lastVisible));
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
    if (id) {
      fetchData();
      fetchInteractions();
      fetchTasks('active');
      fetchTasks('past');
    }
  }, [id]);

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
  
  const handleLogInteraction = async () => {
    if (!selectedQuickLog) return;
    
    if (quickLogStep === 'withdrawn' && withdrawalReasons.length === 0) {
        toast({ variant: 'destructive', title: "Please select a reason for withdrawal."});
        return;
    }

    setSubmissionState('submitting');
    
    let interaction: Partial<Interaction> = {
        quickLogType: selectedQuickLog
    };

    if (selectedQuickLog === 'Withdrawn') {
        interaction.withdrawalReasons = withdrawalReasons;
    }

    try {
        await addDoc(collection(db, 'interactions'), {
            ...interaction,
            leadId: id,
            createdAt: new Date().toISOString(),
        });
        setSubmissionState('submitted');
        toast({title: "Interaction logged successfully."});
        fetchInteractions(); 
    } catch (error) {
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
    await addDoc(collection(db, "interactions"), {
      feedback,
      leadId: id,
      createdAt: new Date().toISOString(),
    });
    setFeedback({});
    setActiveChipCategory(null);
    setIsLoggingFeedback(false);
    toast({ title: "Feedback logged" });
    fetchInteractions();
  }

  const availableTraits = useMemo(() => {
    if (!appSettings?.commonTraits || !lead?.traits) return [];
    return appSettings.commonTraits.filter(trait => !lead.traits.includes(trait));
  }, [appSettings?.commonTraits, lead?.traits]);

  const handleQuickLogChipClick = (logType: QuickLogType) => {
    setSelectedQuickLog(logType);
    const option = quickLogOptions.find(o => o.value === logType);
    if (option?.multistep) {
        setQuickLogStep(option.multistep);
    }
  };

  const handleToggleWithdrawalReason = (reason: string) => {
    setWithdrawalReasons(prev => 
      prev.includes(reason) ? prev.filter(r => r !== reason) : [...prev, reason]
    );
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

  const formatFeedbackLog = (feedbackData: InteractionFeedback) => {
    const parts: string[] = [];
    for (const key in feedbackData) {
        const category = key as FeedbackCategory;
        const feedbackItem = feedbackData[category];
        if (feedbackItem) {
            let part = `${category}: ${feedbackItem.perception}`;
            if (feedbackItem.objections && feedbackItem.objections.length > 0) {
                part += ` (${feedbackItem.objections.join(', ')})`;
            }
            parts.push(part);
        }
    }
    return parts.join('; ');
  };
  
  const formatRelativeTime = (date: Date) => {
    const distance = formatDistanceToNowStrict(date, { addSuffix: true });
    return distance
      .replace(/ seconds| second/, 's')
      .replace(/ minutes| minute/, 'm')
      .replace(/ hours| hour/, 'h')
      .replace(/ days| day/, 'd')
      .replace(/ months| month/, 'mo')
      .replace(/ years| year/, 'y');
  };

  if (isLoading || !lead || !appSettings) {
    return <div className="flex h-screen items-center justify-center"><Logo className="h-12 w-12 animate-spin text-primary" /></div>;
  }
  
  const renderLeadView = () => {
    return (
      <Tabs defaultValue="summary">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
        </TabsList>
        
        <TabsContent value="summary" className="space-y-4">
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
               <div>
                 <EditableField label="Schedule" value={lead.commitmentSnapshot?.schedule || ""} onSave={(val) => handleUpdate('commitmentSnapshot.schedule', val)} placeholder="Enter schedule"/>
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
                    {(lead.traits || []).map(trait => <Badge key={trait} variant="secondary">{trait} <button onClick={() => handleRemoveChip('traits', trait)} className="ml-2 p-0.5 rounded-full hover:bg-destructive/20"><Trash2 className="h-3 w-3 text-destructive"/></button></Badge>)}
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
                          {(lead.insights || []).map(insight => <Badge key={insight} variant="outline">{insight} <button onClick={() => handleRemoveChip('insights', insight)} className="ml-2 p-0.5 rounded-full hover:bg-destructive/20"><Trash2 className="h-3 w-3 text-destructive"/></button></Badge>)}
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
        
        <TabsContent value="logs" className="space-y-6">
            <Card className="relative overflow-hidden">
              <AnimatePresence initial={false}>
                <motion.div
                  key={quickLogStep}
                  className="w-full"
                  initial={{ opacity: 0, x: quickLogStep === 'initial' ? 0 : 300 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -300, position: 'absolute' }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                >
                  {quickLogStep === 'initial' && (
                    <>
                      <CardHeader className="flex-row items-center justify-between">
                          <CardTitle className="text-lg font-normal">Quick Log</CardTitle>
                          <Button onClick={handleLogInteraction} size="icon" variant="ghost" disabled={isSubmitDisabled()}>
                              {submissionState === 'submitting' ? <Loader2 className="animate-spin" /> : <Send />}
                          </Button>
                      </CardHeader>
                      <CardContent className="flex flex-wrap gap-2">
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
                      <CardHeader>
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
                      <CardContent>
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
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg font-normal">Log Feedback</CardTitle>
                <Button onClick={handleLogFeedback} disabled={isLoggingFeedback || Object.keys(feedback).length === 0} size="icon" variant="ghost">
                  {isLoggingFeedback ? <Loader2 className="animate-spin" /> : <Send />}
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  {(['content', 'schedule', 'price'] as FeedbackCategory[]).map(category => (
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
              <CardHeader>
                <CardTitle className="text-lg font-normal">Log History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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
                            <p className="text-muted-foreground capitalize">
                              {interaction.feedback ? formatFeedbackLog(interaction.feedback) : interaction.notes}
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
        </TabsContent>
        
        <TabsContent value="tasks" className="space-y-4">
          <Card>
            <CardHeader className="p-4"><CardTitle className="text-lg">Active Tasks</CardTitle></CardHeader>
            <CardContent className="p-4 pt-0">
              {isTasksLoading && activeTasks.length === 0 && <div className="flex justify-center"><Loader2 className="animate-spin" /></div>}
              {activeTasks.length > 0 ? (
                <div className="space-y-2">
                  {activeTasks.map(task => (
                    <div key={task.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                       <button onClick={() => handleTaskCompletion(task, true)} className="flex items-center justify-center h-5 w-5 rounded-full border-2 border-muted-foreground/50 hover:border-primary shrink-0" />
                       <p className="flex-1 text-sm">{task.description}</p>
                       {task.dueDate && <p className="text-xs text-muted-foreground">{format(toDate(task.dueDate)!, 'MMM d')}</p>}
                    </div>
                  ))}
                </div>
              ) : !isTasksLoading && <p className="text-sm text-center text-muted-foreground p-4">No active tasks.</p>}
              {hasMoreActiveTasks && (
                <div className="flex justify-center mt-4">
                  <Button variant="outline" onClick={() => fetchTasks('active', true)} disabled={isTasksLoading}>
                    {isTasksLoading ? <Loader2 className="animate-spin" /> : 'Load More'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
           <Card>
            <CardHeader className="p-4"><CardTitle className="text-lg">Past Tasks</CardTitle></CardHeader>
            <CardContent className="p-4 pt-0">
              {isTasksLoading && pastTasks.length === 0 && <div className="flex justify-center"><Loader2 className="animate-spin" /></div>}
              {pastTasks.length > 0 ? (
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
              ) : !isTasksLoading && <p className="text-sm text-center text-muted-foreground p-4">No past tasks.</p>}
              {hasMorePastTasks && (
                <div className="flex justify-center mt-4">
                  <Button variant="outline" onClick={() => fetchTasks('past', true)} disabled={isTasksLoading}>
                    {isTasksLoading ? <Loader2 className="animate-spin" /> : 'Load More'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    );
  };
  
  const renderLearnerView = () => (
    <Tabs defaultValue="overview">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="schedule">Schedule</TabsTrigger>
        <TabsTrigger value="payplan">Pay Plan</TabsTrigger>
        <TabsTrigger value="leadlog">Lead Log</TabsTrigger>
      </TabsList>
      
      <TabsContent value="overview">
        {/* Implement Learner Overview Tab UI */}
      </TabsContent>
      
       <TabsContent value="schedule">
        {/* Implement Learner Schedule Tab UI */}
      </TabsContent>
      
       <TabsContent value="payplan">
        {/* Implement Learner Pay Plan Tab UI */}
      </TabsContent>
      
       <TabsContent value="leadlog">
        {/* Implement Learner Lead Log Tab UI */}
      </TabsContent>
    </Tabs>
  );

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="bg-card border-b p-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" asChild>
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
             <div>
                {/* Add Actions like Edit/Delete/Merge here */}
            </div>
        </div>
      </header>
      
      <main className="flex-1 p-4 sm:p-6 md:p-8">
        {lead.relationship === 'Learner' ? renderLearnerView() : renderLeadView()}
      </main>
    </div>
  );
}

