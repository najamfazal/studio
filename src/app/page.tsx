
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
import { AlertTriangle, Plus, ListTodo, ArrowRight, User, Users } from "lucide-react";

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
    // Return first 10 characters of the text
    return text.length > 15 ? `${text.substring(0, 15)}...` : text;
}


async function getDashboardData() {
  noStore();
  const today = startOfToday();

  // We can't use a single query with multiple `where` on different fields
  // without a composite index. So we fetch all and filter in code.
  const allIncompleteTasksQuery = query(
    collection(db, "tasks"),
    where("completed", "==", false)
  );

  const hotFollowupsQuery = query(
    collection(db, "leads"),
    where("onFollowList", "==", true)
  );
  
  let allTasksSnapshot: QuerySnapshot<DocumentData, DocumentData>,
      hotFollowupsSnapshot: QuerySnapshot<DocumentData, DocumentData>;

  try {
    [
      allTasksSnapshot,
      hotFollowupsSnapshot,
    ] = await Promise.all([
      getDocs(allIncompleteTasksQuery),
      getDocs(hotFollowupsQuery),
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

  const allIncompleteTasks = allTasksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
  const hotFollowups = hotFollowupsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lead));
  
  // --- Filter tasks on the server ---
  const overdueTasks = allIncompleteTasks.filter(task => {
    const dueDate = toDate(task.dueDate);
    return dueDate && isPast(dueDate) && !isToday(dueDate);
  });
  
  const newLeadsTasks = allIncompleteTasks.filter(task => task.description === "Send initial contact");

  const regularFollowupsTasks = allIncompleteTasks.filter(task => 
    task.nature === "Interactive" && 
    task.description !== "Send initial contact" &&
    !overdueTasks.some(overdueTask => overdueTask.id === task.id) // Exclude overdue
  ).sort((a, b) => (toDate(a.dueDate)?.getTime() || 0) - (toDate(b.dueDate)?.getTime() || 0));


  const adminTasks = allIncompleteTasks.filter(task => 
    task.nature === "Procedural" &&
    !overdueTasks.some(overdueTask => overdueTask.id === task.id) // Exclude overdue
  ).sort((a, b) => (toDate(a.dueDate)?.getTime() || 0) - (toDate(b.dueDate)?.getTime() || 0));
  
  return {
    overdueTasks: overdueTasks.sort((a, b) => (toDate(a.dueDate)?.getTime() || 0) - (toDate(b.dueDate)?.getTime() || 0)),
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
          <div className="flex items-center gap-3">
            <SidebarTrigger />
            <div className="flex flex-col">
              <h1 className="text-xl font-bold tracking-tight leading-none">My Tasks</h1>
              {overdueTasks.length > 0 && (
                  <Link href={{ pathname: '/tasks/focus', query: { queue: getTaskQueueParams(overdueTasks), initial: overdueTasks[0].id }}}>
                  <div className="text-xs font-bold text-destructive hover:underline mt-1">
                      <AlertTriangle className="inline-block h-3 w-3 mr-1" />
                      {overdueTasks.length} overdue
                  </div>
                  </Link>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ManualTaskDialog allTasks={[]} />
          </div>
        </div>
      </header>

       <main className="flex-1 p-4 space-y-4">
        {hotFollowups.length === 0 && newLeadsTasks.length === 0 && regularFollowupsTasks.length === 0 && adminTasks.length === 0 ? (
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
