
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Users2, Filter, Search, X, Wand2, Loader2 } from "lucide-react";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  getDoc,
  where,
  QueryConstraint
} from "firebase/firestore";

import { Button } from "@/components/ui/button";
import { LeadCard } from "@/components/lead-card";
import { LeadDialog } from "@/components/lead-dialog";
import { Logo } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { enrichLeadAction, migrateLeadsToContactsAction } from "@/app/actions";
import { db } from "@/lib/firebase";
import type { Lead, AppSettings, LeadStatus } from "@/lib/types";
import type { LeadFormValues } from "@/lib/schemas";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useDebounce } from "@/hooks/use-debounce";

const ALL_STATUSES: LeadStatus[] = ['Active', 'Paused', 'Snoozed', 'Cooling', 'Dormant', 'Enrolled', 'Withdrawn', 'Archived', 'Graduated'];

export default function ContactsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const [statusFilters, setStatusFilters] = useState<LeadStatus[]>(['Active']);
  const [isMigrating, setIsMigrating] = useState(false);

  const { toast } = useToast();

  const fetchLeads = useCallback(async () => {
    setIsLoading(true);
    try {
      const constraints: QueryConstraint[] = [orderBy("createdAt", "desc")];
      if (statusFilters.length > 0) {
        constraints.push(where("status", "in", statusFilters));
      }
      const q = query(collection(db, "leads"), ...constraints);
      const querySnapshot = await getDocs(q);
      const leadsData = querySnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as Lead)
      );
      setLeads(leadsData);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch contacts from the database.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, statusFilters]);
  
  const fetchSettings = useCallback(async () => {
    try {
        const settingsDoc = await getDoc(doc(db, "settings", "appConfig"));
        if (settingsDoc.exists()) {
            setAppSettings({ id: settingsDoc.id, ...settingsDoc.data() } as AppSettings);
        } else {
            setAppSettings({ id: 'appConfig', relationshipTypes: ['Lead', 'Learner'], courseNames: [], commonTraits: [], withdrawalReasons: [], feedbackChips: { content: [], schedule: [], price: [] } });
        }
    } catch (error) {
        console.error("Error fetching settings:", error);
    }
  }, []);


  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleAddClick = () => {
    setEditingLead(null);
    setIsDialogOpen(true);
  };

  const handleEditClick = (lead: Lead) => {
    setEditingLead(lead);
    setIsDialogOpen(true);
  };

  const handleDelete = async (leadId: string) => {
    if (!window.confirm("Are you sure you want to delete this contact?")) return;
    try {
      await deleteDoc(doc(db, "leads", leadId));
      setLeads((prev) => prev.filter((lead) => lead.id !== leadId));
      toast({
        title: "Contact Deleted",
        description: "The contact has been removed successfully.",
      });
    } catch (error) {
      console.error("Error deleting contact:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete contact.",
      });
    }
  };

  const handleSaveLead = async (values: LeadFormValues) => {
    setIsSaving(true);
    try {
      if (editingLead) {
        // Update existing lead
        const leadRef = doc(db, "leads", editingLead.id);
        const { course, ...otherValues } = values;
        
        const updateData = { 
            ...otherValues, 
            'commitmentSnapshot.course': course,
            phones: values.phones,
            relationship: values.relationship,
        };
        
        await updateDoc(leadRef, updateData as any);
        
        setLeads((prev) =>
          prev.map((lead) =>
            lead.id === editingLead.id ? { ...lead, ...(updateData as any) } : lead
          )
        );
        toast({
          title: "Contact Updated",
          description: "The contact's details have been saved.",
        });
      } else {
        // Add new lead
        const { course, ...otherValues } = values;
        const newLeadData = { 
            ...otherValues,
            createdAt: new Date().toISOString(),
            status: 'Active',
            relationship: values.relationship || 'Lead',
            afc_step: 0,
            hasEngaged: false,
            onFollowList: false,
            traits: [],
            insights: [],
            commitmentSnapshot: {
              course: course || ''
            },
        };
        const docRef = await addDoc(collection(db, "leads"), newLeadData);
        const newLead: Lead = {
          id: docRef.id,
          ...newLeadData,
        };
        setLeads((prev) => [newLead, ...prev]);
        toast({
          title: "Contact Added",
          description: "A new contact has been created successfully.",
        });
      }
      setIsDialogOpen(false);
      setEditingLead(null);
    } catch (error) {
      console.error("Error saving contact:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save contact.",
      });
    } finally {
        setIsSaving(false);
    }
  };

  const handleEnrich = async (leadToEnrich: Lead) => {
    const result = await enrichLeadAction({
      name: leadToEnrich.name,
      email: leadToEnrich.email,
      phone: leadToEnrich.phones[0]?.number || "",
    });
    if (result.success && result.additionalInformation) {
      try {
        const leadRef = doc(db, "leads", leadToEnrich.id);
        const enrichedData = {
          additionalInformation: result.additionalInformation,
          lastEnriched: new Date().toISOString(),
        };
        await updateDoc(leadRef, enrichedData);

        setLeads((prevLeads) =>
          prevLeads.map((lead) =>
            lead.id === leadToEnrich.id
              ? { ...lead, ...enrichedData }
              : lead
          )
        );
        toast({
          title: "Contact Enriched!",
          description: "AI has added new information to the contact.",
        });
      } catch (error) {
        console.error("Error updating enriched contact:", error);
        toast({
          variant: "destructive",
          title: "Update Failed",
          description: "Could not save enriched information.",
        });
      }
    } else {
      toast({
        variant: "destructive",
        title: "Enrichment Failed",
        description: result.error || "Could not fetch additional information.",
      });
    }
  };
  
  const handleMigration = async () => {
    setIsMigrating(true);
    const result = await migrateLeadsToContactsAction();
    if (result.success) {
      toast({
        title: "Migration Complete",
        description: result.message,
      });
      fetchLeads(); // Refresh the list after migration
    } else {
      toast({
        variant: "destructive",
        title: "Migration Failed",
        description: result.error,
      });
    }
    setIsMigrating(false);
  };

  const filteredLeads = useMemo(() => {
    if (!debouncedSearchTerm) {
      return leads;
    }
    return leads.filter(lead =>
      lead.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
    );
  }, [leads, debouncedSearchTerm]);


  if (isLoading && leads.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Logo className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="bg-card border-b p-4 flex flex-col sm:flex-row items-center justify-between sticky top-0 z-10 gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <SidebarTrigger />
          <Logo className="h-8 w-8 text-primary hidden sm:block" />
          <h1 className="text-xl font-bold tracking-tight">Contacts</h1>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
             <Input 
                placeholder="Search contacts..." 
                className="pl-9"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
             />
             {searchTerm && (
                <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setSearchTerm('')}>
                    <X className="h-4 w-4"/>
                </Button>
             )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline">
                    <Filter className="mr-2 h-4 w-4" />
                    Filter
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
                <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {ALL_STATUSES.map(status => (
                    <DropdownMenuCheckboxItem
                        key={status}
                        checked={statusFilters.includes(status)}
                        onCheckedChange={(checked) => {
                            setStatusFilters(prev => 
                                checked 
                                    ? [...prev, status] 
                                    : prev.filter(s => s !== status)
                            )
                        }}
                    >
                        {status}
                    </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={handleAddClick} className="whitespace-nowrap">
            <Plus className="mr-2 h-4 w-4" />
            Add Contact
          </Button>
           <Button onClick={handleMigration} variant="ghost" size="icon" disabled={isMigrating} title="Fix Old Data">
                {isMigrating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                <span className="sr-only">Fix old data</span>
            </Button>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6 md:p-8">
        {filteredLeads.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredLeads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                onEdit={handleEditClick}
                onDelete={handleDelete}
                onEnrich={handleEnrich}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 h-[60vh] text-center text-muted-foreground">
            <Users2 className="h-16 w-16 mb-4" />
            <h2 className="text-2xl font-semibold text-foreground">
              No contacts found
            </h2>
            <p className="mt-2 max-w-xs">
              Try adjusting your search or filters, or click the "Fix Data" button (<Wand2 className="inline h-4 w-4" />) if you have old data.
            </p>
          </div>
        )}
      </main>

      <LeadDialog
        isOpen={isDialogOpen}
        setIsOpen={setIsDialogOpen}
        onSave={handleSaveLead}
        leadToEdit={editingLead}
        isSaving={isSaving}
        courseNames={appSettings?.courseNames || []}
        relationshipTypes={appSettings?.relationshipTypes || []}
      />
    </div>
  );
}
