
"use client"

import { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, query, where, getDocs, orderBy, doc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { isAfter, isBefore, isSameDay, parseISO, startOfDay, endOfDay, addDays } from 'date-fns';
import { CalendarDays, Check, Edit, X, Loader2, CalendarClock } from 'lucide-react';
import Link from 'next/link';

import { db } from '@/lib/firebase';
import type { Interaction, Lead } from '@/lib/types';
import { Logo } from '@/components/icons';
import { useToast } from '@/hooks/use-toast';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import { produce } from 'immer';
import { DateTimePicker } from '@/components/date-time-picker';

type EventInteraction = Interaction & { leadId: string; leadName?: string };

const toDate = (dateValue: any): Date | null => {
  if (!dateValue) return null;
  if (typeof dateValue === 'string') return parseISO(dateValue);
  if (dateValue.toDate) return dateValue.toDate();
  return null;
};

export default function EventsPage() {
  const [events, setEvents] = useState<EventInteraction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);
  const [rescheduleEvent, setRescheduleEvent] = useState<EventInteraction | null>(null);
  const [newDateTime, setNewDateTime] = useState<Date | undefined>(undefined);
  const [isDateTimePickerOpen, setIsDateTimePickerOpen] = useState(false);
  const { toast } = useToast();

  const fetchEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const leadsQuery = query(
        collection(db, "leads"),
        where("interactions", "!=", [])
      );
      const leadsSnapshot = await getDocs(leadsQuery);
      
      const allEvents: EventInteraction[] = [];
      
      leadsSnapshot.forEach(doc => {
        const lead = { id: doc.id, ...doc.data() } as Lead;
        const leadEvents = (lead.interactions || [])
          .filter(i => i.outcome === "Event Scheduled" && i.eventDetails?.status === 'Scheduled')
          .map(i => ({...i, leadId: lead.id, leadName: lead.name } as EventInteraction));
        allEvents.push(...leadEvents);
      });
      
      allEvents.sort((a, b) => toDate(a.eventDetails!.dateTime)!.getTime() - toDate(b.eventDetails!.dateTime)!.getTime());

      setEvents(allEvents);

    } catch (error) {
      console.error("Error fetching events:", error);
      toast({ variant: "destructive", title: "Failed to fetch events." });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleEventAction = async (event: EventInteraction, action: 'complete' | 'cancel') => {
    setIsActionLoading(event.id);
    try {
      const leadRef = doc(db, "leads", event.leadId);
      const leadDoc = await getDoc(leadRef);
      if (!leadDoc.exists()) throw new Error("Lead not found");

      const leadData = leadDoc.data() as Lead;
      const updatedInteractions = produce(leadData.interactions || [], draft => {
        const interactionIndex = draft.findIndex(i => i.id === event.id);
        if (interactionIndex !== -1 && draft[interactionIndex].eventDetails) {
          draft[interactionIndex].eventDetails!.status = action === 'complete' ? 'Completed' : 'Cancelled';
        }
      });
      
      const newLog: Interaction = {
        id: `log-${Date.now()}`,
        createdAt: new Date().toISOString(),
        notes: `Event ${event.eventDetails?.type} marked as ${action === 'complete' ? 'Completed' : 'Cancelled'}.`
      }
      
      // We need two updates because one adds an element and the other modifies one.
      // Firestore doesn't support this in a single operation without reading the doc first, which we've done.
      await updateDoc(leadRef, { interactions: updatedInteractions });
      await updateDoc(leadRef, { interactions: arrayUnion(newLog) });
      

      toast({ title: `Event ${action === 'complete' ? 'Completed' : 'Cancelled'}` });
      await fetchEvents();
    } catch (error) {
      toast({ variant: 'destructive', title: `Failed to ${action} event.` });
      console.error(error);
    } finally {
      setIsActionLoading(null);
    }
  };

  const handleReschedule = async () => {
    if (!rescheduleEvent || !newDateTime) return;
    setIsActionLoading(rescheduleEvent.id);
    try {
      const leadRef = doc(db, 'leads', rescheduleEvent.leadId);
      const leadDoc = await getDoc(leadRef);
      if (!leadDoc.exists()) throw new Error("Lead not found");

      const leadData = leadDoc.data() as Lead;

      // 1. Mark original event as cancelled
      const interactionsWithCancelled = produce(leadData.interactions || [], draft => {
        const interactionIndex = draft.findIndex(i => i.id === rescheduleEvent.id);
        if (interactionIndex !== -1 && draft[interactionIndex].eventDetails) {
          draft[interactionIndex].eventDetails!.status = 'Cancelled';
        }
      });
      
      // 2. Add new event
      const newEventLog: Interaction = {
        id: `evt-${Date.now()}`,
        createdAt: new Date().toISOString(),
        outcome: "Event Scheduled",
        eventDetails: {
          ...rescheduleEvent.eventDetails!,
          dateTime: newDateTime.toISOString(),
          status: 'Scheduled',
          rescheduledFrom: rescheduleEvent.eventDetails!.dateTime,
        },
        notes: `Event rescheduled from ${format(toDate(rescheduleEvent.eventDetails!.dateTime)!, 'PPp')}`
      }
      
      await updateDoc(leadRef, { interactions: interactionsWithCancelled });
      await updateDoc(leadRef, { interactions: arrayUnion(newEventLog) });
      

      toast({ title: "Event Rescheduled" });
      setRescheduleEvent(null);
      setNewDateTime(undefined);
      await fetchEvents();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Failed to reschedule event.' });
      console.error(error);
    } finally {
      setIsActionLoading(null);
    }
  };

  const openRescheduleDialog = (event: EventInteraction) => {
    setRescheduleEvent(event);
    setNewDateTime(toDate(event.eventDetails?.dateTime) || new Date());
    setIsDateTimePickerOpen(true);
  }

  const categorizedEvents = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);
    const tomorrow = startOfDay(addDays(now, 1));
    const dayAfterTomorrow = endOfDay(addDays(now, 1));

    const recent: EventInteraction[] = [];
    const todayEvents: EventInteraction[] = [];
    const tomorrowEvents: EventInteraction[] = [];
    const later: EventInteraction[] = [];

    events.forEach(event => {
      const eventDate = toDate(event.eventDetails!.dateTime);
      if (!eventDate) return;
      if (isBefore(eventDate, today)) {
        recent.push(event);
      } else if (isSameDay(eventDate, today)) {
        todayEvents.push(event);
      } else if (isAfter(eventDate, today) && isBefore(eventDate, dayAfterTomorrow)) {
        tomorrowEvents.push(event);
      } else {
        later.push(event);
      }
    });
    
    const sortAsc = (a: EventInteraction, b: EventInteraction) => toDate(a.eventDetails!.dateTime)!.getTime() - toDate(b.eventDetails!.dateTime)!.getTime();
    
    // Sort recent/overdue to show most recent first (which is largest time diff from now)
    const sortDesc = (a: EventInteraction, b: EventInteraction) => toDate(b.eventDetails!.dateTime)!.getTime() - toDate(a.eventDetails!.dateTime)!.getTime();

    return { 
      recent: recent.sort(sortDesc), 
      today: todayEvents.sort(sortAsc), 
      tomorrow: tomorrowEvents.sort(sortAsc), 
      later: later.sort(sortAsc) 
    };
  }, [events]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Logo className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="bg-card border-b p-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          <CalendarDays className="h-8 w-8 text-primary hidden sm:block" />
          <h1 className="text-xl font-bold tracking-tight">Events</h1>
        </div>
      </header>
      <main className="flex-1 p-4 sm:p-6 md:p-8">
        {events.length === 0 ? (
           <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 h-[60vh] text-center text-muted-foreground">
            <CalendarClock className="h-16 w-16 mb-4" />
            <h2 className="text-2xl font-semibold text-foreground">
              No upcoming events
            </h2>
            <p className="mt-2 max-w-xs">
              Scheduled meetings and visits will appear here once you log them for a contact.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {categorizedEvents.recent.length > 0 && <EventCategory title="Recent & Overdue" events={categorizedEvents.recent} onAction={handleEventAction} onReschedule={openRescheduleDialog} isLoading={isActionLoading} />}
            {categorizedEvents.today.length > 0 && <EventCategory title="Today" events={categorizedEvents.today} onAction={handleEventAction} onReschedule={openRescheduleDialog} isLoading={isActionLoading} />}
            {categorizedEvents.tomorrow.length > 0 && <EventCategory title="Tomorrow" events={categorizedEvents.tomorrow} onAction={handleEventAction} onReschedule={openRescheduleDialog} isLoading={isActionLoading} />}
            {categorizedEvents.later.length > 0 && <EventCategory title="Later" events={categorizedEvents.later} onAction={handleEventAction} onReschedule={openRescheduleDialog} isLoading={isActionLoading} />}
          </div>
        )}
      </main>

       <DateTimePicker 
          isOpen={isDateTimePickerOpen}
          onClose={() => {
            setIsDateTimePickerOpen(false);
            setRescheduleEvent(null);
          }}
          onSelect={(date) => {
            setNewDateTime(date);
            handleReschedule();
          }}
          initialDate={newDateTime}
       />
    </div>
  );
}

