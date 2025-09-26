
"use client";

import { useState, useEffect, useCallback, useTransition } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { BarChart, Loader2, Zap, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addMonths, subMonths } from 'date-fns';
import Link from 'next/link';

import { db } from '@/lib/firebase';
import type { CourseRevenueReport, LogAnalysisReport, AnalyzedLead } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { generateCourseRevenueReportAction } from '@/app/actions';
import { Logo } from '@/components/ui/logo';
import { cn } from '@/lib/utils';

export default function ReportsPage() {
    const [selectedMonth, setSelectedMonth] = useState(new Date());
    const [crReport, setCrReport] = useState<CourseRevenueReport | null>(null);
    
    const [isCrLoading, setIsCrLoading] = useState(true);

    const [isGeneratingCr, startGeneratingCrTransition] = useTransition();

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
                </Tabs>
            </main>
        </div>
    );
}
