
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
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Lead, Interaction, Task } from "@/lib/types";
import { Logo } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, Star, Brain, ToggleRight, X, Users, Menu, FilePenLine } from "lucide-react";
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
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useRouter } from "next/navigation";
import { LeadDialog } from "@/components/lead-dialog";
import type { LeadFormValues } from "@/lib/schemas";

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

export default function LeadDetailPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const router = useRouter();
  const [lead, setLead] = useState<Lead | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLogDialogOpen, setIsLogDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  
  const [traits, setTraits] = useState<string[]>([]);
  const [insights, setInsights] = useState<string[]>([]);
  const [traitInput, setTraitInput] = useState("");
  const [insightInput, setInsightInput] = useState("");
  
  const [isSaving, setIsSaving] = useState(false);
  const [isTogglingFollow, setIsTogglingFollow] = useState(false);

  const { toast } = useToast();
  
  const fetchLeadData = useCallback(async () => {
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

        // Fetch tasks
        const tasksQuery = query(
          collection(db, "tasks"),
          where("leadId", "==", params.id),
          orderBy("createdAt", "desc")
        );
        const tasksSnapshot = await getDocs(tasksQuery);
        const tasksData = tasksSnapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as Task)
        );
        setTasks(tasksData);

      } catch (error) {
        console.error("Error fetching lead data:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to fetch lead data.",
        });
      }
    }, [params.id, toast]);


  useEffect(() => {
    const loadData = async () => {
        setIsLoading(true);
        await fetchLeadData();
        setIsLoading(false);
    }
    loadData();
  }, [params.id, fetchLeadData]);

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
      
      await updateDoc(leadRef, {
        ...leadDetails,
       'commitmentSnapshot.course': course,
      });

      setLead(prev => {
        if (!prev) return null;
        return {
          ...prev,
          ...leadDetails,
          commitmentSnapshot: {
            ...prev.commitmentSnapshot,
            course,
          }
        }
      });
      
      toast({
        title: "Lead Updated",
        description: "The lead's details have been saved.",
      });
      setIsEditDialogOpen(false);
    } catch (error) {
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
             <div className="grid gap-2">
                <Card>
                    <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-lg">Snapshot</CardTitle>
                         <CardDescription className="text-xs">
                          Last interaction: {lastInteractionDate ? format(lastInteractionDate, 'PP') : 'Never'}
                       </CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 p-4 pt-2 text-sm">
                        <div className="space-y-1">
                            <p className="font-medium text-muted-foreground text-xs">Course</p>
                            <p>{lead.commitmentSnapshot?.course || 'Not specified'}</p>
                        </div>
                         <div className="space-y-1">
                            <p className="font-medium text-muted-foreground text-xs">Price</p>
                            <p>{lead.commitmentSnapshot?.price || 'Not specified'}</p>
                        </div>
                         <div className="space-y-1">
                            <p className="font-medium text-muted-foreground text-xs">Schedule</p>
                            <p>{lead.commitmentSnapshot?.schedule || 'Not specified'}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="font-medium text-muted-foreground text-xs">Key Notes</p>
                            <p className="text-muted-foreground/80">{lead.commitmentSnapshot?.keyNotes || 'None'}</p>
                        </div>
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
                                 <Button onClick={handleAddTrait} size="icon" className="sm:w-auto sm:px-4">
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
                                <Button onClick={handleAddInsight} size="icon" className="sm:w-auto sm:px-4">
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
                                          {interaction.outcome && <Badge variant="secondary" className="ml-2">{interaction.outcome}</Badge>}
                                         </div>
                                         <p className="text-muted-foreground mt-1">{interaction.notes || 'Quick Log'}</p>
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
        onLogSaved={fetchLeadData}
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
