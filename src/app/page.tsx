
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
import { AlertTriangle, Plus, ListTodo, ArrowRight, User, Users, Calendar, NotebookPen, Flame, Sparkles } from "lucide-react";

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
  
  let hotFollowupsSnapshot: QuerySnapshot<DocumentData, DocumentData>;
  let allIncompleteTasksSnapshot: QuerySnapshot<DocumentData, DocumentData>;

  try {
    const hotFollowupsQuery = query(
      collection(db, "leads"),
      where("onFollowList", "==", true),
      limit(5)
    );

    const allIncompleteTasksQuery = query(
      collection(db, "tasks"),
      where("completed", "==", false)
    );

    [hotFollowupsSnapshot, allIncompleteTasksSnapshot] = await Promise.all([
      getDocs(hotFollowupsQuery),
      getDocs(allIncompleteTasksQuery),
    ]);

  } catch (e) {
    console.error("Error fetching dashboard data:", e);
    // Return empty arrays on error to prevent render failures
    return {
      hotFollowups: [],
      newLeadsTasks: [],
      regularFollowupsTasks: [],
    };
  }

  const hotFollowups = hotFollowupsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lead));
  const allIncompleteTasks = allIncompleteTasksSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  } as Task));

  const newLeadsTasks = allIncompleteTasks.filter(task => task.description === "Send initial contact");
  const regularFollowupsTasks = allIncompleteTasks.filter(task => task.nature === "Interactive" && task.description !== "Send initial contact");

  return {
    hotFollowups,
    newLeadsTasks,
    regularFollowupsTasks,
  };
}


export default async function RoutinesPage() {
  const { hotFollowups, newLeadsTasks, regularFollowupsTasks } = await getDashboardData();
  
  const getQueueParams = (items: (Lead | Task)[]) => items.map(item => 'leadId' in item ? item.leadId : item.id).join(',');

  return (
     <div className="flex flex-col min-h-screen bg-background">
      <header className="bg-card border-b p-3 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SidebarTrigger />
            <div className="grid gap-0.5">
              <h1 className="text-xl font-bold tracking-tight leading-none">Routines</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ManualTaskDialog />
          </div>
        </div>
      </header>

       <main className="flex-1 p-4 space-y-6">
        {hotFollowups.length === 0 && newLeadsTasks.length === 0 && regularFollowupsTasks.length === 0 ? (
           <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 h-[60vh] text-center text-muted-foreground">
            <ListTodo className="h-16 w-16 mb-4" />
            <h2 className="text-2xl font-semibold text-foreground">
              All clear!
            </h2>
            <p className="mt-2 max-w-xs">
              No routines available. Add new leads or tasks to get started.
            </p>
          </div>
        ) : (
          <>
            {hotFollowups.length > 0 && (
              <section>
                 <Link href={`/routines/hot/${hotFollowups.map(l => l.id).join(',')}`}>
                  <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors">
                    <CardHeader className="flex-row items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <Flame className="h-6 w-6 text-red-600"/>
                        <div>
                          <CardTitle className="text-lg">Hot Follow-ups</CardTitle>
                          <CardDescription className="text-xs">{hotFollowups.length} priority leads</CardDescription>
                        </div>
                      </div>
                      <Button size="sm" variant="destructive" className="bg-red-600 hover:bg-red-700">
                        Start
                        <ArrowRight className="h-4 w-4 ml-2"/>
                      </Button>
                    </CardHeader>
                  </Card>
                 </Link>
              </section>
            )}

            {newLeadsTasks.length > 0 && (
               <section>
                <Link href={`/tasks/focus/${newLeadsTasks[0].id}?queue=${getQueueParams(newLeadsTasks)}`}>
                  <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/50 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
                    <CardHeader className="flex-row items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <Sparkles className="h-6 w-6 text-blue-600"/>
                        <div>
                          <CardTitle className="text-lg">New Leads</CardTitle>
                          <CardDescription className="text-xs">{newLeadsTasks.length} new leads to contact</CardDescription>
                        </div>
                      </div>
                      <Button size="sm" variant="default" className="bg-blue-600 hover:bg-blue-700">
                        Initiate
                        <ArrowRight className="h-4 w-4 ml-2"/>
                      </Button>
                    </CardHeader>
                  </Card>
                 </Link>
              </section>
            )}
            
            {regularFollowupsTasks.length > 0 && (
              <section>
                 <Link href={{ pathname: `/tasks/focus/${regularFollowupsTasks[0].id}`, query: { queue: getQueueParams(regularFollowupsTasks) } }}>
                  <Card className="bg-card hover:bg-muted/50 transition-colors">
                    <CardHeader className="flex-row items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <ListTodo className="h-6 w-6 text-muted-foreground"/>
                        <div>
                          <CardTitle className="text-lg">Regular Follow-ups</CardTitle>
                          <CardDescription className="text-xs">{regularFollowupsTasks.length} scheduled tasks</CardDescription>
                        </div>
                      </div>
                       <Button size="sm" variant="secondary">
                        Resume
                        <ArrowRight className="h-4 w-4 ml-2"/>
                      </Button>
                    </CardHeader>
                  </Card>
                 </Link>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
