

"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { collection, query, where, getDocs, getDoc, doc, onSnapshot, updateDoc, arrayUnion } from 'firebase/firestore';
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

const PAGE_SIZE = 20;

export default function RegularFocusPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const isMobile = useIsMobile();
    
    const queueIds = useMemo(() => searchParams.get('queue')?.split(',') || [], [searchParams]);

    const [allLeads, setAllLeads] = useState<Lead[]>([]);
    const [allTasks, setAllTasks] = useState<Task[]>([]);
    const [isLeadQueue, setIsLeadQueue] = useState(false);
    
    const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

    const [isLoading, setIsLoading] = useState(true);
    const [isQueueVisible, setIsQueueVisible] = useState(true);
    const [currentPage, setCurrentPage] = useState(0);

    const [filteredQueue, setFilteredQueue] = useState<(Lead | Task)[]>([]);
    const [selectedCourse, setSelectedCourse] = useState<string | null>(null);

    useEffect(() => {
        // Determine if we are dealing with leads or tasks based on URL or first ID
        // This is a heuristic. A more robust way might be an explicit query param.
        const firstId = queueIds[0];
        if (firstId && !isNaN(Date.parse(firstId.split('-')[0]))) {
           setIsLeadQueue(false);
        } else if (firstId) {
            setIsLeadQueue(true);
        }
    }, [queueIds]);
    

    const currentItem = useMemo(() => {
        if (filteredQueue.length === 0) return null;
        const index = currentPage * PAGE_SIZE;
        return filteredQueue[index];
    }, [filteredQueue, currentPage]);

    const currentLead = useMemo(() => {
        if (!currentItem) return null;
        if (isLeadQueue) return currentItem as Lead;
        return allLeads.find(l => l.id === (currentItem as Task).leadId);
    }, [currentItem, allLeads, isLeadQueue]);

    const currentTask = useMemo(() => {
        if (!currentItem) return null;
        if (!isLeadQueue) return currentItem as Task;
        // Create a dummy task for lead-based follow-ups
        if (currentLead) {
            return {
                id: `afc-${currentLead.id}-${currentLead.afc_step}`,
                leadId: currentLead.id,
                leadName: currentLead.name,
                description: `Day ${currentLead.afc_step} Follow-up`,
                completed: false,
                createdAt: new Date().toISOString(),
                nature: 'Interactive'
            } as Task;
        }
        return null;
    }, [currentItem, currentLead, isLeadQueue]);


    const paginatedItems = useMemo(() => {
        const start = currentPage * PAGE_SIZE;
        const end = start + PAGE_SIZE;
        return filteredQueue.slice(start, end);
    }, [filteredQueue, currentPage]);

    const fetchQueueData = useCallback(async () => {
        if (queueIds.length === 0) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);

        try {
            const BATCH_SIZE = 30;
            if (isLeadQueue) {
                 const leadsData: Lead[] = [];
                for (let i = 0; i < queueIds.length; i += BATCH_SIZE) {
                    const batchIds = queueIds.slice(i, i + BATCH_SIZE);
                    const q = query(collection(db, "leads"), where('__name__', 'in', batchIds));
                    const snapshot = await getDocs(q);
                    snapshot.forEach(d => leadsData.push({ id: d.id, ...d.data() } as Lead));
                }
                leadsData.sort((a, b) => (a.afc_step || 0) - (b.afc_step || 0));
                setAllLeads(leadsData);
                setFilteredQueue(leadsData);
            } else { // It's a task queue
                const tasksData: Task[] = [];
                 for (let i = 0; i < queueIds.length; i += BATCH_SIZE) {
                    const batchIds = queueIds.slice(i, i + BATCH_SIZE);
                    const q = query(collection(db, "tasks"), where('__name__', 'in', batchIds));
                    const snapshot = await getDocs(q);
                    snapshot.forEach(d => tasksData.push({ id: d.id, ...d.data() } as Task));
                }
                 tasksData.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                 setAllTasks(tasksData);
                 setFilteredQueue(tasksData);

                 // Fetch associated leads
                const leadIds = [...new Set(tasksData.map(t => t.leadId).filter(Boolean))];
                const leadsData: Lead[] = [];
                 for (let i = 0; i < leadIds.length; i += BATCH_SIZE) {
                    const batchIds = leadIds.slice(i, i + BATCH_SIZE);
                    const q = query(collection(db, "leads"), where('__name__', 'in', batchIds));
                    const snapshot = await getDocs(q);
                    snapshot.forEach(d => leadsData.push({ id: d.id, ...d.data() } as Lead));
                }
                setAllLeads(leadsData);
            }
        } catch (error) {
            console.error("Error fetching queue data:", error);
            toast({ variant: 'destructive', title: 'Failed to load routine data.' });
        } finally {
            setIsLoading(false);
        }
    }, [queueIds, toast, isLeadQueue]);

    const availableCourses = useMemo(() => {
        const allCourses = new Set<string>();
        allLeads.forEach(lead => {
            lead.commitmentSnapshot?.deals?.forEach(deal => {
                deal.courses.forEach(course => allCourses.add(course));
            });
        });
        return Array.from(allCourses).sort();
    }, [allLeads]);

    useEffect(() => {
        const sourceQueue = isLeadQueue ? allLeads : allTasks;
        if (selectedCourse) {
            const filtered = sourceQueue.filter(item => {
                const leadId = isLeadQueue ? (item as Lead).id : (item as Task).leadId;
                const lead = allLeads.find(l => l.id === leadId);
                return lead?.commitmentSnapshot?.deals?.some(deal => deal.courses.includes(selectedCourse));
            });
            setFilteredQueue(filtered);
        } else {
            setFilteredQueue(sourceQueue);
        }
        setCurrentPage(0);
    }, [selectedCourse, allLeads, allTasks, isLeadQueue]);


    useEffect(() => {
        fetchQueueData();
        const settingsRef = doc(db, 'settings', 'appConfig');
        const unsubSettings = onSnapshot(settingsRef, (doc) => {
            if (doc.exists()) setAppSettings(doc.data() as AppSettings);
        });
        return () => unsubSettings();
    }, [fetchQueueData]);
    
    const handleTaskUpdate = (updatedTask: Task) => {
        if (!isLeadQueue) {
            setAllTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
             const taskRef = doc(db, "tasks", updatedTask.id);
             updateDoc(taskRef, { completed: updatedTask.completed, dueDate: updatedTask.dueDate });
        }
    }
    
    const onInteractionLogged = () => {
       if (currentTask) handleTaskUpdate({...currentTask, completed: true });
    };

    const handleLeadUpdate = (updatedLead: Lead) => {
        setAllLeads(prev => prev.map(l => l.id === updatedLead.id ? updatedLead : l));
    }
    
    if (isLoading) {
        return <div className="flex h-screen items-center justify-center"><Logo className="h-12 w-12 animate-spin text-primary" /></div>;
    }

    const totalPages = Math.ceil(filteredQueue.length / PAGE_SIZE);

    return (
        <div className="flex flex-col h-screen bg-background">
            <header className="bg-card border-b p-3 flex items-center justify-between sticky top-0 z-20 h-14">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                        <Link href="/"><ArrowLeft/></Link>
                    </Button>
                    <div className="flex items-baseline gap-2">
                        <h1 className="text-base font-bold tracking-tight">Focus Mode</h1>
                        <p className="text-xs text-muted-foreground">{filteredQueue.length > 0 ? (currentPage * PAGE_SIZE) + 1 : 0} / {filteredQueue.length}</p>
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
                                {paginatedItems.map((item) => {
                                    const isCurrent = item.id === currentItem?.id;
                                    const lead = isLeadQueue ? item as Lead : allLeads.find(l => l.id === (item as Task).leadId);
                                    const task = isLeadQueue ? null : item as Task;
                                    return (
                                        <button 
                                            key={item.id} 
                                            onClick={() => setCurrentPage(paginatedItems.findIndex(i => i.id === item.id) / PAGE_SIZE)}
                                            className={cn(
                                                "block w-full text-left p-3 rounded-lg border",
                                                isCurrent ? "bg-primary/10 border-primary" : "hover:bg-muted/50",
                                                task?.completed && "opacity-50 line-through"
                                            )}
                                        >
                                            <p className="font-semibold text-sm truncate">{isLeadQueue ? lead?.name : task?.description}</p>
                                            <p className="text-xs text-muted-foreground truncate">{isLeadQueue ? `AFC Step: ${lead?.afc_step}` : lead?.name}</p>
                                        </button>
                                    )
                                })}
                            </div>
                        </ScrollArea>
                    </aside>
                )}

                <main className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-2 sm:p-4 md:p-6">
                         {currentLead && currentTask && appSettings ? (
                            <FocusView 
                                lead={currentLead}
                                task={currentTask}
                                appSettings={appSettings}
                                onInteractionLogged={onInteractionLogged}
                                onLeadUpdate={handleLeadUpdate}
                                onTaskUpdate={handleTaskUpdate}
                            />
                        ) : (
                             <div className="flex h-full items-center justify-center text-center">
                                <p className="text-muted-foreground">No items in this queue{selectedCourse ? ' for this course' : ''}.</p>
                             </div>
                        )}
                    </div>

                    {!isMobile && (
                        <footer className="bg-card/80 backdrop-blur-sm border-t p-2 flex items-center justify-center gap-4 sticky bottom-0 z-20">
                             <Button variant="outline" size="icon" onClick={() => setCurrentPage(0)} disabled={currentPage <= 0}>
                                <ChevronsLeft />
                            </Button>
                            <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage <= 0}>
                                <ChevronLeft />
                            </Button>
                            <Button variant="default" size="lg" onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage >= totalPages - 1}>
                                Next Page
                                <ChevronRight />
                            </Button>
                            <Button variant="outline" size="icon" onClick={() => setCurrentPage(totalPages - 1)} disabled={currentPage >= totalPages - 1}>
                                <ChevronsRight />
                            </Button>
                        </footer>
                    )}
                </main>
            </div>

            {isMobile && (
                <footer className="bg-card border-t p-2 flex items-center justify-center gap-4 sticky bottom-0 z-20">
                     <Button variant="outline" size="icon" onClick={() => setCurrentPage(0)} disabled={currentPage <= 0}>
                        <ChevronsLeft />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage <= 0}>
                        <ChevronLeft />
                    </Button>
                    <Button variant="default" size="lg" onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage >= totalPages - 1}>
                        Next
                        <ChevronRight />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => setCurrentPage(totalPages - 1)} disabled={currentPage >= totalPages - 1}>
                        <ChevronsRight />
                    </Button>
                </footer>
            )}
        </div>
    );
}
