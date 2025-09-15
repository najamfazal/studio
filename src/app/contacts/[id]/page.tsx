
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, orderBy, limit, startAfter, QueryDocumentSnapshot, DocumentData, addDoc } from 'firebase/firestore';
import { useParams, useRouter } from 'next/navigation';
import { produce } from 'immer';
import { format, parseISO } from 'date-fns';
import { ArrowLeft, Loader2, Mail, Phone, Plus, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import Link from 'next/link';

import { db } from '@/lib/firebase';
import type { AppSettings, Interaction, Lead, CourseSchedule, PaymentInstallment } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Logo } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { EditableField } from '@/components/editable-field';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';

const INTERACTION_PAGE_SIZE = 5;

// Helper to safely convert Firestore Timestamps or strings to Date objects
const toDate = (dateValue: any): Date | null => {
  if (!dateValue) return null;
  if (typeof dateValue === "string") return parseISO(dateValue);
  if (dateValue.toDate) return dateValue.toDate(); // Firestore Timestamp
  return null;
};

export default function ContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { toast } = useToast();

  const [lead, setLead] = useState<Lead | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [isInteractionsLoading, setIsInteractionsLoading] = useState(true);
  const [lastInteraction, setLastInteraction] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreInteractions, setHasMoreInteractions] = useState(true);
  
  const [newInsight, setNewInsight] = useState("");
  const [newTrait, setNewTrait] = useState("");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const leadDocRef = doc(db, 'leads', id);
      const leadDoc = await getDoc(leadDocRef);
      if (leadDoc.exists()) {
        setLead({ id: leadDoc.id, ...leadDoc.data() } as Lead);
      } else {
        toast({ variant: 'destructive', title: 'Contact not found.' });
        router.push('/contacts');
      }

      const settingsDocRef = doc(db, 'settings', 'appConfig');
      const settingsDoc = await getDoc(settingsDocRef);
      if(settingsDoc.exists()) {
        setAppSettings(settingsDoc.data() as AppSettings);
      }

    } catch (error) {
      console.error('Error fetching data:', error);
      toast({ variant: 'destructive', title: 'Failed to load contact data.' });
    } finally {
      setIsLoading(false);
    }
  }, [id, router, toast]);

  const fetchInteractions = useCallback(async (loadMore = false) => {
    if (!id) return;
    setIsInteractionsLoading(true);
    try {
      const qConstraints = [
        where('leadId', '==', id),
        orderBy('createdAt', 'desc'),
        limit(INTERACTION_PAGE_SIZE)
      ];

      if (loadMore && lastInteraction) {
        qConstraints.push(startAfter(lastInteraction));
      }

      const q = query(collection(db, 'interactions'), ...qConstraints);
      const snapshot = await getDocs(q);
      const newInteractions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Interaction));

      setHasMoreInteractions(newInteractions.length === INTERACTION_PAGE_SIZE);
      setLastInteraction(snapshot.docs[snapshot.docs.length - 1] || null);

      setInteractions(prev => loadMore ? [...prev, ...newInteractions] : newInteractions);
    } catch (error) {
      console.error("Error fetching interactions:", error);
      toast({ variant: "destructive", title: "Failed to load interactions." });
    } finally {
      setIsInteractionsLoading(false);
    }
  }, [id, toast, lastInteraction]);


  useEffect(() => {
    fetchData();
    fetchInteractions();
  }, [id]); // Only refetch if ID changes

  const handleUpdate = async (field: keyof Lead | string, value: any) => {
    if (!lead) return;
    
    // Create a path for nested updates
    const updatePayload: { [key: string]: any } = {};
    updatePayload[field] = value;
    
    const originalLead = { ...lead };
    
    // Optimistic update
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
  
  const handleAddChip = (type: 'traits' | 'insights') => {
    const value = type === 'traits' ? newTrait.trim() : newInsight.trim();
    if (!value || !lead) return;

    const currentList = lead[type] || [];
    if (currentList.includes(value)) {
        toast({ variant: 'destructive', title: 'Item already exists' });
        return;
    }
    
    const newList = [...currentList, value];
    handleUpdate(type, newList);

    if (type === 'traits') setNewTrait("");
    else setNewInsight("");
  };
  
  const handleRemoveChip = (type: 'traits' | 'insights', value: string) => {
    if (!lead) return;
    const newList = (lead[type] || []).filter(item => item !== value);
    handleUpdate(type, newList);
  };
  
  const handleLogInteraction = async (interaction: Partial<Interaction>) => {
    try {
        await addDoc(collection(db, 'interactions'), {
            ...interaction,
            leadId: id,
            createdAt: new Date().toISOString(),
        });
        toast({title: "Interaction logged successfully."});
        fetchInteractions(); // Refresh logs
    } catch (error) {
        console.error("Error logging interaction:", error);
        toast({variant: "destructive", title: "Failed to log interaction."});
    }
  }


  if (isLoading || !lead) {
    return <div className="flex h-screen items-center justify-center"><Logo className="h-12 w-12 animate-spin text-primary" /></div>;
  }
  
  const renderLeadView = () => (
    <Tabs defaultValue="summary">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="summary">Summary</TabsTrigger>
        <TabsTrigger value="logs">Logs</TabsTrigger>
      </TabsList>
      
      <TabsContent value="summary" className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Commitment Snapshot</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            <EditableField label="Course" value={lead.commitmentSnapshot?.course || ""} onSave={(val) => handleUpdate('commitmentSnapshot.course', val)} type="select" selectOptions={appSettings?.courseNames || []} placeholder="Select a course"/>
            <EditableField label="Price" value={lead.commitmentSnapshot?.price || ""} onSave={(val) => handleUpdate('commitmentSnapshot.price', val)} inputType="number" placeholder="Enter price"/>
            <EditableField label="Schedule" value={lead.commitmentSnapshot?.schedule || ""} onSave={(val) => handleUpdate('commitmentSnapshot.schedule', val)} placeholder="Enter schedule"/>
            <div className="md:col-span-2">
              <EditableField label="Key Notes" value={lead.commitmentSnapshot?.keyNotes || ""} onSave={(val) => handleUpdate('commitmentSnapshot.keyNotes', val)} type="textarea" placeholder="Add key negotiation points..."/>
            </div>
          </CardContent>
        </Card>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>Traits</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {(lead.traits || []).map(trait => <Badge key={trait} variant="secondary">{trait} <button onClick={() => handleRemoveChip('traits', trait)} className="ml-2 p-0.5 rounded-full hover:bg-destructive/20"><Trash2 className="h-3 w-3 text-destructive"/></button></Badge>)}
                </div>
                <div className="flex gap-2">
                  <Input value={newTrait} onChange={e => setNewTrait(e.target.value)} placeholder="Add a trait..."/>
                  <Button size="icon" onClick={() => handleAddChip('traits')}><Plus/></Button>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Insights</CardTitle></CardHeader>
            <CardContent>
                <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                        {(lead.insights || []).map(insight => <Badge key={insight} variant="outline">{insight} <button onClick={() => handleRemoveChip('insights', insight)} className="ml-2 p-0.5 rounded-full hover:bg-destructive/20"><Trash2 className="h-3 w-3 text-destructive"/></button></Badge>)}
                    </div>
                    <div className="flex gap-2">
                        <Input value={newInsight} onChange={e => setNewInsight(e.target.value)} placeholder="Add an insight..."/>
                        <Button size="icon" onClick={() => handleAddChip('insights')}><Plus/></Button>
                    </div>
                </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>
      
      <TabsContent value="logs" className="space-y-6">
         {/* Implement Log Tab UI */}
      </TabsContent>
    </Tabs>
  );
  
  const renderLearnerView = () => (
    <Tabs defaultValue="overview">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="schedule">Schedule</TabsTrigger>
        <TabsTrigger value="payplan">Pay Plan</TabsTrigger>
        <TabsTrigger value="leadlog">Lead Log</TabsTrigger>
      </TabsList>
      
      <TabsContent value="overview">
        {/* Implement Learner Overview Tab UI */}
      </TabsContent>
      
       <TabsContent value="schedule">
        {/* Implement Learner Schedule Tab UI */}
      </TabsContent>
      
       <TabsContent value="payplan">
        {/* Implement Learner Pay Plan Tab UI */}
      </TabsContent>
      
       <TabsContent value="leadlog">
        {/* Implement Learner Lead Log Tab UI */}
      </TabsContent>
    </Tabs>
  );

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
        {lead.relationship === 'Learner' ? renderLearnerView() : renderLeadView()}
      </main>
    </div>
  );
}

    