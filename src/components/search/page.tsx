

'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Users,
  Search as SearchIcon,
  Loader2,
  X,
  MoreVertical,
  Trash2,
  GitMerge,
  FilePenLine,
  UserPlus,
  FileUp,
} from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

import { searchLeadsAction, deleteLeadAction, mergeLeadsAction, createLeadAction } from '@/app/actions';
import type { Lead, AppSettings, SalesCatalog, LeadStatus, CommitmentSnapshot } from '@/lib/types';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import type { LeadFormValues } from '@/lib/schemas';

import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ContactDetailView } from '@/components/contact-detail-view';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { LeadDialog } from '@/components/lead-dialog';
import { MergeDialog } from '@/components/merge-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ImportDialog } from '@/components/import-dialog';

export default function SearchPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Lead[]>([]);
  const [searchPerformed, setSearchPerformed] = useState(false);

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isLoadingLead, setIsLoadingLead] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [salesCatalog, setSalesCatalog] = useState<SalesCatalog | null>(null);
  
  const [leadToDelete, setLeadToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [isLeadDialogOpen, setIsLeadDialogOpen] = useState(false);
  const [isSaving, startSavingTransition] = useTransition();

  const [mergeSourceLead, setMergeSourceLead] = useState<Lead | null>(null);
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);


  useEffect(() => {
    const leadId = searchParams.get('id');
    if (leadId) {
      setIsLoadingLead(true);
      const leadRef = doc(db, 'leads', leadId);
      getDoc(leadRef).then(docSnap => {
        if (docSnap.exists()) {
          setSelectedLead({ id: docSnap.id, ...docSnap.data() } as Lead);
        } else {
          toast({ variant: 'destructive', title: 'Contact not found' });
          router.replace('/search');
        }
        setIsLoadingLead(false);
      });
    } else {
        setSelectedLead(null);
    }
  }, [searchParams, router, toast]);

  useEffect(() => {
    if (!appSettings) {
        getDoc(doc(db, 'settings', 'appConfig')).then(docSnap => {
            if(docSnap.exists()) setAppSettings(docSnap.data() as AppSettings)
        });
        getDoc(doc(db, 'settings', 'salesCatalog')).then(docSnap => {
            if(docSnap.exists()) setSalesCatalog(docSnap.data() as SalesCatalog)
        });
    }
  }, [appSettings]);

  const handleSearchSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!searchTerm) {
        setSearchResults([]);
        setSearchPerformed(true);
        return;
    }
    
    setIsSearching(true);
    setSearchPerformed(true);
    setSelectedLead(null);
    router.replace('/search');

    const result = await searchLeadsAction(searchTerm);
    if (result.success) {
      setSearchResults(result.leads as Lead[]);
    } else {
      toast({ variant: 'destructive', title: 'Search failed', description: result.error });
    }
    setIsSearching(false);
  };


  const handleSelectContact = (lead: Lead) => {
    router.push(`/search?id=${lead.id}`);
  };

  const handleLeadUpdate = (updatedLead: Lead) => {
    setSelectedLead(updatedLead);
  }

  const handleDelete = async () => {
    if (!leadToDelete) return;
    setIsDeleting(true);
    try {
      await deleteLeadAction(leadToDelete);
      toast({ title: 'Contact Deleted' });
      setLeadToDelete(null);
      router.replace('/search'); // Go back to blank search page
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Failed to delete contact' });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveLead = (values: LeadFormValues) => {
    startSavingTransition(async () => {
        if (selectedLead) { // Update existing lead
            const updatedLeadData: Partial<Lead> & { commitmentSnapshot: Partial<CommitmentSnapshot> } = {
                name: values.name,
                email: values.email,
                phones: values.phones,
                relationship: values.relationship,
                status: values.status as LeadStatus,
                source: values.source,
                assignedAt: values.assignedAt,
                commitmentSnapshot: {
                    ...selectedLead.commitmentSnapshot,
                    inquiredFor: values.inquiredFor
                }
            };
            try {
                await updateDoc(doc(db, 'leads', selectedLead.id), updatedLeadData);
                toast({ title: 'Contact Updated' });
                setSelectedLead(prev => prev ? {...prev, ...updatedLeadData} : null);
                setIsLeadDialogOpen(false);
            } catch (error) {
                console.error("Error updating contact:", error);
                toast({ variant: 'destructive', title: 'Update failed' });
            }
        } else { // Create new lead
            const result = await createLeadAction(values);
            if (result.success) {
                toast({ title: "Contact Created!" });
                setIsLeadDialogOpen(false);
                router.push(`/search?id=${result.id}`);
            } else {
                toast({ variant: "destructive", title: "Failed to create contact", description: result.error });
            }
        }
    });
  }
  
   const handleMergeSave = async (primaryLeadId: string, secondaryLeadId: string) => {
    setIsMerging(true);
    try {
      const result = await mergeLeadsAction({ primaryLeadId, secondaryLeadId });
      if (result.success) {
        toast({ title: "Merge successful!" });
        setIsMergeDialogOpen(false);
        // If the currently viewed lead was the one that got deleted, refresh.
        if (selectedLead?.id === secondaryLeadId) {
             router.replace(`/search?id=${primaryLeadId}`);
        }
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


  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="bg-card border-b p-4 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SidebarTrigger />
            <Users className="h-8 w-8 text-primary hidden sm:block" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Contacts</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setIsImportDialogOpen(true)}>
              <FileUp className="h-5 w-5" />
              <span className="sr-only">Import Contacts</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={() => { setSelectedLead(null); setIsLeadDialogOpen(true); }}>
              <UserPlus className="h-5 w-5" />
              <span className="sr-only">Add New Contact</span>
            </Button>
            {selectedLead && (
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                      </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setIsLeadDialogOpen(true)}>
                          <FilePenLine className="mr-2 h-4 w-4" />
                          <span>Edit</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setMergeSourceLead(selectedLead)}>
                          <GitMerge className="mr-2 h-4 w-4" />
                          <span>Merge</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setLeadToDelete(selectedLead.id)} className="text-destructive focus:bg-destructive/10">
                          <Trash2 className="mr-2 h-4 w-4" />
                          <span>Delete</span>
                      </DropdownMenuItem>
                  </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        <div className="mt-4">
            <form onSubmit={handleSearchSubmit}>
                <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by name or phone and press Enter"
                        className="pl-9"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />}
                </div>
            </form>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6 md:p-8">
        {isLoadingLead ? (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary"/>
            </div>
        ) : selectedLead && appSettings && salesCatalog ? (
             <ContactDetailView 
                lead={selectedLead} 
                appSettings={appSettings}
                salesCatalog={salesCatalog}
                onLeadUpdate={handleLeadUpdate}
            />
        ) : isSearching ? (
             <div className="flex justify-center items-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary"/>
            </div>
        ) : searchPerformed ? (
          searchResults.length > 0 ? (
            <div className="space-y-2">
              {searchResults.map(lead => (
                <Card key={lead.id} className="cursor-pointer hover:bg-muted" onClick={() => handleSelectContact(lead)}>
                    <div className="p-3">
                      <p className="font-semibold">{lead.name}</p>
                      <p className="text-sm text-muted-foreground">{lead.email || (lead.phones && lead.phones[0]?.number)}</p>
                    </div>
                </Card>
              ))}
            </div>
          ) : (
             <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 h-[60vh] text-center text-muted-foreground">
                <SearchIcon className="h-16 w-16 mb-4" />
                <h2 className="text-2xl font-semibold text-foreground">
                    No Results Found
                </h2>
                <p className="mt-2 max-w-xs">
                    Try a different name or phone number.
                </p>
            </div>
          )
        ) : (
             <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 h-[60vh] text-center text-muted-foreground">
                <SearchIcon className="h-16 w-16 mb-4" />
                <h2 className="text-2xl font-semibold text-foreground">
                    Search for a Contact
                </h2>
                <p className="mt-2 max-w-xs">
                    Use the search bar above to find a contact by their name or phone number.
                </p>
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
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {appSettings && (
        <LeadDialog
            isOpen={isLeadDialogOpen}
            setIsOpen={setIsLeadDialogOpen}
            onSave={handleSaveLead}
            leadToEdit={selectedLead}
            isSaving={isSaving}
            relationshipTypes={appSettings.relationshipTypes}
            courseNames={appSettings.courseNames}
        />
      )}

      {mergeSourceLead && (
        <MergeDialog
          isOpen={!!mergeSourceLead}
          setIsOpen={(open) => {if (!open) setMergeSourceLead(null)}}
          sourceLead={mergeSourceLead}
          onMerge={handleMergeSave}
          isMerging={isMerging}
        />
      )}

      <ImportDialog 
        isOpen={isImportDialogOpen}
        setIsOpen={setIsImportDialogOpen}
        onSuccess={() => {}}
      />
    </div>
  );
}
