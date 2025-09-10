"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  orderBy,
  where,
} from "firebase/firestore";
import { AlertTriangle, Badge, ListTodo } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Logo } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { isPast } from "date-fns";

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterOverdue, setFilterOverdue] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const q = query(
          collection(db, "tasks"),
          orderBy("createdAt", "desc")
        );
        const querySnapshot = await getDocs(q);
        const tasksData = querySnapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as Task)
        );
        setTasks(tasksData);
      } catch (error) {
        console.error("Error fetching tasks:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to fetch tasks from the database.",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchTasks();
  }, [toast]);

  const handleMarkComplete = async (taskId: string, completed: boolean) => {
    try {
      const taskRef = doc(db, "tasks", taskId);
      await updateDoc(taskRef, { completed });
      setTasks((prev) =>
        prev.map((task) => (task.id === taskId ? { ...task, completed } : task))
      );
      if (completed) {
        toast({
          title: "Task Completed",
          description: "Good job!",
        });
      }
    } catch (error) {
      console.error("Error updating task:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update task.",
      });
    }
  };

  const { overdueCount, visibleTasks } = useMemo(() => {
    const incomplete = tasks.filter((task) => !task.completed);
    const overdue = incomplete.filter(
      (task) => task.dueDate && isPast(new Date(task.dueDate))
    );
    const overdueCount = overdue.length;
    const visibleTasks = filterOverdue ? overdue : incomplete;
    return { overdueCount, visibleTasks };
  }, [tasks, filterOverdue]);

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
          <ListTodo className="h-8 w-8 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">My Tasks</h1>
        </div>
        {overdueCount > 0 && (
          <Badge
            variant={filterOverdue ? "default" : "outline"}
            className="cursor-pointer gap-2"
            onClick={() => setFilterOverdue(!filterOverdue)}
          >
            <AlertTriangle className="h-4 w-4" />
            <span>{overdueCount} Overdue</span>
          </Badge>
        )}
      </header>

      <main className="flex-1 p-4 sm:p-6 md:p-8">
        {visibleTasks.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {visibleTasks.map((task) => (
              <Link href={`/leads/${task.leadId}`} key={task.id}>
                <Card
                  className={cn(
                    "flex flex-col h-full transition-shadow hover:shadow-md"
                  )}
                >
                  <CardHeader className="flex-row items-start gap-4">
                    {task.nature === "Procedural" && (
                      <Checkbox
                        checked={task.completed}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleMarkComplete(task.id, !task.completed)
                        }}
                        className="mt-1"
                      />
                    )}
                    <div className="flex-1">
                      <CardTitle>{task.description}</CardTitle>
                      <CardDescription>
                        For lead: {task.leadName}
                      </CardDescription>
                       {task.dueDate && (
                        <CardDescription>
                          Due: {new Date(task.dueDate).toLocaleDateString()}
                        </CardDescription>
                      )}
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 h-[60vh] text-center text-muted-foreground">
            <ListTodo className="h-16 w-16 mb-4" />
            <h2 className="text-2xl font-semibold text-foreground">
              All tasks completed!
            </h2>
            <p className="mt-2 max-w-xs">
             {filterOverdue ? "No overdue tasks." : "Great job clearing your list!"}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
