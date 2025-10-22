

"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { db } from '@/lib/firebase';
import type { AppSettings, Lead, SalesCatalog } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Logo } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ContactDetailView } from '@/components/contact-detail-view';

export default function ContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { toast } = useToast();

  const [lead, setLead] = useState<Lead | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [salesCatalog, setSalesCatalog] = useState<SalesCatalog | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchInitialData = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const leadDocRef = doc(db, 'leads', id);
      const settingsDocRef = doc(db, 'settings', 'appConfig');
      const catalogDocRef = doc(db, 'settings', 'salesCatalog');

      const [leadDoc, settingsDoc, catalogDoc] = await Promise.all([
        getDoc(leadDocRef),
        getDoc(settingsDocRef),
        getDoc(catalogDocRef)
      ]);

      if (leadDoc.exists()) {
        setLead({ id: leadDoc.id, ...leadDoc.data() } as Lead);
      } else {
        toast({ variant: 'destructive', title: 'Contact not found.' });
        router.push('/search');
        return;
      }
      
      if(settingsDoc.exists()) {
        setAppSettings(settingsDoc.data() as AppSettings);
      }
      if(catalogDoc.exists()) {
        setSalesCatalog(catalogDoc.data() as SalesCatalog);
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
  
  const handleLeadUpdate = (updatedLead: Lead) => {
    setLead(updatedLead);
  }

  if (isLoading || !lead || !appSettings) {
    return <div className="flex h-screen items-center justify-center"><Logo className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="bg-card border-b p-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <SidebarTrigger />
                <Button variant="ghost" size="icon" asChild className="hidden sm:inline-flex">
                    <Link href="/search"><ArrowLeft/></Link>
                </Button>
                <div>
                    <h1 className="text-xl font-bold tracking-tight">{lead.name}</h1>
                </div>
            </div>
        </div>
      </header>
      
      <main className="flex-1 p-4 sm:p-6 md:p-8">
        <ContactDetailView 
            lead={lead} 
            appSettings={appSettings} 
            salesCatalog={salesCatalog} 
            onLeadUpdate={handleLeadUpdate} 
        />
      </main>
    </div>
  );
}
