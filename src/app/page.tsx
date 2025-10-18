
"use client";

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
import { AlertTriangle, Plus, ListTodo, ArrowRight, User, Users, Calendar, NotebookPen, Flame, Sparkles, Zap, Loader2 } from "lucide-react";
import { useAuthState } from 'react-firebase-hooks/auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { db, auth } from "@/lib/firebase";
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
import { Logo } from "@/components/icons";
import { errorEmitter } from "@/lib/error-emitter";
import { FirestorePermissionError } from "@/lib/errors";

const ROUTINE_PAGE_SIZE = 20;

const getInteractionSnippet = (lead: Lead): string => {
    if (!lead.interactions || lead.interactions.length === 0) {
        return "No interactions yet";
    }
    const lastInteraction = lead.interactions.slice().sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    const text = lastInteraction.notes || lastInteraction.quickLogType || `Outcome: ${lastInteraction.outcome}` || "Interaction";
    
    return text.length > 10 ? `${text.substring(0, 10)}...` : text;
}


const toDate = (timestamp: any): Date => {
  if (timestamp?.toDate) { // Firestore Timestamp
    return timestamp.toDate();
  }
  return new Date(timestamp); // ISO string or Date object
};


async function getDashboardData(userId: string) {
  noStore();
  
  let hotFollowupsSnapshot: QuerySnapshot<DocumentData, DocumentData>;
  let newLeadsTasksSnapshot: QuerySnapshot<DocumentData, DocumentData>;
  let regularFollowupsTasksSnapshot: QuerySnapshot<DocumentData, DocumentData>;
  let adminTasksSnapshot: QuerySnapshot<DocumentData, DocumentData>;
  let overdueTasksSnapshot: QuerySnapshot<DocumentData, DocumentData>;

  const hotFollowupsQuery = query(
      collection(db, "leads"),
      where("onFollowList", "==", true),
      orderBy("name", "asc")
  );
  
  const newLeadsTasksQuery = query(
      collection(db, "tasks"),
      where("completed", "==", false),
      where("description", "==", "Send initial contact"),
      orderBy("createdAt", "desc")
  );

  const regularFollowupsTasksQuery = query(
      collection(db, "tasks"),
      where("completed", "==", false),
      where("nature", "==", "Interactive"),
      where("description", "!=", "Send initial contact"),
      orderBy("createdAt", "desc")
  );

  const adminTasksQuery = query(
      collection(db, "tasks"),
      where("completed", "==", false),
      where("nature", "==", "Procedural"),
      orderBy("createdAt", "desc")
  );

  const overdueTasksQuery = query(
      collection(db, "tasks"),
      where("completed", "==", false),
      where("dueDate", "<", new Date()),
      orderBy("dueDate", "asc")
  );


  try {
    [
        hotFollowupsSnapshot,
        newLeadsTasksSnapshot,
        regularFollowupsTasksSnapshot,
        adminTasksSnapshot,
        overdueTasksSnapshot
    ] = await Promise.all([
        getDocs(hotFollowupsQuery),
        getDocs(newLeadsTasksQuery),
        getDocs(regularFollowupsTasksQuery),
        getDocs(adminTasksQuery),
        getDocs(overdueTasksQuery)
    ]).catch(serverError => {
        if (serverError.code === 'permission-denied') {
            throw new FirestorePermissionError({ path: 'leads or tasks', operation: 'list' });
        }
        throw serverError;
    });

  } catch (e) {
    if (e instanceof FirestorePermissionError) {
        errorEmitter.emit('permission-error', e);
    }
    console.error("Error fetching dashboard data:", e);
    return {
      hotFollowups: [],
      newLeadsTasks: [],
      regularFollowupsTasks: [],
      adminTasks: [],
      overdueTasks: [],
    };
  }
  
  const toTask = (doc: DocumentData) => {
       const data = doc.data();
      return {
        id: doc.id,
        ...data,
        dueDate: data.dueDate ? toDate(data.dueDate).toISOString() : null,
        createdAt: data.createdAt ? toDate(data.createdAt).toISOString() : null,
      } as Task;
  }

  const hotFollowups = hotFollowupsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lead));
  const newLeadsTasks = newLeadsTasksSnapshot.docs.map(toTask);
  const regularFollowupsTasks = regularFollowupsTasksSnapshot.docs.map(toTask);
  const adminTasks = adminTasksSnapshot.docs.map(toTask);
  const overdueTasks = overdueTasksSnapshot.docs.map(toTask);

  return {
    hotFollowups,
    newLeadsTasks,
    regularFollowupsTasks,
    adminTasks,
    overdueTasks,
  };
}

interface DashboardData {
    hotFollowups: Lead[];
    newLeadsTasks: Task[];
    regularFollowupsTasks: Task[];
    adminTasks: Task[];
    overdueTasks: Task[];
}


