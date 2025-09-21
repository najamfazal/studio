
"use client";

import { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, where, orderBy, limit } from 'firebase/firestore';
import { ArrowLeft, Loader2, Search } from 'lucide-react';
import { produce } from 'immer';

import { db } from '@/lib/firebase';
import type { Lead } from '@/lib/types';
import { useDebounce } from '@/hooks/use-debounce';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ScrollArea } from './ui/scroll-area';

interface MergeDialogProps {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    sourceLead: Lead;
    onMerge: (primaryLeadId: string, secondaryLeadId: string) => Promise<void>;
    isMerging: boolean;
}

type MergeStep = 'selectTarget' | 'selectPrimary';

export function MergeDialog({ isOpen, setIsOpen, sourceLead, onMerge, isMerging }: MergeDialogProps) {
    const [step, setStep] = useState<MergeStep>('selectTarget');
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<Lead[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [targetLead, setTargetLead] = useState<Lead | null>(null);
    const [primaryLeadId, setPrimaryLeadId] = useState<string | null>(null);
    
    const debouncedSearchTerm = useDebounce(searchTerm, 300);

    useEffect(() => {
        if (!isOpen) {
            // Reset state on close
            setTimeout(() => {
                setStep('selectTarget');
                setSearchTerm('');
                setSearchResults([]);
                setTargetLead(null);
                setPrimaryLeadId(null);
            }, 300);
        }
    }, [isOpen]);

    useEffect(() => {
        const fetchLeads = async () => {
            if (debouncedSearchTerm.length < 2) {
                setSearchResults([]);
                return;
            }
            setIsLoading(true);
            try {
                const nameQuery = query(
                    collection(db, 'leads'),
                    where('name', '>=', debouncedSearchTerm),
                    where('name', '<=', debouncedSearchTerm + '\uf8ff'),
                    orderBy('name'),
                    limit(10)
                );
                const querySnapshot = await getDocs(nameQuery);
                const leads = querySnapshot.docs
                    .map(doc => ({ id: doc.id, ...doc.data() } as Lead))
                    .filter(lead => lead.id !== sourceLead.id); // Exclude the source lead
                setSearchResults(leads);
            } catch (error) {
                console.error("Error searching leads:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchLeads();
    }, [debouncedSearchTerm, sourceLead.id]);
    
    const handleNext = () => {
        if (targetLead) {
            setPrimaryLeadId(sourceLead.id); // Default to source lead
            setStep('selectPrimary');
        }
    };
    
    const handleMergeClick = () => {
        if (primaryLeadId && targetLead) {
            const secondaryLeadId = primaryLeadId === sourceLead.id ? targetLead.id : sourceLead.id;
            onMerge(primaryLeadId, secondaryLeadId);
        }
    };
    
    const handleBack = () => {
        setStep('selectTarget');
        setTargetLead(null);
        setPrimaryLeadId(null);
    }
    
    const renderSelectTargetStep = () => (
        <>
            <DialogHeader>
                <DialogTitle>Merge Contact</DialogTitle>
                <DialogDescription>
                    Search for the contact to merge with &quot;{sourceLead.name}&quot;.
                </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by name..."
                        className="pl-9"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        autoFocus
                    />
                </div>
                <ScrollArea className="h-60">
                    <div className="space-y-2 pr-4">
                        {isLoading ? (
                            <div className="flex justify-center items-center h-full">
                                <Loader2 className="animate-spin" />
                            </div>
                        ) : searchResults.length > 0 ? (
                            searchResults.map(lead => (
                                <button key={lead.id} onClick={() => setTargetLead(lead)} className={`w-full text-left p-3 rounded-md border ${targetLead?.id === lead.id ? 'bg-muted ring-2 ring-primary' : 'bg-background'}`}>
                                    <p className="font-semibold">{lead.name}</p>
                                    <p className="text-sm text-muted-foreground">{lead.commitmentSnapshot?.course || 'No course specified'}</p>
                                </button>
                            ))
                        ) : (
                            <div className="text-center text-sm text-muted-foreground pt-10">
                                {debouncedSearchTerm.length < 2 ? 'Enter at least 2 characters to search.' : 'No contacts found.'}
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button onClick={handleNext} disabled={!targetLead}>Next</Button>
            </DialogFooter>
        </>
    );
    
    const renderSelectPrimaryStep = () => {
        if (!targetLead) return null;
        
        return (
             <>
                <DialogHeader>
                    <DialogTitle>Select Primary Contact</DialogTitle>
                    <DialogDescription>
                       All data will be merged into the primary contact. The other contact will be deleted. This cannot be undone.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <RadioGroup value={primaryLeadId ?? ''} onValueChange={setPrimaryLeadId}>
                        <div className="flex items-center space-x-2 p-4 border rounded-md has-[:checked]:bg-muted has-[:checked]:ring-2 has-[:checked]:ring-primary">
                            <RadioGroupItem value={sourceLead.id} id={`r-${sourceLead.id}`} />
                            <Label htmlFor={`r-${sourceLead.id}`} className="font-semibold text-base w-full cursor-pointer">{sourceLead.name}</Label>
                        </div>
                        <div className="flex items-center space-x-2 p-4 border rounded-md has-[:checked]:bg-muted has-[:checked]:ring-2 has-[:checked]:ring-primary">
                            <RadioGroupItem value={targetLead.id} id={`r-${targetLead.id}`} />
                            <Label htmlFor={`r-${targetLead.id}`} className="font-semibold text-base w-full cursor-pointer">{targetLead.name}</Label>
                        </div>
                    </RadioGroup>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={handleBack} disabled={isMerging}><ArrowLeft className="mr-2 h-4 w-4"/> Back</Button>
                    <Button onClick={handleMergeClick} disabled={isMerging}>
                        {isMerging && <Loader2 className="animate-spin mr-2"/>}
                        Merge Contacts
                    </Button>
                </DialogFooter>
            </>
        )
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-md">
                {step === 'selectTarget' ? renderSelectTargetStep() : renderSelectPrimaryStep()}
            </DialogContent>
        </Dialog>
    );
}
