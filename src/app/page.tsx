
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

async function getDashboardData(userId: string) {
  noStore();
  
  let newLeadsSnapshot: QuerySnapshot<DocumentData, DocumentData>;
  let followupLeadsSnapshot: QuerySnapshot<DocumentData, DocumentData>;
  let adminTasksSnapshot: QuerySnapshot<DocumentData, DocumentData>;
  let overdueTasksSnapshot: QuerySnapshot<DocumentData, DocumentData>;

  const leadsRef = collection(db, "leads");
  
  const newLeadsQuery = query(
      leadsRef,
      where("afc_step", "==", 0)
  );
  
  const followupLeadsQuery = query(
      leadsRef,
      where("afc_step", ">", 0)
  );

  const adminTasksQuery = query(
      collection(db, "tasks"),
      where("completed", "==", false),
      where("nature", "==", "Procedural"),
      orderBy("createdAt", "desc")
  );

  const allIncompleteTasksQuery = query(
      collection(db, "tasks"),
      where("completed", "==", false)
  );


  try {
    [
        newLeadsSnapshot,
        followupLeadsSnapshot,
        adminTasksSnapshot,
        overdueTasksSnapshot
    ] = await Promise.all([
        getDocs(newLeadsQuery),
        getDocs(followupLeadsQuery),
        getDocs(adminTasksQuery),
        getDocs(allIncompleteTasksQuery)
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
      newLeadsCount: 0,
      followupLeadsCount: 0,
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

  const newLeadsCount = newLeadsSnapshot.size;
  const followupLeadsCount = followupLeadsSnapshot.size;
  const adminTasks = adminTasksSnapshot.docs.map(toTask);
  
  const allOverdueTasks = overdueTasksSnapshot.docs.map(toTask);
  const overdueTasks = allOverdueTasks
    .filter(task => task.dueDate && isPast(toDate(task.dueDate)))
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());

  return {
    newLeadsCount,
    followupLeadsCount,
    adminTasks,
    overdueTasks,
  };
}

interface DashboardData {
    newLeadsCount: number;
    followupLeadsCount: number;
    adminTasks: Task[];
    overdueTasks: Task[];
}


const toDate = (timestamp: any): Date => {
  if (timestamp?.toDate) { // Firestore Timestamp
    return timestamp.toDate();
  }
  return new Date(timestamp); // ISO string or Date object
};


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
  
  const { newLeadsCount, followupLeadsCount, adminTasks, overdueTasks } = dashboardData;

  const getTasksQueueParams = (tasks: Task[]) => tasks.map(t => t.id).join(',');

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
                   <Link href={`/contacts/focus/overdue/${getTasksQueueParams(overdueTasks)}`}>
                    <Badge variant="destructive" className="blinking-badge">{overdueTasks.length} due</Badge>
                   </Link>
                 )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ManualTaskDialog />
          </div>
        </div>
      </header>

       <main className="flex-1 p-4 space-y-4">
        {newLeadsCount === 0 && followupLeadsCount === 0 && adminTasks.length === 0 ? (
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
            {newLeadsCount > 0 && (
               <section>
                <Link href={`/contacts/focus/new`}>
                  <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/50 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
                    <CardHeader className="flex-row items-center justify-between p-3">
                      <div className="flex items-center gap-3">
                        <Sparkles className="h-5 w-5 text-blue-600"/>
                        <div>
                          <CardTitle className="text-base">New Leads</CardTitle>
                          <CardDescription className="text-xs">{newLeadsCount} new leads to contact</CardDescription>
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
            
            {followupLeadsCount > 0 && (
              <section>
                 <Link href={`/contacts/focus/followup`}>
                  <Card className="bg-card hover:bg-muted/50 transition-colors">
                    <CardHeader className="flex-row items-center justify-between p-3">
                      <div className="flex items-center gap-3">
                        <ListTodo className="h-5 w-5 text-muted-foreground"/>
                        <div>
                          <CardTitle className="text-base">Follow-ups</CardTitle>
                          <CardDescription className="text-xs">{followupLeadsCount} scheduled follow-ups</CardDescription>
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
                 <Link href={`/contacts/focus/admin/${getTasksQueueParams(adminTasks)}`}>
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
