

"use client";

import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { SalesCatalog, CatalogCourse, PriceVariant } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { produce } from 'immer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, PlusCircle, Trash2, Pencil, Check, X, CheckIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from './ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { cn } from '@/lib/utils';
import { Badge } from './ui/badge';


interface SalesCatalogManagerProps {
    courseNames: string[];
}

export function SalesCatalogManager({ courseNames }: SalesCatalogManagerProps) {
    const [catalog, setCatalog] = useState<SalesCatalog | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);

    const [isCourseDialogOpen, setIsCourseDialogOpen] = useState(false);
    const [editingCourse, setEditingCourse] = useState<CatalogCourse | null>(null);

    useEffect(() => {
        const catalogRef = doc(db, "settings", "salesCatalog");
        const unsubscribe = onSnapshot(catalogRef, (docSnap) => {
            if (docSnap.exists()) {
                setCatalog(docSnap.data() as SalesCatalog);
            } else {
                // If it doesn't exist, create it
                const defaultCatalog: SalesCatalog = { courses: [] };
                setDoc(catalogRef, defaultCatalog);
                setCatalog(defaultCatalog);
            }
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching sales catalog:", error);
            toast({ variant: 'destructive', title: "Could not load sales catalog." });
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [toast]);

    const handleSaveCatalog = async (newCatalog: SalesCatalog) => {
        setIsSaving(true);
        try {
            await setDoc(doc(db, "settings", "salesCatalog"), newCatalog);
            toast({ title: "Sales Catalog Updated" });
        } catch (error) {
            console.error("Error saving sales catalog:", error);
            toast({ variant: "destructive", title: "Failed to save catalog." });
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveCourse = (courseToSave: CatalogCourse) => {
        if (!catalog) return;
        const newCatalog = produce(catalog, draft => {
            const index = draft.courses.findIndex(c => c.id === courseToSave.id);
            if (index > -1) {
                draft.courses[index] = courseToSave;
            } else {
                draft.courses.push(courseToSave);
            }
        });
        handleSaveCatalog(newCatalog);
        setIsCourseDialogOpen(false);
        setEditingCourse(null);
    };

    const handleRemoveCourse = (courseId: string) => {
        if (!catalog) return;
        const newCatalog = produce(catalog, draft => {
            draft.courses = draft.courses.filter(c => c.id !== courseId);
        });
        handleSaveCatalog(newCatalog);
    };

    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Sales Playbook</CardTitle>
                    <CardDescription>Manage your courses, bundles, and standard pricing.</CardDescription>
                </CardHeader>
                <CardContent className="flex justify-center items-center h-24">
                    <Loader2 className="animate-spin text-primary" />
                </CardContent>
            </Card>
        );
    }
    
    if (!catalog) return null;

    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between">
                <div>
                    <CardTitle>Sales Playbook</CardTitle>
                    <CardDescription>Manage your courses, bundles, and standard pricing.</CardDescription>
                </div>
                <Button onClick={() => { setEditingCourse(null); setIsCourseDialogOpen(true); }}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Add Course
                </Button>
            </CardHeader>
            <CardContent className="space-y-4">
                {catalog.courses.length > 0 ? (
                    catalog.courses.map(course => (
                        <div key={course.id} className="border rounded-lg p-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h4 className="font-semibold">{course.name} {course.isBundle && <span className="text-xs font-normal text-muted-foreground">(Bundle)</span>}</h4>
                                    <p className="text-xs text-muted-foreground italic mt-1">{course.valueProposition}</p>
                                    {course.isBundle && course.includedCourses.length > 0 && (
                                        <p className="text-xs text-muted-foreground mt-1">Includes: {course.includedCourses.join(', ')}</p>
                                    )}
                                </div>
                                <div className="flex items-center">
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingCourse(course); setIsCourseDialogOpen(true); }}><Pencil className="h-4 w-4"/></Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleRemoveCourse(course.id)}><Trash2 className="h-4 w-4"/></Button>
                                </div>
                            </div>
                            <div className="mt-2 space-y-1 text-sm">
                                {course.standardPrices.map(variant => (
                                <div key={variant.id} className="flex justify-between items-center text-muted-foreground">
                                    <p>{variant.mode}, {variant.format}</p>
                                    <p className="font-semibold text-foreground">${variant.price}</p>
                                </div>
                                ))}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="text-center py-10 text-sm text-muted-foreground">
                        No courses defined in your catalog yet.
                    </div>
                )}
            </CardContent>

            {isCourseDialogOpen && (
                <CourseDialog
                    isOpen={isCourseDialogOpen}
                    onClose={() => setIsCourseDialogOpen(false)}
                    onSave={handleSaveCourse}
                    courseToEdit={editingCourse}
                    existingCourseNames={courseNames}
                />
            )}
        </Card>
    );
}


interface CourseDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (course: CatalogCourse) => void;
    courseToEdit: CatalogCourse | null;
    existingCourseNames: string[];
}

