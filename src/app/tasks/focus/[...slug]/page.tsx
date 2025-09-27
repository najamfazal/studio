
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { doc, onSnapshot, collection, query, where, getDocs, getDoc } from 'firebase/firestore';
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

export default function FocusPage() {
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

    const [currentIndex, setCurrentIndex] = useState(() => queueIds.findIndex(id => id === initialTaskId));

    const currentTaskId = useMemo(() => queueIds[currentIndex], [queueIds, currentIndex]);
    const currentTask = useMemo(() => taskQueue.find(t => t.id === currentTaskId), [taskQueue, currentTaskId]);
    const currentLead = useMemo(() => currentTask?.leadId ? leadsCache[currentTask.leadId] : null, [leadsCache, currentTask]);

    const fetchTaskQueue = useCallback(async () => {
        if (queueIds.length === 0) {
            setIsLoading(false);
            return;
        }
        try {
            const tasksData: Task[] = [];
            const BATCH_SIZE = 30; // Firestore 'in' query limit

            for (let i = 0; i < queueIds.length; i += BATCH_SIZE) {
                const batchIds = queueIds.slice(i, i + BATCH_SIZE);
                if (batchIds.length > 0) {
                    const q = query(collection(db, "tasks"), where('__name__', 'in', batchIds));
                    const snapshot = await getDocs(q);
                    const batchTasks = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Task));
                    tasksData.push(...batchTasks);
                }
            }
            
            const orderedTasks = queueIds.map(id => tasksData.find(t => t.id === id)).filter(Boolean) as Task[];
            setTaskQueue(orderedTasks);

        } catch (error) {
            console.error("Error fetching task queue:", error);
            toast({ variant: 'destructive', title: 'Failed to load task queue.' });
        }
    }, [queueIds, toast]);

    useEffect(() => {
        setIsLoading(true);
        fetchTaskQueue();
        
        const settingsRef = doc(db, 'settings', 'appConfig');
        const unsubSettings = onSnapshot(settingsRef, (doc) => {
            if (doc.exists()) setAppSettings(doc.data() as AppSettings);
            setIsLoading(false);
        });

        return () => unsubSettings();
    }, [fetchTaskQueue]);


    useEffect(() => {
        const fetchLeadForCurrentTask = async () => {
            if (currentTask && currentTask.leadId && !leadsCache[currentTask.leadId]) {
                setIsLoading(true);
                const leadDoc = await getDoc(doc(db, 'leads', currentTask.leadId));
                if (leadDoc.exists()) {
                    setLeadsCache(prev => ({ ...prev, [currentTask.leadId!]: { id: leadDoc.id, ...leadDoc.data() } as Lead }));
                } else {
                    toast({ variant: 'destructive', title: 'Contact not found for this task.' });
                }
                setIsLoading(false);
            } else if (!currentTask?.leadId) {
                setIsLoading(false);
            }
        };

        if (taskQueue.length > 0) {
            fetchLeadForCurrentTask();
        }
    }, [currentTask, leadsCache, taskQueue.length, toast]);

    const navigateToTask = (index: number) => {
        if (index >= 0 && index < queueIds.length) {
            setCurrentIndex(index);
            const nextTaskId = queueIds[index];
            // Update URL without a full page reload
            router.push(`/tasks/focus/${nextTaskId}?queue=${queueIds.join(',')}`, { scroll: false });
        }
    }

    const handleInteractionLogged = () => {
        // Find the current task and mark it as completed visually (temporary)
        setTaskQueue(prevQueue => {
            const newQueue = [...prevQueue];
            const taskToUpdate = newQueue.find(t => t.id === currentTaskId);
            if (taskToUpdate) {
                taskToUpdate.completed = true;
            }
            return newQueue;
        });

        // Auto-navigate to the next uncompleted task
        setTimeout(() => {
            const nextUncompletedIndex = taskQueue.findIndex((task, index) => index > currentIndex && !task.completed);
            if (nextUncompletedIndex !== -1) {
                navigateToTask(nextUncompletedIndex);
            } else {
                const nextIndex = currentIndex + 1;
                if (nextIndex < queueIds.length) {
                    navigateToTask(nextIndex);
                } else {
                    toast({ title: "Queue finished!"});
                    router.push('/');
                }
            }
        }, 500); // Small delay for user to see the change
    };
    
    if (taskQueue.length === 0 && isLoading) {
        return <div className="flex h-screen items-center justify-center"><Logo className="h-12 w-12 animate-spin text-primary" /></div>;
    }

    return (
        <div className="flex flex-col h-screen bg-background">
            <header className="bg-card border-b p-4 flex items-center justify-between sticky top-0 z-20">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" asChild>
                        <Link href="/"><ArrowLeft/></Link>
                    </Button>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight">Focus Mode</h1>
                        <p className="text-sm text-muted-foreground">Task {currentIndex + 1} of {queueIds.length}</p>
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
                <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
                     {(isLoading && !currentLead) ? (
                        <div className="flex h-full items-center justify-center">
                            <Loader2 className="h-10 w-10 animate-spin text-primary" />
                        </div>
                    ) : currentLead && currentTask && appSettings ? (
                        <FocusView 
                            lead={currentLead}
                            task={currentTask}
                            appSettings={appSettings}
                            onInteractionLogged={handleInteractionLogged}
                        />
                    ) : currentTask ? ( // Task exists but maybe no lead
                        <div className="flex flex-col h-full items-center justify-center text-center">
                            <ListTodo className="h-12 w-12 text-muted-foreground mb-4"/>
                            <h2 className="text-xl font-semibold">No Contact Associated</h2>
                            <p className="text-muted-foreground mt-1">This task is not linked to a contact.</p>
                        </div>
                    ) : (
                         <div className="flex h-full items-center justify-center">
                            <p>Loading task...</p>
                         </div>
                    )}
                </main>
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
                    <Button variant="outline" size="icon" onClick={() => navigateToTask(currentIndex + 1)} disabled={currentIndex >= queueIds.length - 1}>
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
