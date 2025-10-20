
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { collection, query, where, getDocs, doc, onSnapshot, orderBy, limit, startAfter, QueryDocumentSnapshot, DocumentData, Timestamp } from 'firebase/firestore';
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, Users } from 'lucide-react';
import Link from 'next/link';

import { db } from '@/lib/firebase';
import type { Lead, AppSettings, Task } from '@/lib/types';
import { Logo } from '@/components/icons';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { FocusView } from '@/components/focus-view';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const PAGE_SIZE = 20;

type QueueItem = {
    task: Task;
    lead: Lead | null;
};

export default function ContactsFocusPage() {
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const isMobile = useIsMobile();
    
    const slug = params.slug as string[];
    const routineType = slug?.[0]; // e.g., 'new', 'followup', 'admin', 'overdue'
    
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isQueueVisible, setIsQueueVisible] = useState(true);
    const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
    const [hasMore, setHasMore] = useState(true);

    const [currentIndex, setCurrentIndex] = useState(0);

    const currentItem = useMemo(() => queue[currentIndex], [queue, currentIndex]);

    const fetchFocusData = useCallback(async (loadMore = false) => {
        if (!routineType) {
            setIsLoading(false);
            return;
        }

        if (loadMore) {
            if (!hasMore) return;
        } else {
            setIsLoading(true);
            setQueue([]);
            setCurrentIndex(0);
        }

        try {
            let baseQuery;
            const queryConstraints: any[] = [limit(PAGE_SIZE)];
            if (loadMore && lastVisible) {
                queryConstraints.push(startAfter(lastVisible));
            }

            if (routineType === 'new') {
                baseQuery = query(collection(db, "leads"), where("afc_step", "==", 0), where("status", "==", "Active"), orderBy("assignedAt", "desc"));
            } else if (routineType === 'followup') {
                baseQuery = query(collection(db, "leads"), where("afc_step", ">", 0), where("status", "==", "Active"), orderBy("afc_step", "asc"));
            } else if (routineType === 'admin') {
                 baseQuery = query(collection(db, "tasks"), where("completed", "==", false), where("nature", "==", "Procedural"), orderBy("createdAt", "desc"));
            } else if (routineType === 'overdue') {
                 baseQuery = query(collection(db, "tasks"), where("completed", "==", false), where("dueDate", "<", new Date()), orderBy("dueDate", "asc"));
            } else if (routineType === 'archived') {
                baseQuery = query(collection(db, "leads"), where("status", "in", ["Withdrawn", "Archived", "Dormant"]), orderBy("last_interaction_date", "desc"));
            } else if (routineType === 'enrolled') {
                baseQuery = query(collection(db, "leads"), where("status", "==", "Enrolled"), orderBy("last_interaction_date", "desc"));
            } else if (routineType === 'paused') {
                baseQuery = query(collection(db, "leads"), where("status", "in", ["Cooling", "Snoozed", "Paused"]), orderBy("last_interaction_date", "desc"));
            } else {
                toast({ variant: 'destructive', title: 'Unknown routine type.' });
                return;
            }
            
            const finalQuery = query(baseQuery, ...queryConstraints);
            const snapshot = await getDocs(finalQuery);

            let newQueueItems: QueueItem[] = [];

            if(routineType === 'admin' || routineType === 'overdue') {
                const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
                const leadIds = [...new Set(tasks.map(t => t.leadId).filter(Boolean))];
                
                let leadsMap: Map<string, Lead> = new Map();
                if (leadIds.length > 0) {
                     const leadsQuery = query(collection(db, "leads"), where('__name__', 'in', leadIds));
                     const leadsSnapshot = await getDocs(leadsQuery);
                     leadsSnapshot.docs.forEach(doc => leadsMap.set(doc.id, { id: doc.id, ...doc.data() } as Lead));
                }
                
                newQueueItems = tasks.map(task => ({
                    task,
                    lead: task.leadId ? leadsMap.get(task.leadId) || null : null
                }));

            } else { // 'new', 'followup', 'archived', 'enrolled', 'paused'
                 const leads = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lead));
                 newQueueItems = leads.map(lead => ({
                    lead,
                    task: { id: `task-${lead.id}`, leadId: lead.id, leadName: lead.name, description: `Routine for ${lead.name}`, completed: false, nature: "Interactive", createdAt: new Date().toISOString() }
                 }));
            }

            setQueue(prev => loadMore ? [...prev, ...newQueueItems] : newQueueItems);
            setLastVisible(snapshot.docs[snapshot.docs.length - 1] || null);
            setHasMore(snapshot.docs.length === PAGE_SIZE);

        } catch (error) {
            console.error("Error fetching focus data:", error);
            toast({ variant: 'destructive', title: 'Failed to load focus queue.' });
        } finally {
            setIsLoading(false);
        }
    }, [routineType, toast, hasMore, lastVisible]);


    useEffect(() => {
        fetchFocusData();
        
        const settingsRef = doc(db, 'settings', 'appConfig');
        const unsubSettings = onSnapshot(settingsRef, (doc) => {
            if (doc.exists()) setAppSettings(doc.data() as AppSettings);
        });

        return () => unsubSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [routineType]);

    const navigateToItem = (index: number) => {
        if (index >= 0 && index < queue.length) {
            setCurrentIndex(index);
        } else if (index >= queue.length && hasMore) {
            fetchFocusData(true).then(() => {
                setCurrentIndex(index);
            });
        }
    };
    
    const handleLeadUpdate = (updatedLead: Lead) => {
        setQueue(prevQueue => prevQueue.map(item => item.lead?.id === updatedLead.id ? { ...item, lead: updatedLead } : item));
    }

    const handleTaskUpdate = (updatedTask: Task) => {
        setQueue(prevQueue => prevQueue.map(item => item.task.id === updatedTask.id ? { ...item, task: updatedTask } : item));
    }

    if (isLoading && queue.length === 0) {
        return <div className="flex h-screen items-center justify-center"><Logo className="h-12 w-12 animate-spin text-primary" /></div>;
    }

    if (queue.length === 0 && !isLoading) {
        return (
             <div className="flex h-screen items-center justify-center text-center">
                <div>
                    <Users className="mx-auto h-12 w-12 text-muted-foreground" />
                    <h2 className="mt-4 text-xl font-semibold">No items in this Queue</h2>
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
                        <p className="text-xs text-muted-foreground">{currentIndex + 1} / {queue.length}{hasMore ? '+' : ''}</p>
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
                                {queue.map((item, index) => (
                                     <button 
                                        key={item.task.id} 
                                        onClick={() => navigateToItem(index)}
                                        className={cn(
                                            "block w-full text-left p-3 rounded-lg border",
                                            item.task.id === currentItem.task.id ? "bg-primary/10 border-primary" : "hover:bg-muted/50"
                                        )}
                                      >
                                        <p className="font-semibold text-sm truncate">{item.lead?.name || item.task.description}</p>
                                        {item.lead && <Badge variant={item.lead.status === 'Active' ? 'default' : 'secondary'} className="text-xs mt-1">{item.lead.status || 'Active'}</Badge>}
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
                        {currentItem && appSettings ? (
                            <FocusView 
                                lead={currentItem.lead}
                                task={currentItem.task}
                                appSettings={appSettings}
                                onLeadUpdate={handleLeadUpdate}
                                onInteractionLogged={() => {}}
                                onTaskUpdate={handleTaskUpdate}
                            />
                        ) : (
                             <div className="flex h-full items-center justify-center">
                                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                             </div>
                        )}
                    </div>

                    {!isMobile && (
                        <footer className="bg-card/80 backdrop-blur-sm border-t p-2 flex items-center justify-center gap-4 sticky bottom-0 z-20">
                             <Button variant="outline" size="icon" onClick={() => navigateToItem(0)} disabled={currentIndex === 0}>
                                <ChevronsLeft />
                            </Button>
                            <Button variant="outline" size="icon" onClick={() => navigateToItem(currentIndex - 1)} disabled={currentIndex === 0}>
                                <ChevronLeft />
                            </Button>
                            <Button variant="default" size="lg" onClick={() => navigateToItem(currentIndex + 1)} disabled={currentIndex >= queue.length - 1 && !hasMore}>
                                Next
                                <ChevronRight />
                            </Button>
                            <Button variant="outline" size="icon" onClick={() => navigateToItem(queue.length - 1)} disabled={currentIndex >= queue.length - 1}>
                                <ChevronsRight />
                            </Button>
                        </footer>
                    )}
                </main>
            </div>

            {isMobile && (
                <footer className="bg-card border-t p-2 flex items-center justify-center gap-4 sticky bottom-0 z-20">
                     <Button variant="outline" size="icon" onClick={() => navigateToItem(0)} disabled={currentIndex === 0}>
                        <ChevronsLeft />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => navigateToItem(currentIndex - 1)} disabled={currentIndex === 0}>
                        <ChevronLeft />
                    </Button>
                    <Button variant="default" size="lg" onClick={() => navigateToItem(currentIndex + 1)} disabled={currentIndex >= queue.length - 1 && !hasMore}>
                        Next
                        <ChevronRight />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => navigateToItem(queue.length - 1)} disabled={currentIndex >= queue.length - 1}>
                        <ChevronsRight />
                    </Button>
                </footer>
            )}
        </div>
    );
}
