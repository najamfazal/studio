
"use client";

import { useState, useEffect, useCallback, useTransition, useMemo } from "react";
import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  query,
  orderBy,
  limit,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
  where,
} from "firebase/firestore";
import { Plus, Users, Loader2, Filter, Upload, Search } from "lucide-react";

import { db } from "@/lib/firebase";
import type { AppSettings, Lead, LeadStatus } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/icons";
import { ContactCard } from "@/components/contact-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LeadDialog } from "@/components/lead-dialog";
import { addDoc, getDoc, updateDoc } from "firebase/firestore";
import { ImportDialog } from "@/components/import-dialog";
import { importContactsAction, mergeLeadsAction } from "@/app/actions";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { MergeDialog } from "@/components/merge-dialog";

const PAGE_SIZE = 10;

const ALL_STATUSES: LeadStatus[] = [
  'Active', 'Paused', 'Snoozed', 'Cooling', 'Dormant', 'Enrolled', 'Withdrawn', 'Archived', 'Graduated'
];

type ImportProgress = {
  active: boolean;
  value: number;
  total: number;
  message: string;
}

export default function ContactsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [allLeads, setAllLeads] = useState<Lead[]>([]); // For client-side search
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [lastVisible, setLastVisible] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  const [leadToEdit, setLeadToEdit] = useState<Lead | null>(null);
  const [leadToDelete, setLeadToDelete] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLeadDialogOpen, setIsLeadDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  
  const [statusFilters, setStatusFilters] = useState<LeadStatus[]>([]);
  const [isImporting, startImportTransition] = useTransition();

  const [importProgress, setImportProgress] = useState<ImportProgress>({ active: false, value: 0, total: 0, message: '' });

  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [mergeSourceLead, setMergeSourceLead] = useState<Lead | null>(null);
  const [isMerging, setIsMerging] = useState(false);

  const { toast } = useToast();

  const fetchSettings = useCallback(async () => {
    try {
      const settingsDoc = await getDoc(doc(db, "settings", "appConfig"));
      if (settingsDoc.exists()) {
        setAppSettings(settingsDoc.data() as AppSettings);
      }
    } catch (error) {
      console.error("Error fetching settings: ", error);
    }
  }, []);
  
  const fetchLeads = useCallback(async (loadMore = false, filters: LeadStatus[] | null = null) => {
    if (loadMore) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
      setLeads([]); // Clear leads for new filter
      setLastVisible(null); // Reset pagination for new filter
      setHasMore(true);
    }

    const currentFilters = filters !== null ? filters : statusFilters;

    try {
      const leadsRef = collection(db, "leads");
      const queryConstraints = [];
      
      // If filters are active, use them. Otherwise, don't filter by status.
      if (currentFilters.length > 0) {
        queryConstraints.push(where("status", "in", currentFilters));
      }
      
      queryConstraints.push(orderBy("name"));

      if (loadMore && lastVisible) {
        queryConstraints.push(startAfter(lastVisible));
      }
      
      queryConstraints.push(limit(PAGE_SIZE));

      const q = query(leadsRef, ...queryConstraints);

      const querySnapshot = await getDocs(q);
      const newLeads = querySnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as Lead)
      );

      const newLastVisible = querySnapshot.docs.length === PAGE_SIZE ? querySnapshot.docs[querySnapshot.docs.length - 1] : null;
      
      setLastVisible(newLastVisible);
      setHasMore(newLeads.length === PAGE_SIZE);
      
      const combinedLeads = loadMore ? [...leads, ...newLeads] : newLeads;
      setLeads(combinedLeads);
      if (currentFilters.length === 0) {
        // If no filters, we store all for searching
        setAllLeads(prev => loadMore ? [...prev, ...newLeads] : newLeads);
      }

    } catch (error) {
      console.error("Error fetching contacts:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch contacts. Ensure your Firestore indexes are set up correctly if filtering.",
      });
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [toast, lastVisible, statusFilters, leads]);


  useEffect(() => {
    fetchSettings();
    fetchLeads(false, statusFilters);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilters]); // Re-fetch when filters change

  const filteredLeads = useMemo(() => {
    if (!debouncedSearchTerm) {
      return leads;
    }
    
    // When filters are active, Firestore does the filtering. We search within the results.
    const sourceData = statusFilters.length > 0 ? leads : allLeads;

    return sourceData.filter(lead => {
        const term = debouncedSearchTerm.toLowerCase();
        const nameMatch = lead.name.toLowerCase().includes(term);
        const phoneMatch = lead.phones?.some(p => p.number.replace(/\s+/g, '').includes(term));
        return nameMatch || phoneMatch;
    });

  }, [debouncedSearchTerm, leads, allLeads, statusFilters.length]);

  const handleEdit = (lead: Lead) => {
    setLeadToEdit(lead);
    setIsLeadDialogOpen(true);
  };
  
  const handleMerge = (lead: Lead) => {
    setMergeSourceLead(lead);
    setIsMergeDialogOpen(true);
  }

  const handleDelete = async () => {
    if (!leadToDelete) return;
    try {
      await deleteDoc(doc(db, "leads", leadToDelete));
      setLeads((prev) => prev.filter((lead) => lead.id !== leadToDelete));
      setAllLeads((prev) => prev.filter((lead) => lead.id !== leadToDelete));
      toast({
        title: "Contact Deleted",
        description: "The contact has been successfully removed.",
      });
    } catch (error) {
      console.error("Error deleting contact:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete contact.",
      });
    } finally {
      setLeadToDelete(null);
    }
  };
  
  const handleDialogSave = async (values: any) => {
    setIsSaving(true);
    try {
      const { course, ...leadData } = values;
      const dataToSave = {
        ...leadData,
        commitmentSnapshot: {
          ...(leadToEdit?.commitmentSnapshot || {}),
          ...(course ? { course } : {}),
        },
      };

      if (leadToEdit) {
        // Update existing lead
        const leadRef = doc(db, "leads", leadToEdit.id);
        await updateDoc(leadRef, dataToSave);
        const updatedLead = { ...leadToEdit, ...dataToSave };
        setLeads((prev) =>
          prev.map((l) => (l.id === leadToEdit.id ? updatedLead : l))
        );
        setAllLeads((prev) =>
          prev.map((l) => (l.id === leadToEdit.id ? updatedLead : l))
        );
        toast({ title: "Contact Updated" });
      } else {
        // Add new lead - note that onLeadCreate will not fire if status is set here.
        const docRef = await addDoc(collection(db, "leads"), {
          ...dataToSave,
          createdAt: new Date().toISOString(),
          traits: [],
          insights: [],
        });
        const newLead = { ...dataToSave, id: docRef.id, status: 'Active' }; // Assume Active for UI
        setLeads((prev) => [{ ...newLead } as Lead, ...prev]);
        setAllLeads((prev) => [{ ...newLead } as Lead, ...prev]);
        toast({ title: "Contact Added" });
      }
      setIsLeadDialogOpen(false);
    } catch (error) {
      console.error("Error saving contact:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save contact details.",
      });
    } finally {
      setIsSaving(false);
      setLeadToEdit(null);
    }
  };
  
  const handleFilterChange = (status: LeadStatus) => {
    const newFilters = statusFilters.includes(status)
      ? statusFilters.filter(s => s !== status)
      : [...statusFilters, status];
    setStatusFilters(newFilters);
  };

  const handleImportSave = (data: { jsonData: string; isNew: boolean }) => {
    setIsImportDialogOpen(false);
    
    if (!data.jsonData.trim()) {
        toast({ variant: "destructive", title: "Empty JSON", description: "The provided JSON is empty."});
        return;
    }

    let contacts;
    try {
        contacts = JSON.parse(data.jsonData);
        if (!Array.isArray(contacts)) throw new Error();
    } catch(e) {
        toast({ variant: "destructive", title: "Invalid JSON", description: "The text you pasted is not valid JSON."});
        return;
    }
    
    const totalContacts = contacts.length;
    if (totalContacts === 0) {
        toast({ variant: "destructive", title: "No contacts found", description: "The JSON array is empty."});
        return;
    }

    setImportProgress({ active: true, value: 0, total: totalContacts, message: "Starting import..." });
    
    startImportTransition(async () => {
        const result = await importContactsAction({ jsonData: data.jsonData, isNew: data.isNew });

        if (result.success) {
            const { created = 0, updated = 0, skipped = 0 } = result;
            setImportProgress({ active: true, value: created + updated + skipped, total: totalContacts, message: "Import complete!" });
            toast({
                title: "Import Successful",
                description: `${created} created, ${updated} updated, ${skipped} skipped.`,
            });
            fetchLeads(false, statusFilters);
        } else {
            setImportProgress({ active: false, value: 0, total: 0, message: "" });
            toast({
                variant: "destructive",
                title: "Import Failed",
                description: result.error || "An unknown error occurred during import.",
            });
        }
        
        setTimeout(() => {
            setImportProgress(prev => ({ ...prev, active: false }));
        }, 4000);
    });
  }
  
  const handleMergeSave = async (primaryLeadId: string, secondaryLeadId: string) => {
    setIsMerging(true);
    try {
      const result = await mergeLeadsAction({ primaryLeadId, secondaryLeadId });
      if (result.success) {
        toast({ title: "Merge successful!" });
        // Refresh leads list
        setLeads(prev => prev.filter(l => l.id !== secondaryLeadId));
        setAllLeads(prev => prev.filter(l => l.id !== secondaryLeadId));
        setIsMergeDialogOpen(false);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Merge Failed",
        description: error instanceof Error ? error.message : "An unknown error occurred.",
      });
    } finally {
      setIsMerging(false);
    }
  };


  if (isLoading && leads.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Logo className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="bg-card border-b p-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
                <SidebarTrigger />
                <Users className="h-8 w-8 text-primary hidden sm:block" />
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Contacts</h1>
            </div>
            <div className="flex items-center gap-2">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" className="w-10">
                            <Filter className="h-4 w-4" />
                            <span className="sr-only">Filter</span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {ALL_STATUSES.map(status => (
                            <DropdownMenuCheckboxItem
                                key={status}
                                checked={statusFilters.includes(status)}
                                onCheckedChange={() => handleFilterChange(status)}
                                onSelect={(e) => e.preventDefault()}
                            >
                                {status}
                            </DropdownMenuCheckboxItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" size="icon" className="w-10" onClick={() => setIsImportDialogOpen(true)}>
                    {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    <span className="sr-only">Import Contacts</span>
                </Button>
                <Button size="icon" className="w-10" onClick={() => { setLeadToEdit(null); setIsLeadDialogOpen(true); }}>
                    <Plus className="h-4 w-4" />
                    <span className="sr-only">Add Contact</span>
                </Button>
            </div>
        </div>
        <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or phone..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
         {importProgress.active && (
          <div className="mt-4 space-y-1">
             <Progress value={(importProgress.value / importProgress.total) * 100} className="w-full h-2" />
             <p className="text-xs text-muted-foreground">{importProgress.message} ({importProgress.value} / {importProgress.total})</p>
          </div>
        )}
      </header>
      <main className="flex-1 p-4 sm:p-6 md:p-8">
        {isLoading && <div className="flex justify-center"><Loader2 className="animate-spin text-primary"/></div>}
        {!isLoading && filteredLeads.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredLeads.map((lead) => (
              <ContactCard
                key={lead.id}
                lead={lead}
                onEdit={handleEdit}
                onDelete={(id) => setLeadToDelete(id)}
                onMerge={handleMerge}
              />
            ))}
          </div>
        ) : (
          !isLoading && <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 h-[60vh] text-center text-muted-foreground">
            <Users className="h-16 w-16 mb-4" />
            <h2 className="text-2xl font-semibold text-foreground">
              No contacts found
            </h2>
            <p className="mt-2 max-w-xs">
              {searchTerm ? `No results for "${searchTerm}".` : (statusFilters.length > 0 ? "No contacts match the current filter." : "Click the \"+\" button to add your first contact.")}
            </p>
          </div>
        )}

        {hasMore && !isLoadingMore && !debouncedSearchTerm && (
            <div className="flex justify-center mt-8">
                <Button variant="link" onClick={() => fetchLeads(true, statusFilters)} disabled={isLoadingMore}>
                    {isLoadingMore ? "Loading..." : "Load More"}
                </Button>
            </div>
        )}
        {isLoadingMore && (
             <div className="flex justify-center mt-8">
                <Loader2 className="animate-spin text-primary"/>
            </div>
        )}
      </main>

      <AlertDialog open={!!leadToDelete} onOpenChange={(open) => !open && setLeadToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              contact and all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <LeadDialog
        isOpen={isLeadDialogOpen}
        setIsOpen={setIsLeadDialogOpen}
        onSave={handleDialogSave}
        leadToEdit={leadToEdit}
        isSaving={isSaving}
        courseNames={appSettings?.courseNames || []}
        relationshipTypes={appSettings?.relationshipTypes || ['Lead', 'Learner']}
      />

      <ImportDialog
        isOpen={isImportDialogOpen}
        setIsOpen={setIsImportDialogOpen}
        onSave={handleImportSave}
        isImporting={isImporting}
      />
      
      {mergeSourceLead && (
        <MergeDialog
          isOpen={isMergeDialogOpen}
          setIsOpen={setIsMergeDialogOpen}
          sourceLead={mergeSourceLead}
          onMerge={handleMergeSave}
          isMerging={isMerging}
        />
      )}
    </div>
  );
}
