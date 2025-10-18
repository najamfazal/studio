

"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { onSnapshot, collection, query, where, getDocs, getDoc, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, Clock, Check, Book } from 'lucide-react';
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

export default function NewLeadFocusPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const isMobile = useIsMobile();
    
    const queueIds = useMemo(() => searchParams.get('queue')?.split(',') || [], [searchParams]);

    const [allLeads, setAllLeads] = useState<Lead[]>([]);
    const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

    const [isLoading, setIsLoading] = useState(true);
    const [isQueueVisible, setIsQueueVisible] = useState(true);

    const [currentPage, setCurrentPage] = useState(0);
    const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
    const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
    
    const currentLead = useMemo(() => filteredLeads[currentPage * PAGE_SIZE], [filteredLeads, currentPage]);
    
    const paginatedLeads = useMemo(() => {
        const start = currentPage * PAGE_SIZE;
        const end = start + PAGE_SIZE;
        return filteredLeads.slice(start, end);
    }, [filteredLeads, currentPage]);

    const fetchQueueData = useCallback(async () => {
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
                    snapshot.forEach(d => leadsData.push({ id: d.id, ...d.data() } as Lead));
                }
            }
            // Sort by assignedAt descending
            leadsData.sort((a, b) => new Date(b.assignedAt || 0).getTime() - new Date(a.assignedAt || 0).getTime());
            setAllLeads(leadsData);

        } catch (error) {
            console.error("Error fetching queue data:", error);
            toast({ variant: 'destructive', title: 'Failed to load routine data.' });
        } finally {
            setIsLoading(false);
        }
    }, [queueIds, toast]);

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
        let leads = [...allLeads];
        if (selectedCourse) {
            leads = allLeads.filter(lead => 
                lead.commitmentSnapshot?.deals?.some(deal => deal.courses.includes(selectedCourse))
            );
        }
        setFilteredLeads(leads);
        setCurrentPage(0);
    }, [selectedCourse, allLeads]);

    useEffect(() => {
        fetchQueueData();
        const settingsRef = doc(db, 'settings', 'appConfig');
        const unsubSettings = onSnapshot(settingsRef, (doc) => {
            if (doc.exists()) setAppSettings(doc.data() as AppSettings);
        });
        return () => unsubSettings();
    }, [fetchQueueData]);


    const navigateToLead = (index: number) => {
        if (index >= 0 && index < paginatedLeads.length) {
            setCurrentPage(Math.floor((currentPage * PAGE_SIZE + index) / PAGE_SIZE));
        }
    }

    const onInteractionLogged = async () => {
        if (!currentLead) return;
         // Optimistically update UI
        setAllLeads(prev => prev.filter(l => l.id !== currentLead.id));
        
        // Asynchronously update Firestore
        const leadRef = doc(db, "leads", currentLead.id);
        const newInteraction: Interaction = {
          id: `new-${Date.now()}`,
          quickLogType: 'Initiated',
          createdAt: new Date().toISOString(),
        } as Interaction;
        try {
            await updateDoc(leadRef, { 
              interactions: arrayUnion(newInteraction),
              hasEngaged: true, // Mark as engaged
            });
            toast({ title: 'Lead Engaged', description: `${currentLead.name} has been marked as engaged.`});
        } catch (error) {
            console.error("Failed to update lead engagement status", error);
            // Optionally revert UI state here if needed
        }
    };

    const handleLeadUpdate = (updatedLead: Lead) => {
        setAllLeads(prev => prev.map(l => l.id === updatedLead.id ? updatedLead : l));
    }
    
    if (isLoading) {
        return <div className="flex h-screen items-center justify-center"><Logo className="h-12 w-12 animate-spin text-primary" /></div>;
    }
    
    const totalPages = Math.ceil(filteredLeads.length / PAGE_SIZE);

    return (
        <div className="flex flex-col h-screen bg-background">
            <header className="bg-card border-b p-3 flex items-center justify-between sticky top-0 z-20 h-14">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                        <Link href="/"><ArrowLeft/></Link>
                    </Button>
                    <div className="flex items-baseline gap-2">
                        <h1 className="text-base font-bold tracking-tight">New Leads</h1>
                        <p className="text-xs text-muted-foreground">{filteredLeads.length > 0 ? (currentPage * PAGE_SIZE) + 1 : 0} / {filteredLeads.length}</p>
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
                                {paginatedLeads.map((lead, index) => (
                                     <button 
                                        key={lead.id} 
                                        onClick={() => navigateToLead(index)}
                                        className={cn(
                                            "block w-full text-left p-3 rounded-lg border",
                                            lead.id === currentLead?.id ? "bg-primary/10 border-primary" : "hover:bg-muted/50"
                                        )}
                                      >
                                        <p className="font-semibold text-sm truncate">{lead.name}</p>
                                        <p className="text-xs text-muted-foreground truncate">{lead.email || (lead.phones && lead.phones[0]?.number) || 'No contact info'}</p>
                                    </button>
                                ))}
                            </div>
                        </ScrollArea>
                    </aside>
                )}

                <main className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-2 sm:p-4 md:p-6">
                         {currentLead && appSettings ? (
                            <FocusView 
                                lead={currentLead}
                                task={{id: `new-${currentLead.id}`, leadId: currentLead.id, leadName: currentLead.name, description: "Initiate contact with this new lead.", completed: false, createdAt: currentLead.createdAt!, nature: 'Interactive'}}
                                appSettings={appSettings}
                                onInteractionLogged={onInteractionLogged}
                                onLeadUpdate={handleLeadUpdate}
                                onTaskUpdate={() => {}}
                            />
                        ) : (
                            <div className="flex h-full items-center justify-center text-center">
                                <p className="text-muted-foreground">No new leads in the queue{selectedCourse ? ' for this course' : ''}.</p>
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

