
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
  Timestamp,
} from "firebase/firestore";
import { Plus, Users, Loader2, Filter, Upload, Search, CalendarIcon, X, Layers, Trash2, Focus } from "lucide-react";
import { startOfDay, endOfDay } from "date-fns";
import { useRouter } from "next/navigation";

import { app, db } from "@/lib/firebase";
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
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LeadDialog } from "@/components/lead-dialog";
import { addDoc, getDoc, updateDoc } from "firebase/firestore";
import { ImportDialog } from "@/components/import-dialog";
import { bulkDeleteLeadsAction, mergeLeadsAction, searchLeadsAction } from "@/app/actions";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { MergeDialog } from "@/components/merge-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

const ALL_STATUSES: LeadStatus[] = [
  'Active', 'Paused', 'Snoozed', 'Cooling', 'Dormant', 'Enrolled', 'Withdrawn', 'Archived', 'Graduated'
];

type ProgressState = {
  active: boolean;
  value: number;
  total: number;
  message: string;
}

interface ContactsPageClientProps {
    initialLeads: Lead[];
    initialAppSettings: AppSettings | null;
    initialHasMore: boolean;
}


export function ContactsPageClient({ initialLeads, initialAppSettings, initialHasMore }: ContactsPageClientProps) {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [lastVisible, setLastVisible] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(initialHasMore);
  
  const [appSettings, setAppSettings] = useState<AppSettings | null>(initialAppSettings);

  const [leadToEdit, setLeadToEdit] = useState<Lead | null>(null);
  const [leadToDelete, setLeadToDelete] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLeadDialogOpen, setIsLeadDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  
  const [statusFilters, setStatusFilters] = useState<LeadStatus[]>([]);
  const [createdDateFilter, setCreatedDateFilter] = useState<Date | null>(null);
  const [isImporting, startImportTransition] = useTransition();

  const [progress, setProgress] = useState<ProgressState>({ active: false, value: 0, total: 0, message: '' });

  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Lead[]>([]);
  

  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [mergeSourceLead, setMergeSourceLead] = useState<Lead | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { toast } = useToast();
  
  const fetchLeads = useCallback(async (loadMore = false, filters: {statuses?: LeadStatus[], date?: Date | null} = {}) => {
    if (debouncedSearchTerm) return; // Don't fetch paginated leads if searching

    if (loadMore) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
      setLeads([]); // Clear leads for new filter
      setLastVisible(null); // Reset pagination for new filter
      setHasMore(true);
    }

    const { statuses = statusFilters, date = createdDateFilter } = filters;

    try {
      const leadsRef = collection(db, "leads");
      const queryConstraints = [];
      
      if (statuses.length > 0) {
        queryConstraints.push(where("status", "in", statuses));
      }

      if (date) {
        const start = startOfDay(date);
        const end = endOfDay(date);
        queryConstraints.push(where("createdAt", ">=", Timestamp.fromDate(start)));
        queryConstraints.push(where("createdAt", "<=", Timestamp.fromDate(end)));
      }
      
      queryConstraints.push(orderBy("createdAt", "desc"));

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
      
      setLeads(prev => loadMore ? [...prev, ...newLeads] : newLeads);

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
  }, [toast, lastVisible, statusFilters, createdDateFilter, debouncedSearchTerm]);


  useEffect(() => {
    fetchLeads(false, { statuses: statusFilters, date: createdDateFilter });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilters, createdDateFilter]); // Re-fetch when filters change


  useEffect(() => {
    const search = async () => {
        if (debouncedSearchTerm) {
            setIsSearching(true);
            try {
                const result = await searchLeadsAction(debouncedSearchTerm);
                if (result.success) {
                    setSearchResults(result.leads as Lead[]);
                } else {
                    throw new Error(result.error);
                }
            } catch (error) {
                console.error("Native search failed:", error);
                toast({ variant: 'destructive', title: "Search failed" });
                setSearchResults([]);
            } finally {
                setIsSearching(false);
            }
        } else {
            setSearchResults([]);
            if (leads.length === 0) {
              fetchLeads(false, {statuses: statusFilters, date: createdDateFilter});
            }
        }
    };
    search();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchTerm]);

  const displayedLeads = useMemo(() => {
    return debouncedSearchTerm ? searchResults : leads;
  }, [debouncedSearchTerm, searchResults, leads]);


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
      setSearchResults((prev) => prev.filter((lead) => lead.id !== leadToDelete));
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
        const { courses, ...leadData } = values;

        const dataToSave: Partial<Lead> = {
            ...leadData,
            commitmentSnapshot: {
                ...(leadToEdit?.commitmentSnapshot || {}),
                ...(courses ? { courses } : {}),
            },
        };

        if (leadToEdit) {
            const leadRef = doc(db, "leads", leadToEdit.id);
            await updateDoc(leadRef, dataToSave);
            toast({ title: "Contact Updated" });
        } else {
            const docRef = await addDoc(collection(db, "leads"), {
                ...dataToSave,
                status: 'Active',
                afc_step: 0,
                hasEngaged: false,
                onFollowList: false,
                createdAt: new Date(),
                traits: [],
                insights: [],
                interactions: [],
            });
            toast({ title: "Contact Added" });
        }
        setIsLeadDialogOpen(false);
        // Refresh the list after save
        if(debouncedSearchTerm) {
             const result = await searchLeadsAction(debouncedSearchTerm);
             if (result.success) setSearchResults(result.leads as Lead[]);
        } else {
            fetchLeads(false, { statuses: statusFilters, date: createdDateFilter });
        }

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
    setStatusFilters(prevFilters =>
      prevFilters.includes(status)
        ? prevFilters.filter(s => s !== status)
        : [...prevFilters, status]
    );
  };
  
  const handleMergeSave = async (primaryLeadId: string, secondaryLeadId: string) => {
    setIsMerging(true);
    try {
      const result = await mergeLeadsAction({ primaryLeadId, secondaryLeadId });
      if (result.success) {
        toast({ title: "Merge successful!" });
        setLeads(prev => prev.filter(l => l.id !== secondaryLeadId));
        setSearchResults(prev => prev.filter(l => l.id !== secondaryLeadId));
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

  const handleToggleSelect = (leadId: string) => {
    if (!isSelectionMode) {
      setIsSelectionMode(true);
      setSelectedLeadIds([leadId]);
    } else {
      setSelectedLeadIds(prev =>
        prev.includes(leadId)
          ? prev.filter(id => id !== leadId)
          : [...prev, leadId]
      );
    }
  };

  useEffect(() => {
    if (isSelectionMode && selectedLeadIds.length === 0) {
      setIsSelectionMode(false);
    }
  }, [isSelectionMode, selectedLeadIds]);

  const handleClearSelection = () => {
    setSelectedLeadIds([]);
    setIsSelectionMode(false);
  };

  const handleBulkDelete = async () => {
    setIsBulkDeleteConfirmOpen(false);
    setIsDeleting(true);
    setProgress({ active: true, value: 0, total: selectedLeadIds.length, message: "Starting deletion..." });

    try {
        const result = await bulkDeleteLeadsAction(selectedLeadIds);
        if (result.success) {
            toast({ title: "Bulk Delete Successful", description: `${selectedLeadIds.length} contacts have been deleted.` });
            
            // Optimistically remove from state
            setLeads(prev => prev.filter(l => !selectedLeadIds.includes(l.id)));
            setSearchResults(prev => prev.filter(l => !selectedLeadIds.includes(l.id)));
            
            handleClearSelection();
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        toast({
            variant: "destructive",
            title: "Bulk Delete Failed",
            description: error instanceof Error ? error.message : "An unknown error occurred.",
        });
    } finally {
        setIsDeleting(false);
        setProgress({ ...progress, active: false });
    }
  };

  const handleFocusClick = () => {
    if (displayedLeads.length > 0) {
      const leadIds = displayedLeads.map(l => l.id).join(',');
      router.push(`/contacts/focus/${leadIds}`);
    }
  }


  if (isLoading && leads.length === 0 && !debouncedSearchTerm) {
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
          {isSelectionMode ? (
            <>
              <div className="flex items-center gap-3">
                  <Button variant="ghost" size="icon" onClick={handleClearSelection}><X className="h-5 w-5"/></Button>
                  <span className="font-semibold">{selectedLeadIds.length} selected</span>
              </div>
               <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="w-10">
                        <Layers className="h-4 w-4" />
                        <span className="sr-only">Bulk Actions</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem 
                        onClick={() => setIsBulkDeleteConfirmOpen(true)}
                        disabled={selectedLeadIds.length === 0}
                        className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Selected
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                  <SidebarTrigger />
                  <Users className="h-8 w-8 text-primary hidden sm:block" />
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Contacts</h1>
              </div>
              <div className="flex items-center gap-2">
                  {displayedLeads.length > 0 && (
                    <Button variant="outline" size="icon" className="w-10" onClick={handleFocusClick}>
                        <Focus className="h-4 w-4" />
                        <span className="sr-only">Focus Mode</span>
                    </Button>
                  )}
                  <Popover>
                      <PopoverTrigger asChild>
                          <Button variant="outline" size="icon" className={cn("w-10 relative", createdDateFilter && "border-primary text-primary")}>
                              <CalendarIcon className="h-4 w-4" />
                              <span className="sr-only">Filter by date</span>
                          </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                          {createdDateFilter && (
                              <Button variant="ghost" size="sm" className="absolute top-2 right-2 text-muted-foreground z-10 h-7" onClick={() => setCreatedDateFilter(null)}>
                                  <X className="h-4 w-4"/>
                                  Clear
                              </Button>
                          )}
                          <Calendar
                              mode="single"
                              selected={createdDateFilter || undefined}
                              onSelect={(date) => setCreatedDateFilter(date || null)}
                              initialFocus
                          />
                      </PopoverContent>
                  </Popover>

                  <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="icon" className="w-10">
                              <Filter className="h-4 w-4" />
                              <span className="sr-only">Filter</span>
                          </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
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
                  <Button variant="outline" size="icon" className="w-10" onClick={() => setIsImportDialogOpen(true)} disabled={isImporting}>
                      {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      <span className="sr-only">Import Contacts</span>
                  </Button>
                  <Button size="icon" className="w-10" onClick={() => { setLeadToEdit(null); setIsLeadDialogOpen(true); }} disabled={isImporting}>
                      <Plus className="h-4 w-4" />
                      <span className="sr-only">Add Contact</span>
                  </Button>
              </div>
            </>
          )}
        </div>
        {!isSelectionMode && (
             <div className="relative mt-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                placeholder="Search by name or phone..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                />
                {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />}
            </div>
        )}
         {(progress.active || isDeleting) && (
          <div className="mt-4 space-y-1">
             <Progress value={isDeleting ? (progress.value / progress.total) * 100 : undefined} className="w-full h-2" />
             <p className="text-xs text-muted-foreground">{isDeleting ? `Deleting contacts...` : progress.message}</p>
          </div>
        )}
      </header>
      <main className="flex-1 p-4 sm:p-6 md:p-8">
        {(isLoading || (isSearching && !debouncedSearchTerm)) && <div className="flex justify-center"><Loader2 className="animate-spin text-primary"/></div>}
        
        {displayedLeads.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {displayedLeads.map((lead) => (
              <ContactCard
                key={lead.id}
                lead={lead}
                onEdit={handleEdit}
                onDelete={(id) => setLeadToDelete(id)}
                onMerge={handleMerge}
                isSelectionMode={isSelectionMode}
                isSelected={selectedLeadIds.includes(lead.id)}
                onToggleSelect={handleToggleSelect}
              />
            ))}
          </div>
        ) : (
          !isSearching && !isLoading && <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 h-[60vh] text-center text-muted-foreground">
            <Users className="h-16 w-16 mb-4" />
            <h2 className="text-2xl font-semibold text-foreground">
              No contacts found
            </h2>
            <p className="mt-2 max-w-xs">
              {searchTerm ? `No results for "${searchTerm}".` : (statusFilters.length > 0 || createdDateFilter ? "No contacts match the current filters." : "Click the \"+\" button to add your first contact.")}
            </p>
          </div>
        )}

        {hasMore && !isLoadingMore && !debouncedSearchTerm && (
            <div className="flex justify-center mt-8">
                <Button variant="link" onClick={() => fetchLeads(true)} disabled={isLoadingMore}>
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

       <AlertDialog open={isBulkDeleteConfirmOpen} onOpenChange={setIsBulkDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedLeadIds.length} Contacts?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected contacts and all their associated tasks and data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
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
        relationshipTypes={appSettings?.relationshipTypes || ['Lead', 'Learner']}
      />

      <ImportDialog
        isOpen={isImportDialogOpen}
        setIsOpen={setIsImportDialogOpen}
        onSuccess={() => fetchLeads(false)}
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
