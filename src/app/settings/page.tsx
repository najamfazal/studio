
"use client";

import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AppSettings, ThemeSettings } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Logo } from '@/components/icons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, Settings, Trash2, X, Pencil, Check } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { produce } from 'immer';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { reindexLeadsAction } from '@/app/actions';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { Label } from '@/components/ui/label';
import { errorEmitter } from '@/lib/error-emitter';
import { FirestorePermissionError } from '@/lib/errors';

type FeedbackCategory = 'content' | 'schedule' | 'price';
type AppSettingsField = 'courseNames' | 'commonTraits' | 'withdrawalReasons' | 'relationshipTypes' | 'trainers' | 'timeSlots' | 'infoLogOptions';

const colorPalettes: { name: string; colors: ThemeSettings }[] = [
    { name: 'Default', colors: { primary: '231 48% 48%', background: '0 0% 98%', accent: '262 39% 55%' } },
    { name: 'Stone', colors: { primary: '24 9.8% 10%', background: '0 0% 96.1%', accent: '24 5.4% 63.9%' } },
    { name: 'Rose', colors: { primary: '346.8 77.2% 49.8%', background: '0 0% 97.3%', accent: '346.8 72.2% 50.8%' } },
    { name: 'Mint', colors: { primary: '142.1 76.2% 36.3%', background: '143 76% 97%', accent: '142.1 70.6% 45.3%' } },
    { name: 'Cobalt', colors: { primary: '221.2 83.2% 53.3%', background: '224 71% 95%', accent: '221.2 83.2% 53.3%' } },
];

