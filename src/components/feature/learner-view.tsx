
"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { produce } from 'immer';
import { Plus, Mail, Phone, BookOpen, Briefcase, User, Clock, Trash2, Check, Loader2 } from 'lucide-react';
import { collection, query, where, getDocs, orderBy, limit, startAfter, QueryDocumentSnapshot, DocumentData, doc, updateDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { parseISO } from 'date-fns';

import { db } from '@/lib/firebase';
import type { AppSettings, Lead, CourseSchedule, SessionGroup, PaymentPlan, Task } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { EditableField } from '@/components/editable-field';
import { Label } from '@/components/ui/label';
import { LeadLogView } from './lead-log-view';
import { ToggleGroup, ToggleGroupItem, ToggleGroupContext } from '@/app/contacts/[id]/page';

const TASK_PAGE_SIZE = 10;

// Helper to safely convert Firestore Timestamps or strings to Date objects
const toDate = (dateValue: any): Date | null => {
  if (!dateValue) return null;
  if (typeof dateValue === "string") return parseISO(dateValue);
  if (dateValue.toDate) return dateValue.toDate(); // Firestore Timestamp
  return null;
};

interface LearnerViewProps {
    lead: Lead;
    appSettings: AppSettings;
    onUpdate: (field: keyof Lead | string, value: any) => Promise<void>;
    onScheduleEdit: () => void;
    onSessionGroupEdit: (group: SessionGroup) => void;
    onScheduleSave: (schedule: CourseSchedule) => Promise<void>;
    currentSchedule: CourseSchedule | null;
}

export function LearnerView({ lead, appSettings, onUpdate, onScheduleEdit, onSessionGroupEdit, onScheduleSave, currentSchedule }: LearnerViewProps) {
    const { toast } = useToast();
    const id = lead.id;

    // Tasks state
    const [activeTasks, setActiveTasks] = useState<Task[]>([]);
    const [pastTasks, setPastTasks] = useState<Task[]>([]);
    const [isTasksLoading, setIsTasksLoading] = useState(false);
    const [tasksLoaded, setTasksLoaded] = useState(false);
    const [lastActiveTask, setLastActiveTask] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
    const [lastPastTask, setLastPastTask] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
    const [hasMoreActiveTasks, setHasMoreActiveTasks] = useState(true);
    const [hasMorePastTasks, setHasMorePastTasks] = useState(true);

    const handleScheduleChange = (value: any, type: 'mode' | 'format') => {
        if (!value) return;
        const newSchedule = produce(currentSchedule || { sessionGroups: [] }, draft => {
            draft.sessionGroups.forEach(g => { 
                if (type === 'mode') g.mode = value as 'Online' | 'In-person';
                if (type === 'format') g.format = value as '1-1' | 'Batch';
            });
        });
        onScheduleSave(newSchedule);
    };

    const handleSessionGroupDelete = (groupId: string) => {
        const newSchedule = produce(currentSchedule, draft => {
            if (draft) {
                draft.sessionGroups = draft.sessionGroups.filter(g => g.groupId !== groupId);
            }
        });
        if (newSchedule) onScheduleSave(newSchedule);
    };

    const fetchTasks = useCallback(async (type: 'active' | 'past', loadMore = false) => {
        if (!loadMore) setIsTasksLoading(true);
        
        try {
          const isCompleted = type === 'past';
          let qConstraints: any[] = [
            where('leadId', '==', id),
            where('completed', '==', isCompleted),
            orderBy('createdAt', 'desc'),
            limit(TASK_PAGE_SIZE)
          ];
    
          if (loadMore) {
            const lastVisible = type === 'active' ? lastActiveTask : lastPastTask;
            if (lastVisible) {
              qConstraints.push(startAfter(lastVisible));
            }
          }
    
          const q = query(collection(db, 'tasks'), ...qConstraints);
          const snapshot = await getDocs(q);
          const newTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
          
          const newLastVisible = snapshot.docs[snapshot.docs.length - 1] || null;
    
          if (type === 'active') {
            setHasMoreActiveTasks(newTasks.length === TASK_PAGE_SIZE);
            setLastActiveTask(newLastVisible);
            setActiveTasks(prev => loadMore ? [...prev, ...newTasks] : newTasks);
          } else {
            setHasMorePastTasks(newTasks.length === TASK_PAGE_SIZE);
            setLastPastTask(newLastVisible);
            setPastTasks(prev => loadMore ? [...prev, ...newTasks] : newTasks);
          }
        } catch (error) {
          console.error(`Error fetching ${type} tasks:`, error);
          toast({ variant: "destructive", title: `Failed to load ${type} tasks.` });
        } finally {
          setIsTasksLoading(false);
        }
    }, [id, toast, lastActiveTask, lastPastTask]);
    
    const handleTabChange = (value: string) => {
        if (value === 'tasks' && !tasksLoaded) {
          setTasksLoaded(true);
        }
    };

    useEffect(() => {
        if (tasksLoaded) {
            setActiveTasks([]);
            setPastTasks([]);
            setLastActiveTask(null);
            setLastPastTask(null);
            setHasMoreActiveTasks(true);
            setHasMorePastTasks(true);
            fetchTasks('active');
            fetchTasks('past');
        }
    }, [tasksLoaded, fetchTasks]);

    const handleTaskCompletion = async (task: Task, isCompleted: boolean) => {
        try {
          await updateDoc(doc(db, 'tasks', task.id), { completed: isCompleted });
          
          if (isCompleted) {
            setActiveTasks(prev => prev.filter(t => t.id !== task.id));
            setPastTasks(prev => [{...task, completed: true}, ...prev]);
          } else {
            setPastTasks(prev => prev.filter(t => t.id !== task.id));
            setActiveTasks(prev => [{...task, completed: false}, ...prev]);
          }
          toast({title: `Task marked as ${isCompleted ? 'complete' : 'active'}.`});
        } catch (e) {
          toast({variant: 'destructive', title: 'Failed to update task status.'});
        }
    }
    
    return (
        <Tabs defaultValue="overview" onValueChange={handleTabChange}>
            <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="schedule">Schedule</TabsTrigger>
                <TabsTrigger value="tasks">Tasks</TabsTrigger>
            </TabsList>
            
            <TabsContent value="overview" className="space-y-4">
                <Card>
                    <CardHeader className="p-4"><CardTitle className="text-lg">Contact Details</CardTitle></CardHeader>
                    <CardContent className="p-4 pt-0 space-y-2">
                    {lead.email && (
                        <div className="flex items-center gap-3">
                        <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <a href={`mailto:${lead.email}`} className="text-sm hover:underline">
                            {lead.email}
                        </a>
                        </div>
                    )}
                    {(lead.phones || []).map((phone, index) => (
                        <div key={index} className="flex items-center gap-3">
                            <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <a href={`tel:${phone.number}`} className="text-sm">
                            {phone.number}
                            </a>
                            {phone.type !== 'both' && <Badge variant="secondary" className="text-xs capitalize">{phone.type}</Badge>}
                        </div>
                    ))}
                    </CardContent>
                </Card>
                <Card>
                <CardHeader className="p-4"><CardTitle className="text-lg">Commitment Snapshot</CardTitle></CardHeader>
                <CardContent className="p-4 pt-0 space-y-4">
                    <div className="flex items-start gap-4">
                    <div className="flex-grow-[3]">
                        <EditableField label="Course" value={lead.commitmentSnapshot?.course || ""} onSave={(val) => onUpdate('commitmentSnapshot.course', val)} type="select" selectOptions={appSettings.courseNames || []} placeholder="Select a course"/>
                    </div>
                    <div className="flex-grow-[1]">
                        <EditableField label="Price" value={lead.commitmentSnapshot?.price || ""} onSave={(val) => onUpdate('commitmentSnapshot.price', val)} inputType="number" placeholder="Enter price"/>
                    </div>
                    </div>
                    <div>
                        <p className="text-xs font-medium text-muted-foreground">Schedule Summary</p>
                        <p className="text-sm">{lead.commitmentSnapshot?.schedule || 'Not set.'}</p>
                    </div>
                    <div>
                    <EditableField label="Key Notes" value={lead.commitmentSnapshot?.keyNotes || ""} onSave={(val) => onUpdate('commitmentSnapshot.keyNotes', val)} type="textarea" placeholder="Add key negotiation points..."/>
                    </div>
                </CardContent>
                </Card>
            </TabsContent>
            
            <TabsContent value="schedule">
                <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>Training Schedule</CardTitle>
                        <CardDescription>Manage this learner&apos;s weekly sessions.</CardDescription>
                    </div>
                    <Button onClick={onScheduleEdit}>
                        <Plus className="mr-2 h-4 w-4"/> Add Session Group
                    </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center space-x-4 rounded-md border p-4">
                        <div className="flex items-center space-x-2">
                            <Label>Mode:</Label>
                            <ToggleGroupContext.Provider value={{
                                value: currentSchedule?.sessionGroups?.[0]?.mode || 'Online',
                                onValueChange: (value) => handleScheduleChange(value, 'mode')
                            }}>
                                <ToggleGroup>
                                    <ToggleGroupItem value="Online">Online</ToggleGroupItem>
                                    <ToggleGroupItem value="In-person">In-person</ToggleGroupItem>
                                </ToggleGroup>
                            </ToggleGroupContext.Provider>
                        </div>
                        <Separator orientation="vertical" className="h-6"/>
                        <div className="flex items-center space-x-2">
                            <Label>Format:</Label>
                            <ToggleGroupContext.Provider value={{
                                value: currentSchedule?.sessionGroups?.[0]?.format || '1-1',
                                onValueChange: (value) => handleScheduleChange(value, 'format')
                            }}>
                                <ToggleGroup>
                                    <ToggleGroupItem value="1-1">1-on-1</ToggleGroupItem>
                                    <ToggleGroupItem value="Batch">Batch</ToggleGroupItem>
                                </ToggleGroup>
                            </ToggleGroupContext.Provider>
                        </div>
                    </div>

                    {currentSchedule?.sessionGroups && currentSchedule.sessionGroups.length > 0 ? (
                    currentSchedule.sessionGroups.map((group) => (
                        <Card key={group.groupId} className="overflow-hidden">
                        <CardHeader className="bg-muted/50 p-4">
                            <div className="flex items-center justify-between">
                            <div className="grid gap-0.5">
                                <CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground"/> {group.trainer}</CardTitle>
                                <CardDescription className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-muted-foreground"/>{group.sections.join(', ')}</CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button variant="ghost" size="sm" onClick={() => onSessionGroupEdit(group)}>Edit</Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleSessionGroupDelete(group.groupId)}>
                                    <Trash2 className="h-4 w-4"/>
                                </Button>
                            </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 text-sm">
                            <ul className="space-y-2">
                                {group.schedule.map((s, i) => (
                                <li key={i} className="flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-muted-foreground"/> <span>{s.day} @ {s.timeSlot}</span>
                                </li>
                                ))}
                            </ul>
                        </CardContent>
                        </Card>
                    ))
                    ) : (
                    <div className="text-center text-muted-foreground py-10">No schedule set up for this learner yet.</div>
                    )}
                </CardContent>
                </Card>
            </TabsContent>
            
             <TabsContent value="tasks" className="space-y-4">
                <Card>
                    <CardHeader className="p-4"><CardTitle className="text-lg">Active Tasks</CardTitle></CardHeader>
                    <CardContent className="p-4 pt-0">
                    {isTasksLoading && activeTasks.length === 0 && <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div>}
                    {activeTasks.length > 0 && (
                        <div className="space-y-2">
                        {activeTasks.map(task => (
                            <div key={task.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                            <button onClick={() => handleTaskCompletion(task, true)} className="flex items-center justify-center h-5 w-5 rounded-full border-2 border-muted-foreground/50 hover:border-primary shrink-0" />
                            <p className="flex-1 text-sm">{task.description}</p>
                            {task.dueDate && <p className="text-xs text-muted-foreground">{format(toDate(task.dueDate)!, 'MMM d')}</p>}
                            </div>
                        ))}
                        </div>
                    )}
                    {!isTasksLoading && activeTasks.length === 0 && <p className="text-sm text-center text-muted-foreground p-4">No active tasks.</p>}
                    {hasMoreActiveTasks && !isTasksLoading && (
                        <div className="flex justify-center mt-4">
                        <Button variant="outline" size="sm" onClick={() => fetchTasks('active', true)} disabled={isTasksLoading}>
                            Load More
                        </Button>
                        </div>
                    )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="p-4"><CardTitle className="text-lg">Past Tasks</CardTitle></CardHeader>
                    <CardContent className="p-4 pt-0">
                    {isTasksLoading && pastTasks.length === 0 && <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div>}
                    {pastTasks.length > 0 && (
                        <div className="space-y-2">
                        {pastTasks.map(task => (
                            <div key={task.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                            <button onClick={() => handleTaskCompletion(task, false)} className="flex items-center justify-center h-5 w-5 rounded-full border-2 bg-primary border-primary text-primary-foreground shrink-0">
                                <Check className="h-4 w-4"/>
                            </button>
                            <p className="flex-1 text-sm text-muted-foreground line-through">{task.description}</p>
                            {task.dueDate && <p className="text-xs text-muted-foreground">{format(toDate(task.dueDate)!, 'MMM d')}</p>}
                            </div>
                        ))}
                        </div>
                    )}
                    {!isTasksLoading && pastTasks.length === 0 && <p className="text-sm text-center text-muted-foreground p-4">No past tasks.</p>}
                    {hasMorePastTasks && !isTasksLoading && (
                        <div className="flex justify-center mt-4">
                        <Button variant="outline" size="sm" onClick={() => fetchTasks('past', true)} disabled={isTasksLoading}>
                            Load More
                        </Button>
                        </div>
                    )}
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
    );
}
