

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
import { Loader2, Plus, Settings, Trash2, X } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

type FeedbackCategory = 'content' | 'schedule' | 'price';

export default function SettingsPage() {
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();

    const [newCourseName, setNewCourseName] = useState("");
    const [newTrait, setNewTrait] = useState("");
    const [newWithdrawalReason, setNewWithdrawalReason] = useState("");
    const [newFeedbackChip, setNewFeedbackChip] = useState<{ category: FeedbackCategory | null, value: string }>({ category: null, value: "" });

    const fetchSettings = useCallback(async () => {
        setIsLoading(true);
        try {
            const settingsDocRef = doc(db, "settings", "appConfig");
            const settingsDoc = await getDoc(settingsDocRef);
            if (settingsDoc.exists()) {
                const data = settingsDoc.data();
                // Ensure all fields exist, providing defaults if they don't
                const completeSettings: AppSettings = {
                    courseNames: data.courseNames || [],
                    commonTraits: data.commonTraits || [],
                    withdrawalReasons: data.withdrawalReasons || [],
                    feedbackChips: data.feedbackChips || { content: [], schedule: [], price: [] },
                    id: settingsDoc.id,
                };
                setSettings(completeSettings);
            } else {
                const defaultSettings: AppSettings = {
                    courseNames: ["Example Course 1", "Example Course 2"],
                    commonTraits: ["Decisive", "Budget-conscious"],
                    withdrawalReasons: ["Not interested", "Found alternative"],
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

    const handleSave = async (updatedSettings: Partial<AppSettings>) => {
        setIsSaving(true);
        try {
            const settingsDocRef = doc(db, "settings", "appConfig");
            await updateDoc(settingsDocRef, updatedSettings);
            
            // Re-fetch to ensure local state is in sync with DB
            await fetchSettings();
            
            toast({ title: "Settings Saved", description: "Your changes have been saved successfully." });
        } catch (error) {
            console.error("Error saving settings:", error);
            toast({ variant: "destructive", title: "Save Failed", description: "Could not save your changes." });
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddItem = (field: 'courseNames' | 'commonTraits' | 'withdrawalReasons' | `feedbackChips.${FeedbackCategory}`) => {
        if (!settings) return;
        
        let valueToAdd = "";
        let fieldToUpdate: string[] = [];
        let updatePath = "";

        if (field === 'courseNames') {
            if (!newCourseName) return;
            valueToAdd = newCourseName;
            fieldToUpdate = settings.courseNames;
            updatePath = 'courseNames';
            setNewCourseName("");
        } else if (field === 'commonTraits') {
            if (!newTrait) return;
            valueToAdd = newTrait;
            fieldToUpdate = settings.commonTraits;
            updatePath = 'commonTraits';
            setNewTrait("");
        } else if (field === 'withdrawalReasons') {
            if (!newWithdrawalReason) return;
            valueToAdd = newWithdrawalReason;
            fieldToUpdate = settings.withdrawalReasons;
            updatePath = 'withdrawalReasons';
            setNewWithdrawalReason("");
        } else if (field.startsWith('feedbackChips.')) {
            const category = newFeedbackChip.category;
            if (!category || !newFeedbackChip.value) return;
            valueToAdd = newFeedbackChip.value;
            fieldToUpdate = settings.feedbackChips[category];
            updatePath = `feedbackChips.${category}`;
            setNewFeedbackChip({ category: null, value: "" });
        }

        if (fieldToUpdate.includes(valueToAdd)) {
            toast({ variant: "destructive", title: "Item already exists." });
            return;
        }

        const updatedItems = [...fieldToUpdate, valueToAdd];
        
        const updatePayload: { [key: string]: any } = {};
        
        // Handle nested feedbackChips object
        if (updatePath.includes('.')) {
            const [parent, child] = updatePath.split('.');
            updatePayload[parent] = { ...settings.feedbackChips, [child]: updatedItems };
        } else {
            updatePayload[updatePath] = updatedItems;
        }
        
        handleSave(updatePayload);
    };

    const handleRemoveItem = (field: 'courseNames' | 'commonTraits' | 'withdrawalReasons' | `feedbackChips.${FeedbackCategory}`, itemToRemove: string) => {
        if (!settings) return;

        let fieldToUpdate: string[] = [];
        let updatePath = "";

        if (field === 'courseNames') {
            fieldToUpdate = settings.courseNames;
            updatePath = 'courseNames';
        } else if (field === 'commonTraits') {
            fieldToUpdate = settings.commonTraits;
            updatePath = 'commonTraits';
        } else if (field === 'withdrawalReasons') {
            fieldToUpdate = settings.withdrawalReasons;
            updatePath = 'withdrawalReasons';
        } else if (field.startsWith('feedbackChips.')) {
            const category = field.split('.')[1] as FeedbackCategory;
            fieldToUpdate = settings.feedbackChips[category];
            updatePath = `feedbackChips.${category}`;
        }
        
        const updatedItems = fieldToUpdate.filter(item => item !== itemToRemove);
        
        const updatePayload: { [key: string]: any } = {};
        
        if (updatePath.includes('.')) {
            const [parent, child] = updatePath.split('.');
            updatePayload[parent] = { ...settings.feedbackChips, [child]: updatedItems };
        } else {
            updatePayload[updatePath] = updatedItems;
        }
        
        handleSave(updatePayload);
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
                    <Settings className="h-8 w-8 text-primary" />
                    <h1 className="text-xl font-bold tracking-tight">App Settings</h1>
                </div>
            </header>
            <main className="flex-1 p-4 sm:p-6 md:p-8">
                <div className="grid gap-6 max-w-4xl mx-auto">
                    <Card>
                        <CardHeader>
                            <CardTitle>Course Names</CardTitle>
                            <CardDescription>Manage the list of available courses for the dropdown.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                <div className="flex flex-wrap gap-2">
                                    {settings.courseNames.map(course => (
                                        <Badge key={course} variant="secondary" className="text-sm">
                                            {course}
                                            <button onClick={() => handleRemoveItem('courseNames', course)} className="ml-2 rounded-full hover:bg-muted-foreground/20 p-0.5">
                                                <X className="h-3 w-3"/>
                                            </button>
                                        </Badge>
                                    ))}
                                </div>
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
                            <CardDescription>Manage predefined traits for lead intel.</CardDescription>
                        </CardHeader>
                        <CardContent>
                             <div className="space-y-2">
                                <div className="flex flex-wrap gap-2">
                                    {settings.commonTraits.map(trait => (
                                        <Badge key={trait} variant="secondary" className="text-sm">
                                            {trait}
                                            <button onClick={() => handleRemoveItem('commonTraits', trait)} className="ml-2 rounded-full hover:bg-muted-foreground/20 p-0.5">
                                                <X className="h-3 w-3"/>
                                            </button>
                                        </Badge>
                                    ))}
                                </div>
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
                            <CardDescription>Manage the chips shown when a lead is marked as "Withdrawn".</CardDescription>
                        </CardHeader>
                        <CardContent>
                             <div className="space-y-2">
                                <div className="flex flex-wrap gap-2">
                                    {(settings.withdrawalReasons || []).map(reason => (
                                        <Badge key={reason} variant="secondary" className="text-sm">
                                            {reason}
                                            <button onClick={() => handleRemoveItem('withdrawalReasons', reason)} className="ml-2 rounded-full hover:bg-muted-foreground/20 p-0.5">
                                                <X className="h-3 w-3"/>
                                            </button>
                                        </Badge>
                                    ))}
                                </div>
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
                                        <div className="flex flex-wrap gap-2">
                                            {settings.feedbackChips[category].map(chip => (
                                                <Badge key={chip} variant="secondary" className="text-sm">
                                                    {chip}
                                                    <button onClick={() => handleRemoveItem(`feedbackChips.${category}`, chip)} className="ml-2 rounded-full hover:bg-muted-foreground/20 p-0.5">
                                                        <X className="h-3 w-3"/>
                                                    </button>
                                                </Badge>
                                            ))}
                                        </div>
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
