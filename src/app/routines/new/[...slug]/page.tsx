
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { onSnapshot, collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ListTodo, Loader2, Pencil } from 'lucide-react';
import Link from 'next/link';

import { db } from '@/lib/firebase';
import type { Lead, Task, AppSettings } from '@/lib/types';
import { Logo } from '@/components/icons';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { FocusView } from '@/components/focus-view';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function NewLeadFocusPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const isMobile = useIsMobile();
    
    const slug = params.slug as string[];
    const initialTaskId = slug[0];
    const queueIds = useMemo(() => searchParams.get('queue')?.split(',') || [], [searchParams]);

    const [taskQueue, setTaskQueue] = useState<Task[]>([]);
    const [leadsCache, setLeadsCache] = useState<Record<string, Lead>>({});
    const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

    const [isLoading, setIsLoading] = useState(true);
    const [isQueueVisible, setIsQueueVisible] = useState(true);

    const [currentIndex, setCurrentIndex] = useState(-1);
    
    const [isLoadingLead, setIsLoadingLead] = useState(false);
    
    useEffect(() => {
        const index = queueIds.findIndex(id => id === initialTaskId);
        setCurrentIndex(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialTaskId]);


    const currentTaskId = useMemo(() => queueIds[currentIndex], [queueIds, currentIndex]);
    const currentTask = useMemo(() => taskQueue.find(t => t.id === currentTaskId), [taskQueue, currentTaskId]);
    const currentLead = useMemo(() => currentTask?.leadId ? leadsCache[currentTask.leadId] : null, [leadsCache, currentTask]);
    
    const fetchFullQueueData = useCallback(async () => {
        if (queueIds.length === 0) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            // Fetch all tasks in the queue
            const tasksData: Task[] = [];
            const BATCH_SIZE = 30;
            for (let i = 0; i < queueIds.length; i += BATCH_SIZE) {
                const batchIds = queueIds.slice(i, i + BATCH_SIZE);
                if (batchIds.length > 0) {
                    const q = query(collection(db, "tasks"), where('__name__', 'in', batchIds));
                    const snapshot = await getDocs(q);
                    tasksData.push(...snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Task)));
                }
            }
            const orderedTasks = queueIds.map(id => tasksData.find(t => t.id === id)).filter(Boolean) as Task[];
            setTaskQueue(orderedTasks);

            // Fetch all associated leads
            const leadIdsToFetch = [...new Set(orderedTasks.map(t => t.leadId).filter(Boolean))];
            const leadsData: Record<string, Lead> = {};
            for (let i = 0; i < leadIdsToFetch.length; i += BATCH_SIZE) {
                const batchIds = leadIdsToFetch.slice(i, i + BATCH_SIZE);
                if (batchIds.length > 0) {
                    const q = query(collection(db, "leads"), where('__name__', 'in', batchIds));
                    const snapshot = await getDocs(q);
                    snapshot.forEach(doc => {
                        leadsData[doc.id] = { id: doc.id, ...doc.data() } as Lead;
                    });
                }
            }
            setLeadsCache(leadsData);

        } catch (error) {
            console.error("Error fetching queue data:", error);
            toast({ variant: 'destructive', title: 'Failed to load routine data.' });
        } finally {
            setIsLoading(false);
        }
    }, [queueIds, toast]);

    useEffect(() => {
        fetchFullQueueData();
        
        const settingsRef = doc(db, 'settings', 'appConfig');
        const unsubSettings = onSnapshot(settingsRef, (doc) => {
            if (doc.exists()) setAppSettings(doc.data() as AppSettings);
        });

        return () => unsubSettings();
    }, [fetchFullQueueData]);


    const navigateToTask = (index: number) => {
        if (index >= 0 && index < queueIds.length) {
            setCurrentIndex(index);
        }
    }

    const handleInteractionLogged = () => {
        // Mark the task as completed in the local state, but don't navigate.
        setTaskQueue(prevQueue =>
            prevQueue.map(t =>
                t.id === currentTaskId ? { ...t, completed: true } : t
            )
        );
    };

    const handleLeadUpdate = (updatedLead: Lead) => {
        setLeadsCache(prev => ({...prev, [updatedLead.id]: updatedLead}));
    }
    
    if (isLoading || currentIndex === -1) {
        return <div className="flex h-screen items-center justify-center"><Logo className="h-12 w-12 animate-spin text-primary" /></div>;
    }

    return (
        <div className="flex flex-col h-screen bg-background">
            <header className="bg-card border-b p-3 flex items-center justify-between sticky top-0 z-20 h-14">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                        <Link href="/"><ArrowLeft/></Link>
                    </Button>
                    <div className="flex items-baseline gap-2">
                        <h1 className="text-base font-bold tracking-tight">Focus Mode</h1>
                        <p className="text-xs text-muted-foreground">{currentIndex + 1} / {queueIds.length}</p>
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
                {/* Task Queue Sidebar */}
                { !isMobile && isQueueVisible && (
                    <aside className="w-80 border-r bg-card overflow-y-auto">
                        <ScrollArea className="h-full">
                            <div className="p-4 space-y-2">
                                {taskQueue.map((task, index) => (
                                     <button 
                                        key={task.id} 
                                        onClick={() => navigateToTask(index)}
                                        className={cn(
                                            "block w-full text-left p-3 rounded-lg border",
                                            task.id === currentTaskId ? "bg-primary/10 border-primary" : "hover:bg-muted/50",
                                            task.completed && "opacity-50 line-through"
                                        )}
                                      >
                                        <p className="font-semibold text-sm truncate">{task.description}</p>
                                        <p className="text-xs text-muted-foreground truncate">{task.leadName}</p>
                                    </button>
                                ))}
                            </div>
                        </ScrollArea>
                    </aside>
                )}

                {/* Main Content */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    <main className="flex-1 overflow-y-auto p-2 sm:p-4 md:p-6">
                         {(isLoadingLead || (currentTask && !currentLead)) ? (
                            <div className="flex h-full items-center justify-center">
                                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                            </div>
                        ) : currentLead && currentTask && appSettings ? (
                            <FocusView 
                                lead={currentLead}
                                task={currentTask}
                                appSettings={appSettings}
                                onInteractionLogged={handleInteractionLogged}
                                onLeadUpdate={handleLeadUpdate}
                            />
                        ) : currentTask ? ( // Task exists but maybe no lead
                            <div className="flex flex-col h-full items-center justify-center text-center">
                                <ListTodo className="h-12 w-12 text-muted-foreground mb-4"/>
                                <h2 className="text-xl font-semibold">{currentTask.description}</h2>
                                <p className="text-muted-foreground mt-1">This is a personal task not linked to a contact.</p>
                            </div>
                        ) : (
                             <div className="flex h-full items-center justify-center">
                                <p>Loading task...</p>
                             </div>
                        )}
                    </main>

                     {/* Desktop Navigation */}
                    {!isMobile && (
                        <footer className="bg-card/80 backdrop-blur-sm border-t p-2 flex items-center justify-center gap-4 sticky bottom-0 z-20">
                             <Button variant="outline" size="icon" onClick={() => navigateToTask(0)} disabled={currentIndex === 0}>
                                <ChevronsLeft />
                            </Button>
                            <Button variant="outline" size="icon" onClick={() => navigateToTask(currentIndex - 1)} disabled={currentIndex === 0}>
                                <ChevronLeft />
                            </Button>
                            <Button variant="default" size="lg" onClick={() => navigateToTask(currentIndex + 1)} disabled={currentIndex >= queueIds.length - 1}>
                                Next Task
                                <ChevronRight />
                            </Button>
                            <Button variant="outline" size="icon" onClick={() => navigateToTask(queueIds.length - 1)} disabled={currentIndex >= queueIds.length - 1}>
                                <ChevronsRight />
                            </Button>
                        </footer>
                    )}
                </div>
            </div>

            {/* Mobile Navigation */}
            {isMobile && (
                <footer className="bg-card border-t p-2 flex items-center justify-center gap-4 sticky bottom-0 z-20">
                     <Button variant="outline" size="icon" onClick={() => navigateToTask(0)} disabled={currentIndex === 0}>
                        <ChevronsLeft />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => navigateToTask(currentIndex - 1)} disabled={currentIndex === 0}>
                        <ChevronLeft />
                    </Button>
                    <Button variant="default" size="lg" onClick={() => navigateToTask(currentIndex + 1)} disabled={currentIndex >= queueIds.length - 1}>
                        Next
                        <ChevronRight />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => navigateToTask(queueIds.length - 1)} disabled={currentIndex >= queueIds.length - 1}>
                        <ChevronsRight />
                    </Button>
                </footer>
            )}
        </div>
    );
}
