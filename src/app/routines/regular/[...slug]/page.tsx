
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { collection, query, where, getDocs, getDoc, doc, onSnapshot } from 'firebase/firestore';
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ListTodo, Loader2 } from 'lucide-react';
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

// Helper to deserialize Firestore Timestamps
const toDate = (timestamp: any): Date | null => {
  if (!timestamp) return null;
  if (timestamp.seconds) return new Date(timestamp.seconds * 1000);
  return new Date(timestamp);
};

export default function RegularFocusPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const isMobile = useIsMobile();
    
    const slug = params.slug as string[];
    const initialTaskId = slug[0];
    const queueIds = useMemo(() => searchParams.get('queue')?.split(',') || [], [searchParams]);

    const [tasksCache, setTasksCache] = useState<Record<string, Task>>({});
    const [leadsCache, setLeadsCache] = useState<Record<string, Lead>>({});
    const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

    const [isLoading, setIsLoading] = useState(true);
    const [isQueueVisible, setIsQueueVisible] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(-1);

    useEffect(() => {
        const index = queueIds.findIndex(id => id === initialTaskId);
        setCurrentIndex(index > -1 ? index : 0);
    }, [initialTaskId, queueIds]);

    const currentTaskId = useMemo(() => queueIds[currentIndex], [queueIds, currentIndex]);
    const currentTask = useMemo(() => tasksCache[currentTaskId], [tasksCache, currentTaskId]);
    const currentLead = useMemo(() => currentTask?.leadId ? leadsCache[currentTask.leadId] : null, [leadsCache, currentTask]);
    
    const fetchTask = useCallback(async (taskId: string) => {
        if (!taskId || tasksCache[taskId]) return;
        
        setIsLoading(true);
        try {
            const taskDoc = await getDoc(doc(db, 'tasks', taskId));
            if (taskDoc.exists()) {
                const taskData = taskDoc.data() as Task;
                setTasksCache(prev => ({ ...prev, [taskId]: { id: taskId, ...taskData } }));
            }
        } catch (error) {
            toast({ variant: 'destructive', title: 'Failed to load task.' });
        } finally {
            setIsLoading(false);
        }
    }, [tasksCache, toast]);

    const fetchLead = useCallback(async (leadId: string) => {
        if (!leadId || leadsCache[leadId]) return;
        
        setIsLoading(true);
        try {
            const leadDoc = await getDoc(doc(db, 'leads', leadId));
            if (leadDoc.exists()) {
                setLeadsCache(prev => ({ ...prev, [leadId]: { id: leadId, ...leadDoc.data() } as Lead }));
            }
        } catch (error) {
            toast({ variant: 'destructive', title: 'Failed to load contact.' });
        } finally {
            setIsLoading(false);
        }
    }, [leadsCache, toast]);

    useEffect(() => {
        if (currentTaskId) {
            fetchTask(currentTaskId);
        }
    }, [currentTaskId, fetchTask]);

    useEffect(() => {
        if (currentTask?.leadId) {
            fetchLead(currentTask.leadId);
        }
    }, [currentTask, fetchLead]);

    useEffect(() => {
        const settingsRef = doc(db, 'settings', 'appConfig');
        const unsubSettings = onSnapshot(settingsRef, (doc) => {
            if (doc.exists()) setAppSettings(doc.data() as AppSettings);
        });
        return () => unsubSettings();
    }, []);

    const navigateToTask = (index: number) => {
        if (index >= 0 && index < queueIds.length) {
            const nextTaskId = queueIds[index];
            router.push(`/routines/regular/${nextTaskId}?queue=${queueIds.join(',')}`, { scroll: false });
        }
    }

    const handleInteractionLogged = () => {
        setTasksCache(prev => ({ ...prev, [currentTaskId]: { ...prev[currentTaskId], completed: true } }));
    };

    const handleLeadUpdate = (updatedLead: Lead) => {
        setLeadsCache(prev => ({ ...prev, [updatedLead.id]: updatedLead }));
    }
    
    if (isLoading && !currentTask) {
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
                { !isMobile && isQueueVisible && (
                    <aside className="w-80 border-r bg-card overflow-y-auto">
                        <ScrollArea className="h-full">
                            <div className="p-4 space-y-2">
                                {queueIds.map((taskId, index) => {
                                    const task = tasksCache[taskId];
                                    return (
                                        <button 
                                            key={taskId} 
                                            onClick={() => navigateToTask(index)}
                                            className={cn(
                                                "block w-full text-left p-3 rounded-lg border",
                                                taskId === currentTaskId ? "bg-primary/10 border-primary" : "hover:bg-muted/50",
                                                task?.completed && "opacity-50 line-through"
                                            )}
                                        >
                                            {task ? (
                                                <>
                                                <p className="font-semibold text-sm truncate">{task.description}</p>
                                                <p className="text-xs text-muted-foreground truncate">{task.leadName}</p>
                                                </>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <Loader2 className="h-4 w-4 animate-spin"/>
                                                    <span className="text-sm">Loading...</span>
                                                </div>
                                            )}
                                        </button>
                                    )
                                })}
                            </div>
                        </ScrollArea>
                    </aside>
                )}

                <main className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-2 sm:p-4 md:p-6">
                         {(isLoading || (currentTask && !currentLead && currentTask.leadId)) ? (
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
                        ) : currentTask ? (
                            <div className="flex flex-col h-full items-center justify-center text-center">
                                <ListTodo className="h-12 w-12 text-muted-foreground mb-4"/>
                                <h2 className="text-xl font-semibold">{currentTask.description}</h2>
                                <p className="text-muted-foreground mt-1">This is a personal task not linked to a contact.</p>
                                {currentTask.dueDate && <p className="text-sm mt-2">Due: {format(toDate(currentTask.dueDate)!, 'PP')}</p>}
                            </div>
                        ) : (
                             <div className="flex h-full items-center justify-center">
                                <p>Task not found or queue is empty.</p>
                             </div>
                        )}
                    </div>

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
                </main>
            </div>

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