export default function RoutinesPage() {
  const [user, loading] = useAuthState(auth);
  const router = useRouter();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (user) {
        getDashboardData(user.uid).then(setDashboardData);
    }
  }, [user, loading, router]);


  if (loading || !user || !dashboardData) {
    return <div className="flex h-screen items-center justify-center"><Logo className="h-12 w-12 animate-spin text-primary" /></div>;
  }
  
  const { hotFollowups, newLeadsTasks, regularFollowupsTasks, adminTasks, overdueTasks } = dashboardData;

  const getTaskQueueParams = (tasks: Task[]) => tasks.slice(0, ROUTINE_PAGE_SIZE).map(task => task.id).join(',');
  const getHotQueueParams = (leads: Lead[]) => leads.slice(0, ROUTINE_PAGE_SIZE).map(l => l.id).join(',');

  return (
     <div className="flex flex-col min-h-screen bg-background">
      <header className="bg-card border-b p-3 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SidebarTrigger />
            <div className="grid gap-0.5">
              <div className="flex items-center gap-2">
                 <h1 className="text-xl font-bold tracking-tight leading-none">My Tasks</h1>
                 {overdueTasks.length > 0 && (
                   <Link href={`/routines/regular/${overdueTasks[0].id}?queue=${getTaskQueueParams(overdueTasks)}`}>
                    <Badge variant="destructive" className="blinking-badge">{overdueTasks.length} due</Badge>
                   </Link>
                 )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ManualTaskDialog allTasks={[...newLeadsTasks, ...regularFollowupsTasks, ...adminTasks]} />
          </div>
        </div>
      </header>

       <main className="flex-1 p-4 space-y-4">
        {hotFollowups.length === 0 && newLeadsTasks.length === 0 && regularFollowupsTasks.length === 0 && adminTasks.length === 0 ? (
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
                 <Link href={`/routines/hot/${getHotQueueParams(hotFollowups)}`}>
                  <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors">
                    <CardHeader className="flex-row items-center justify-between p-3">
                      <div className="flex items-center gap-3">
                        <Flame className="h-5 w-5 text-red-600"/>
                        <div>
                          <CardTitle className="text-base">Hot Follow-ups</CardTitle>
                          <CardDescription className="text-xs">{hotFollowups.length} priority leads</CardDescription>
                        </div>
                      </div>
                      <Button size="xs" variant="destructive" className="bg-red-600 hover:bg-red-700">
                        Start
                        <ArrowRight className="h-4 w-4 ml-1"/>
                      </Button>
                    </CardHeader>
                  </Card>
                 </Link>
              </section>
            )}

            {newLeadsTasks.length > 0 && (
               <section>
                <Link href={`/routines/new/${newLeadsTasks[0].id}?queue=${getTaskQueueParams(newLeadsTasks)}`}>
                  <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/50 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
                    <CardHeader className="flex-row items-center justify-between p-3">
                      <div className="flex items-center gap-3">
                        <Sparkles className="h-5 w-5 text-blue-600"/>
                        <div>
                          <CardTitle className="text-base">New Leads</CardTitle>
                          <CardDescription className="text-xs">{newLeadsTasks.length} new leads to contact</CardDescription>
                        </div>
                      </div>
                      <Button size="xs" variant="default" className="bg-blue-600 hover:bg-blue-700">
                        Initiate
                        <ArrowRight className="h-4 w-4 ml-1"/>
                      </Button>
                    </CardHeader>
                  </Card>
                 </Link>
              </section>
            )}
            
            {regularFollowupsTasks.length > 0 && (
              <section>
                 <Link href={{ pathname: `/routines/regular/${regularFollowupsTasks[0].id}`, query: { queue: getTaskQueueParams(regularFollowupsTasks) } }}>
                  <Card className="bg-card hover:bg-muted/50 transition-colors">
                    <CardHeader className="flex-row items-center justify-between p-3">
                      <div className="flex items-center gap-3">
                        <ListTodo className="h-5 w-5 text-muted-foreground"/>
                        <div>
                          <CardTitle className="text-base">Regular Follow-ups</CardTitle>
                          <CardDescription className="text-xs">{regularFollowupsTasks.length} scheduled tasks</CardDescription>
                        </div>
                      </div>
                       <Button size="xs" variant="secondary">
                        Resume
                        <ArrowRight className="h-4 w-4 ml-1"/>
                      </Button>
                    </CardHeader>
                  </Card>
                 </Link>
              </section>
            )}

            {adminTasks.length > 0 && (
              <section>
                 <Link href={{ pathname: `/routines/regular/${adminTasks[0].id}`, query: { queue: getTaskQueueParams(adminTasks) } }}>
                  <Card className="bg-card hover:bg-muted/50 transition-colors">
                    <CardHeader className="flex-row items-center justify-between p-3">
                      <div className="flex items-center gap-3">
                        <NotebookPen className="h-5 w-5 text-muted-foreground"/>
                        <div>
                          <CardTitle className="text-base">Administrative</CardTitle>
                          <CardDescription className="text-xs">{adminTasks.length} procedural tasks</CardDescription>
                        </div>
                      </div>
                       <Button size="xs" variant="secondary">
                        Start
                        <ArrowRight className="h-4 w-4 ml-1"/>
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
