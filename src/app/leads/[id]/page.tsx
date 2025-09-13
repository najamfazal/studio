
"use client";

import { useState, useEffect, use, useCallback } from "react";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  updateDoc,
  Timestamp,
  addDoc,
  limit,
  startAfter,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Lead, Interaction, InteractionFeedback, AppSettings } from "@/lib/types";
import { Logo } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, Star, Brain, ToggleRight, X, Users, FilePenLine, ThumbsUp, ThumbsDown, CalendarClock, Send, Loader2, MessageSquareText, CalendarCheck, CircleDollarSign, Phone, MessageSquare } from "lucide-react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { QuickLogDialog } from "@/components/quick-log-dialog";
import { format, addDays, setHours, setMinutes, getHours, getMinutes } from "date-fns";
import { cn } from "@/lib/utils";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useRouter } from "next/navigation";
import { LeadDialog } from "@/components/lead-dialog";
import type { LeadFormValues } from "@/lib/schemas";
import { EditableField } from "@/components/editable-field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// Helper function to safely convert Firestore Timestamps or strings to Date objects
const toDate = (dateValue: any): Date | null => {
  if (!dateValue) return null;
  if (dateValue instanceof Timestamp) {
    return dateValue.toDate();
  }
  if (typeof dateValue === 'string') {
    const date = new Date(dateValue);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  if (typeof dateValue === "object" && dateValue.seconds) {
    return new Timestamp(dateValue.seconds, dateValue.nanoseconds).toDate();
  }
  return null;
};

type FeedbackCategory = keyof Omit<InteractionFeedback, 'id'>;

const dateQuickPicks = [
    { label: "Tomorrow", days: 1 },
    { label: "+3 days", days: 3 },
    { label: "A week", days: 7 },
    { label: "Next Month", days: 30 },
]

const INTERACTION_PAGE_SIZE = 3;
const AED_TO_USD_RATE = 0.27;

export default function LeadDetailPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const router = useRouter();
  const [lead, setLead] = useState<Lead | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [hasMoreInteractions, setHasMoreInteractions] = useState(true);
  const [lastInteractionDoc, setLastInteractionDoc] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLogDialogOpen, setIsLogDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  
  const [traits, setTraits] = useState<string[]>([]);
  const [insights, setInsights] = useState<string[]>([]);
  const [traitInput, setTraitInput] = useState("");
  const [insightInput, setInsightInput] = useState("");
  
  const [isSaving, setIsSaving] = useState(false);
  const [isTogglingFollow, setIsTogglingFollow] = useState(false);

  const [feedback, setFeedback] = useState<InteractionFeedback>({});
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [activeObjectionCategory, setActiveObjectionCategory] = useState<FeedbackCategory | null>(null);
  
  const [eventDetails, setEventDetails] = useState<{type?: string, dateTime?: Date}>({});
  const [isSubmittingEvent, setIsSubmittingEvent] = useState(false);
  const [scheduleStep, setScheduleStep] = useState<'date' | 'time'>('date');

  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  const { toast } = useToast();
  
  const fetchLeadData = useCallback(async () => {
    try {
      const leadDocRef = doc(db, "leads", params.id);
      const leadDocSnap = await getDoc(leadDocRef);

      if (leadDocSnap.exists()) {
        const leadData = { id: leadDocSnap.id, ...leadDocSnap.data() } as Lead;
        setLead(leadData);
        setTraits(leadData.traits || []);
        setInsights(leadData.insights || []);
      } else {
        toast({ variant: "destructive", title: "Lead not found" });
      }
    } catch (error) {
      console.error("Error fetching lead data:", error);
      toast({ variant: "destructive", title: "Error fetching lead." });
    }
  }, [params.id, toast]);

  const fetchInteractions = useCallback((loadMore = false) => {
    return new Promise<void>(async (resolve) => {
        if (loadMore) {
            setIsLoadingMore(true);
        } else {
            setIsLoading(true);
            setInteractions([]); // Clear on initial fetch
        }

        try {
            let interactionsQuery;
            if (loadMore && lastInteractionDoc) {
                 interactionsQuery = query(
                    collection(db, "interactions"),
                    where("leadId", "==", params.id),
                    orderBy("createdAt", "desc"),
                    startAfter(lastInteractionDoc),
                    limit(INTERACTION_PAGE_SIZE)
                );
            } else {
                interactionsQuery = query(
                    collection(db, "interactions"),
                    where("leadId", "==", params.id),
                    orderBy("createdAt", "desc"),
                    limit(INTERACTION_PAGE_SIZE)
                );
            }

            const snapshot = await getDocs(interactionsQuery);
            const newInteractions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Interaction));
            
            setHasMoreInteractions(newInteractions.length === INTERACTION_PAGE_SIZE);
            
            setLastInteractionDoc(snapshot.docs[snapshot.docs.length - 1]);
            setInteractions(prev => loadMore ? [...prev, ...newInteractions] : newInteractions);

        } catch (error) {
            console.error("Error fetching interactions:", error);
            toast({ variant: "destructive", title: "Error fetching interactions." });
        } finally {
             setIsLoadingMore(false);
             setIsLoading(false);
             resolve();
        }
    });
  }, [params.id, toast, lastInteractionDoc]);


  const fetchSettings = useCallback(async () => {
    try {
        const settingsDoc = await getDoc(doc(db, "settings", "appConfig"));
        if (settingsDoc.exists()) {
            setAppSettings({ id: settingsDoc.id, ...settingsDoc.data() } as AppSettings);
        } else {
            // Default settings if not found
            setAppSettings({
              courseNames: [],
              commonTraits: [],
              feedbackChips: { content: [], schedule: [], price: [] },
            });
        }
    } catch (error) {
        console.error("Error fetching settings:", error);
        toast({variant: "destructive", title: "Could not load app settings."})
    }
}, [toast]);


  const onInteractionLogged = useCallback(async () => {
    setLastInteractionDoc(null); // Reset for re-fetching from the start
    await Promise.all([
      fetchInteractions(false),
      fetchLeadData()
    ]);
  }, [fetchInteractions, fetchLeadData]);


  useEffect(() => {
    const loadData = async () => {
        setIsLoading(true);
        await Promise.all([fetchLeadData(), fetchInteractions(false), fetchSettings()]);
        setIsLoading(false);
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);
  
  const logInteraction = useCallback(async (interactionData: Partial<Interaction>, successMessage?: string) => {
    if (!lead) return;
    try {
      await addDoc(collection(db, "interactions"), {
        ...interactionData,
        leadId: lead.id,
        createdAt: new Date().toISOString(),
      });
      await onInteractionLogged();
      toast({ title: successMessage || "Interaction Logged" });
    } catch (error) {
      console.error("Error logging interaction:", error);
      toast({ variant: "destructive", title: "Logging Failed" });
    }
  }, [lead, onInteractionLogged, toast]);


  const handleToggleFollowList = async () => {
    if (!lead) return;
    setIsTogglingFollow(true);
    const newValue = !lead.onFollowList;
    try {
      const leadRef = doc(db, "leads", lead.id);
      await updateDoc(leadRef, { onFollowList: newValue });
      setLead(prev => prev ? { ...prev, onFollowList: newValue } : null);
      toast({
        title: newValue ? "Added to Follow List" : "Removed from Follow List",
      });
    } catch (error) {
      toast({ variant: "destructive", title: "Error updating follow list status." });
    } finally {
        setIsTogglingFollow(false);
    }
  };

  const handleEditClick = () => {
    setIsEditDialogOpen(true);
  };

  const handleSaveLead = async (values: LeadFormValues) => {
    if (!lead) return;
    setIsSaving(true);
    try {
      const leadRef = doc(db, "leads", lead.id);
      
      const { course, ...leadDetails } = values;
      
      const updateData: any = { 
          ...leadDetails
      };
      
      await updateDoc(leadRef, updateData);

      const newSnapshotCourse = course || lead.commitmentSnapshot.course;
      if (newSnapshotCourse) {
        await updateDoc(leadRef, { 'commitmentSnapshot.course': newSnapshotCourse });
      }

      // We need to re-fetch to get the latest state from DB
      await fetchLeadData();
      
      toast({
        title: "Lead Updated",
        description: "The lead's details have been saved.",
      });
      setIsEditDialogOpen(false);
    } catch (error)
    {
      console.error("Error saving lead:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save lead.",
      });
    } finally {
        setIsSaving(false);
    }
  };


  const updateField = async (fieldName: 'traits' | 'insights' | 'phones', value: any) => {
      if (!lead) return;
      try {
          const leadRef = doc(db, "leads", lead.id);
          await updateDoc(leadRef, { [fieldName]: value });
          setLead(prev => prev ? { ...prev, [fieldName]: value } : null);
          toast({ title: `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} updated` });
      } catch (error) {
          toast({ variant: "destructive", title: `Error updating ${fieldName}` });
      }
  };

  const handleAddTrait = () => {
    if (traitInput && !traits.includes(traitInput)) {
        const newTraits = [...traits, traitInput];
        setTraits(newTraits);
        updateField('traits', newTraits);
        setTraitInput("");
    }
  };

  const handleRemoveTrait = (traitToRemove: string) => {
      const newTraits = traits.filter(t => t !== traitToRemove);
      setTraits(newTraits);
      updateField('traits', newTraits);
  };
  
  const handleAddInsight = () => {
    if (insightInput && !insights.includes(insightInput)) {
      const newInsights = [...insights, insightInput];
      setInsights(newInsights);
      updateField('insights', newInsights);
      setInsightInput("");
    }
  };

  const handleRemoveInsight = (insightToRemove: string) => {
      const newInsights = insights.filter(i => i !== insightToRemove);
      setInsights(newInsights);
      updateField('insights', newInsights);
  };

  const handleSnapshotUpdate = async (field: string, value: string) => {
    if (!lead) return;
    const fieldPath = `commitmentSnapshot.${field}`;
    try {
      const leadRef = doc(db, "leads", lead.id);
      await updateDoc(leadRef, { [fieldPath]: value });
      setLead(prev => {
        if (!prev) return null;
        return {
          ...prev,
          commitmentSnapshot: {
            ...prev.commitmentSnapshot,
            [field]: value
          }
        }
      })
      toast({ title: "Snapshot updated" });
    } catch (error) {
      console.error(`Error updating ${field}:`, error);
      toast({ variant: 'destructive', title: `Failed to update ${field}`});
    }
  };

  const handleFeedbackSelection = (category: FeedbackCategory, perception: 'positive' | 'negative') => {
    setFeedback(prev => {
      const current = prev[category]?.perception;
      if (current === perception) {
        const { [category]: _, ...rest } = prev;
        if (category === activeObjectionCategory) {
          setActiveObjectionCategory(null);
        }
        return rest;
      }
      setActiveObjectionCategory(perception === 'negative' ? category : null);
      return {
        ...prev,
        [category]: { perception, objections: [] }
      };
    });
  };

  const handleObjectionSelection = (category: FeedbackCategory, objection: string) => {
    setFeedback(prev => {
      if (!prev[category]) return prev;
      const existingObjections = prev[category]!.objections || [];
      const newObjections = existingObjections.includes(objection)
        ? existingObjections.filter(o => o !== objection)
        : [...existingObjections, objection];
      return {
        ...prev,
        [category]: {
          ...prev[category]!,
          objections: newObjections
        }
      };
    });
  };

  const handleLogFeedback = async () => {
    if (Object.keys(feedback).length === 0) {
      toast({ variant: 'destructive', title: 'No feedback selected' });
      return;
    }
    setIsSubmittingFeedback(true);
    await logInteraction({ feedback }, "Feedback logged");
    setFeedback({});
    setActiveObjectionCategory(null);
    setIsSubmittingFeedback(false);
  };


  const handleScheduleEvent = async () => {
      if (!eventDetails.type || !eventDetails.dateTime) {
          toast({variant: 'destructive', title: "Please select event type and date/time"});
          return;
      }
      setIsSubmittingEvent(true);
      await logInteraction({
          outcome: "Event Scheduled",
          eventDetails: { type: eventDetails.type, dateTime: eventDetails.dateTime.toISOString() }
      }, "Event Scheduled");
      setEventDetails({});
      setScheduleStep('date');
      setIsSubmittingEvent(false);
  };

  const isObjectionsOpen = activeObjectionCategory !== null;


  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Logo className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center p-4">
         <Users className="h-16 w-16 mb-4 text-muted-foreground"/>
        <h2 className="text-2xl font-semibold">Lead not found</h2>
        <p className="text-muted-foreground mt-2">
          The lead you are looking for does not exist or has been deleted.
        </p>
        <Button asChild className="mt-4">
            <Link href="/leads"><ArrowLeft className="mr-2"/> Back to Leads</Link>
        </Button>
      </div>
    );
  }
  
  const lastInteractionDate = toDate(lead.last_interaction_date);
  const priceInAED = parseFloat(lead.commitmentSnapshot?.price || "0");
  const priceInUSD = priceInAED * AED_TO_USD_RATE;


  return (
    <div className="flex flex-col min-h-screen bg-background relative">
       <header className="bg-card border-b p-3 flex items-center justify-between sticky top-0 z-20 gap-2">
          <div className="flex items-center gap-1">
             <SidebarTrigger />
             <Button variant="ghost" size="icon" onClick={() => router.back()} className="hidden sm:inline-flex">
              <ArrowLeft />
            </Button>
          </div>
          <div className="flex-1 overflow-hidden">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight leading-snug break-words line-clamp-2">{lead.name}</h1>
              <Badge variant={lead.status === 'Active' ? 'default' : 'secondary'} className="mt-1">{lead.status}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <Button onClick={handleEditClick} variant="outline" size="sm" className="shrink-0 sm:w-auto w-10 p-0 sm:px-4 sm:py-2">
                <FilePenLine className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Edit</span>
                <span className="sr-only">Edit Lead</span>
            </Button>
            <Button onClick={handleToggleFollowList} disabled={isTogglingFollow} variant={lead.onFollowList ? "default" : "outline"} size="sm" className="shrink-0 sm:w-auto w-10 p-0 sm:px-4 sm:py-2" >
              {isTogglingFollow ? <Loader2 className="h-4 w-4 animate-spin"/> : <Star className={cn("h-4 w-4", lead.onFollowList && "fill-current text-yellow-400", "sm:mr-2")}/>}
              <span className="hidden sm:inline">{lead.onFollowList ? 'On Follow List' : 'Add to Follow List'}</span>
              <span className="sr-only">Add to Follow List</span>
            </Button>
          </div>
      </header>

      <main className="flex-1 p-2 sm:p-4 pb-24">
        <Tabs defaultValue="summary" className="mt-0">
          <TabsList className="mb-2">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="history">History & Intel</TabsTrigger>
          </TabsList>
          
          <TabsContent value="summary">
             <div className="grid gap-4">
                <Card>
                    <CardHeader className="p-4 pb-2 relative">
                        <CardTitle className="text-lg">Snapshot</CardTitle>
                         <CardDescription className="text-xs">
                          Last interaction: {lastInteractionDate ? format(lastInteractionDate, 'PP') : 'Never'}
                       </CardDescription>
                       <Badge className="absolute top-4 right-4">AFC Step: {lead.afc_step}</Badge>
                    </CardHeader>
                    <CardContent className="p-4 pt-2 text-sm">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                         <div className="space-y-2 col-span-2">
                            <p className="font-medium text-muted-foreground text-xs">Phone(s)</p>
                            {(lead.phones || []).map((phone, index) => (
                                <div key={index} className="flex items-center gap-2">
                                    <p className="flex-1">{phone.number}</p>
                                    {(phone.type === 'calling' || phone.type === 'both') && (
                                    <a href={`tel:${phone.number.replace(/\\D/g, "")}`}>
                                        <Button variant="outline" size="icon" className="h-7 w-7"><Phone className="h-4 w-4" /></Button>
                                    </a>
                                    )}
                                    {(phone.type === 'chat' || phone.type === 'both') && (
                                    <a href={`https://wa.me/${phone.number.replace(/\\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                                        <Button variant="outline" size="icon" className="h-7 w-7"><MessageSquare className="h-4 w-4" /></Button>
                                    </a>
                                    )}
                                </div>
                            ))}
                             {(lead.phones || []).length === 0 && <p className="text-muted-foreground text-sm">No phone numbers.</p>}
                        </div>

                        <div className="col-span-1">
                          <EditableField label="Course" value={lead.commitmentSnapshot?.course || 'Not specified'} onSave={(v) => handleSnapshotUpdate('course', v)} />
                        </div>
                        <div className="col-span-1 flex flex-col items-end">
                            <div className="w-full max-w-[150px] text-right">
                                <EditableField 
                                  label="Price" 
                                  value={lead.commitmentSnapshot?.price || '0'} 
                                  onSave={(v) => handleSnapshotUpdate('price', v)} 
                                  inputType="number" 
                                  displayFormatter={(val) => (
                                    <div className="text-right">
                                      <span className="font-semibold">{Number(val).toLocaleString()} AED</span>
                                      <p className="text-xs text-muted-foreground">(~${(Number(val) * AED_TO_USD_RATE).toFixed(0)} USD)</p>
                                    </div>
                                  )}
                                />
                            </div>
                        </div>

                        <div className="col-span-2">
                            <EditableField label="Schedule" value={lead.commitmentSnapshot?.schedule || 'Not specified'} onSave={(v) => handleSnapshotUpdate('schedule', v)} type="textarea" />
                        </div>
                        <div className="col-span-2">
                          <EditableField label="Key Notes" value={lead.commitmentSnapshot?.keyNotes || 'None'} onSave={(v) => handleSnapshotUpdate('keyNotes', v)} type="textarea" />
                        </div>
                      </div>
                    </CardContent>
                </Card>
                
                <Card>
                    <Collapsible open={isObjectionsOpen} onOpenChange={(isOpen) => { if (!isOpen) setActiveObjectionCategory(null); }}>
                        <CardHeader className="p-4 pb-3 flex flex-row items-center justify-between">
                             <div className="flex items-center gap-2">
                                <CardTitle className="text-lg">Feedback</CardTitle>
                             </div>
                             <Button onClick={handleLogFeedback} size="icon" variant="ghost" className="h-8 w-8" disabled={isSubmittingFeedback || Object.keys(feedback).length === 0}>
                                {isSubmittingFeedback ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                             </Button>
                        </CardHeader>
                        <CardContent className="px-4 pt-0 pb-4">
                             <div className="grid grid-cols-3 gap-2 sm:gap-3">
                                {(['content', 'schedule', 'price'] as const).map(category => (
                                    <div key={category} className="space-y-2 text-center">
                                         <p className="font-medium text-muted-foreground text-xs capitalize flex items-center justify-center gap-1.5">
                                          {category === 'content' && <MessageSquareText className="h-3.5 w-3.5"/>}
                                          {category === 'schedule' && <CalendarCheck className="h-3.5 w-3.5"/>}
                                          {category === 'price' && <CircleDollarSign className="h-3.5 w-3.5"/>}
                                          <span className="hidden sm:inline">{category}</span>
                                          <span className="inline sm:hidden">{category}</span>
                                        </p>
                                        <div className="flex items-center justify-center gap-1 border rounded-full p-0.5 bg-muted/50">
                                            <Button size="icon" variant={feedback[category]?.perception === 'positive' ? 'default' : 'ghost'} className="h-7 w-7 rounded-full flex-1" onClick={() => handleFeedbackSelection(category, 'positive')}><ThumbsUp className="h-4 w-4"/></Button>
                                            <Separator orientation="vertical" className="h-5"/>
                                            <Button size="icon" variant={feedback[category]?.perception === 'negative' ? 'destructive' : 'ghost'} className="h-7 w-7 rounded-full flex-1" onClick={() => handleFeedbackSelection(category, 'negative')}><ThumbsDown className="h-4 w-4"/></Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <CollapsibleContent>
                                <div className="pt-3 mt-3 border-t">
                                  {activeObjectionCategory && (
                                       <div className="flex flex-wrap gap-2 justify-center">
                                          {(appSettings?.feedbackChips[activeObjectionCategory] || []).map(objection => (
                                              <Badge
                                                  key={objection}
                                                  variant={feedback[activeObjectionCategory]?.objections?.includes(objection) ? "default" : "secondary"}
                                                  onClick={() => handleObjectionSelection(activeObjectionCategory, objection)}
                                                  className="cursor-pointer transition-colors text-sm"
                                              >
                                                  {objection}
                                              </Badge>
                                          ))}
                                      </div>
                                  )}
                                </div>
                            </CollapsibleContent>
                        </CardContent>
                    </Collapsible>
                </Card>
                
                 <Card>
                    <CardHeader className="p-4 pb-3">
                        <CardTitle className="text-lg">Schedule</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 space-y-3">
                         <div className="flex gap-2">
                            <Select onValueChange={(v) => setEventDetails(p => ({...p, type: v}))} value={eventDetails.type}>
                                <SelectTrigger><SelectValue placeholder="Event type..." /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Online Meet/Demo">Online Meet/Demo</SelectItem>
                                    <SelectItem value="Visit">Visit</SelectItem>
                                </SelectContent>
                            </Select>
                            <Popover onOpenChange={(open) => !open && setScheduleStep('date')}>
                                <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    size="icon"
                                    className={cn("h-10 w-10 shrink-0", !eventDetails.dateTime && "text-muted-foreground")}
                                >
                                    <CalendarClock className="h-4 w-4" />
                                </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    {scheduleStep === 'date' && (
                                        <>
                                            <Calendar
                                                mode="single"
                                                selected={eventDetails.dateTime}
                                                onSelect={(d) => {
                                                    const existing = eventDetails.dateTime || setMinutes(setHours(new Date(), 17), 0);
                                                    if (d) {
                                                        const newDate = setMinutes(setHours(d, getHours(existing)), getMinutes(existing));
                                                        setEventDetails(p => ({...p, dateTime: newDate}));
                                                        setScheduleStep('time');
                                                    }
                                                }}
                                                initialFocus
                                            />
                                            <div className="flex flex-wrap gap-1 p-2 border-t justify-center">
                                                {dateQuickPicks.map(qp => (
                                                    <Button key={qp.label} variant="ghost" size="sm" onClick={() => {
                                                        const existing = eventDetails.dateTime || setMinutes(setHours(new Date(), 17), 0);
                                                        const newDate = setMinutes(setHours(addDays(new Date(), qp.days), getHours(existing)), getMinutes(existing));
                                                        setEventDetails(p => ({...p, dateTime: newDate}));
                                                        setScheduleStep('time');
                                                    }}>{qp.label}</Button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                    {scheduleStep === 'time' && (
                                        <div className="p-4">
                                            <p className="text-sm font-medium text-center mb-2">{eventDetails.dateTime ? format(eventDetails.dateTime, 'PPP') : 'Select a date'}</p>
                                            <div className="space-y-3">
                                                <div>
                                                    <p className="text-xs font-medium text-muted-foreground mb-1 text-center">Hour</p>
                                                    <div className="grid grid-cols-6 gap-1">
                                                        {Array.from({length: 12}, (_, i) => i + 1).map(h => (
                                                          <Button key={h} variant={((getHours(eventDetails.dateTime || new Date()) % 12) || 12) === h ? 'default' : 'outline'} size="sm" onClick={() => {
                                                            const d = eventDetails.dateTime || new Date();
                                                            const currentAmPm = getHours(d) >= 12 ? 'pm' : 'am';
                                                            const newHour = currentAmPm === 'pm' && h < 12 ? h + 12 : (currentAmPm === 'am' && h === 12 ? 0 : h);
                                                            setEventDetails(p => ({...p, dateTime: setHours(d, newHour)}));
                                                          }}>{h}</Button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2">
                                                   <div>
                                                        <p className="text-xs font-medium text-muted-foreground mb-1 text-center">Period</p>
                                                        <div className="grid grid-cols-2 gap-1">
                                                            <Button variant={getHours(eventDetails.dateTime || new Date()) < 12 ? 'default' : 'outline'} size="sm" onClick={() => {
                                                                const d = eventDetails.dateTime || new Date();
                                                                const h = getHours(d);
                                                                if (h >= 12) setEventDetails(p => ({...p, dateTime: setHours(d, h - 12)}));
                                                            }}>AM</Button>
                                                            <Button variant={getHours(eventDetails.dateTime || new Date()) >= 12 ? 'default' : 'outline'} size="sm" onClick={() => {
                                                                const d = eventDetails.dateTime || new Date();
                                                                const h = getHours(d);
                                                                if (h < 12) setEventDetails(p => ({...p, dateTime: setHours(d, h + 12)}));
                                                            }}>PM</Button>
                                                        </div>
                                                   </div>
                                                   <div>
                                                        <p className="text-xs font-medium text-muted-foreground mb-1 text-center">Minute</p>
                                                        <div className="grid grid-cols-2 gap-1">
                                                            {['00', '15', '30', '45'].map(m => (
                                                                <Button key={m} variant={getMinutes(eventDetails.dateTime || new Date()) === parseInt(m) ? 'default' : 'outline'} size="sm" onClick={() => {
                                                                    const d = eventDetails.dateTime || new Date();
                                                                    setEventDetails(p => ({...p, dateTime: setMinutes(d, parseInt(m))}));
                                                                }}>{m}</Button>
                                                            ))}
                                                        </div>
                                                   </div>
                                                </div>
                                            </div>
                                            <Button onClick={() => setScheduleStep('date')} variant="link" size="sm" className="mt-2 p-0 h-auto">Back to date</Button>
                                        </div>
                                    )}
                                </PopoverContent>
                            </Popover>
                         </div>
                         {eventDetails.dateTime && <p className="text-sm text-muted-foreground">Selected: {format(eventDetails.dateTime, "PPP p")}</p>}
                         <Button onClick={handleScheduleEvent} className="w-full" disabled={!eventDetails.type || !eventDetails.dateTime || isSubmittingEvent}>
                          {isSubmittingEvent && <Loader2 className="animate-spin mr-2" />}
                          {isSubmittingEvent ? "Processing..." : "Schedule Event"}
                        </Button>
                    </CardContent>
                </Card>

             </div>
          </TabsContent>

          <TabsContent value="history">
             <div className="grid gap-4">
                <Card>
                    <CardHeader className="p-4">
                        <CardTitle className="text-lg">Intel</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 p-4 pt-0">
                        <div>
                            <h3 className="font-semibold mb-2 flex items-center gap-2 text-sm"><Brain className="text-primary h-4 w-4"/> Traits</h3>
                             <div className="flex flex-wrap gap-2 mb-2">
                                {traits.map(trait => (
                                    <Badge key={trait} variant="outline" className="flex items-center gap-1">
                                        {trait}
                                        <button onClick={() => handleRemoveTrait(trait)} className="rounded-full hover:bg-muted"><X className="h-3 w-3"/></button>
                                    </Badge>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <Input value={traitInput} onChange={e => setTraitInput(e.target.value)} placeholder="Add a trait..." onKeyDown={e => e.key === 'Enter' && handleAddTrait()} className="h-9 text-sm"/>
                                 <Button onClick={handleAddTrait} size="icon" className="sm:w-auto sm:px-4 shrink-0">
                                  <Plus className="sm:mr-2 h-4 w-4"/>
                                  <span className="sr-only sm:not-sr-only">Add</span>
                                </Button>
                            </div>
                        </div>
                        <Separator />
                         <div>
                            <h3 className="font-semibold mb-2 flex items-center gap-2 text-sm"><ToggleRight className="text-primary h-4 w-4"/> Insights</h3>
                             <div className="flex flex-wrap gap-2 mb-2">
                                {insights.map(insight => (
                                    <Badge key={insight} variant="outline" className="flex items-center gap-1">
                                        {insight}
                                        <button onClick={() => handleRemoveInsight(insight)} className="rounded-full hover:bg-muted"><X className="h-3 w-3"/></button>
                                    </Badge>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <Input value={insightInput} onChange={e => setInsightInput(e.target.value)} placeholder="Add an insight..." onKeyDown={e => e.key === 'Enter' && handleAddInsight()} className="h-9 text-sm"/>
                                <Button onClick={handleAddInsight} size="icon" className="sm:w-auto sm:px-4 shrink-0">
                                   <Plus className="sm:mr-2 h-4 w-4"/>
                                  <span className="sr-only sm:not-sr-only">Add</span>
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="p-4">
                        <CardTitle className="text-lg">Interaction History</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                       {interactions.length > 0 ? (
                           <div className="space-y-4">
                               {interactions.map(interaction => {
                                   const interactionDate = toDate(interaction.createdAt);
                                   return (
                                     <div key={interaction.id} className="p-3 rounded-md bg-muted/50 text-sm">
                                         <div className="font-semibold flex justify-between items-center">
                                            <span>{interactionDate ? format(interactionDate, 'PP p') : 'Invalid date'}</span>
                                            {interaction.quickLogType && <Badge variant="secondary">{interaction.quickLogType}</Badge>}
                                            {interaction.outcome === 'Event Scheduled' && interaction.eventDetails && <Badge variant="secondary">{interaction.eventDetails.type}</Badge>}
                                         </div>
                                        {interaction.notes && <p className="text-muted-foreground mt-1">{interaction.notes}</p>}
                                        {interaction.outcome === 'Event Scheduled' && interaction.eventDetails?.dateTime && (
                                            <p className="text-muted-foreground mt-1">Scheduled for: {format(toDate(interaction.eventDetails.dateTime)!, "PPP p")}</p>
                                        )}
                                        {interaction.feedback && (
                                            <div className="mt-2 space-y-1 text-xs">
                                                {Object.entries(interaction.feedback).map(([key, value]) => (
                                                    <div key={key} className="flex items-center gap-2">
                                                        <span className="font-medium capitalize">{key}:</span>
                                                        <Badge variant={value.perception === 'positive' ? 'default' : 'destructive'} className="text-xs">{value.perception}</Badge>
                                                        {value.objections && value.objections.length > 0 && <span className="text-muted-foreground">{value.objections.join(', ')}</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                     </div>
                                   );
                               })}
                               {hasMoreInteractions && (
                                 <Button onClick={() => fetchInteractions(true)} disabled={isLoadingMore} className="w-full mt-4">
                                   {isLoadingMore ? <Loader2 className="animate-spin mr-2"/> : null}
                                   {isLoadingMore ? 'Loading...' : 'Load More'}
                                 </Button>
                               )}
                           </div>
                       ) : (
                           <p className="text-sm text-muted-foreground">No interactions logged yet.</p>
                       )}
                    </CardContent>
                </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>
      
       <div className="fixed bottom-0 left-0 right-0 p-4 flex justify-end bg-gradient-to-t from-background to-transparent z-10 md:relative md:bg-none">
        <Button
          size="lg"
          className="rounded-full shadow-lg h-14 w-14 sm:w-auto sm:px-6"
          onClick={() => setIsLogDialogOpen(true)}
        >
          <Plus className="h-6 w-6 sm:mr-2" />
          <span className="hidden sm:inline">Log Interaction</span>
        </Button>
      </div>

      <QuickLogDialog 
        isOpen={isLogDialogOpen}
        setIsOpen={setIsLogDialogOpen}
        lead={lead}
        onLogSaved={onInteractionLogged}
      />
      <LeadDialog
        isOpen={isEditDialogOpen}
        setIsOpen={setIsEditDialogOpen}
        onSave={handleSaveLead}
        leadToEdit={lead}
        isSaving={isSaving}
      />
    </div>
  );
}
