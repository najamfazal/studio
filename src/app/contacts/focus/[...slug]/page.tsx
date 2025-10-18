
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { collection, query, where, getDocs, doc, onSnapshot, orderBy, limit, startAfter, QueryDocumentSnapshot, DocumentData, Timestamp } from 'firebase/firestore';
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

const PAGE_SIZE = 20;

export default function ContactsFocusPage() {
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const isMobile = useIsMobile();
    
    const slug = params.slug as string[];
    const routineType = slug?.[0]; // e.g., 'new', 'followup', 'admin', 'overdue'
    const taskIds = useMemo(() => slug?.[1]?.split(',') || [], [slug]);

    const [leads, setLeads] = useState<Lead[]>([]);
    const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isQueueVisible, setIsQueueVisible] = useState(true);
    const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
    const [hasMore, setHasMore] = useState(true);

    const [currentIndex, setCurrentIndex] = useState(0);

    const currentLead = useMemo(() => leads[currentIndex], [leads, currentIndex]);

    const fetchFocusData = useCallback(async (loadMore = false) => {
        if (!routineType) {
            setIsLoading(false);
            return;
        }

        if (loadMore) {
            if (!hasMore) return;
        } else {
            setIsLoading(true);
            setLeads([]);
            setCurrentIndex(0);
        }

        try {
            let leadsQuery;
            const leadsRef = collection(db, "leads");

            if (routineType === 'new') {
                leadsQuery = query(leadsRef, where("afc_step", "==", 0), orderBy("assignedAt", "desc"));
            } else if (routineType === 'followup') {
                leadsQuery = query(leadsRef, where("afc_step", ">", 0), orderBy("afc_step", "asc"));
            } else if (routineType === 'admin' || routineType === 'overdue') {
                // Task-based routines are not paginated for now, they receive all IDs.
                if (taskIds.length === 0) {
                  setLeads([]);
                  setHasMore(false);
                  return;
                }
                const BATCH_SIZE = 30; // Firestore 'in' query limit
                const leadsData: Lead[] = [];
                for (let i = 0; i < taskIds.length; i += BATCH_SIZE) {
                    const batchIds = taskIds.slice(i, i + BATCH_SIZE);
                    if (batchIds.length > 0) {
                        const q = query(collection(db, "leads"), where('__name__', 'in', batchIds));
                        const snapshot = await getDocs(q);
                        snapshot.forEach(d => leadsData.push({ id: d.id, ...d.data() } as Lead));
                    }
                }
                 setLeads(leadsData);
                 setHasMore(false);
                 return;
            } else {
                toast({ variant: 'destructive', title: 'Unknown routine type.' });
                return;
            }

            const queryConstraints: any[] = [limit(PAGE_SIZE)];
            if (loadMore && lastVisible) {
                queryConstraints.push(startAfter(lastVisible));
            }
            
            const finalQuery = query(leadsQuery, ...queryConstraints);
            const snapshot = await getDocs(finalQuery);
            const newLeads = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lead));

            setLeads(prev => loadMore ? [...prev, ...newLeads] : newLeads);
            setLastVisible(snapshot.docs[snapshot.docs.length - 1] || null);
            setHasMore(snapshot.docs.length === PAGE_SIZE);

        } catch (error) {
            console.error("Error fetching focus data:", error);
            toast({ variant: 'destructive', title: 'Failed to load focus queue.' });
        } finally {
            setIsLoading(false);
        }
    }, [routineType, taskIds, toast, hasMore, lastVisible]);


    useEffect(() => {
        fetchFocusData();
        
        const settingsRef = doc(db, 'settings', 'appConfig');
        const unsubSettings = onSnapshot(settingsRef, (doc) => {
            if (doc.exists()) setAppSettings(doc.data() as AppSettings);
        });

        return () => unsubSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [routineType]);

    const navigateToLead = (index: number) => {
        if (index >= 0 && index < leads.length) {
            setCurrentIndex(index);
        } else if (index >= leads.length && hasMore) {
            fetchFocusData(true).then(() => {
                setCurrentIndex(index);
            });
        }
    };
    
    const handleLeadUpdate = (updatedLead: Lead) => {
        setLeads(prevLeads => prevLeads.map(l => l.id === updatedLead.id ? updatedLead : l));
    }

    if (isLoading && leads.length === 0) {
        return <div className="flex h-screen items-center justify-center"><Logo className="h-12 w-12 animate-spin text-primary" /></div>;
    }

    if (leads.length === 0 && !isLoading) {
        return (
             <div className="flex h-screen items-center justify-center text-center">
                <div>
                    <Users className="mx-auto h-12 w-12 text-muted-foreground" />
                    <h2 className="mt-4 text-xl font-semibold">No Leads in this Queue</h2>
                    <p className="mt-2 text-sm text-muted-foreground">This routine is currently empty.</p>
                    <Button asChild className="mt-4">
                        <Link href="/">Back to Dashboard</Link>
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
                        <h1 className="text-base font-bold tracking-tight capitalize">{routineType}</h1>
                        <p className="text-xs text-muted-foreground">{currentIndex + 1} / {leads.length}{hasMore ? '+' : ''}</p>
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
                                 {hasMore && (
                                    <Button variant="link" className="w-full" onClick={() => fetchFocusData(true)}>Load More</Button>
                                )}
                            </div>
                        </ScrollArea>
                    </aside>
                )}

                <main className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-2 sm:p-4 md:p-6">
                        {currentLead && appSettings ? (
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
                            <Button variant="default" size="lg" onClick={() => navigateToLead(currentIndex + 1)} disabled={currentIndex >= leads.length - 1 && !hasMore}>
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
                    <Button variant="default" size="lg" onClick={() => navigateToLead(currentIndex + 1)} disabled={currentIndex >= leads.length - 1 && !hasMore}>
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
