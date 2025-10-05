
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  type DocumentData,
  type QuerySnapshot,
} from "firebase/firestore";
import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { addDays, format, isPast, isSameDay, isToday, startOfToday } from "date-fns";
import { AlertTriangle, Plus, ListTodo, ArrowRight, User, Users, Calendar, NotebookPen } from "lucide-react";

import { db } from "@/lib/firebase";
import type { Task, Lead } from "@/lib/types";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ManualTaskDialog } from "@/components/manual-task-dialog";
import { Badge } from "@/components/ui/badge";


const toDate = (dateValue: any): Date | null => {
  if (!dateValue) return null;
  if (dateValue instanceof Timestamp) return dateValue.toDate();
  if (typeof dateValue === "string") return new Date(dateValue);
  if (typeof dateValue === "object" && dateValue.seconds) {
    return new Timestamp(dateValue.seconds, dateValue.nanoseconds).toDate();
  }
  return null;
};

const getInteractionSnippet = (lead: Lead): string => {
    if (!lead.interactions || lead.interactions.length === 0) {
        return "No interactions yet";
    }
    const lastInteraction = lead.interactions.slice().sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    const text = lastInteraction.notes || lastInteraction.quickLogType || `Outcome: ${lastInteraction.outcome}` || "Interaction";
    
    return text.length > 10 ? `${text.substring(0, 10)}...` : text;
}


async function getDashboardData() {
  noStore();
  const today = startOfToday();

  let hotFollowupsSnapshot: QuerySnapshot<DocumentData, DocumentData>;
  let allIncompleteTasksSnapshot: QuerySnapshot<DocumentData, DocumentData>;
  
  try {
     const hotFollowupsQuery = query(
        collection(db, "leads"),
        where("onFollowList", "==", true)
     );
     // Fetch all incomplete tasks, then filter in code. This avoids composite indexes.
     const allIncompleteTasksQuery = query(
        collection(db, "tasks"),
        where("completed", "==", false)
    );

    [
      hotFollowupsSnapshot,
      allIncompleteTasksSnapshot,
    ] = await Promise.all([
      getDocs(hotFollowupsQuery),
      getDocs(allIncompleteTasksQuery),
    ]);

  } catch (e) {
     console.error("Error fetching dashboard data:", e);
    // Return empty arrays on error to prevent render failures
    return {
        overdueTasks: [],
        hotFollowups: [],
        newLeadsTasks: [],
        regularFollowupsTasks: [],
        adminTasks: [],
    };
  }

  const hotFollowups = hotFollowupsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lead));
  const allIncompleteTasks = allIncompleteTasksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));

  const overdueTasks: Task[] = [];
  const newLeadsTasks: Task[] = [];
  const regularFollowupsTasks: Task[] = [];
  const adminTasks: Task[] = [];

  allIncompleteTasks.forEach(task => {
    const dueDate = toDate(task.dueDate);
    if (dueDate && isPast(dueDate) && !isToday(dueDate)) {
      overdueTasks.push(task);
    } else if (task.description === "Send initial contact") {
      newLeadsTasks.push(task);
    } else if (task.nature === "Interactive") {
      regularFollowupsTasks.push(task);
    } else if (task.nature === "Procedural") {
      adminTasks.push(task);
    }
  });

  // Sort tasks after filtering
  const sortTasks = (a: Task, b: Task) => {
    const dateA = toDate(a.dueDate);
    const dateB = toDate(b.dueDate);
    if (dateA && dateB) return dateA.getTime() - dateB.getTime();
    if (dateA) return -1;
    if (dateB) return 1;
    return 0;
  };
  
  overdueTasks.sort(sortTasks);
  regularFollowupsTasks.sort(sortTasks);
  adminTasks.sort(sortTasks);
  
  return {
    overdueTasks,
    hotFollowups,
    newLeadsTasks,
    regularFollowupsTasks,
    adminTasks,
  };
}


