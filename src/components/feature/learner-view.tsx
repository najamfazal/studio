
"use client";

import React, { useState } from 'react';
import { produce } from 'immer';
import { Plus, Mail, Phone, BookOpen, Briefcase, User, Clock, Trash2 } from 'lucide-react';

import { db } from '@/lib/firebase';
import type { AppSettings, Lead, CourseSchedule, SessionGroup, PaymentPlan } from '@/lib/types';
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
    
    return (
        <Tabs defaultValue="overview">
        <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
            <TabsTrigger value="payplan">Pay Plan</TabsTrigger>
            <TabsTrigger value="leadlog">Lead Log</TabsTrigger>
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
        
        <TabsContent value="payplan">
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 h-[60vh] text-center text-muted-foreground">
            <BookOpen className="h-16 w-16 mb-4" />
            <h2 className="text-2xl font-semibold text-foreground">
                Coming Soon
            </h2>
            <p className="mt-2 max-w-xs">
                Payment plan management will be available in a future update.
            </p>
            </div>
        </TabsContent>
        
        <TabsContent value="leadlog">
            <LeadLogView lead={lead} appSettings={appSettings} />
        </TabsContent>
        </Tabs>
    );
}
