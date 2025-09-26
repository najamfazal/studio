
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
  addDoc,
} from "firebase/firestore";
import { AlertTriangle, Check, ListTodo, Menu, CalendarIcon, Plus, User, ChevronsUpDown, CheckIcon } from "lucide-react";
import { addDays, format, isPast, isSameDay, isToday, startOfToday } from "date-fns";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Logo } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import type { Task, Lead } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activeTask, setActiveTask] = useState<string | null>(null);
  const { toast } = useToast();

  const [isManualTaskOpen, setIsManualTaskOpen] = useState(false);
  const [manualTaskDescription, setManualTaskDescription] = useState("");
  const [manualTaskDueDate, setManualTaskDueDate] = useState<Date | undefined>(new Date());
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isSavingManualTask, setIsSavingManualTask] = useState(false);
  const [isContactListOpen, setIsContactListOpen] = useState(false);
  
  const [isOverdueDialogOpen, setIsOverdueDialogOpen] = useState(false);

  const fetchInitialData = async () => {
      setIsLoading(true);
      try {
        const tasksQuery = query(collection(db, "tasks"), orderBy("createdAt", "desc"));
        const tasksSnapshot = await getDocs(tasksQuery);
        const tasksData = tasksSnapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as Task)
        );
        setTasks(tasksData);

        const leadsQuery = query(collection(db, "leads"), orderBy("name"));
        const leadsSnapshot = await getDocs(leadsQuery);
        const leadsData = leadsSnapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as Lead)
        );
        setLeads(leadsData);

      } catch (error) {
        console.error("Error fetching data:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to fetch data from the database.",
        });
      } finally {
        setIsLoading(false);
      }
    };


  useEffect(() => {
    fetchInitialData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overdueTasks = useMemo(() => {
    const today = startOfToday();
    return tasks.filter(task => {
      const dueDate = toDate(task.dueDate);
      return !task.completed && dueDate && isPast(dueDate) && !isSameDay(dueDate, today);
    });
  }, [tasks]);

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
  
  const handleAddManualTask = async () => {
    if (!manualTaskDescription.trim()) {
      toast({ variant: "destructive", title: "Description cannot be empty." });
      return;
    }
    setIsSavingManualTask(true);
    try {
      const newTask = {
        description: manualTaskDescription,
        dueDate: manualTaskDueDate,
        completed: false,
        createdAt: new Date(),
        nature: "Procedural",
        leadId: selectedLead?.id || null,
        leadName: selectedLead?.name || "Personal Task",
      };
      const docRef = await addDoc(collection(db, "tasks"), newTask);
      setTasks(prev => [{...newTask, id: docRef.id} as Task, ...prev]);
      toast({ title: "Manual task added!" });
      
      // Reset form state
      setIsManualTaskOpen(false);
      setManualTaskDescription("");
      setManualTaskDueDate(new Date());
      setSelectedLead(null);
    } catch (error) {
       console.error("Error adding manual task:", error);
       toast({ variant: "destructive", title: "Failed to add task." });
    } finally {
        setIsSavingManualTask(false);
    }
  }


  const visibleTasks = useMemo(() => {
    return tasks
      .filter((task) => {
        const dueDate = toDate(task.dueDate);
        if (!dueDate) return false;
        // Show tasks with no due date only on the 'today' view if they are not completed
        if (!task.dueDate && isToday(selectedDate)) return !task.completed;
        return isSameDay(dueDate, selectedDate);
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
  ): { class: string; name: Urgency } => {
    if (completed || !dueDate)
      return {
        class: "border-l-gray-400",
        name: "neutral",
      };
    if (isPast(dueDate) && !isToday(dueDate))
      return {
        class: "border-l-red-500",
        name: "hot",
      };
    if (isToday(dueDate))
      return {
        class: "border-l-yellow-500",
        name: "warm",
      };
    return {
      class: "border-l-blue-500",
      name: "cold",
    };
  };
  
  const getLoaderClass = (urgency: Urgency) => {
    const mapping = {
      hot: 'loader-hot',
      warm: 'loader-warm',
      cold: 'loader-cold',
      neutral: 'loader-neutral'
    }
    return mapping[urgency];
  }


  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Logo className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="bg-card border-b p-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SidebarTrigger />
            <ListTodo className="h-8 w-8 text-primary hidden sm:block" />
            <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight">My Tasks</h1>
                {overdueTasks.length > 0 && (
                    <Button variant="destructive" size="sm" className="h-7 blinking-badge" onClick={() => setIsOverdueDialogOpen(true)}>
                        <AlertTriangle className="h-4 w-4 mr-2" />
                        {overdueTasks.length} Overdue
                    </Button>
                )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsManualTaskOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Task
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-auto justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-0 sm:mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">{selectedDate ? format(selectedDate, "PPP") : <span>Pick a date</span>}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(day) => day && setSelectedDate(day)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6">
        {visibleTasks.length > 0 ? (
          <div className="space-y-3">
            {visibleTasks.map((task) => {
              const dueDate = toDate(task.dueDate);
              const { class: urgencyClass, name: urgencyName } =
                getUrgency(dueDate, task.completed);
              const isNavigating = activeTask === task.id;

              return (
                <div key={task.id} className="relative">
                  {task.leadId ? (
                    <Link
                      href={`/contacts/${task.leadId}`}
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
                              : "border-muted-foreground/50 hover:border-primary"
                          )}
                        >
                          {task.completed && <Check className="h-5 w-5" />}
                        </button>
                      </div>
                      {isNavigating && (
                        <div
                          className={cn(
                            "absolute bottom-0 h-1 w-full",
                            getLoaderClass(urgencyName)
                          )}
                        />
                      )}
                    </Link>
                  ) : (
                     <div className={cn(
                        "block rounded-lg border bg-card text-card-foreground shadow-sm",
                        "border-l-4",
                        urgencyClass
                      )}>
                        <div className="flex items-center p-3">
                          <div className="flex-1">
                            <p className={cn("font-semibold text-base leading-tight", task.completed && "line-through text-muted-foreground")}>
                              {task.description}
                            </p>
                            <p className="text-sm text-muted-foreground mt-1">
                              {task.leadName || "Manual Task"}
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
                                : "border-muted-foreground/50 hover:border-primary"
                            )}
                          >
                            {task.completed && <Check className="h-5 w-5" />}
                          </button>
                        </div>
                    </div>
                  )}
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
      
       <Dialog open={isManualTaskOpen} onOpenChange={setIsManualTaskOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a Manual Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
             <Textarea 
                placeholder="What do you need to do?" 
                value={manualTaskDescription}
                onChange={(e) => setManualTaskDescription(e.target.value)}
                className="min-h-[100px]"
             />
              <Popover open={isContactListOpen} onOpenChange={setIsContactListOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={isContactListOpen}
                        className="w-full justify-between font-normal"
                    >
                       <div className="flex items-center gap-2">
                         <User className="h-4 w-4 text-muted-foreground"/>
                         {selectedLead ? selectedLead.name : "Select contact (optional)"}
                       </div>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                    <Command>
                        <CommandInput placeholder="Search contact..." />
                        <CommandEmpty>No contact found.</CommandEmpty>
                        <CommandList>
                            <CommandGroup>
                                {leads.map((lead) => (
                                    <CommandItem
                                        key={lead.id}
                                        value={lead.name}
                                        onSelect={() => {
                                            setSelectedLead(lead.id === selectedLead?.id ? null : lead);
                                            setIsContactListOpen(false);
                                        }}
                                    >
                                        <CheckIcon
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                selectedLead?.id === lead.id ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                        {lead.name}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>

             <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant={"outline"}
                        className={cn("w-full justify-start text-left font-normal", !manualTaskDueDate && "text-muted-foreground")}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {manualTaskDueDate ? format(manualTaskDueDate, "PPP") : <span>Pick a due date</span>}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                    <Calendar
                        mode="single"
                        selected={manualTaskDueDate}
                        onSelect={(day) => day && setManualTaskDueDate(day)}
                        initialFocus
                    />
                </PopoverContent>
            </Popover>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsManualTaskOpen(false)}>Cancel</Button>
            <Button onClick={handleAddManualTask} disabled={isSavingManualTask}>
                {isSavingManualTask ? "Adding..." : "Add Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
       </Dialog>
      
       <Dialog open={isOverdueDialogOpen} onOpenChange={setIsOverdueDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Overdue Tasks ({overdueTasks.length})</DialogTitle>
                <DialogDescription>
                    These tasks are past their due date.
                </DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto -mx-6 px-6 py-4 space-y-3">
                {overdueTasks.sort((a,b) => toDate(a.dueDate)!.getTime() - toDate(b.dueDate)!.getTime()).map(task => (
                     <div key={task.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                        <button
                          onClick={() => handleMarkComplete(task.id, true)}
                          className={cn( "flex items-center justify-center h-6 w-6 rounded-full border-2 transition-colors shrink-0 border-muted-foreground/50 hover:border-primary")}
                        />
                        <div className="flex-1">
                            <Link href={`/contacts/${task.leadId}`} onClick={() => setIsOverdueDialogOpen(false)} className="hover:underline">
                                <p className="font-medium">{task.description}</p>
                                <p className="text-sm text-muted-foreground">{task.leadName}</p>
                            </Link>
                        </div>
                        <p className="text-xs text-destructive font-semibold">{format(toDate(task.dueDate)!, 'MMM d')}</p>
                    </div>
                ))}
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsOverdueDialogOpen(false)}>Close</Button>
            </DialogFooter>
        </DialogContent>
       </Dialog>
    </div>
  );
}