function EventCategory({ title, events, onAction, onReschedule, isLoading }: { title: string, events: EventInteraction[], onAction: (event: EventInteraction, action: 'complete' | 'cancel') => void, onReschedule: (event: EventInteraction) => void, isLoading: string | null }) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {events.map(event => {
           const eventDate = toDate(event.eventDetails!.dateTime)!;
           return (
            <Card key={event.id}>
              <CardHeader>
                <CardTitle className="text-lg">{event.eventDetails?.type}</CardTitle>
                <CardDescription>
                  <Link href={`/contacts/${event.leadId}`} className="hover:underline">{event.leadName}</Link>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="font-semibold">{format(eventDate, 'PPP')}</p>
                <p className="text-muted-foreground">{format(eventDate, 'p')}</p>
              </CardContent>
              <CardFooter className="flex justify-end gap-2">
                 <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" disabled={isLoading === event.id}>
                      {isLoading === event.id ? <Loader2 className="animate-spin" /> : 'Actions'}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => onAction(event, 'complete')}>
                      <Check className="mr-2 h-4 w-4"/> Mark Complete
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onReschedule(event)}>
                      <Edit className="mr-2 h-4 w-4"/> Reschedule
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onAction(event, 'cancel')} className="text-destructive">
                      <X className="mr-2 h-4 w-4"/> Cancel
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardFooter>
            </Card>
           )
        })}
      </div>
    </section>
  )
}
