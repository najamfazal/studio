

"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { collection, query, where, getDocs, getDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ListTodo, Loader2, Clock, Check, Book } from 'lucide-react';
import Link from 'next/link';
import { add, endOfDay, format } from 'date-fns';

import { db } from '@/lib/firebase';
import type { Lead, Task, AppSettings } from '@/lib/types';
import { Logo } from '@/components/icons';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { FocusView } from '@/components/focus-view';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';


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

    const [taskQueue, setTaskQueue] = useState<Task[]>([]);
    const [leadsCache, setLeadsCache] = useState<Record<string, Lead>>({});
    const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

    const [isLoading, setIsLoading] = useState(true);
    const [isQueueVisible, setIsQueueVisible] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [filteredQueueIds, setFilteredQueueIds] = useState<string[]>([]);
    const [selectedCourse, setSelectedCourse] = useState<string | null>(null);

    useEffect(() => {
        const index = filteredQueueIds.findIndex(id => id === initialTaskId);
        if (index !== -1) {
            setCurrentIndex(index);
        } else if (filteredQueueIds.length > 0) {
            setCurrentIndex(0);
        } else {
            setCurrentIndex(-1);
        }
    }, [initialTaskId, filteredQueueIds]);

    const currentTaskId = useMemo(() => filteredQueueIds[currentIndex], [filteredQueueIds, currentIndex]);
    const currentTask = useMemo(() => taskQueue.find(t => t.id === currentTaskId), [taskQueue, currentTaskId]);
    const currentLead = useMemo(() => currentTask?.leadId ? leadsCache[currentTask.leadId] : null, [leadsCache, currentTask]);
    
    const fetchFullQueueData = useCallback(async () => {
        if (queueIds.length === 0) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
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

    const availableCourses = useMemo(() => {
        const allCourses = new Set<string>();
        taskQueue.forEach(task => {
            const lead = task.leadId ? leadsCache[task.leadId] : null;
            lead?.commitmentSnapshot?.deals?.forEach(deal => {
                deal.courses.forEach(course => allCourses.add(course));
            });
        });
        return Array.from(allCourses).sort();
    }, [taskQueue, leadsCache]);

    useEffect(() => {
        if (selectedCourse) {
            const newFilteredIds = taskQueue
                .filter(task => {
                    const lead = task.leadId ? leadsCache[task.leadId] : null;
                    return lead?.commitmentSnapshot?.deals?.some(deal => deal.courses.includes(selectedCourse));
                })
                .map(task => task.id);
            setFilteredQueueIds(newFilteredIds);
        } else {
            setFilteredQueueIds(taskQueue.map(t => t.id));
        }
    }, [selectedCourse, taskQueue, leadsCache]);

    useEffect(() => {
        fetchFullQueueData();
        
        const settingsRef = doc(db, 'settings', 'appConfig');
        const unsubSettings = onSnapshot(settingsRef, (doc) => {
            if (doc.exists()) setAppSettings(doc.data() as AppSettings);
        });
        return () => unsubSettings();
    }, [fetchFullQueueData]);

    const navigateToTask = (index: number) => {
        if (index >= 0 && index < filteredQueueIds.length) {
            setCurrentIndex(index);
        }
    }
    
    const handleTaskUpdate = (updatedTask: Task) => {
        if (onInteractionLogged && updatedTask.completed) {
            onInteractionLogged();
        }
        setTaskQueue(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
    };

    const handleBackendTaskUpdate = async (taskId: string, update: Partial<Task>) => {
        const taskRef = doc(db, "tasks", taskId);
        await updateDoc(taskRef, update);
    }
    
    const onInteractionLogged = () => {
        setTaskQueue(prev => prev.map(t => t.id === currentTaskId ? { ...t, completed: true } : t));
         if (currentTaskId) {
            handleBackendTaskUpdate(currentTaskId, { completed: true });
        }
    };

    const handleLeadUpdate = (updatedLead: Lead) => {
        setLeadsCache(prev => ({ ...prev, [updatedLead.id]: updatedLead }));
    }

    const handleDefer = async (duration: Duration) => {
        if (!currentTask) return;
        const newDueDate = add(new Date(), duration);
        const updatedTask = { ...currentTask, dueDate: newDueDate.toISOString() };
        handleTaskUpdate(updatedTask);
        await handleBackendTaskUpdate(currentTask.id, { dueDate: newDueDate });
        toast({ title: "Task Deferred", description: `New due date: ${format(newDueDate, 'PP p')}`});
    }

    const handleToggleComplete = async () => {
        if (!currentTask) return;
        const newCompletedStatus = !currentTask.completed;
        const updatedTask = { ...currentTask, completed: newCompletedStatus };
        handleTaskUpdate(updatedTask);
        await handleBackendTaskUpdate(currentTask.id, { completed: newCompletedStatus });
    }
    
    if (isLoading) {
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
                        <p className="text-xs text-muted-foreground">{filteredQueueIds.length > 0 ? currentIndex + 1 : 0} / {filteredQueueIds.length}</p>
                    </div>
                </div>
                 <div className="flex items-center gap-1">
                    {availableCourses.length > 0 && (
                         <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <Book className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setSelectedCourse(null)}>All Courses</DropdownMenuItem>
                                <DropdownMenuSeparator/>
                                {availableCourses.map(course => (
                                    <DropdownMenuItem key={course} onClick={() => setSelectedCourse(course)}>
                                        {course}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                     {currentTask && (
                        <>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentTask.completed}>
                                        <Clock className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => handleDefer({ hours: 2 })}>2 hours</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleDefer({ hours: endOfDay(new Date()).getHours() - new Date().getHours() })}>End of day</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleDefer({ days: 1 })}>Tomorrow</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleDefer({ days: 3 })}>3 days</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleToggleComplete}>
                                <Check className="h-4 w-4" />
                            </Button>
                        </>
                    )}
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
                                {taskQueue.filter(t => filteredQueueIds.includes(t.id)).map((task, index) => (
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

                <main className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-2 sm:p-4 md:p-6">
                         {currentTask && appSettings ? (
                            <FocusView 
                                lead={currentLead}
                                task={currentTask}
                                appSettings={appSettings}
                                onInteractionLogged={onInteractionLogged}
                                onLeadUpdate={handleLeadUpdate}
                                onTaskUpdate={handleTaskUpdate}
                            />
                        ) : (
                             <div className="flex h-full items-center justify-center">
                                <p>Task not found or queue is empty.</p>
                             </div>
                        )}
                    </div>

                    {!isMobile && (
                        <footer className="bg-card/80 backdrop-blur-sm border-t p-2 flex items-center justify-center gap-4 sticky bottom-0 z-20">
                             <Button variant="outline" size="icon" onClick={() => navigateToTask(0)} disabled={currentIndex <= 0}>
                                <ChevronsLeft />
                            </Button>
                            <Button variant="outline" size="icon" onClick={() => navigateToTask(currentIndex - 1)} disabled={currentIndex <= 0}>
                                <ChevronLeft />
                            </Button>
                            <Button variant="default" size="lg" onClick={() => navigateToTask(currentIndex + 1)} disabled={currentIndex >= filteredQueueIds.length - 1}>
                                Next Task
                                <ChevronRight />
                            </Button>
                            <Button variant="outline" size="icon" onClick={() => navigateToTask(filteredQueueIds.length - 1)} disabled={currentIndex >= filteredQueueIds.length - 1}>
                                <ChevronsRight />
                            </Button>
                        </footer>
                    )}
                </main>
            </div>

            {isMobile && (
                <footer className="bg-card border-t p-2 flex items-center justify-center gap-4 sticky bottom-0 z-20">
                     <Button variant="outline" size="icon" onClick={() => navigateToTask(0)} disabled={currentIndex <= 0}>
                        <ChevronsLeft />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => navigateToTask(currentIndex - 1)} disabled={currentIndex <= 0}>
                        <ChevronLeft />
                    </Button>
                    <Button variant="default" size="lg" onClick={() => navigateToTask(currentIndex + 1)} disabled={currentIndex >= filteredQueueIds.length - 1}>
                        Next
                        <ChevronRight />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => navigateToTask(filteredQueueIds.length - 1)} disabled={currentIndex >= filteredQueueIds.length - 1}>
                        <ChevronsRight />
                    </Button>
                </footer>
            )}
        </div>
    );
}
