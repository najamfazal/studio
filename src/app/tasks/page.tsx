"use client";

import { useState, useEffect } from "react";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  orderBy,
  where,
} from "firebase/firestore";
import { Check, ListTodo } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Logo } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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

  const handleMarkComplete = async (taskId: string) => {
    try {
      const taskRef = doc(db, "tasks", taskId);
      await updateDoc(taskRef, { completed: true });
      setTasks((prev) =>
        prev.map((task) =>
          task.id === taskId ? { ...task, completed: true } : task
        )
      );
      toast({
        title: "Task Completed",
        description: "Good job!",
      });
    } catch (error) {
      console.error("Error completing task:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update task.",
      });
    }
  };
  
  const incompleteTasks = tasks.filter(task => !task.completed);

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
      </header>

      <main className="flex-1 p-4 sm:p-6 md:p-8">
        {tasks.length > 0 && incompleteTasks.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {tasks.map((task) => (
              <Card
                key={task.id}
                className={cn(
                  "flex flex-col",
                  task.completed && "bg-muted/50"
                )}
              >
                <CardHeader>
                  <CardTitle
                    className={cn(
                      task.completed && "line-through text-muted-foreground"
                    )}
                  >
                    {task.description}
                  </CardTitle>
                  <CardDescription>For lead: {task.leadName}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1"></CardContent>
                <CardContent>
                  {!task.completed && (
                    <Button onClick={() => handleMarkComplete(task.id)}>
                      <Check className="mr-2 h-4 w-4" />
                      Mark as Complete
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 h-[60vh] text-center text-muted-foreground">
            <ListTodo className="h-16 w-16 mb-4" />
            <h2 className="text-2xl font-semibold text-foreground">
              All tasks completed!
            </h2>
            <p className="mt-2 max-w-xs">
              Add a new lead to generate a new task.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
