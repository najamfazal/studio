
"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
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
import { Plus, Users, Loader2, Filter, Upload } from "lucide-react";

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
import { importContactsAction } from "@/app/actions";

const PAGE_SIZE = 10;

const ALL_STATUSES: LeadStatus[] = [
  'Active', 'Paused', 'Snoozed', 'Cooling', 'Dormant', 'Enrolled', 'Withdrawn', 'Archived', 'Graduated'
];

export default function ContactsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
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
  
  const [statusFilters, setStatusFilters] = useState<LeadStatus[]>(['Active']);
  const [isImporting, startImportTransition] = useTransition();

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
      
      if (loadMore) {
          setLeads(prev => [...prev, ...newLeads]);
      } else {
          setLeads(newLeads);
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
  }, [toast, lastVisible, statusFilters]);


  useEffect(() => {
    fetchSettings();
    fetchLeads(false, statusFilters);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilters]); // Re-fetch when filters change

  const handleEdit = (lead: Lead) => {
    setLeadToEdit(lead);
    setIsLeadDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!leadToDelete) return;
    try {
      await deleteDoc(doc(db, "leads", leadToDelete));
      setLeads((prev) => prev.filter((lead) => lead.id !== leadToDelete));
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
        setLeads((prev) =>
          prev.map((l) => (l.id === leadToEdit.id ? { ...l, ...dataToSave, id: l.id } : l))
        );
        toast({ title: "Contact Updated" });
      } else {
        // Add new lead
        const docRef = await addDoc(collection(db, "leads"), {
          ...dataToSave,
          createdAt: new Date().toISOString(),
          status: 'Active',
          afc_step: 0,
          hasEngaged: false,
          onFollowList: false,
          traits: [],
          insights: [],
        });
        const newLead = { ...dataToSave, id: docRef.id };
        setLeads((prev) => [newLead, ...prev]);
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
    // The useEffect will now handle the re-fetch
  };

  const handleImportSave = (data: { file: File, relationship: string, isNew: boolean }) => {
    setIsImportDialogOpen(false);
    toast({
      title: "Importing contacts...",
      description: "This may take a moment. The page will refresh upon completion.",
    });

    startImportTransition(async () => {
      const formData = new FormData();
      formData.append('file', data.file);
      formData.append('relationship', data.relationship);
      formData.append('isNew', String(data.isNew));

      const result = await importContactsAction(formData);

      if (result.success) {
        toast({
          title: "Import Successful",
          description: `${result.created} created, ${result.updated} updated, ${result.skipped} skipped.`,
        });
        // Re-fetch leads to show the new data
        fetchLeads(false, statusFilters);
      } else {
        toast({
          variant: "destructive",
          title: "Import Failed",
          description: result.error || "An unknown error occurred during import.",
        });
      }
    });
  }


  if (isLoading && leads.length === 0 && statusFilters.length === 0) {
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
                                onSelect={(e) => e.preventDefault()} // Prevents dropdown from closing
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
      </header>
      <main className="flex-1 p-4 sm:p-6 md:p-8">
        {isLoading && <div className="flex justify-center"><Loader2 className="animate-spin text-primary"/></div>}
        {!isLoading && leads.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {leads.map((lead) => (
              <ContactCard
                key={lead.id}
                lead={lead}
                onEdit={handleEdit}
                onDelete={(id) => setLeadToDelete(id)}
                onMerge={() => toast({ title: "Merge is not yet implemented."})}
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
              {statusFilters.length > 0 ? "No contacts match the current filter." : "Click the \"+\" button to add your first contact."}
            </p>
          </div>
        )}

        {hasMore && !isLoadingMore && (
            <div className="flex justify-center mt-8">
                <Button onClick={() => fetchLeads(true)} disabled={isLoadingMore}>
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
        relationshipTypes={appSettings?.relationshipTypes || []}
        isImporting={isImporting}
      />
    </div>
  );
}
