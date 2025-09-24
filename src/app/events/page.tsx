
"use client"

import { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, query, where, getDocs, orderBy, doc, updateDoc, addDoc } from 'firebase/firestore';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';

type EventInteraction = Interaction & { leadName?: string };

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
  const { toast } = useToast();

  const fetchEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const eventsQuery = query(
        collection(db, "interactions"),
        where("outcome", "==", "Event Scheduled"),
        orderBy("eventDetails.dateTime", "desc")
      );
      const eventsSnapshot = await getDocs(eventsQuery);
      
      const leadIds = [...new Set(eventsSnapshot.docs.map(d => d.data().leadId))];
      const leadsData: Record<string, Lead> = {};

      if (leadIds.length > 0) {
        const leadsQuery = query(collection(db, "leads"), where("__name__", "in", leadIds));
        const leadsSnapshot = await getDocs(leadsQuery);
        leadsSnapshot.forEach(doc => {
          leadsData[doc.id] = { id: doc.id, ...doc.data() } as Lead;
        });
      }
      
      const eventsData = eventsSnapshot.docs.map(doc => {
        const interaction = { id: doc.id, ...doc.data() } as Interaction;
        return {
          ...interaction,
          leadName: leadsData[interaction.leadId]?.name || 'Unknown Contact'
        };
      }).filter(event => event.eventDetails?.status !== 'Cancelled' && event.eventDetails?.status !== 'Completed');

      setEvents(eventsData);

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

  const handleEventAction = async (eventId: string, leadId: string, action: 'complete' | 'cancel') => {
    setIsActionLoading(eventId);
    try {
      const eventRef = doc(db, "interactions", eventId);
      await updateDoc(eventRef, { "eventDetails.status": action === 'complete' ? 'Completed' : 'Cancelled' });
      
      const logMessage = `Event marked as ${action === 'complete' ? 'Completed' : 'Cancelled'}.`;
      await addDoc(collection(db, "interactions"), {
          leadId,
          createdAt: new Date().toISOString(),
          notes: logMessage
      });

      toast({ title: `Event ${action === 'complete' ? 'Completed' : 'Cancelled'}` });
      await fetchEvents();
    } catch (error) {
      toast({ variant: 'destructive', title: `Failed to ${action} event.` });
    } finally {
      setIsActionLoading(null);
    }
  };

  const handleReschedule = async () => {
    if (!rescheduleEvent || !newDateTime) return;
    setIsActionLoading(rescheduleEvent.id);
    try {
      const originalDateTime = rescheduleEvent.eventDetails?.dateTime;
      
      // Update original event to be cancelled
      const eventRef = doc(db, "interactions", rescheduleEvent.id);
      await updateDoc(eventRef, { "eventDetails.status": 'Cancelled' });

      // Create a new event
      await addDoc(collection(db, "interactions"), {
        leadId: rescheduleEvent.leadId,
        createdAt: new Date().toISOString(),
        outcome: "Event Scheduled",
        eventDetails: {
          ...rescheduleEvent.eventDetails,
          dateTime: newDateTime.toISOString(),
          status: 'Scheduled',
          rescheduledFrom: originalDateTime,
        },
        notes: `Event rescheduled from ${format(toDate(originalDateTime)!, 'PPp')}`
      });

      toast({ title: "Event Rescheduled" });
      setRescheduleEvent(null);
      setNewDateTime(undefined);
      await fetchEvents();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Failed to reschedule event.' });
    } finally {
      setIsActionLoading(null);
    }
  };

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

    return { recent, today: todayEvents, tomorrow: tomorrowEvents, later };
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
            {categorizedEvents.recent.length > 0 && <EventCategory title="Recent & Overdue" events={categorizedEvents.recent} onAction={handleEventAction} onReschedule={setRescheduleEvent} isLoading={isActionLoading} />}
            {categorizedEvents.today.length > 0 && <EventCategory title="Today" events={categorizedEvents.today} onAction={handleEventAction} onReschedule={setRescheduleEvent} isLoading={isActionLoading} />}
            {categorizedEvents.tomorrow.length > 0 && <EventCategory title="Tomorrow" events={categorizedEvents.tomorrow} onAction={handleEventAction} onReschedule={setRescheduleEvent} isLoading={isActionLoading} />}
            {categorizedEvents.later.length > 0 && <EventCategory title="Later" events={categorizedEvents.later} onAction={handleEventAction} onReschedule={setRescheduleEvent} isLoading={isActionLoading} />}
          </div>
        )}
      </main>

       <AlertDialog open={!!rescheduleEvent} onOpenChange={(open) => !open && setRescheduleEvent(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reschedule Event</AlertDialogTitle>
              <AlertDialogDescription>
                Select a new date and time for the event with {rescheduleEvent?.leadName}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex justify-center py-4">
               <Popover>
                <PopoverTrigger asChild>
                    <Button variant="outline">
                        <CalendarClock className="mr-2 h-4 w-4"/>
                        {newDateTime ? format(newDateTime, 'PPP p') : 'Select new date & time'}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                    <Calendar
                        mode="single"
                        selected={newDateTime}
                        onSelect={setNewDateTime}
                    />
                </PopoverContent>
               </Popover>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleReschedule} disabled={!newDateTime || !!isActionLoading}>
                {isActionLoading && <Loader2 className="animate-spin mr-2" />}
                Reschedule
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
       </AlertDialog>
    </div>
  );
}

function EventCategory({ title, events, onAction, onReschedule, isLoading }: { title: string, events: EventInteraction[], onAction: (id: string, leadId: string, action: 'complete' | 'cancel') => void, onReschedule: (event: EventInteraction) => void, isLoading: string | null }) {
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
                    <DropdownMenuItem onClick={() => onAction(event.id, event.leadId, 'complete')}>
                      <Check className="mr-2 h-4 w-4"/> Mark Complete
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onReschedule(event)}>
                      <Edit className="mr-2 h-4 w-4"/> Reschedule
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onAction(event.id, event.leadId, 'cancel')} className="text-destructive">
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
