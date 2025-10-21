
"use client";

import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, Timestamp, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Task, Interaction, Lead } from '@/lib/types';
import { addHours, endOfDay, format, isAfter, parseISO, startOfToday } from 'date-fns';
import { CalendarClock, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import Link from 'next/link';
import { Separator } from './ui/separator';

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
    const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showAll, setShowAll] = useState(false);

    useEffect(() => {
        const fetchAgenda = async () => {
            setIsLoading(true);
            try {
                const todayStart = startOfToday();
                const todayEnd = endOfDay(todayStart);

                // 1. Fetch tasks for callbacks
                const tasksQuery = query(
                    collection(db, "tasks"),
                    where("dueDate", ">=", Timestamp.fromDate(todayStart)),
                    where("dueDate", "<=", Timestamp.fromDate(todayEnd)),
                    where("completed", "==", false),
                    orderBy("dueDate", "asc")
                );
                const tasksSnapshot = await getDocs(tasksQuery);
                const callbackTasks = tasksSnapshot.docs
                    .map(doc => doc.data() as Task)
                    // Only include tasks specifically created as "Scheduled Follow-up"
                    .filter(task => task.description === 'Scheduled Follow-up');

                const leadIds = new Set<string>();
                callbackTasks.forEach(task => {
                    if (task.leadId) leadIds.add(task.leadId);
                });

                // 2. Fetch leads with scheduled events today
                const eventsQuery = query(collection(db, "leads"), where("interactions", "!=", []));
                const leadsSnapshot = await getDocs(eventsQuery);

                const scheduledEvents: AgendaItem[] = [];
                leadsSnapshot.forEach(doc => {
                    const lead = { id: doc.id, ...doc.data() } as Lead;
                    const leadEvents = (lead.interactions || [])
                        .filter(i => {
                            if (i.outcome === "Event Scheduled" && i.eventDetails?.status === 'Scheduled') {
                                const eventDate = toDate(i.eventDetails.dateTime);
                                return eventDate && eventDate >= todayStart && eventDate <= todayEnd;
                            }
                            return false;
                        })
                        .map(i => ({
                            id: i.id,
                            time: toDate(i.eventDetails!.dateTime)!,
                            type: i.eventDetails!.type || "Event",
                            leadId: lead.id,
                            leadName: lead.name
                        }));
                    scheduledEvents.push(...leadEvents);
                    if (lead.id) {
                        leadIds.add(lead.id);
                    }
                });

                // 3. Fetch lead details for tasks if needed, in batches of 30
                const leadsMap = new Map<string, Lead>();
                const allLeadIds = Array.from(leadIds);

                for (let i = 0; i < allLeadIds.length; i += 30) {
                    const batchIds = allLeadIds.slice(i, i + 30);
                    if (batchIds.length > 0) {
                        const leadsDataQuery = query(collection(db, "leads"), where('__name__', 'in', batchIds));
                        const leadsDataSnapshot = await getDocs(leadsDataQuery);
                        leadsDataSnapshot.forEach(doc => {
                            leadsMap.set(doc.id, { id: doc.id, ...doc.data() } as Lead);
                        });
                    }
                }
                
                // 4. Combine and format
                const taskItems: AgendaItem[] = callbackTasks.map(task => ({
                    id: task.id,
                    time: toDate(task.dueDate)!,
                    type: "Callback",
                    leadId: task.leadId!,
                    leadName: leadsMap.get(task.leadId!)?.name || task.leadName,
                }));

                const allItems = [...taskItems, ...scheduledEvents].sort((a, b) => a.time.getTime() - b.time.getTime());

                setAgendaItems(allItems);
            } catch (error) {
                console.error("Failed to fetch today's agenda:", error);
                // Silently fail, don't show toast on dashboard
            } finally {
                setIsLoading(false);
            }
        };

        fetchAgenda();
    }, []);
    
    const visibleItems = useMemo(() => {
        if (showAll) {
            return agendaItems;
        }
        const threeHoursFromNow = addHours(new Date(), 3);
        return agendaItems.filter(item => isAfter(threeHoursFromNow, item.time));
    }, [agendaItems, showAll]);
    
    const hasMoreItems = agendaItems.length > visibleItems.length;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-4 rounded-lg border bg-card h-24">
                <Loader2 className="animate-spin text-muted-foreground" />
            </div>
        );
    }
    
    if (agendaItems.length === 0) {
        return (
             <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center h-24">
                <p className="text-sm font-medium">No time-sensitive events today</p>
                <p className="text-xs text-muted-foreground">Your agenda is clear.</p>
            </div>
        )
    }

    return (
        <div className="p-4 rounded-lg border bg-card">
            <h3 className="font-semibold text-sm mb-3">Today&apos;s Agenda</h3>
            <div className="space-y-4">
                {visibleItems.map((item, index) => (
                    <div key={`${item.id}-${item.time.toISOString()}`} className="flex items-start">
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
             {(visibleItems.length === 0 && !showAll) && (
                <p className="text-xs text-muted-foreground text-center py-2">Nothing in the next 3 hours. {hasMoreItems ? 'Expand to see full day.' : ''}</p>
             )}
             {hasMoreItems && (
                 <div className="mt-3">
                    <Separator className="mb-3"/>
                    <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => setShowAll(true)}>
                        See Full Day
                        <ChevronDown className="h-4 w-4 ml-1" />
                    </Button>
                </div>
            )}
        </div>
    )
}
