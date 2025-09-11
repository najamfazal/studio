
"use client";

import { useState, useEffect, use } from "react";
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
import { ArrowLeft, Plus, Star, Brain, ToggleRight, X, Users, Menu } from "lucide-react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { LogInteractionDialog } from "@/components/log-interaction-dialog";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { useRouter } from "next/navigation";

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
  
  const [traits, setTraits] = useState<string[]>([]);
  const [insights, setInsights] = useState<string[]>([]);
  const [traitInput, setTraitInput] = useState("");
  const [insightInput, setInsightInput] = useState("");

  const { toast } = useToast();

  useEffect(() => {
    const fetchLeadData = async () => {
      setIsLoading(true);
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
      } finally {
        setIsLoading(false);
      }
    };

    fetchLeadData();
  }, [params.id, toast]);

  const handleToggleFollowList = async () => {
    if (!lead) return;
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
       <header className="bg-card border-b p-3 flex items-center justify-between sticky top-0 z-20 gap-3">
          <SidebarTrigger />
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="hidden sm:inline-flex">
            <ArrowLeft />
          </Button>
          <div className="flex-1 overflow-hidden">
            <h1 className="text-lg font-bold tracking-tight leading-snug break-words line-clamp-2">{lead.name}</h1>
          </div>
          <Button onClick={handleToggleFollowList} variant={lead.onFollowList ? "default" : "outline"} size="sm" className="shrink-0 sm:w-auto w-10 p-0 sm:px-4 sm:py-2" >
            <Star className={cn("h-4 w-4", lead.onFollowList && "fill-current text-yellow-400", "sm:mr-2")}/>
            <span className="hidden sm:inline">{lead.onFollowList ? 'On Follow List' : 'Add to Follow List'}</span>
            <span className="sr-only">Add to Follow List</span>
          </Button>
      </header>

      <main className="flex-1 p-2 sm:p-4 pb-24">
        <Tabs defaultValue="summary">
          <TabsList className="mb-2">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="history">History & Intel</TabsTrigger>
          </TabsList>
          
          <TabsContent value="summary">
             <div className="grid gap-4">
                <Card>
                    <CardHeader className="p-4">
                        <CardTitle className="text-lg">Commitment Snapshot</CardTitle>
                    </CardHeader>
                    <CardContent className="grid sm:grid-cols-2 gap-4 p-4 pt-0 text-sm">
                        <div className="space-y-1">
                            <p className="font-medium text-muted-foreground">Course</p>
                            <p>{lead.commitmentSnapshot?.course || 'Not specified'}</p>
                        </div>
                         <div className="space-y-1">
                            <p className="font-medium text-muted-foreground">Price</p>
                            <p>{lead.commitmentSnapshot?.price || 'Not specified'}</p>
                        </div>
                         <div className="space-y-1">
                            <p className="font-medium text-muted-foreground">Schedule</p>
                            <p>{lead.commitmentSnapshot?.schedule || 'Not specified'}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="font-medium text-muted-foreground">Key Notes</p>
                            <p className="text-muted-foreground/80">{lead.commitmentSnapshot?.keyNotes || 'None'}</p>
                        </div>
                    </CardContent>
                </Card>

                 <Card>
                    <CardHeader className="p-4">
                        <CardTitle className="text-lg">Lead Status</CardTitle>
                    </CardHeader>
                    <CardContent className="flex items-center gap-4 p-4 pt-0">
                       <Badge variant={lead.status === 'Active' ? 'default' : 'secondary'}>{lead.status}</Badge>
                       <p className="text-sm text-muted-foreground">
                        Last interaction: {lastInteractionDate ? format(lastInteractionDate, 'PP') : 'Never'}
                       </p>
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
                                  <Plus className="sm:mr-2"/>
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
                                   <Plus className="sm:mr-2"/>
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
                                         <p className="font-semibold">
                                          {interactionDate ? format(interactionDate, 'PP p') : 'Invalid date'}
                                          {interaction.outcome && <Badge variant="secondary" className="ml-2">{interaction.outcome}</Badge>}
                                         </p>
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
          className="rounded-full shadow-lg"
          onClick={() => setIsLogDialogOpen(true)}
        >
          <Plus className="mr-2" />
          Log Interaction
        </Button>
      </div>

      <LogInteractionDialog 
        isOpen={isLogDialogOpen}
        setIsOpen={setIsLogDialogOpen}
        leadId={params.id}
        onLogSaved={() => {
            // Trigger re-fetch, maybe better way later
             window.location.reload();
        }}
      />
    </div>
  );
}

    