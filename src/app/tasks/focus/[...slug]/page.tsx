
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { doc, getDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ListTodo } from 'lucide-react';
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
    const currentTaskId = slug[0];
    
    const [taskQueue, setTaskQueue] = useState<Task[]>([]);
    const [currentLead, setCurrentLead] = useState<Lead | null>(null);
    const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

    const [isLoading, setIsLoading] = useState(true);
    const [isQueueVisible, setIsQueueVisible] = useState(true);

    const queueIds = useMemo(() => searchParams.get('queue')?.split(',') || [], [searchParams]);

    const currentIndex = useMemo(() => queueIds.findIndex(id => id === currentTaskId), [queueIds, currentTaskId]);
    const currentTask = useMemo(() => taskQueue[currentIndex], [taskQueue, currentIndex]);

    const fetchTaskQueue = useCallback(async () => {
        if (queueIds.length === 0) {
            setIsLoading(false);
            return;
        }
        try {
            const q = query(collection(db, "tasks"), where('__name__', 'in', queueIds));
            const snapshot = await getDocs(q);
            const tasksData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Task));
            
            // Firestore `in` query doesn't guarantee order, so we re-order based on the original queueIds
            const orderedTasks = queueIds.map(id => tasksData.find(t => t.id === id)).filter(Boolean) as Task[];
            setTaskQueue(orderedTasks);

        } catch (error) {
            console.error("Error fetching task queue:", error);
            toast({ variant: 'destructive', title: 'Failed to load task queue.' });
        }
    }, [queueIds, toast]);

    useEffect(() => {
        fetchTaskQueue();
        
        const settingsRef = doc(db, 'settings', 'appConfig');
        const unsubSettings = onSnapshot(settingsRef, (doc) => {
            if (doc.exists()) setAppSettings(doc.data() as AppSettings);
        });

        return () => unsubSettings();
    }, [fetchTaskQueue]);


    useEffect(() => {
        if (!currentTask || !currentTask.leadId) {
            if(taskQueue.length > 0) setIsLoading(false);
            return;
        }
        
        setIsLoading(true);
        const leadRef = doc(db, 'leads', currentTask.leadId);
        
        const unsubscribe = onSnapshot(leadRef, (doc) => {
            if (doc.exists()) {
                setCurrentLead({ id: doc.id, ...doc.data() } as Lead);
            } else {
                toast({ variant: 'destructive', title: 'Contact not found for this task.' });
                setCurrentLead(null);
            }
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching lead:", error);
            toast({ variant: 'destructive', title: 'Failed to load contact.' });
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [currentTask, toast]);

    const navigateToTask = (index: number) => {
        if (index >= 0 && index < queueIds.length) {
            const nextTaskId = queueIds[index];
            router.push(`/tasks/focus/${nextTaskId}?queue=${queueIds.join(',')}`);
        }
    }

    const handleInteractionLogged = () => {
        // Find the current task and mark it as completed visually (temporary)
        const updatedQueue = [...taskQueue];
        if (updatedQueue[currentIndex]) {
            updatedQueue[currentIndex].completed = true;
        }
        setTaskQueue(updatedQueue);

        // Auto-navigate to the next uncompleted task
        setTimeout(() => {
            const nextUncompletedIndex = taskQueue.findIndex((task, index) => index > currentIndex && !task.completed);
            if (nextUncompletedIndex !== -1) {
                navigateToTask(nextUncompletedIndex);
            } else {
                // If no more uncompleted tasks, go to the one after current, or just stay
                const nextIndex = currentIndex + 1;
                if (nextIndex < queueIds.length) {
                    navigateToTask(nextIndex);
                } else {
                    toast({ title: "Queue finished!"});
                }
            }
        }, 500); // Small delay for user to see the change
    };
    
    if (isLoading && !currentLead) {
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
                                {taskQueue.map(task => (
                                     <Link 
                                        key={task.id} 
                                        href={`/tasks/focus/${task.id}?queue=${queueIds.join(',')}`}
                                        className={cn(
                                            "block p-3 rounded-lg border",
                                            task.id === currentTaskId ? "bg-primary/10 border-primary" : "hover:bg-muted/50",
                                            task.completed && "opacity-50 line-through"
                                        )}
                                      >
                                        <p className="font-semibold text-sm truncate">{task.description}</p>
                                        <p className="text-xs text-muted-foreground truncate">{task.leadName}</p>
                                    </Link>
                                ))}
                            </div>
                        </ScrollArea>
                    </aside>
                )}

                {/* Main Content */}
                <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
                     {(isLoading && !currentLead) ? (
                        <div className="flex h-full items-center justify-center">
                            <Logo className="h-10 w-10 animate-spin text-primary" />
                        </div>
                    ) : currentLead && currentTask && appSettings ? (
                        <FocusView 
                            lead={currentLead}
                            task={currentTask}
                            appSettings={appSettings}
                            onInteractionLogged={handleInteractionLogged}
                        />
                    ) : (
                        <div className="flex flex-col h-full items-center justify-center text-center">
                            <ListTodo className="h-12 w-12 text-muted-foreground mb-4"/>
                            <h2 className="text-xl font-semibold">No Contact Associated</h2>
                            <p className="text-muted-foreground mt-1">This task is not linked to a contact.</p>
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

    