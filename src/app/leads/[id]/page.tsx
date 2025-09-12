

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
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Lead, Interaction, InteractionFeedback } from "@/lib/types";
import { Logo } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, Star, Brain, ToggleRight, X, Users, FilePenLine, ThumbsUp, ThumbsDown, CalendarClock, Send, Loader2 } from "lucide-react";
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
import { LogInteractionDialog } from "@/components/log-interaction-dialog";
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
  // Handle Firestore Timestamp-like objects from server-side rendering
  if (typeof dateValue === "object" && dateValue.seconds) {
    return new Timestamp(dateValue.seconds, dateValue.nanoseconds).toDate();
  }
  return null;
};

type FeedbackCategory = keyof Omit<InteractionFeedback, 'id'>;

const objectionChips: Record<FeedbackCategory, string[]> = {
  content: ["Not relevant", "Too complex", "Needs more detail"],
  schedule: ["Wrong time", "Too long", "Inconvenient"],
  price: ["Too expensive", "No budget", "Better offers"],
};

const dateQuickPicks = [
    { label: "Tomorrow", days: 1 },
    { label: "+3 days", days: 3 },
    { label: "A week", days: 7 },
    { label: "Next Month", days: 30 },
]

export default function LeadDetailPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const router = useRouter();
  const [lead, setLead] = useState<Lead | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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
  const [scheduleStep, setScheduleStep] = useState<'date' | 'time'>('date');

  const { toast } = useToast();
  
  const fetchLeadAndInteractions = useCallback(async () => {
    try {
      // Fetch lead
      const leadDocRef = doc(db, "leads", params.id);
      const leadDocSnap = await getDoc(leadDocRef);

      if (leadDocSnap.exists()) {
        const leadData = { id: leadDocSnap.id, ...leadDocSnap.data() } as Lead;
        setLead(leadData);
        setTraits(leadData.traits || []);
        setInsights(leadData.insights || []);
      } else {
        toast({ variant: "destructive", title: "Lead not found" });
        return;
      }

      // Fetch interactions
      const interactionsQuery = query(
        collection(db, "interactions"),
        where("leadId", "==", params.id),
        orderBy("createdAt", "desc")
      );
      const interactionsSnapshot = await getDocs(interactionsQuery);
      const interactionsData = interactionsSnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as Interaction)
      );
      setInteractions(interactionsData);
    } catch (error) {
      console.error("Error fetching lead data:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch lead data.",
      });
    }
  }, [params.id, toast]);

  const onInteractionLogged = useCallback(async () => {
    try {
        const interactionsQuery = query(
          collection(db, "interactions"),
          where("leadId", "==", params.id),
          orderBy("createdAt", "desc")
        );
        const interactionsSnapshot = await getDocs(interactionsQuery);
        const interactionsData = interactionsSnapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as Interaction)
        );
        setInteractions(interactionsData);
        toast({title: "Interactions Updated" })
    } catch (error) {
       console.error("Error fetching interactions:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to fetch new interactions.",
        });
    }
  }, [params.id, toast]);


  useEffect(() => {
    const loadData = async () => {
        setIsLoading(true);
        await fetchLeadAndInteractions();
        setIsLoading(false);
    }
    loadData();
  }, [params.id, fetchLeadAndInteractions]);
  
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
      
      const updateData: any = { ...leadDetails };
      
      await updateDoc(leadRef, updateData);

       const newSnapshotCourse = course || lead.commitmentSnapshot.course;
      if (newSnapshotCourse) {
        await updateDoc(leadRef, { 'commitmentSnapshot.course': newSnapshotCourse });
      }

      setLead(prev => {
        if (!prev) return null;
        const newLead = { ...prev, ...leadDetails };
        if (newSnapshotCourse) {
          newLead.commitmentSnapshot.course = newSnapshotCourse;
        }
        return newLead;
      });
      
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


  const updateField = async (fieldName: 'traits' | 'insights', value: string[]) => {
      if (!lead) return;
      try {
          const leadRef = doc(db, "leads", lead.id);
          await updateDoc(leadRef, { [fieldName]: value });
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
      // If the same button is clicked again, deselect it
      if (current === perception) {
        const { [category]: _, ...rest } = prev;
        if (category === activeObjectionCategory) {
          setActiveObjectionCategory(null);
        }
        return rest;
      }
      // If a new perception is selected for the category
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


  const handleScheduleEvent = () => {
      if (!eventDetails.type || !eventDetails.dateTime) {
          toast({variant: 'destructive', title: "Please select event type and date/time"});
          return;
      }
      logInteraction({
          outcome: "Event Scheduled",
          eventDetails: { type: eventDetails.type, dateTime: eventDetails.dateTime.toISOString() }
      }, "Event Scheduled");
      setEventDetails({});
      setScheduleStep('date');
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
            <h1 className="text-lg font-bold tracking-tight leading-snug break-words line-clamp-2">{lead.name}</h1>
            <Badge variant={lead.status === 'Active' ? 'default' : 'secondary'} className="mt-1">{lead.status}</Badge>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <Button onClick={handleEditClick} variant="outline" size="sm" className="shrink-0 sm:w-auto w-10 p-0 sm:px-4 sm:py-2">
                <FilePenLine className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Edit</span>
                <span className="sr-only">Edit Lead</span>
            </Button>
            <Button onClick={handleToggleFollowList} disabled={isTogglingFollow} variant={lead.onFollowList ? "default" : "outline"} size="sm" className="shrink-0 sm:w-auto w-10 p-0 sm:px-4 sm:py-2" >
              <Star className={cn("h-4 w-4", lead.onFollowList && "fill-current text-yellow-400", "sm:mr-2")}/>
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
                    <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-lg">Snapshot</CardTitle>
                         <CardDescription className="text-xs">
                          Last interaction: {lastInteractionDate ? format(lastInteractionDate, 'PP') : 'Never'}
                       </CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 p-4 pt-2 text-sm">
                        <EditableField label="Course" value={lead.commitmentSnapshot?.course || 'Not specified'} onSave={(v) => handleSnapshotUpdate('course', v)} />
                        <EditableField label="Price" value={lead.commitmentSnapshot?.price || 'Not specified'} onSave={(v) => handleSnapshotUpdate('price', v)} />
                        <EditableField label="Schedule" value={lead.commitmentSnapshot?.schedule || 'Not specified'} onSave={(v) => handleSnapshotUpdate('schedule', v)} type="textarea" />
                        <EditableField label="Key Notes" value={lead.commitmentSnapshot?.keyNotes || 'None'} onSave={(v) => handleSnapshotUpdate('keyNotes', v)} type="textarea" />
                    </CardContent>
                </Card>
                
                <Card>
                    <Collapsible open={isObjectionsOpen} onOpenChange={setActiveObjectionCategory ? () => {} : undefined}>
                        <CardHeader className="p-4 pb-3 flex flex-row items-center justify-between">
                            <CardTitle className="text-lg">Feedback</CardTitle>
                             <Button onClick={handleLogFeedback} size="icon" variant="ghost" className="h-8 w-8" disabled={isSubmittingFeedback}>
                                {isSubmittingFeedback ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            </Button>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                             <div className="flex sm:gap-4 justify-around">
                                {(['content', 'schedule', 'price'] as const).map(category => (
                                    <div key={category} className="space-y-2 text-center">
                                        <p className="font-medium text-muted-foreground text-sm capitalize">{category}</p>
                                        <div className="flex justify-center gap-2">
                                            <Button size="icon" variant={feedback[category]?.perception === 'positive' ? 'default' : 'outline'} className="h-9 w-9 rounded-full" onClick={() => handleFeedbackSelection(category, 'positive')}><ThumbsUp className="h-5 w-5"/></Button>
                                            <Button size="icon" variant={feedback[category]?.perception === 'negative' ? 'default' : 'outline'} className="h-9 w-9 rounded-full" onClick={() => handleFeedbackSelection(category, 'negative')}><ThumbsDown className="h-5 w-5"/></Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <CollapsibleContent className="pt-4 mt-4 border-t border-dashed -mx-4 px-4">
                                {activeObjectionCategory && (
                                     <div className="flex flex-wrap gap-2 justify-center">
                                        {objectionChips[activeObjectionCategory].map(objection => (
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
                                                    const existing = eventDetails.dateTime || new Date();
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
                                                        const existing = eventDetails.dateTime || new Date();
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
                         <Button onClick={handleScheduleEvent} className="w-full">Schedule Event</Button>
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
                           <div className="space-y-3">
                               {interactions.map(interaction => {
                                   const interactionDate = toDate(interaction.createdAt);
                                   return (
                                     <div key={interaction.id} className="p-3 rounded-md bg-muted/50 text-sm">
                                         <div className="font-semibold">
                                          {interactionDate ? format(interactionDate, 'PP p') : 'Invalid date'}
                                          {interaction.quickLogType && <Badge variant="secondary" className="ml-2">{interaction.quickLogType}</Badge>}
                                         </div>
                                         <p className="text-muted-foreground mt-1">{interaction.notes || 'No notes'}</p>
                                     </div>
                                   );
                               })}
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

      <LogInteractionDialog 
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
