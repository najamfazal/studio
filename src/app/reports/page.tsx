
"use client";

import { useState, useEffect, useCallback, useTransition } from 'react';
import { doc, onSnapshot, getDoc, updateDoc } from 'firebase/firestore';
import { BarChart, Loader2, Zap, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import { format, addMonths, subMonths } from 'date-fns';
import Link from 'next/link';

import { db } from '@/lib/firebase';
import type { CourseRevenueReport, LogAnalysisReport, AnalyzedLead, AppSettings } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { generateCourseRevenueReportAction, generateLogAnalysisReportAction } from '@/app/actions';
import { Logo } from '@/components/icons';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export default function ReportsPage() {
    const [selectedMonth, setSelectedMonth] = useState(new Date());
    const [crReport, setCrReport] = useState<CourseRevenueReport | null>(null);
    const [highPotentialReport, setHighPotentialReport] = useState<LogAnalysisReport | null>(null);
    const [lowPotentialReport, setLowPotentialReport] = useState<LogAnalysisReport | null>(null);
    
    const [isCrLoading, setIsCrLoading] = useState(true);
    const [isLaLoading, setIsLaLoading] = useState(true);

    const [isGeneratingCr, startGeneratingCrTransition] = useTransition();
    const [isGeneratingLa, startGeneratingLaTransition] = useTransition();

    const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);

    const { toast } = useToast();

    const crReportId = `CR-${format(selectedMonth, 'yyyy-MM')}`;

    useEffect(() => {
        setIsCrLoading(true);
        const reportDocRef = doc(db, 'reports', crReportId);
        
        const unsubscribe = onSnapshot(reportDocRef, (doc) => {
            if (doc.exists()) {
                setCrReport(doc.data() as CourseRevenueReport);
            } else {
                setCrReport(null);
            }
            setIsCrLoading(false);
        }, (error) => {
            console.error("Error fetching CR report:", error);
            toast({ variant: 'destructive', title: 'Failed to load Course Revenue report.' });
            setIsCrLoading(false);
        });

        return () => unsubscribe();
    }, [crReportId, toast]);

    // useEffect(() => {
    //     setIsLaLoading(true);
    //     const highPotRef = doc(db, 'reports', 'high-potential-leads');
    //     const lowPotRef = doc(db, 'reports', 'low-potential-leads');

    //     const unsubHigh = onSnapshot(highPotRef, (doc) => {
    //         setHighPotentialReport(doc.exists() ? doc.data() as LogAnalysisReport : null);
    //     }, (error) => {
    //         console.error("Error fetching high potential report:", error);
    //         toast({ variant: 'destructive', title: 'Failed to load High Potential report.' });
    //     });

    //     const unsubLow = onSnapshot(lowPotRef, (doc) => {
    //         setLowPotentialReport(doc.exists() ? doc.data() as LogAnalysisReport : null);
    //         setIsLaLoading(false); // Set loading to false after the second report is fetched
    //     }, (error) => {
    //         console.error("Error fetching low potential report:", error);
    //         toast({ variant: 'destructive', title: 'Failed to load Low Potential report.' });
    //          setIsLaLoading(false);
    //     });

    //     return () => {
    //         unsubHigh();
    //         unsubLow();
    //     };
    // }, [toast]);


    const handleGenerateCrReport = () => {
        startGeneratingCrTransition(async () => {
            const result = await generateCourseRevenueReportAction();
            if (result.success) {
                toast({ title: 'Report generation started', description: 'The new report will appear shortly.' });
                if (format(selectedMonth, 'yyyy-MM') !== format(new Date(), 'yyyy-MM')) {
                    setSelectedMonth(new Date());
                }
            } else {
                toast({ variant: 'destructive', title: 'Failed to start report generation', description: result.error });
            }
        });
    };

    // const handleGenerateLaReport = () => {
    //     startGeneratingLaTransition(async () => {
    //         // const result = await generateLogAnalysisReportAction();
    //         // if (result.success) {
    //         //     toast({ title: 'Log analysis started', description: 'The new report will appear shortly.' });
    //         // } else {
    //         //     toast({ variant: 'destructive', title: 'Failed to start log analysis', description: result.error });
    //         // }
    //     });
    // };
    
    const changeMonth = (offset: number) => {
        setSelectedMonth(current => offset > 0 ? addMonths(current, 1) : subMonths(current, 1));
    }

    const totals = crReport ? crReport.courses.reduce((acc, course) => {
        acc.enrolledRevenue += course.enrolledRevenue;
        acc.opportunityRevenue += course.opportunityRevenue;
        return acc;
    }, { enrolledRevenue: 0, opportunityRevenue: 0 }) : { enrolledRevenue: 0, opportunityRevenue: 0 };


    return (
        <div className="flex flex-col min-h-screen bg-background">
            <header className="bg-card border-b p-4 flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <SidebarTrigger />
                    <BarChart className="h-8 w-8 text-primary hidden sm:block" />
                    <h1 className="text-xl font-bold tracking-tight">Reports</h1>
                </div>
            </header>
            <main className="flex-1 p-4 sm:p-6 md:p-8">
                <Tabs defaultValue="course-revenue">
                    <TabsList className={cn("grid w-full grid-cols-1")}>
                        <TabsTrigger value="course-revenue">Course Revenue</TabsTrigger>
                        {/* <TabsTrigger value="log-analysis">Log Analysis</TabsTrigger> */}
                    </TabsList>

                    <TabsContent value="course-revenue" className="mt-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between p-4">
                               <div className="flex items-center gap-2">
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => changeMonth(-1)}>
                                        <ChevronLeft className="h-5 w-5" />
                                    </Button>
                                    <h2 className="text-base font-semibold w-28 text-center">{format(selectedMonth, 'MMMM yyyy')}</h2>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => changeMonth(1)}>
                                        <ChevronRight className="h-5 w-5" />
                                    </Button>
                               </div>
                                <Button variant="outline" size="icon" onClick={handleGenerateCrReport} disabled={isGeneratingCr}>
                                    {isGeneratingCr ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                                    <span className="sr-only">Generate Report</span>
                                </Button>
                            </CardHeader>
                            <CardContent className="px-4 pb-4">
                                {isCrLoading ? (
                                    <div className="flex justify-center items-center h-60">
                                        <Logo className="h-10 w-10 animate-spin text-primary" />
                                    </div>
                                ) : crReport && crReport.courses.length > 0 ? (
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="text-xs">Course</TableHead>
                                                <TableHead className="text-right text-xs">Booked</TableHead>
                                                <TableHead className="text-right text-xs">Opportunity</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {crReport.courses.map((course) => (
                                                <TableRow key={course.courseName}>
                                                    <TableCell className="font-medium py-2">{course.courseName}</TableCell>
                                                    <TableCell className="text-right py-2">{course.enrolledRevenue.toLocaleString()}</TableCell>
                                                    <TableCell className="text-right py-2">{course.opportunityRevenue.toLocaleString()}</TableCell>
                                                </TableRow>
                                            ))}
                                             <TableRow className="font-bold bg-muted/50">
                                                <TableCell className="py-2">Total</TableCell>
                                                <TableCell className="text-right py-2">{totals.enrolledRevenue.toLocaleString()}</TableCell>
                                                <TableCell className="text-right py-2">{totals.opportunityRevenue.toLocaleString()}</TableCell>
                                            </TableRow>
                                        </TableBody>
                                    </Table>
                                ) : (
                                    <div className="text-center py-10">
                                        <p className="text-muted-foreground">No report data for this month.</p>
                                        <p className="text-sm text-muted-foreground mt-2">Click the ✨ button to generate one.</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                    
                    {/* <TabsContent value="log-analysis" className="mt-4">
                        <Card>
                             <CardHeader className="flex flex-row items-center justify-between p-4">
                                <div className="space-y-0.5">
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        Log Analysis
                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsPromptModalOpen(true)}>
                                            <Pencil className="h-4 w-4"/>
                                        </Button>
                                    </CardTitle>
                                    <CardDescription>AI-powered lead potential analysis.</CardDescription>
                                </div>
                                <Button variant="outline" size="icon" onClick={handleGenerateLaReport} disabled={isGeneratingLa}>
                                    {isGeneratingLa ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                                    <span className="sr-only">Generate Log Analysis Report</span>
                                </Button>
                             </CardHeader>
                             <CardContent className="px-4 pb-4 space-y-6">
                                {isLaLoading ? (
                                    <div className="flex justify-center items-center h-60">
                                        <Logo className="h-10 w-10 animate-spin text-primary" />
                                    </div>
                                ) : (
                                   <>
                                    <AnalyzedLeadsSection title="High Potential Leads" report={highPotentialReport} />
                                    <AnalyzedLeadsSection title="Low Potential Leads" report={lowPotentialReport} />
                                   </>
                                )}
                             </CardContent>
                        </Card>
                    </TabsContent> */}
                </Tabs>
            </main>
            {isPromptModalOpen && <PromptEditorDialog isOpen={isPromptModalOpen} onClose={() => setIsPromptModalOpen(false)} />}
        </div>
    );
}


function AnalyzedLeadsSection({ title, report }: { title: string, report: LogAnalysisReport | null }) {
    return (
        <div>
            <h3 className="text-base font-semibold mb-3">{title}</h3>
            {report && report.leads.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {report.leads.map(lead => <AnalyzedLeadCard key={lead.leadId} lead={lead} />)}
                </div>
            ) : (
                <p className="text-sm text-muted-foreground text-center py-6">No leads in this category yet. Click the ✨ button to run the analysis.</p>
            )}
        </div>
    )
}

