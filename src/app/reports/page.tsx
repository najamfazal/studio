
"use client";

import { useState, useEffect, useCallback, useTransition } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { BarChart, Loader2, Zap } from 'lucide-react';
import { format } from 'date-fns';

import { db } from '@/lib/firebase';
import type { CourseRevenueReport } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { generateCourseRevenueReportAction } from '@/app/actions';
import { Logo } from '@/components/icons';

export default function ReportsPage() {
    const [report, setReport] = useState<CourseRevenueReport | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, startGeneratingTransition] = useTransition();
    const { toast } = useToast();

    const reportId = `CR-${format(new Date(), 'yyyy-MM')}`;

    useEffect(() => {
        const reportDocRef = doc(db, 'reports', reportId);
        
        const unsubscribe = onSnapshot(reportDocRef, (doc) => {
            if (doc.exists()) {
                setReport(doc.data() as CourseRevenueReport);
            } else {
                setReport(null); // No report for this month yet
            }
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching report:", error);
            toast({ variant: 'destructive', title: 'Failed to load report.' });
            setIsLoading(false);
        });

        // Cleanup subscription on unmount
        return () => unsubscribe();
    }, [reportId, toast]);

    const handleGenerateReport = () => {
        startGeneratingTransition(async () => {
            const result = await generateCourseRevenueReportAction();
            if (result.success) {
                toast({ title: 'Report generation started', description: 'The new report will appear shortly.' });
            } else {
                toast({ variant: 'destructive', title: 'Failed to start report generation', description: result.error });
            }
        });
    };

    const totals = report ? report.courses.reduce((acc, course) => {
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
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="course-revenue">Course Revenue</TabsTrigger>
                        <TabsTrigger value="log-analysis" disabled>Log Analysis</TabsTrigger>
                    </TabsList>

                    <TabsContent value="course-revenue" className="mt-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle>Course Revenue</CardTitle>
                                    <CardDescription>Monthly breakdown of booked and potential revenue by course.</CardDescription>
                                </div>
                                <Button variant="outline" size="icon" onClick={handleGenerateReport} disabled={isGenerating}>
                                    {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                                    <span className="sr-only">Generate Report</span>
                                </Button>
                            </CardHeader>
                            <CardContent>
                                {isLoading ? (
                                    <div className="flex justify-center items-center h-60">
                                        <Logo className="h-10 w-10 animate-spin text-primary" />
                                    </div>
                                ) : report && report.courses.length > 0 ? (
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Course</TableHead>
                                                <TableHead className="text-right">Revenue Booked</TableHead>
                                                <TableHead className="text-right">Opportunity</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {report.courses.map((course) => (
                                                <TableRow key={course.courseName}>
                                                    <TableCell className="font-medium">{course.courseName}</TableCell>
                                                    <TableCell className="text-right">{course.enrolledRevenue.toLocaleString()}</TableCell>
                                                    <TableCell className="text-right">{course.opportunityRevenue.toLocaleString()}</TableCell>
                                                </TableRow>
                                            ))}
                                             <TableRow className="font-bold bg-muted/50">
                                                <TableCell>Total</TableCell>
                                                <TableCell className="text-right">{totals.enrolledRevenue.toLocaleString()}</TableCell>
                                                <TableCell className="text-right">{totals.opportunityRevenue.toLocaleString()}</TableCell>
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