export default function SettingsPage() {
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();
    const router = useRouter();

    const [newCourseName, setNewCourseName] = useState("");
    const [newTrait, setNewTrait] = useState("");
    const [newWithdrawalReason, setNewWithdrawalReason] = useState("");
    const [newRelationshipType, setNewRelationshipType] = useState("");
    const [newTrainer, setNewTrainer] = useState("");
    const [newTimeSlot, setNewTimeSlot] = useState("");
    const [newInfoLogOption, setNewInfoLogOption] = useState("");
    const [newFeedbackChip, setNewFeedbackChip] = useState<{ category: FeedbackCategory | null, value: string }>({ category: null, value: "" });

    const [editingItem, setEditingItem] = useState<{ field: string; index: number; value: string } | null>(null);
    const [isReindexing, setIsReindexing] = useState(false);


    const fetchSettings = useCallback(async () => {
        setIsLoading(true);
        try {
            const settingsDocRef = doc(db, "settings", "appConfig");
            const settingsDoc = await getDoc(settingsDocRef);
            if (settingsDoc.exists()) {
                const data = settingsDoc.data();
                const defaultTheme = { primary: '231 48% 48%', background: '0 0% 98%', accent: '262 39% 55%' };
                const completeSettings: AppSettings = {
                    courseNames: data.courseNames || [],
                    commonTraits: data.commonTraits || [],
                    withdrawalReasons: data.withdrawalReasons || [],
                    relationshipTypes: data.relationshipTypes || ['Lead', 'Learner'],
                    trainers: data.trainers || [],
                    timeSlots: data.timeSlots || [],
                    infoLogOptions: data.infoLogOptions || ["Sent brochure", "Quoted", "Shared schedule"],
                    feedbackChips: data.feedbackChips || { content: [], schedule: [], price: [] },
                    theme: data.theme || defaultTheme,
                    id: settingsDoc.id,
                };
                setSettings(completeSettings);
            } else {
                const defaultSettings: AppSettings = {
                    courseNames: ["Example Course 1", "Example Course 2"],
                    commonTraits: ["Decisive", "Budget-conscious"],
                    withdrawalReasons: ["Not interested", "Found alternative"],
                    relationshipTypes: ["Lead", "Learner", "Archived", "Graduated"],
                    trainers: ["Jhonny", "Marie", "Faisal"],
                    timeSlots: ["09:00 A - 11:00 A", "11:00 A - 01:00 P"],
                    infoLogOptions: ["Sent brochure", "Quoted", "Shared schedule"],
                    feedbackChips: {
                        content: ["Not relevant", "Too complex"],
                        schedule: ["Wrong time", "Too long"],
                        price: ["Too expensive", "No budget"],
                    },
                    theme: { primary: '231 48% 48%', background: '0 0% 98%', accent: '262 39% 55%' }
                };
                await setDoc(settingsDocRef, defaultSettings);
                setSettings(defaultSettings);
                toast({ title: "Settings initialized with default values." });
            }
        } catch (error: any) {
            console.error("Error fetching settings:", error);
            if (error.code === 'permission-denied') {
                const permissionError = new FirestorePermissionError({
                    path: 'settings/appConfig',
                    operation: 'get',
                });
                errorEmitter.emit('permission-error', permissionError);
            }
            toast({ variant: "destructive", title: "Could not load app settings." });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    const handleSave = async (updatePayload: Partial<AppSettings>, newSettingsState: AppSettings) => {
        if (!settings) return;

        // Optimistic UI update
        const originalSettings = settings;
        setSettings(newSettingsState);
        setIsSaving(true);

        try {
            const settingsDocRef = doc(db, "settings", "appConfig");
            await updateDoc(settingsDocRef, updatePayload)
            .catch(async (serverError) => {
                if (serverError.code === 'permission-denied') {
                    const permissionError = new FirestorePermissionError({
                        path: 'settings/appConfig',
                        operation: 'update',
                        requestResourceData: updatePayload,
                    });
                    errorEmitter.emit('permission-error', permissionError);
                }
                throw serverError; // re-throw to be caught by outer catch
            });
            toast({ title: "Settings Saved", description: "Your changes have been saved successfully." });
            
            if (updatePayload.theme) {
              toast({ title: 'Theme changed!', description: 'Reloading to apply new colors...' });
              setTimeout(() => {
                  router.refresh();
              }, 1500);
            }

        } catch (error) {
            // Revert on error
            setSettings(originalSettings);
            console.error("Error saving settings:", error);
            toast({ variant: "destructive", title: "Save Failed", description: "Could not save your changes." });
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleRenameItem = () => {
        if (!editingItem || !settings) return;

        const { field, index, value } = editingItem;
        if (!value.trim()) {
            toast({ variant: 'destructive', title: 'Item name cannot be empty.' });
            return;
        }

        const newSettings = produce(settings, draft => {
            if (field.startsWith('feedbackChips.')) {
                const category = field.split('.')[1] as FeedbackCategory;
                draft.feedbackChips[category][index] = value;
            } else {
                (draft[field as AppSettingsField] as string[])[index] = value;
            }
        });

        const updatePath = field;
        const updatePayload: { [key: string]: any } = {};
        if (updatePath.includes('.')) {
            const [parent] = updatePath.split('.') as ['feedbackChips'];
            updatePayload[parent] = { ...newSettings.feedbackChips };
        } else {
            updatePayload[updatePath] = newSettings[updatePath as keyof AppSettings];
        }

        handleSave(updatePayload, newSettings);
        setEditingItem(null);
    }


    const handleAddItem = (field: AppSettingsField | `feedbackChips.${FeedbackCategory}`) => {
        if (!settings) return;
        
        let valueToAdd = "";
        let fieldKey: keyof Omit<AppSettings, 'id' | 'feedbackChips' | 'theme'> | 'feedbackChips.content' | 'feedbackChips.schedule' | 'feedbackChips.price' | 'trainers' | 'timeSlots' | 'infoLogOptions' = 'courseNames';

        if (field === 'courseNames') {
            if (!newCourseName) return;
            valueToAdd = newCourseName;
            fieldKey = 'courseNames';
            setNewCourseName("");
        } else if (field === 'commonTraits') {
            if (!newTrait) return;
            valueToAdd = newTrait;
            fieldKey = 'commonTraits';
            setNewTrait("");
        } else if (field === 'withdrawalReasons') {
            if (!newWithdrawalReason) return;
            valueToAdd = newWithdrawalReason;
            fieldKey = 'withdrawalReasons';
            setNewWithdrawalReason("");
        } else if (field === 'relationshipTypes') {
            if(!newRelationshipType) return;
            valueToAdd = newRelationshipType;
            fieldKey = 'relationshipTypes';
            setNewRelationshipType("");
        } else if (field === 'trainers') {
            if (!newTrainer) return;
            valueToAdd = newTrainer;
            fieldKey = 'trainers';
            setNewTrainer("");
        } else if (field === 'timeSlots') {
            if (!newTimeSlot) return;
            valueToAdd = newTimeSlot;
            fieldKey = 'timeSlots';
            setNewTimeSlot("");
        } else if (field === 'infoLogOptions') {
            if (!newInfoLogOption) return;
            valueToAdd = newInfoLogOption;
            fieldKey = 'infoLogOptions';
            setNewInfoLogOption("");
        }
        else if (field.startsWith('feedbackChips.')) {
            const category = newFeedbackChip.category;
            if (!category || !newFeedbackChip.value) return;
            valueToAdd = newFeedbackChip.value;
            fieldKey = field;
            setNewFeedbackChip({ category: null, value: "" });
        }

        const newSettings = produce(settings, draft => {
            let list: string[];
            if (fieldKey.startsWith('feedbackChips.')) {
                const category = fieldKey.split('.')[1] as FeedbackCategory;
                list = draft.feedbackChips[category];
            } else {
                list = draft[fieldKey as keyof Omit<AppSettings, 'id'| 'feedbackChips' | 'theme'>] as string[];
            }
            if (!list.includes(valueToAdd)) {
                list.push(valueToAdd);
            } else {
                 toast({ variant: "destructive", title: "Item already exists." });
            }
        });

        if (newSettings === settings) return; // No change was made

        const updatePath = fieldKey;
        const updatePayload: { [key: string]: any } = {};
         if (updatePath.includes('.')) {
            const [parent] = updatePath.split('.') as ['feedbackChips'];
            updatePayload[parent] = { ...newSettings.feedbackChips };
        } else {
            updatePayload[updatePath] = newSettings[updatePath as keyof AppSettings];
        }

        handleSave(updatePayload, newSettings);
    };

    const handleRemoveItem = (field: AppSettingsField | `feedbackChips.${FeedbackCategory}`, itemToRemove: string) => {
        if (!settings) return;

        const newSettings = produce(settings, draft => {
            let list: string[];
            if (field.startsWith('feedbackChips.')) {
                const category = field.split('.')[1] as FeedbackCategory;
                list = draft.feedbackChips[category];
            } else {
                list = draft[field as keyof Omit<AppSettings, 'id' | 'feedbackChips' | 'theme'>] as string[];
            }
            const index = list.indexOf(itemToRemove);
            if (index > -1) {
                list.splice(index, 1);
            }
        });

        const updatePath = field;
        const updatePayload: { [key: string]: any } = {};
        if (updatePath.includes('.')) {
            const [parent] = updatePath.split('.') as ['feedbackChips'];
            updatePayload[parent] = { ...newSettings.feedbackChips };
        } else {
            updatePayload[updatePath] = newSettings[updatePath as keyof AppSettings];
        }

        handleSave(updatePayload, newSettings);
    };
    
    const handleReindex = async () => {
        setIsReindexing(true);
        toast({ title: 'Re-indexing started...', description: 'This may take a few moments.' });
        try {
            const result = await reindexLeadsAction();
            if (result.success) {
                toast({ title: 'Re-indexing Complete!', description: `${result.processed} contacts are now searchable.` });
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            toast({ variant: 'destructive', title: 'Re-indexing Failed', description: error instanceof Error ? error.message : "An unknown error occurred." });
        } finally {
            setIsReindexing(false);
        }
    };

    const renderChipList = (
        field: AppSettingsField | `feedbackChips.${FeedbackCategory}`,
        items: string[]
    ) => {
        return (
            <div className="flex flex-wrap gap-2">
                {items.map((item, index) => {
                    const isEditing = editingItem?.field === field && editingItem?.index === index;
                    return (
                        <div key={`${field}-${index}`}>
                            {isEditing ? (
                                <div className="flex items-center gap-1">
                                    <Input
                                        value={editingItem.value}
                                        onChange={e => setEditingItem({ ...editingItem, value: e.target.value })}
                                        onKeyDown={e => e.key === 'Enter' && handleRenameItem()}
                                        autoFocus
                                        className="h-7 text-xs"
                                    />
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleRenameItem}><Check className="h-4 w-4 text-green-600"/></Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingItem(null)}><X className="h-4 w-4"/></Button>
                                </div>
                            ) : (
                                <Badge variant="secondary" className="text-sm items-center">
                                    {item}
                                    <button onClick={() => setEditingItem({ field, index, value: item })} className="ml-2 rounded-full hover:bg-muted-foreground/20 p-0.5">
                                        <Pencil className="h-3 w-3" />
                                    </button>
                                    <button onClick={() => handleRemoveItem(field, item)} className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5">
                                        <X className="h-3 w-3" />
                                    </button>
                                </Badge>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    const handleThemeUpdate = (newTheme: ThemeSettings) => {
        if (!settings) return;
        const newSettings = produce(settings, draft => {
            draft.theme = newTheme;
        });
        handleSave({ theme: newTheme }, newSettings);
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Logo className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }
    
    if (!settings) {
         return (
            <div className="flex items-center justify-center min-h-screen">
                <p>Could not load settings. Please try again.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen bg-background">
            <header className="bg-card border-b p-4 flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <SidebarTrigger />
                    <Settings className="h-8 w-8 text-primary hidden sm:block" />
                    <h1 className="text-xl font-bold tracking-tight">App Settings</h1>
                </div>
            </header>
            <main className="flex-1 p-4 sm:p-6 md:p-8">
                <div className="grid gap-6 max-w-4xl mx-auto">
                    <Card>
                        <CardHeader>
                            <CardTitle>Theme Customization</CardTitle>
                            <CardDescription>Customize the look and feel of your app.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div>
                                <h3 className="font-semibold mb-2 text-sm">Color Palettes</h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                                    {colorPalettes.map(palette => (
                                        <button key={palette.name} onClick={() => handleThemeUpdate(palette.colors)} className={cn("text-left rounded-lg border-2 p-2 transition-colors", settings.theme?.primary === palette.colors.primary ? "border-primary" : "border-transparent hover:border-muted-foreground/50")}>
                                            <div className="flex -space-x-2">
                                                <div className="w-5 h-5 rounded-full border-2 border-card" style={{ backgroundColor: `hsl(${palette.colors.primary})` }}></div>
                                                <div className="w-5 h-5 rounded-full border-2 border-card" style={{ backgroundColor: `hsl(${palette.colors.accent})` }}></div>
                                                <div className="w-5 h-5 rounded-full border-2 border-card" style={{ backgroundColor: `hsl(${palette.colors.background})` }}></div>
                                            </div>
                                            <p className="text-xs font-medium mt-2">{palette.name}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                             <div>
                                <h3 className="font-semibold mb-2 text-sm">Custom Colors</h3>
                                <p className="text-xs text-muted-foreground mb-4">Changes here will be saved as your custom theme. HSL values are required (e.g. 231 48% 48%).</p>
                                <div className="grid sm:grid-cols-3 gap-4">
                                     <div className="space-y-1">
                                        <Label htmlFor="primaryColor" className="text-xs">Primary</Label>
                                        <Input id="primaryColor" value={settings.theme?.primary} onChange={e => handleThemeUpdate({...settings.theme!, primary: e.target.value})} />
                                     </div>
                                     <div className="space-y-1">
                                        <Label htmlFor="bgColor" className="text-xs">Background</Label>
                                        <Input id="bgColor" value={settings.theme?.background} onChange={e => handleThemeUpdate({...settings.theme!, background: e.target.value})} />
                                     </div>
                                     <div className="space-y-1">
                                        <Label htmlFor="accentColor" className="text-xs">Accent</Label>
                                        <Input id="accentColor" value={settings.theme?.accent} onChange={e => handleThemeUpdate({...settings.theme!, accent: e.target.value})} />
                                     </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Data Management</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                           <div className="flex items-center justify-between rounded-lg border p-4">
                                <div>
                                    <h3 className="font-semibold">Native Search Indexing</h3>
                                    <p className="text-sm text-muted-foreground">Make all existing contacts searchable. Run this after a large manual import.</p>
                                </div>
                                <Button onClick={handleReindex} disabled={isReindexing}>
                                    {isReindexing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Re-index Contacts
                                </Button>
                           </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Relationship Types</CardTitle>
                            <CardDescription>Manage the relationship tags for your contacts (e.g., Lead, Learner).</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {renderChipList('relationshipTypes', settings.relationshipTypes)}
                                <div className="flex gap-2 pt-2">
                                    <Input value={newRelationshipType} onChange={e => setNewRelationshipType(e.target.value)} placeholder="Add new type..." onKeyDown={e => e.key === 'Enter' && handleAddItem('relationshipTypes')} />
                                    <Button onClick={() => handleAddItem('relationshipTypes')} disabled={isSaving || !newRelationshipType}>
                                        {isSaving ? <Loader2 className="animate-spin" /> : <Plus/>}
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Course Names</CardTitle>
                            <CardDescription>Manage the list of available courses for the dropdown.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {renderChipList('courseNames', settings.courseNames)}
                                <div className="flex gap-2 pt-2">
                                    <Input value={newCourseName} onChange={e => setNewCourseName(e.target.value)} placeholder="Add new course..." onKeyDown={e => e.key === 'Enter' && handleAddItem('courseNames')} />
                                    <Button onClick={() => handleAddItem('courseNames')} disabled={isSaving || !newCourseName}>
                                        {isSaving ? <Loader2 className="animate-spin" /> : <Plus/>}
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    
                    <Card>
                        <CardHeader>
                            <CardTitle>Trainers</CardTitle>
                            <CardDescription>Manage the list of available trainers for scheduling.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {renderChipList('trainers', settings.trainers)}
                                <div className="flex gap-2 pt-2">
                                    <Input value={newTrainer} onChange={e => setNewTrainer(e.target.value)} placeholder="Add new trainer..." onKeyDown={e => e.key === 'Enter' && handleAddItem('trainers')} />
                                    <Button onClick={() => handleAddItem('trainers')} disabled={isSaving || !newTrainer}>
                                        {isSaving ? <Loader2 className="animate-spin" /> : <Plus/>}
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Time Slots</CardTitle>
                            <CardDescription>Manage predefined time slots for scheduling (e.g., "02:00 P - 04:00 P").</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {renderChipList('timeSlots', settings.timeSlots)}
                                <div className="flex gap-2 pt-2">
                                    <Input value={newTimeSlot} onChange={e => setNewTimeSlot(e.target.value)} placeholder="Add new time slot..." onKeyDown={e => e.key === 'Enter' && handleAddItem('timeSlots')} />
                                    <Button onClick={() => handleAddItem('timeSlots')} disabled={isSaving || !newTimeSlot}>
                                        {isSaving ? <Loader2 className="animate-spin" /> : <Plus/>}
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Log Info Options</CardTitle>
                            <CardDescription>Manage the chips for the "Log Info" section.</CardDescription>
                        </CardHeader>
                        <CardContent>
                             <div className="space-y-2">
                                {renderChipList('infoLogOptions', settings.infoLogOptions || [])}
                                <div className="flex gap-2 pt-2">
                                    <Input value={newInfoLogOption} onChange={e => setNewInfoLogOption(e.target.value)} placeholder="Add new info log..." onKeyDown={e => e.key === 'Enter' && handleAddItem('infoLogOptions')} />
                                    <Button onClick={() => handleAddItem('infoLogOptions')} disabled={isSaving || !newInfoLogOption}>
                                        {isSaving ? <Loader2 className="animate-spin" /> : <Plus/>}
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Common Traits</CardTitle>
                            <CardDescription>Manage predefined traits for contact intel.</CardDescription>
                        </CardHeader>
                        <CardContent>
                             <div className="space-y-2">
                                {renderChipList('commonTraits', settings.commonTraits)}
                                <div className="flex gap-2 pt-2">
                                    <Input value={newTrait} onChange={e => setNewTrait(e.target.value)} placeholder="Add new trait..." onKeyDown={e => e.key === 'Enter' && handleAddItem('commonTraits')} />
                                    <Button onClick={() => handleAddItem('commonTraits')} disabled={isSaving || !newTrait}>
                                        {isSaving ? <Loader2 className="animate-spin" /> : <Plus/>}
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Withdrawal Reasons</CardTitle>
                            <CardDescription>Manage the chips shown when a contact is marked as "Withdrawn".</CardDescription>
                        </CardHeader>
                        <CardContent>
                             <div className="space-y-2">
                                {renderChipList('withdrawalReasons', settings.withdrawalReasons || [])}
                                <div className="flex gap-2 pt-2">
                                    <Input value={newWithdrawalReason} onChange={e => setNewWithdrawalReason(e.target.value)} placeholder="Add new reason..." onKeyDown={e => e.key === 'Enter' && handleAddItem('withdrawalReasons')} />
                                    <Button onClick={() => handleAddItem('withdrawalReasons')} disabled={isSaving || !newWithdrawalReason}>
                                        {isSaving ? <Loader2 className="animate-spin" /> : <Plus/>}
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    
                    <Card>
                        <CardHeader>
                            <CardTitle>Feedback Reasons</CardTitle>
                            <CardDescription>Manage the objection chips for negative feedback.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {(['content', 'schedule', 'price'] as FeedbackCategory[]).map(category => (
                                <div key={category}>
                                    <h3 className="font-semibold capitalize mb-2">{category}</h3>
                                     <div className="space-y-2">
                                        {renderChipList(`feedbackChips.${category}`, settings.feedbackChips[category])}
                                        <div className="flex gap-2 pt-2">
                                            <Input 
                                              value={newFeedbackChip.category === category ? newFeedbackChip.value : ""} 
                                              onChange={e => setNewFeedbackChip({ category, value: e.target.value })} 
                                              placeholder={`Add ${category} reason...`}
                                              onKeyDown={e => {
                                                  if (e.key === 'Enter') {
                                                      setNewFeedbackChip({ category, value: (e.target as HTMLInputElement).value });
                                                      handleAddItem(`feedbackChips.${category}`);
                                                  }
                                              }}
                                            />
                                            <Button 
                                                onClick={() => handleAddItem(`feedbackChips.${category}`)} 
                                                disabled={isSaving || newFeedbackChip.category !== category || !newFeedbackChip.value}
                                            >
                                                {isSaving && newFeedbackChip.category === category ? <Loader2 className="animate-spin" /> : <Plus/>}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                </div>
            </main>
        </div>
    );
}