export default async function TasksPage() {
  const { overdueTasks, hotFollowups, newLeadsTasks, regularFollowupsTasks, adminTasks } = await getDashboardData();

  const getTaskQueueParams = (tasks: Task[]) => tasks.map(t => t.id).join(',');

  return (
     <div className="flex flex-col min-h-screen bg-background">
      <header className="bg-card border-b p-3 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SidebarTrigger />
            <div className="flex items-baseline gap-2">
              <h1 className="text-xl font-bold tracking-tight leading-none">My Tasks</h1>
              {overdueTasks.length > 0 && (
                  <Link href={{ pathname: `/tasks/focus/${overdueTasks[0].id}`, query: { queue: getTaskQueueParams(overdueTasks) }}}>
                    <Badge variant="destructive" className="hover:underline blinking-badge">
                        {overdueTasks.length} due
                    </Badge>
                  </Link>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ManualTaskDialog allTasks={[...newLeadsTasks, ...regularFollowupsTasks, ...adminTasks]} />
            <Button variant="outline" size="icon" className="w-8 h-8">
              <Calendar className="h-4 w-4"/>
              <span className="sr-only">Calendar View</span>
            </Button>
          </div>
        </div>
      </header>

       <main className="flex-1 p-4 space-y-4">
        {hotFollowups.length === 0 && newLeadsTasks.length === 0 && regularFollowupsTasks.length === 0 && adminTasks.length === 0 && overdueTasks.length === 0 ? (
           <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 h-[60vh] text-center text-muted-foreground">
            <ListTodo className="h-16 w-16 mb-4" />
            <h2 className="text-2xl font-semibold text-foreground">
              You're all clear!
            </h2>
            <p className="mt-2 max-w-xs">
              No tasks are currently scheduled. Add a new task manually or import new leads to get started.
            </p>
          </div>
        ) : (
          <>
            {hotFollowups.length > 0 && (
              <section>
                <h2 className="text-base font-semibold tracking-tight mb-2">Hot Follow-ups</h2>
                <div className="space-y-2">
                  {hotFollowups.map(lead => (
                    <Link key={lead.id} href={`/contacts/${lead.id}`}>
                      <Card className="hover:bg-muted/50 transition-colors">
                        <CardHeader className="flex-row items-center justify-between p-2">
                           <div className="flex items-center gap-3">
                             <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                               <User className="h-4 w-4 text-muted-foreground"/>
                             </div>
                             <div>
                                <CardTitle className="text-sm leading-tight">{lead.name}</CardTitle>
                                <CardDescription className="text-xs">{lead.commitmentSnapshot?.courses?.join(', ') || "No course"}</CardDescription>
                             </div>
                           </div>
                           <div className="text-right">
                               <p className="text-xs text-muted-foreground italic">{getInteractionSnippet(lead)}</p>
                           </div>
                        </CardHeader>
                      </Card>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {newLeadsTasks.length > 0 && (
               <section>
                <h2 className="text-base font-semibold tracking-tight mb-2">New Leads</h2>
                 <Link href={{ pathname: `/tasks/focus/${newLeadsTasks[0].id}`, query: { queue: getTaskQueueParams(newLeadsTasks) } }}>
                  <Card className="bg-primary/5 border-primary/20 hover:bg-primary/10 transition-colors">
                    <CardHeader className="flex-row items-center justify-between p-3">
                      <div className="flex items-center gap-3">
                        <Users className="h-5 w-5 text-primary"/>
                        <div>
                          <CardTitle className="text-base">First Contact Blitz</CardTitle>
                          <CardDescription className="text-xs">{newLeadsTasks.length} new leads to call</CardDescription>
                        </div>
                      </div>
                      <Button size="sm">
                        Start
                        <ArrowRight className="h-4 w-4 ml-2"/>
                      </Button>
                    </CardHeader>
                  </Card>
                 </Link>
              </section>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <section>
                <h2 className="text-base font-semibold tracking-tight mb-2">Regular Follow-ups</h2>
                {regularFollowupsTasks.length > 0 ? (
                  <div className="space-y-2">
                    {regularFollowupsTasks.map(task => (
                       <Link key={task.id} href={{ pathname: `/tasks/focus/${task.id}`, query: { queue: getTaskQueueParams(regularFollowupsTasks) } }}>
                        <div className="p-2.5 rounded-md border bg-card hover:bg-muted/50 transition-colors flex items-center justify-between">
                            <div>
                                <p className="font-medium text-sm">{task.leadName}</p>
                                <p className="text-xs text-muted-foreground">{task.description}</p>
                            </div>
                           {task.dueDate && <p className="text-xs font-semibold text-muted-foreground">{format(toDate(task.dueDate)!, 'MMM d')}</p>}
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No regular follow-ups scheduled.</p>
                )}
              </section>

              <section>
                <h2 className="text-base font-semibold tracking-tight mb-2">Administrative</h2>
                {adminTasks.length > 0 ? (
                  <div className="space-y-2">
                     {adminTasks.map(task => (
                       <Link key={task.id} href={task.leadId ? `/contacts/${task.leadId}`: '#'}>
                        <div className="p-2.5 rounded-md border bg-card hover:bg-muted/50 transition-colors flex items-center justify-between">
                            <div>
                                <p className="font-medium text-sm">{task.description}</p>
                                <p className="text-xs text-muted-foreground">{task.leadName}</p>
                            </div>
                           {task.dueDate && <p className="text-xs font-semibold text-muted-foreground">{format(toDate(task.dueDate)!, 'MMM d')}</p>}
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                   <p className="text-sm text-muted-foreground text-center py-4">No administrative tasks.</p>
                )}
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
