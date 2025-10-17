

"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { collection, query, where, getDocs, doc, onSnapshot, getDoc, updateDoc } from 'firebase/firestore';
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, Sparkles, Check, Clock } from 'lucide-react';
import Link from 'next/link';
import { add, endOfDay } from 'date-fns';

import { db } from '@/lib/firebase';
import type { Lead, Task, AppSettings } from '@/lib/types';
import { Logo } from '@/components/icons';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FocusView } from '@/components/focus-view';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export default function HotFollowupFocusPage() {
    const params = useParams();
    const { toast } = useToast();
    
    const slug = params.slug as string[];
    const queueIds = useMemo(() => slug, [slug]);

    const [leads, setLeads] = useState<Lead[]>([]);
    const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const [carouselApi, setCarouselApi] = useState<CarouselApi>()
    const [currentIndex, setCurrentIndex] = useState(0);

    const currentLead = useMemo(() => leads[currentIndex], [leads, currentIndex]);
    const [task, setTask] = useState<Task | null>(null);
    
    useEffect(() => {
        if (currentLead) {
            const dummyTask: Task = {
                id: `hot-${currentLead.id}`,
                description: 'Hot Follow-up',
                completed: false,
                leadId: currentLead.id,
                leadName: currentLead.name,
                nature: 'Interactive',
                createdAt: new Date().toISOString(),
            };
            setTask(dummyTask);
        }
    }, [currentLead]);


    const fetchLeads = useCallback(async () => {
        if (queueIds.length === 0) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const leadsData: Lead[] = [];
            const BATCH_SIZE = 30; // Firestore 'in' query limit

            for (let i = 0; i < queueIds.length; i += BATCH_SIZE) {
                const batchIds = queueIds.slice(i, i + BATCH_SIZE);
                if (batchIds.length > 0) {
                    const q = query(collection(db, "leads"), where('__name__', 'in', batchIds));
                    const snapshot = await getDocs(q);
                    const batchLeads = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Lead));
                    leadsData.push(...batchLeads);
                }
            }
            
            const orderedLeads = queueIds.map(id => leadsData.find(l => l.id === id)).filter(Boolean) as Lead[];
            setLeads(orderedLeads);
            
            const initialLeadId = slug[0];
            const initialIndex = orderedLeads.findIndex(l => l.id === initialLeadId);
            if (initialIndex !== -1) {
                setCurrentIndex(initialIndex);
                if (carouselApi) {
                    carouselApi.scrollTo(initialIndex, true);
                }
            }

        } catch (error) {
            console.error("Error fetching leads:", error);
            toast({ variant: 'destructive', title: 'Failed to load leads.' });
        } finally {
            setIsLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queueIds, toast]);

     useEffect(() => {
        fetchLeads();
        
        const settingsRef = doc(db, 'settings', 'appConfig');
        const unsubSettings = onSnapshot(settingsRef, (doc) => {
            if (doc.exists()) setAppSettings(doc.data() as AppSettings);
        });

        return () => unsubSettings();
    }, [fetchLeads]);

    useEffect(() => {
        if (!carouselApi) return;
        
        const handleSelect = () => {
            setCurrentIndex(carouselApi.selectedScrollSnap());
        };
        
        carouselApi.on("select", handleSelect);
        
        return () => {
            carouselApi.off("select", handleSelect);
        };
    }, [carouselApi]);

    const navigate = (index: number) => {
        if (carouselApi && index >= 0 && index < leads.length) {
            carouselApi.scrollTo(index);
        }
    };
    
    const handleLeadUpdate = (updatedLead: Lead) => {
        setLeads(prevLeads => prevLeads.map(l => l.id === updatedLead.id ? updatedLead : l));
    }
    
    const handleTaskUpdate = (updatedTask: Task) => {
        setTask(updatedTask);
    }
    
    const handleDefer = async (duration: Duration) => {
        if (!task) return;
        const newDueDate = add(new Date(), duration);
        const updatedTask = { ...task, dueDate: newDueDate.toISOString() };
        handleTaskUpdate(updatedTask);
        toast({ title: "Task Deferred", description: `New due date: ${format(newDueDate, 'PP p')}`});
    }

    if (isLoading || !appSettings) {
        return <div className="flex h-screen items-center justify-center"><Logo className="h-12 w-12 animate-spin text-primary" /></div>;
    }

    if (leads.length === 0) {
        return (
             <div className="flex h-screen items-center justify-center text-center">
                <div>
                    <Sparkles className="mx-auto h-12 w-12 text-muted-foreground" />
                    <h2 className="mt-4 text-xl font-semibold">No Leads in Queue</h2>
                    <p className="mt-2 text-sm text-muted-foreground">This routine queue is empty.</p>
                    <Button asChild className="mt-4">
                        <Link href="/">Back to Routines</Link>
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
                        <h1 className="text-base font-bold tracking-tight">Hot Follow-ups</h1>
                        <p className="text-xs text-muted-foreground">{currentIndex + 1} / {leads.length}</p>
                    </div>
                </div>
                 {task && (
                    <div className="flex items-center gap-1">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={task.completed}>
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
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleTaskUpdate({...task, completed: !task.completed })}>
                            <Check className="h-4 w-4" />
                        </Button>
                    </div>
                )}
            </header>

            <Carousel setApi={setCarouselApi} className="flex-1 flex flex-col overflow-hidden">
                <div className="p-2 border-b">
                    <div className="flex items-center justify-center">
                         <CarouselContent>
                            {leads.map((lead, index) => (
                                <CarouselItem key={lead.id} onClick={() => navigate(index)} className="basis-auto">
                                    <div className={cn("text-center p-1 cursor-pointer", index === currentIndex ? "text-primary font-bold" : "text-muted-foreground")}>
                                        {lead.name.split(' ')[0].substring(0, 8)}
                                    </div>
                                </CarouselItem>
                            ))}
                        </CarouselContent>
                    </div>
                </div>
                
                <main className="flex-1 overflow-y-auto p-2 sm:p-4 md:p-6">
                    <CarouselContent>
                        {leads.map((lead) => {
                            const dummyTask: Task = {
                                id: `hot-${lead.id}`,
                                description: 'Hot Follow-up',
                                completed: false,
                                leadId: lead.id,
                                leadName: lead.name,
                                nature: 'Interactive',
                                createdAt: new Date().toISOString(),
                            };
                            return (
                                <CarouselItem key={lead.id}>
                                    {task && (
                                        <FocusView 
                                            lead={lead}
                                            task={task}
                                            appSettings={appSettings}
                                            onLeadUpdate={handleLeadUpdate}
                                            onInteractionLogged={() => handleTaskUpdate({...task, completed: true})}
                                            onTaskUpdate={handleTaskUpdate}
                                        />
                                    )}
                                </CarouselItem>
                            );
                        })}
                    </CarouselContent>
                </main>
            </Carousel>
             <footer className="bg-card/80 backdrop-blur-sm border-t p-2 flex items-center justify-center gap-4 sticky bottom-0 z-20">
                <Button variant="outline" size="icon" onClick={() => navigate(0)} disabled={currentIndex === 0}>
                    <ChevronsLeft />
                </Button>
                <Button variant="outline" size="icon" onClick={() => carouselApi?.scrollPrev()} disabled={!carouselApi?.canScrollPrev()}>
                    <ChevronLeft />
                </Button>
                <Button variant="default" size="lg" onClick={() => carouselApi?.scrollNext()} disabled={!carouselApi?.canScrollNext()}>
                    Next
                    <ChevronRight />
                </Button>
                <Button variant="outline" size="icon" onClick={() => navigate(leads.length - 1)} disabled={currentIndex >= leads.length - 1}>
                    <ChevronsRight />
                </Button>
            </footer>
        </div>
    );
}
