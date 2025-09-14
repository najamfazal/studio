
"use client";

import { useState, useEffect, useCallback } from "react";
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
import { Plus, Users, Loader2, Filter } from "lucide-react";

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
import { addDoc, updateDoc } from "firebase/firestore";

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
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  const [statusFilters, setStatusFilters] = useState<LeadStatus[]>([]);

  const { toast } = useToast();
  
  const fetchLeads = useCallback(async (loadMore = false, filtersChanged = false) => {
    if (loadMore) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }

    try {
      let q;
      const leadsRef = collection(db, "leads");
      
      const queryConstraints = [orderBy("name")];

      if (statusFilters.length > 0) {
        queryConstraints.push(where("status", "in", statusFilters));
      }
      
      if (loadMore && lastVisible && !filtersChanged) {
        queryConstraints.push(startAfter(lastVisible));
      }
      
      queryConstraints.push(limit(PAGE_SIZE));

      q = query(leadsRef, ...queryConstraints);

      const querySnapshot = await getDocs(q);
      const newLeads = querySnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as Lead)
      );

      const newLastVisible = querySnapshot.docs[querySnapshot.docs.length - 1] || null;
      setLastVisible(newLastVisible);
      setHasMore(newLeads.length === PAGE_SIZE);
      
      if (loadMore && !filtersChanged) {
          setLeads(prev => [...prev, ...newLeads]);
      } else {
          setLeads(newLeads);
      }

    } catch (error) {
      console.error("Error fetching contacts:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch contacts.",
      });
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [toast, lastVisible, statusFilters]);


  useEffect(() => {
    fetchLeads(false, true);
  }, [statusFilters]);

  const handleEdit = (lead: Lead) => {
    setLeadToEdit(lead);
    setIsDialogOpen(true);
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
      setIsDialogOpen(false);
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
    setStatusFilters(prev => 
      prev.includes(status) 
        ? prev.filter(s => s !== status) 
        : [...prev, status]
    );
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
                            >
                                {status}
                            </DropdownMenuCheckboxItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
                <Button size="icon" className="w-10" onClick={() => { setLeadToEdit(null); setIsDialogOpen(true); }}>
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

        {hasMore && (
            <div className="flex justify-center mt-8">
                <Button onClick={() => fetchLeads(true, false)} disabled={isLoadingMore}>
                    {isLoadingMore && <Loader2 className="mr-2 animate-spin" />}
                    {isLoadingMore ? "Loading..." : "Load More"}
                </Button>
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
        isOpen={isDialogOpen}
        setIsOpen={setIsDialogOpen}
        onSave={handleDialogSave}
        leadToEdit={leadToEdit}
        isSaving={isSaving}
        courseNames={appSettings?.courseNames || []}
        relationshipTypes={appSettings?.relationshipTypes || ['Lead', 'Learner']}
      />
    </div>
  );
}
