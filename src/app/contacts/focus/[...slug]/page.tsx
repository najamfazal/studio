
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { collection, query, where, getDocs, doc, onSnapshot, getDoc } from 'firebase/firestore';
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, Users } from 'lucide-react';
import Link from 'next/link';

import { db } from '@/lib/firebase';
import type { Lead, AppSettings } from '@/lib/types';
import { Logo } from '@/components/icons';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { FocusView } from '@/components/focus-view';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

export default function ContactsFocusPage() {
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const isMobile = useIsMobile();
    
    const slug = params.slug as string[];
    const queueIds = useMemo(() => {
        if (slug && slug.length > 0) {
            // The slug is an array like ['id1,id2,id3'], so we access the first element and split it.
            return slug[0].split(',');
        }
        return [];
    }, [slug]);

    const [leads, setLeads] = useState<Lead[]>([]);
    const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isQueueVisible, setIsQueueVisible] = useState(true);

    const [currentIndex, setCurrentIndex] = useState(0);

    const currentLead = useMemo(() => leads[currentIndex], [leads, currentIndex]);

    const fetchLeads = useCallback(async () => {
        if (queueIds.length === 0) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const BATCH_SIZE = 30; // Firestore 'in' query limit
            const leadsData: Lead[] = [];
            for (let i = 0; i < queueIds.length; i += BATCH_SIZE) {
                const batchIds = queueIds.slice(i, i + BATCH_SIZE);
                if (batchIds.length > 0) {
                    const q = query(collection(db, "leads"), where('__name__', 'in', batchIds));
                    const snapshot = await getDocs(q);
                    snapshot.forEach(d => leadsData.push({ id: d.id, ...d.data() } as Lead));
                }
            }

            // Re-order based on original queueIds array
            const orderedLeads = queueIds.map(id => leadsData.find(lead => lead.id === id)).filter((l): l is Lead => !!l);
            setLeads(orderedLeads);
        } catch (error) {
            console.error("Error fetching leads:", error);
            toast({ variant: 'destructive', title: 'Failed to load leads.' });
        } finally {
            setIsLoading(false);
        }
    }, [queueIds, toast]);


    useEffect(() => {
        fetchLeads();
        
        const settingsRef = doc(db, 'settings', 'appConfig');
        const unsubSettings = onSnapshot(settingsRef, (doc) => {
            if (doc.exists()) setAppSettings(doc.data() as AppSettings);
        });

        return () => unsubSettings();
    }, [fetchLeads]);

    const navigateToLead = (index: number) => {
        if (index >= 0 && index < leads.length) {
            setCurrentIndex(index);
        }
    };
    
    const handleLeadUpdate = (updatedLead: Lead) => {
        setLeads(prevLeads => prevLeads.map(l => l.id === updatedLead.id ? updatedLead : l));
    }

    if (isLoading || !appSettings) {
        return <div className="flex h-screen items-center justify-center"><Logo className="h-12 w-12 animate-spin text-primary" /></div>;
    }

    if (leads.length === 0) {
        return (
             <div className="flex h-screen items-center justify-center text-center">
                <div>
                    <Users className="mx-auto h-12 w-12 text-muted-foreground" />
                    <h2 className="mt-4 text-xl font-semibold">No Leads in Focus Queue</h2>
                    <p className="mt-2 text-sm text-muted-foreground">The list of contacts is empty.</p>
                    <Button asChild className="mt-4">
                        <Link href="/contacts">Back to Contacts</Link>
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-screen bg-background">
            <header className="bg-card border-b p-3 flex items-center justify-between sticky top-0 z-20 h-14">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                        <Link href="/"><ArrowLeft/></Link>
                    </Button>
                    <div className="flex items-baseline gap-2">
                        <h1 className="text-base font-bold tracking-tight">Contact Focus</h1>
                        <p className="text-xs text-muted-foreground">{currentIndex + 1} / {leads.length}</p>
                    </div>
                </div>
                 <div className="flex items-center gap-2">
                     {!isMobile && (
                        <Button variant="ghost" size="icon" onClick={() => setIsQueueVisible(!isQueueVisible)}>
                            {isQueueVisible ? <ChevronsLeft/> : <ChevronsRight/>}
                        </Button>
                     )}
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden">
                { !isMobile && isQueueVisible && (
                    <aside className="w-80 border-r bg-card overflow-y-auto">
                        <ScrollArea className="h-full">
                            <div className="p-4 space-y-2">
                                {leads.map((lead, index) => (
                                     <button 
                                        key={lead.id} 
                                        onClick={() => navigateToLead(index)}
                                        className={cn(
                                            "block w-full text-left p-3 rounded-lg border",
                                            lead.id === currentLead.id ? "bg-primary/10 border-primary" : "hover:bg-muted/50"
                                        )}
                                      >
                                        <p className="font-semibold text-sm truncate">{lead.name}</p>
                                        <Badge variant={lead.status === 'Active' ? 'default' : 'secondary'} className="text-xs mt-1">{lead.status || 'Active'}</Badge>
                                    </button>
                                ))}
                            </div>
                        </ScrollArea>
                    </aside>
                )}

                <main className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-2 sm:p-4 md:p-6">
                        {currentLead ? (
                            <FocusView 
                                lead={currentLead}
                                task={{id: `focus-${currentLead.id}`, leadId: currentLead.id, leadName: currentLead.name, description: `Focus on ${currentLead.name}`, completed: false, createdAt: new Date().toISOString(), nature: 'Interactive'}}
                                appSettings={appSettings}
                                onLeadUpdate={handleLeadUpdate}
                                onInteractionLogged={() => {}}
                                onTaskUpdate={() => {}}
                            />
                        ) : (
                             <div className="flex h-full items-center justify-center">
                                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                             </div>
                        )}
                    </div>

                    {!isMobile && (
                        <footer className="bg-card/80 backdrop-blur-sm border-t p-2 flex items-center justify-center gap-4 sticky bottom-0 z-20">
                             <Button variant="outline" size="icon" onClick={() => navigateToLead(0)} disabled={currentIndex === 0}>
                                <ChevronsLeft />
                            </Button>
                            <Button variant="outline" size="icon" onClick={() => navigateToLead(currentIndex - 1)} disabled={currentIndex === 0}>
                                <ChevronLeft />
                            </Button>
                            <Button variant="default" size="lg" onClick={() => navigateToLead(currentIndex + 1)} disabled={currentIndex >= leads.length - 1}>
                                Next
                                <ChevronRight />
                            </Button>
                            <Button variant="outline" size="icon" onClick={() => navigateToLead(leads.length - 1)} disabled={currentIndex >= leads.length - 1}>
                                <ChevronsRight />
                            </Button>
                        </footer>
                    )}
                </main>
            </div>

            {isMobile && (
                <footer className="bg-card border-t p-2 flex items-center justify-center gap-4 sticky bottom-0 z-20">
                     <Button variant="outline" size="icon" onClick={() => navigateToLead(0)} disabled={currentIndex === 0}>
                        <ChevronsLeft />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => navigateToLead(currentIndex - 1)} disabled={currentIndex === 0}>
                        <ChevronLeft />
                    </Button>
                    <Button variant="default" size="lg" onClick={() => navigateToLead(currentIndex + 1)} disabled={currentIndex >= leads.length - 1}>
                        Next
                        <ChevronRight />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => navigateToLead(leads.length - 1)} disabled={currentIndex >= leads.length - 1}>
                        <ChevronsRight />
                    </Button>
                </footer>
            )}
        </div>
    );
}
