
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useParams, useRouter } from 'next/navigation';
import { produce } from 'immer';
import { ArrowLeft, Users, Mail, Phone, User, Briefcase, Clock, ToggleLeft, ToggleRight, Radio, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';

import { db } from '@/lib/firebase';
import type { AppSettings, Lead, CourseSchedule, SessionGroup } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Logo } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { LeadView } from '@/components/feature/lead-view';
import { LearnerView } from '@/components/feature/learner-view';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const ToggleGroupContext = React.createContext<{value: string, onValueChange: (v:string)=>void}>({value: "", onValueChange: (v:string)=>{}});


export default function ContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { toast } = useToast();

  const [lead, setLead] = useState<Lead | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Schedule Management State
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<SessionGroup | null>(null);
  const [currentSchedule, setCurrentSchedule] = useState<CourseSchedule | null>(null);
  
  const fetchInitialData = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const leadDocRef = doc(db, 'leads', id);
      const leadDoc = await getDoc(leadDocRef);

      if (leadDoc.exists()) {
        const leadData = { id: leadDoc.id, ...leadDoc.data() } as Lead;
        setLead(leadData);
        setCurrentSchedule(leadData.courseSchedule || { sessionGroups: [] });
      } else {
        toast({ variant: 'destructive', title: 'Contact not found.' });
        router.push('/contacts');
        return;
      }
      
      const settingsDocRef = doc(db, 'settings', 'appConfig');
      const settingsDoc = await getDoc(settingsDocRef);
      if(settingsDoc.exists()) {
        setAppSettings(settingsDoc.data() as AppSettings);
      }
    } catch (error) {
      console.error('Error fetching initial data:', error);
      toast({ variant: 'destructive', title: 'Failed to load contact data.' });
    } finally {
        setIsLoading(false);
    }
  }, [id, router, toast]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const handleUpdate = async (field: keyof Lead | string, value: any) => {
    if (!lead) return;
    
    const updatePayload: { [key: string]: any } = {};
    updatePayload[field] = value;
    
    const originalLead = { ...lead };
    
    const updatedLead = produce(lead, draft => {
        const keys = field.split('.');
        let current: any = draft;
        keys.slice(0, -1).forEach(key => {
            if (!current[key]) current[key] = {};
            current = current[key];
        });
        current[keys[keys.length - 1]] = value;
    });
    setLead(updatedLead);
    
    try {
      const leadRef = doc(db, 'leads', id);
      await updateDoc(leadRef, updatePayload);
      toast({ title: 'Contact Updated' });
    } catch (error) {
      console.error('Error updating contact:', error);
      toast({ variant: 'destructive', title: 'Update failed' });
      setLead(originalLead); // Revert on failure
    }
  };

  const generateScheduleSummary = (schedule: CourseSchedule | null | undefined): string => {
    if (!schedule || !schedule.sessionGroups || schedule.sessionGroups.length === 0) {
      return 'Not set.';
    }
  
    const summaryParts = schedule.sessionGroups.map(group => {
      const days = group.schedule.map(s => s.day.substring(0, 3)).join(', ');
      const times = [...new Set(group.schedule.map(s => s.timeSlot.replace(/\s/g, '')))].join(', ');
      const sections = group.sections.join(', ');
      
      let part = `${group.trainer} (${sections}): ${days} ${times}`;
      return part;
    });
  
    const mode = schedule.sessionGroups[0]?.mode || '';
    const format = schedule.sessionGroups[0]?.format || '';
  
    return `${mode}, ${format} | ${summaryParts.join(' | ')}`;
  };
  
  const handleScheduleSave = async (newSchedule: CourseSchedule) => {
    if (!lead) return;
    const summary = generateScheduleSummary(newSchedule);
    
    const updatePayload = {
      courseSchedule: newSchedule,
      'commitmentSnapshot.schedule': summary
    };

    setLead(prev => prev ? produce(prev, draft => {
      draft.courseSchedule = newSchedule;
      if (draft.commitmentSnapshot) {
        draft.commitmentSnapshot.schedule = summary;
      }
    }) : null);

    setCurrentSchedule(newSchedule);
    
    try {
      const leadRef = doc(db, 'leads', id);
      await updateDoc(leadRef, updatePayload);
      toast({ title: 'Schedule Updated' });
      setIsScheduleModalOpen(false);
      setEditingGroup(null);
    } catch (error) {
      console.error('Error updating schedule:', error);
      toast({ variant: 'destructive', title: 'Failed to save schedule.' });
    }
  };

  if (isLoading || !lead || !appSettings) {
    return <div className="flex h-screen items-center justify-center"><Logo className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="bg-card border-b p-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" asChild>
                    <Link href="/contacts"><ArrowLeft/></Link>
                </Button>
                <div>
                    <h1 className="text-xl font-bold tracking-tight">{lead.name}</h1>
                    <div className="flex items-center gap-2">
                        <Badge variant={lead.status === 'Active' ? 'default' : 'secondary'}>{lead.status}</Badge>
                        <Separator orientation="vertical" className="h-4"/>
                        <p className="text-sm text-muted-foreground">{lead.relationship}</p>
                    </div>
                </div>
            </div>
             <div>
                {/* Add Actions like Edit/Delete/Merge here */}
            </div>
        </div>
      </header>
      
      <main className="flex-1 p-4 sm:p-6 md:p-8">
        {lead.relationship === 'Learner' ? (
            <LearnerView 
                lead={lead} 
                appSettings={appSettings} 
                onUpdate={handleUpdate}
                onScheduleEdit={() => { setEditingGroup(null); setIsScheduleModalOpen(true); }}
                onSessionGroupEdit={(group) => { setEditingGroup(group); setIsScheduleModalOpen(true); }}
                onScheduleSave={handleScheduleSave}
                currentSchedule={currentSchedule}
            />
        ) : (
            <LeadView 
                lead={lead} 
                appSettings={appSettings} 
                onUpdate={handleUpdate}
            />
        )}
      </main>
      
       {isScheduleModalOpen && (
          <ScheduleEditorModal
            isOpen={isScheduleModalOpen}
            onClose={() => { setIsScheduleModalOpen(false); setEditingGroup(null); }}
            onSave={handleScheduleSave}
            appSettings={appSettings}
            learnerSchedule={currentSchedule}
            editingGroup={editingGroup}
          />
       )}
    </div>
  );
}

