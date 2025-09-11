
"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  Timestamp,
  orderBy,
  where,
} from "firebase/firestore";
import { AlertTriangle, Check, ListTodo } from "lucide-react";
import { addDays, format, isPast, isSameDay, isToday } from "date-fns";

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

// Helper to safely convert Firestore Timestamps or strings to Date objects
const toDate = (dateValue: any): Date | null => {
  if (!dateValue) return null;
  if (dateValue instanceof Timestamp) {
    return dateValue.toDate();
  }
  if (typeof dateValue === "string") {
    const date = new Date(dateValue);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  // Handle Firestore Timestamp-like objects from server-side rendering
  if (typeof dateValue === "object" && dateValue.seconds) {
    return new Timestamp(dateValue.seconds, dateValue.nanoseconds).toDate();
  }
  return null;
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activeTask, setActiveTask] = useState<string | null>(null);
  const { toast } = useToast();

  const weekDays = useMemo(() => {
    const today = new Date();
    const startDate = addDays(today, -3);
    return Array.from({ length: 7 }, (_, i) => addDays(startDate, i));
  }, []);

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
    // Find the task to get its nature
    const taskToUpdate = tasks.find(t => t.id === taskId);
    if (!taskToUpdate) return;
    
    // Prevent completing procedural tasks from the main list.
    if (taskToUpdate.nature === 'Procedural') {
        toast({
            variant: "default",
            title: "Action Required",
            description: "Please complete procedural tasks from the lead's detail page.",
        });
        return;
    }

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


  const visibleTasks = useMemo(() => {
    return tasks
      .filter((task) => {
        const dueDate = toDate(task.dueDate);
        return dueDate && isSameDay(dueDate, selectedDate);
      })
      .sort((a, b) => {
        if (a.completed !== b.completed) {
            return a.completed ? 1 : -1;
        }
        const dateA = toDate(a.dueDate) ?? new Date(0);
        const dateB = toDate(b.dueDate) ?? new Date(0);
        return dateA.getTime() - dateB.getTime();
      });
  }, [tasks, selectedDate]);

  type Urgency = "hot" | "warm" | "cold" | "neutral";

  const getUrgency = (
    dueDate: Date | null,
    completed: boolean,
  ): { class: string; colorClass: string; name: Urgency } => {
    if (completed || !dueDate)
      return {
        class: "border-l-gray-400",
        colorClass: "loader-neutral",
        name: "neutral",
      };
    if (isPast(dueDate) && !isToday(dueDate))
      return {
        class: "border-l-red-500",
        colorClass: "loader-hot",
        name: "hot",
      };
    if (isToday(dueDate))
      return {
        class: "border-l-yellow-500",
        colorClass: "loader-warm",
        name: "warm",
      };
    return {
      class: "border-l-blue-500",
      colorClass: "loader-cold",
      name: "cold",
    };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Logo className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background sm:pl-0 pl-12">
      <header className="bg-card border-b p-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-4">
          <ListTodo className="h-8 w-8 text-primary" />
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">My Tasks</h1>
        </div>
        <div className="flex space-x-2 overflow-x-auto pb-2 -mx-4 px-4 hide-scrollbar">
          {weekDays.map((day) => (
            <button
              key={day.toISOString()}
              onClick={() => setSelectedDate(day)}
              className={cn(
                "flex flex-col items-center justify-center rounded-lg p-2 w-12 h-14 sm:w-14 sm:h-16 transition-colors duration-200 shrink-0",
                isSameDay(selectedDate, day)
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted-foreground/20"
              )}
            >
              <span className="text-xs font-medium">{format(day, "E")}</span>
              <span className="text-base sm:text-lg font-bold">{format(day, "d")}</span>
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6">
        {visibleTasks.length > 0 ? (
          <div className="space-y-3">
            {visibleTasks.map((task) => {
              const dueDate = toDate(task.dueDate);
              const { class: urgencyClass, colorClass: loaderColorClass } =
                getUrgency(dueDate, task.completed);
              const isNavigating = activeTask === task.id;

              return (
                <div key={task.id} className="relative">
                  <Link
                    href={`/leads/${task.leadId}`}
                    onClick={() => setActiveTask(task.id)}
                    className={cn(
                      "block rounded-lg border bg-card text-card-foreground shadow-sm transition-shadow hover:shadow-md",
                      "border-l-4 overflow-hidden",
                      urgencyClass,
                       isNavigating && "pointer-events-none"
                    )}
                  >
                    <div className="flex items-center p-3">
                      <div className="flex-1">
                        <p className={cn("font-semibold text-base leading-tight", task.completed && "line-through text-muted-foreground")}>
                          {task.description}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {task.leadName}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleMarkComplete(task.id, !task.completed);
                        }}
                        className={cn(
                          "flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-full border-2 transition-colors shrink-0",
                          task.completed
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-muted-foreground/50 hover:border-primary",
                           task.nature === 'Procedural' && 'cursor-not-allowed opacity-50'
                        )}
                      >
                        {task.completed && <Check className="h-5 w-5" />}
                      </button>
                    </div>
                     {isNavigating && (
                      <div
                        className={cn(
                          "absolute bottom-0 h-1 w-full",
                          loaderColorClass
                        )}
                      />
                    )}
                  </Link>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 h-[50vh] text-center text-muted-foreground">
            <ListTodo className="h-16 w-16 mb-4" />
            <h2 className="text-2xl font-semibold text-foreground">
              No tasks for this day!
            </h2>
            <p className="mt-2 max-w-xs">
              Select another date or enjoy your day off.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