function AnalyzedLeadCard({ lead }: { lead: AnalyzedLead }) {
    return (
        <Link href={`/contacts/${lead.leadId}`}>
            <div className="border rounded-lg p-4 hover:bg-muted/50 transition-colors h-full">
                <div className="flex justify-between items-start">
                    <p className="font-semibold">{lead.leadName}</p>
                    <p className="text-xs font-mono text-muted-foreground">AED {lead.price?.toLocaleString()}</p>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{lead.course}</p>
                <p className="text-sm">{lead.aiActions}</p>
            </div>
        </Link>
    )
}

function PromptEditorDialog({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
    const [prompt, setPrompt] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();

    const defaultPrompt = `You are an expert sales assistant tasked with analyzing a lead to determine their potential.
  
Your goal is to classify the lead as either 'High' or 'Low' potential and provide concrete, actionable next steps for the salesperson.

Analyze the following lead data:
- Traits: {{traits}}
- Insights: {{insights}}
- Key Notes: {{notes}}
- Interaction History: {{jsonStringify interactions}}

A HIGH potential lead is someone who shows clear buying signals: they are responsive, have few major objections (especially regarding price), and seem genuinely interested in the course content.
A LOW potential lead is someone who is unresponsive, raises significant objections that haven't been resolved, or seems indecisive or uninterested.

Based on your analysis, set the 'potential' field.

Then, provide a short, actionable 2-3 line recommendation in the 'actions' field. The recommendation should be a concrete next step for the salesperson. For example: "The lead seems concerned about the schedule. Send them two alternative timings for the demo call." or "They are very interested in the content. Send them the advanced course module breakdown and suggest a call to discuss it."
`;

    useEffect(() => {
        if (isOpen) {
            setIsLoading(true);
            const settingsDocRef = doc(db, 'settings', 'appConfig');
            getDoc(settingsDocRef).then(docSnap => {
                if (docSnap.exists()) {
                    const settings = docSnap.data() as AppSettings;
                    setPrompt(settings.logAnalysisPrompt || defaultPrompt);
                } else {
                    setPrompt(defaultPrompt);
                }
                setIsLoading(false);
            });
        }
    }, [isOpen, defaultPrompt]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const settingsDocRef = doc(db, 'settings', 'appConfig');
            await updateDoc(settingsDocRef, { logAnalysisPrompt: prompt });
            toast({ title: 'Prompt saved successfully!' });
            onClose();
        } catch (error) {
            console.error("Error saving prompt:", error);
            toast({ variant: 'destructive', title: 'Failed to save prompt.' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Edit Log Analysis Prompt</DialogTitle>
                    <DialogDescription>
                        Modify the prompt used by the AI to analyze leads. Use Handlebars syntax `{{'{{field}}'}}` to include lead data.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    {isLoading ? (
                        <div className="flex justify-center items-center h-40">
                            <Loader2 className="animate-spin" />
                        </div>
                    ) : (
                        <Textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            className="h-96 font-mono text-xs"
                            placeholder="Enter your AI prompt here..."
                        />
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave} disabled={isLoading || isSaving}>
                        {isSaving ? <Loader2 className="animate-spin mr-2" /> : null}
                        Save Prompt
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
    

    