interface ScheduleEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (schedule: CourseSchedule) => void;
  appSettings: AppSettings;
  learnerSchedule: CourseSchedule | null | undefined;
  editingGroup: SessionGroup | null;
}

function ScheduleEditorModal({ isOpen, onClose, onSave, appSettings, learnerSchedule, editingGroup }: ScheduleEditorModalProps) {
  const [sessionGroup, setSessionGroup] = useState<Partial<SessionGroup>>({});
  const { toast } = useToast();
  
  useEffect(() => {
    if (editingGroup) {
      setSessionGroup(editingGroup);
    } else {
      setSessionGroup({
        groupId: `group_${Date.now()}`,
        sections: [],
        schedule: [],
        mode: learnerSchedule?.sessionGroups?.[0]?.mode || 'Online',
        format: learnerSchedule?.sessionGroups?.[0]?.format || '1-1',
      });
    }
  }, [editingGroup, isOpen, learnerSchedule]);

  const handleSave = () => {
    const finalGroup = sessionGroup as SessionGroup;
    if (!finalGroup.trainer || !finalGroup.sections?.length || !finalGroup.schedule?.length) {
      toast({ variant: "destructive", title: "Please fill all fields." });
      return;
    }

    const newSchedule = produce(learnerSchedule || { sessionGroups: [] }, draft => {
        const overallMode = draft.sessionGroups[0]?.mode || finalGroup.mode;
        const overallFormat = draft.sessionGroups[0]?.format || finalGroup.format;

        finalGroup.mode = overallMode;
        finalGroup.format = overallFormat;

       const existingGroupIndex = draft.sessionGroups.findIndex(g => g.groupId === finalGroup.groupId);
       if (existingGroupIndex > -1) {
          draft.sessionGroups[existingGroupIndex] = finalGroup;
       } else {
          draft.sessionGroups.push(finalGroup);
       }
    });

    onSave(newSchedule);
  };
  
  const handleDayTimeChange = (index: number, day: string, time: string) => {
    const newSchedule = produce(sessionGroup.schedule || [], draft => {
      draft[index] = { day, timeSlot: time };
    });
    setSessionGroup(prev => ({ ...prev, schedule: newSchedule }));
  };

  const addDayTime = () => {
    const newSchedule = produce(sessionGroup.schedule || [], draft => {
        draft.push({ day: 'Monday', timeSlot: appSettings.timeSlots[0] || ''});
    });
    setSessionGroup(prev => ({...prev, schedule: newSchedule }));
  };
  
  const removeDayTime = (index: number) => {
    const newSchedule = produce(sessionGroup.schedule || [], draft => {
        draft.splice(index, 1);
    });
    setSessionGroup(prev => ({ ...prev, schedule: newSchedule }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingGroup ? 'Edit' : 'Add'} Session Group</DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div>
            <Label>Trainer</Label>
            <Select 
              value={sessionGroup.trainer} 
              onValueChange={trainer => setSessionGroup(prev => ({...prev, trainer}))}>
              <SelectTrigger>
                <SelectValue placeholder="Select a trainer..." />
              </SelectTrigger>
              <SelectContent>
                {appSettings.trainers.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Sections/Subjects</Label>
            <Input 
              placeholder="e.g. Power BI, Excel"
              value={sessionGroup.sections?.join(', ')}
              onChange={e => setSessionGroup(prev => ({...prev, sections: e.target.value.split(',').map(s => s.trim())}))} />
          </div>
          <div className="space-y-2">
            <Label>Schedule</Label>
            {sessionGroup.schedule?.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select value={s.day} onValueChange={day => handleDayTimeChange(i, day, s.timeSlot)}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>
                        {daysOfWeek.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={s.timeSlot} onValueChange={time => handleDayTimeChange(i, s.day, time)}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>
                        {appSettings.timeSlots.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" onClick={() => removeDayTime(i)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addDayTime}><Plus className="mr-2 h-4 w-4"/> Add Day/Time</Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const ToggleGroup = ({children}: {children: React.ReactNode}) => {
    return <div className="flex items-center rounded-md border">{children}</div>
}

export const ToggleGroupItem = ({value, children}: {value: string, children: React.ReactNode}) => {
    const context = React.useContext(ToggleGroupContext);
    const isActive = context.value === value;
    return <Button variant={isActive ? "secondary" : "ghost"} onClick={() => context.onValueChange(value)} className="rounded-none first:rounded-l-md last:rounded-r-md first:border-r last:border-l">{children}</Button>
}
