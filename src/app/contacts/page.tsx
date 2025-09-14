
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Users2, Filter, Search, X } from "lucide-react";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  getDoc,
  where,
  QueryConstraint
} from "firebase/firestore";

import { Button } from "@/components/ui/button";
import { LeadCard } from "@/components/lead-card";
import { LeadDialog } from "@/components/lead-dialog";
import { Logo } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { enrichLeadAction } from "@/app/actions";
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

  const { toast } = useToast();

  const fetchLeads = useCallback(async () => {
    setIsLoading(true);
    try {
      const constraints: QueryConstraint[] = [];
      if (statusFilters.length > 0) {
        constraints.push(where("status", "in", statusFilters));
      }
      // Firestore requires the first orderBy to match the inequality filter if one exists
      const q = query(collection(db, "contacts"), ...constraints, orderBy("createdAt", "desc"));
      
      const querySnapshot = await getDocs(q);
      const leadsData = querySnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as Lead)
      );
      setLeads(leadsData);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      if ((error as any).code === 'failed-precondition') {
          toast({
            variant: "destructive",
            title: "Query failed",
            description: "This filter combination requires a composite index. Please create it in your Firebase console.",
          });
      } else {
        toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to fetch contacts from the database.",
        });
      }
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
      await deleteDoc(doc(db, "contacts", leadId));
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
        const leadRef = doc(db, "contacts", editingLead.id);
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
        const docRef = await addDoc(collection(db, "contacts"), newLeadData);
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
        const leadRef = doc(db, "contacts", leadToEnrich.id);
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
  
  const filteredLeads = useMemo(() => {
    let sortedLeads = [...leads];
    if (debouncedSearchTerm) {
      sortedLeads = sortedLeads.filter(lead =>
        lead.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
      );
    }
    // Sort by status first, then by creation date
    sortedLeads.sort((a, b) => {
        if (a.status < b.status) return -1;
        if (a.status > b.status) return 1;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
    return sortedLeads;
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
      <header className="bg-card border-b p-3 flex items-center justify-between sticky top-0 z-10 gap-2">
        <div className="flex items-center gap-1">
          <SidebarTrigger />
          <h1 className="text-xl font-bold tracking-tight hidden sm:block">Contacts</h1>
        </div>
        <div className="flex items-center gap-2 flex-1 max-w-md">
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
                <Button variant="outline" size="sm" className="w-10 p-0 sm:w-auto sm:px-4 shrink-0">
                    <Filter className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Filter</span>
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
          <Button onClick={handleAddClick} size="sm" className="w-10 p-0 sm:w-auto sm:px-4 shrink-0 whitespace-nowrap">
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Add Contact</span>
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
              Try adjusting your search or filters, or add a new contact to get started.
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

    