function CourseDialog({ isOpen, onClose, onSave, courseToEdit, existingCourseNames }: CourseDialogProps) {
    const [course, setCourse] = useState<CatalogCourse>({ id: '', name: '', isBundle: false, includedCourses: [], valueProposition: '', standardPrices: []});
    const [isCoursePopoverOpen, setIsCoursePopoverOpen] = useState(false);

    useEffect(() => {
        if (courseToEdit) {
            setCourse(courseToEdit);
        } else {
            setCourse({ id: `course_${Date.now()}`, name: '', isBundle: false, includedCourses: [], valueProposition: '', standardPrices: [] });
        }
    }, [courseToEdit, isOpen]);

    const addVariant = () => {
        setCourse(produce(draft => {
            draft.standardPrices.push({ id: `v_${Date.now()}`, mode: 'Online', format: '1-1', price: 0 });
        }));
    };
    
    const updateVariant = (id: string, field: keyof PriceVariant, value: string | number) => {
         setCourse(produce(draft => {
            const variant = draft.standardPrices.find(v => v.id === id);
            if (variant) { (variant as any)[field] = value; }
        }));
    };

    const removeVariant = (id: string) => {
        setCourse(produce(draft => {
            draft.standardPrices = draft.standardPrices.filter(v => v.id !== id);
        }));
    };
    
    const handleToggleIncludedCourse = (courseName: string) => {
        setCourse(produce(draft => {
            const index = draft.includedCourses.indexOf(courseName);
            if (index > -1) {
                draft.includedCourses.splice(index, 1);
            } else {
                draft.includedCourses.push(courseName);
            }
        }));
    };


    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{courseToEdit ? 'Edit' : 'Add'} Course</DialogTitle>
                    <DialogDescription>Define a course or bundle for your sales catalog.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-4">
                    <div className="space-y-2">
                        <Label htmlFor="courseName">Course Name</Label>
                        <Select value={course.name} onValueChange={(name) => setCourse({ ...course, name })}>
                            <SelectTrigger><SelectValue placeholder="Select a course..." /></SelectTrigger>
                            <SelectContent>
                                {existingCourseNames.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="valueProposition">Value Proposition</Label>
                        <Textarea id="valueProposition" value={course.valueProposition} onChange={e => setCourse({...course, valueProposition: e.target.value})} placeholder="e.g. Become a job-ready data analyst..." />
                    </div>
                    <div className="flex items-center space-x-2">
                        <Switch id="isBundle" checked={course.isBundle} onCheckedChange={isBundle => setCourse({...course, isBundle})} />
                        <Label htmlFor="isBundle">This is a bundle of other courses</Label>
                    </div>
                    {course.isBundle && (
                        <div className="space-y-2 pl-4 border-l-2">
                             <Label>Included Courses</Label>
                             <Popover open={isCoursePopoverOpen} onOpenChange={setIsCoursePopoverOpen}>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" role="combobox" className="w-full justify-start font-normal h-auto min-h-10">
                                        <div className="flex gap-1 flex-wrap">
                                            {course.includedCourses.length > 0 ? (
                                                course.includedCourses.map(c => <Badge key={c} variant="secondary">{c}</Badge>)
                                            ) : (
                                                <span className="text-muted-foreground">Select courses...</span>
                                            )}
                                        </div>
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                                    <Command>
                                        <CommandInput placeholder="Search courses..." />
                                        <CommandList>
                                            <CommandEmpty>No course found.</CommandEmpty>
                                            <CommandGroup>
                                                {existingCourseNames.filter(name => name !== course.name).map(name => (
                                                    <CommandItem
                                                        key={name}
                                                        value={name}
                                                        onSelect={() => handleToggleIncludedCourse(name)}
                                                    >
                                                        <CheckIcon className={cn("mr-2 h-4 w-4", course.includedCourses.includes(name) ? "opacity-100" : "opacity-0")} />
                                                        {name}
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </div>
                    )}
                    <div className="space-y-3">
                        <Label>Standard Prices</Label>
                        {course.standardPrices.map(variant => (
                            <div key={variant.id} className="grid grid-cols-10 gap-2 items-center">
                                <div className="col-span-3">
                                    <Select value={variant.mode} onValueChange={(val) => updateVariant(variant.id, 'mode', val)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="Online">Online</SelectItem><SelectItem value="In-person">In-person</SelectItem></SelectContent></Select>
                                </div>
                                <div className="col-span-3">
                                    <Select value={variant.format} onValueChange={(val) => updateVariant(variant.id, 'format', val)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="1-1">1-on-1</SelectItem><SelectItem value="Batch">Batch</SelectItem></SelectContent></Select>
                                </div>
                                <div className="col-span-3"><Input type="number" value={variant.price} onChange={(e) => updateVariant(variant.id, 'price', parseFloat(e.target.value) || 0)} /></div>
                                <div className="col-span-1"><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeVariant(variant.id)}><Trash2 className="h-4 w-4"/></Button></div>
                            </div>
                        ))}
                        <Button variant="outline" size="sm" onClick={addVariant}><PlusCircle className="mr-2 h-4 w-4"/>Add Price Variant</Button>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => onSave(course)}>Save Course</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
