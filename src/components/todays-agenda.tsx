
"use client";

import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, Timestamp, orderBy, getCountFromServer } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Task, Interaction, Lead } from '@/lib/types';
import { addHours, endOfDay, format, isAfter, parseISO, startOfToday } from 'date-fns';
import { CalendarClock, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';

type AgendaItem = {
    id: string;
    time: Date;
    type: string;
    leadId: string;
    leadName: string;
};

const toDate = (dateValue: any): Date | null => {
  if (!dateValue) return null;
  if (typeof dateValue === 'string') return parseISO(dateValue);
  if (dateValue.toDate) return dateValue.toDate(); // Firestore Timestamp
  return null;
};

export function TodaysAgenda() {
    const [counts, setCounts] = useState<{ events: number, callbacks: number } | null>(null);
    const [detailedAgendaItems, setDetailedAgendaItems] = useState<AgendaItem[]>([]);
    const [isLoadingCounts, setIsLoadingCounts] = useState(true);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        const fetchCounts = async () => {
            setIsLoadingCounts(true);
            try {
                const todayStart = startOfToday();
                const todayEnd = endOfDay(todayStart);

                const tasksQuery = query(
                    collection(db, "tasks"),
                    where("dueDate", ">=", Timestamp.fromDate(todayStart)),
                    where("dueDate", "<=", Timestamp.fromDate(todayEnd)),
                    where("completed", "==", false),
                    where("description", "==", "Scheduled Follow-up")
                );

                const eventsQuery = query(
                    collection(db, "leads"),
                    where("interactions", "array-contains-any", [
                        // This is a workaround as Firestore doesn't support querying nested fields inside arrays effectively.
                        // This will fetch more than needed, but we'll filter client-side.
                        // For a large dataset, this should be optimized with a separate 'events' collection.
                    ])
                );
                 const leadsSnapshotForEvents = await getDocs(eventsQuery);
                 let eventsCount = 0;
                 leadsSnapshotForEvents.forEach(doc => {
                    const lead = doc.data() as Lead;
                    const todaysEvents = (lead.interactions || []).filter(i => {
                        if (i.outcome === "Event Scheduled" && i.eventDetails?.status === 'Scheduled') {
                            const eventDate = toDate(i.eventDetails.dateTime);
                            return eventDate && eventDate >= todayStart && eventDate <= todayEnd;
                        }
                        return false;
                    }).length;
                    eventsCount += todaysEvents;
                 });

                const tasksCountSnapshot = await getCountFromServer(tasksQuery);
                
                setCounts({
                    events: eventsCount,
                    callbacks: tasksCountSnapshot.data().count,
                });

            } catch (error) {
                console.error("Failed to fetch agenda counts:", error);
            } finally {
                setIsLoadingCounts(false);
            }
        };

        fetchCounts();
    }, []);

    const fetchDetailedAgenda = async () => {
        if (detailedAgendaItems.length > 0) return; // Don't refetch if we already have them

        setIsLoadingDetails(true);
        try {
            const todayStart = startOfToday();
            const todayEnd = endOfDay(todayStart);

            const tasksQuery = query(
                collection(db, "tasks"),
                where("dueDate", ">=", Timestamp.fromDate(todayStart)),
                where("dueDate", "<=", Timestamp.fromDate(todayEnd)),
                where("completed", "==", false),
                where("description", "==", "Scheduled Follow-up")
            );
            const tasksSnapshot = await getDocs(tasksQuery);
            const callbackTasks = tasksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));

            const leadIds = new Set<string>();
            callbackTasks.forEach(task => {
                if (task.leadId) leadIds.add(task.leadId);
            });

            const eventsQuery = query(collection(db, "leads"), where("interactions", "!=", []));
            const leadsSnapshot = await getDocs(eventsQuery);
            
            const scheduledEvents: AgendaItem[] = [];
            leadsSnapshot.forEach(doc => {
                const lead = { id: doc.id, ...doc.data() } as Lead;
                const leadEvents = (lead.interactions || []).filter(i => {
                    if (i.outcome === "Event Scheduled" && i.eventDetails?.status === 'Scheduled') {
                        const eventDate = toDate(i.eventDetails.dateTime);
                        return eventDate && eventDate >= todayStart && eventDate <= todayEnd;
                    }
                    return false;
                }).map(i => {
                    if (lead.id) leadIds.add(lead.id);
                    return {
                        id: `${i.id}-${i.eventDetails!.dateTime}`,
                        time: toDate(i.eventDetails!.dateTime)!,
                        type: i.eventDetails!.type || "Event",
                        leadId: lead.id,
                        leadName: lead.name
                    };
                });
                scheduledEvents.push(...leadEvents);
            });
            
            const leadsMap = new Map<string, Lead>();
            const allLeadIds = Array.from(leadIds);

            for (let i = 0; i < allLeadIds.length; i += 30) {
                const batchIds = allLeadIds.slice(i, i + 30);
                if (batchIds.length > 0) {
                    const leadsDataQuery = query(collection(db, "leads"), where('__name__', 'in', batchIds));
                    const leadsDataSnapshot = await getDocs(leadsDataQuery);
                    leadsDataSnapshot.forEach(doc => leadsMap.set(doc.id, { id: doc.id, ...doc.data() } as Lead));
                }
            }
            
            const taskItems: AgendaItem[] = callbackTasks.map(task => ({
                id: `${task.id}-${toDate(task.dueDate)?.toISOString()}`,
                time: toDate(task.dueDate)!,
                type: "Callback",
                leadId: task.leadId!,
                leadName: leadsMap.get(task.leadId!)?.name || task.leadName,
            }));

            const allItems = [...taskItems, ...scheduledEvents].sort((a, b) => a.time.getTime() - b.time.getTime());
            setDetailedAgendaItems(allItems);

        } catch (error) {
            console.error("Failed to fetch detailed agenda:", error);
        } finally {
            setIsLoadingDetails(false);
        }
    };

    const handleToggleExpand = () => {
        if (!isExpanded) {
            fetchDetailedAgenda();
        }
        setIsExpanded(!isExpanded);
    };

    if (isLoadingCounts) {
        return (
            <div className="flex items-center justify-center p-4 rounded-lg border bg-card h-24">
                <Loader2 className="animate-spin text-muted-foreground" />
            </div>
        );
    }
    
    if (!counts || (counts.events === 0 && counts.callbacks === 0)) {
        return (
             <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center h-24">
                <p className="text-sm font-medium">No time-sensitive events today</p>
                <p className="text-xs text-muted-foreground">Your agenda is clear.</p>
            </div>
        );
    }

    return (
        <div className="p-4 rounded-lg border bg-card">
            <div className="flex items-center justify-between cursor-pointer" onClick={handleToggleExpand}>
                <h3 className="font-semibold text-sm">Today&apos;s Agenda</h3>
                 <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-sm">
                        <span>{counts.events} Events</span>
                        <Separator orientation="vertical" className="h-4" />
                        <span>{counts.callbacks} Callbacks</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                </div>
            </div>
            
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0, marginTop: 0 }}
                        animate={{ height: 'auto', opacity: 1, marginTop: '1rem' }}
                        exit={{ height: 0, opacity: 0, marginTop: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="overflow-hidden"
                    >
                        {isLoadingDetails ? (
                            <div className="flex items-center justify-center p-4">
                                <Loader2 className="animate-spin text-muted-foreground" />
                            </div>
                        ) : detailedAgendaItems.length > 0 ? (
                             <div className="space-y-4 pt-4 border-t">
                                {detailedAgendaItems.map(item => (
                                    <div key={item.id} className="flex items-start">
                                        <div className="flex flex-col items-center mr-3">
                                        <div className="text-xs font-bold text-primary">{format(item.time, 'h:mm')}</div>
                                        <div className="text-xs text-primary/80 -mt-1">{format(item.time, 'a')}</div>
                                        </div>
                                        <div className="flex-1 space-y-0.5">
                                            <Link href={`/contacts/${item.leadId}`} className="font-semibold text-sm hover:underline">{item.leadName}</Link>
                                            <p className="text-xs text-muted-foreground">{item.type}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-center text-xs text-muted-foreground pt-4 border-t">No items to display.</p>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
