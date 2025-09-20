
"use client";

import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AppSettings } from '@/lib/types';
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

type FeedbackCategory = 'content' | 'schedule' | 'price';
type AppSettingsField = 'courseNames' | 'commonTraits' | 'withdrawalReasons' | 'relationshipTypes';

export default function SettingsPage() {
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();

    const [newCourseName, setNewCourseName] = useState("");
    const [newTrait, setNewTrait] = useState("");
    const [newWithdrawalReason, setNewWithdrawalReason] = useState("");
    const [newRelationshipType, setNewRelationshipType] = useState("");
    const [newFeedbackChip, setNewFeedbackChip] = useState<{ category: FeedbackCategory | null, value: string }>({ category: null, value: "" });

    const [editingItem, setEditingItem] = useState<{ field: string; index: number; value: string } | null>(null);

    const fetchSettings = useCallback(async () => {
        setIsLoading(true);
        try {
            const settingsDocRef = doc(db, "settings", "appConfig");
            const settingsDoc = await getDoc(settingsDocRef);
            if (settingsDoc.exists()) {
                const data = settingsDoc.data();
                const completeSettings: AppSettings = {
                    courseNames: data.courseNames || [],
                    commonTraits: data.commonTraits || [],
                    withdrawalReasons: data.withdrawalReasons || [],
                    relationshipTypes: data.relationshipTypes || ['Lead', 'Learner'],
                    feedbackChips: data.feedbackChips || { content: [], schedule: [], price: [] },
                    id: settingsDoc.id,
                };
                setSettings(completeSettings);
            } else {
                const defaultSettings: AppSettings = {
                    courseNames: ["Example Course 1", "Example Course 2"],
                    commonTraits: ["Decisive", "Budget-conscious"],
                    withdrawalReasons: ["Not interested", "Found alternative"],
                    relationshipTypes: ["Lead", "Learner", "Archived", "Graduated"],
                    feedbackChips: {
                        content: ["Not relevant", "Too complex"],
                        schedule: ["Wrong time", "Too long"],
                        price: ["Too expensive", "No budget"],
                    }
                };
                await setDoc(settingsDocRef, defaultSettings);
                setSettings(defaultSettings);
                toast({ title: "Settings initialized with default values." });
            }
        } catch (error) {
            console.error("Error fetching settings:", error);
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
            await updateDoc(settingsDocRef, updatePayload);
            toast({ title: "Settings Saved", description: "Your changes have been saved successfully." });
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


    const handleAddItem = (field: 'courseNames' | 'commonTraits' | 'withdrawalReasons' | 'relationshipTypes' | `feedbackChips.${FeedbackCategory}`) => {
        if (!settings) return;
        
        let valueToAdd = "";
        let fieldKey: keyof Omit<AppSettings, 'id' | 'feedbackChips'> | 'feedbackChips.content' | 'feedbackChips.schedule' | 'feedbackChips.price' = 'courseNames';

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
                list = draft[fieldKey as keyof Omit<AppSettings, 'id'| 'feedbackChips'>] as string[];
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

    const handleRemoveItem = (field: 'courseNames' | 'commonTraits' | 'withdrawalReasons' | 'relationshipTypes' | `feedbackChips.${FeedbackCategory}`, itemToRemove: string) => {
        if (!settings) return;

        const newSettings = produce(settings, draft => {
            let list: string[];
            if (field.startsWith('feedbackChips.')) {
                const category = field.split('.')[1] as FeedbackCategory;
                list = draft.feedbackChips[category];
            } else {
                list = draft[field as keyof Omit<AppSettings, 'id' | 'feedbackChips'>] as string[];
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

    