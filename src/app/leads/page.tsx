
"use client";

import { useState, useEffect } from "react";
import { Plus, Users2, Menu } from "lucide-react";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp
} from "firebase/firestore";

import { Button } from "@/components/ui/button";
import { LeadCard } from "@/components/lead-card";
import { LeadDialog } from "@/components/lead-dialog";
import { Logo } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { enrichLeadAction } from "@/app/actions";
import { db } from "@/lib/firebase";
import type { Lead } from "@/lib/types";
import type { LeadFormValues } from "@/lib/schemas";
import { SidebarTrigger } from "@/components/ui/sidebar";

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchLeads = async () => {
      try {
        const q = query(collection(db, "leads"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        const leadsData = querySnapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as Lead)
        );
        setLeads(leadsData);
      } catch (error) {
        console.error("Error fetching leads:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to fetch leads from the database.",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchLeads();
  }, [toast]);

  const handleAddClick = () => {
    setEditingLead(null);
    setIsDialogOpen(true);
  };

  const handleEditClick = (lead: Lead) => {
    setEditingLead(lead);
    setIsDialogOpen(true);
  };

  const handleDelete = async (leadId: string) => {
    if (!window.confirm("Are you sure you want to delete this lead?")) return;
    try {
      await deleteDoc(doc(db, "leads", leadId));
      setLeads((prev) => prev.filter((lead) => lead.id !== leadId));
      toast({
        title: "Lead Deleted",
        description: "The lead has been removed successfully.",
      });
    } catch (error) {
      console.error("Error deleting lead:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete lead.",
      });
    }
  };

  const handleSaveLead = async (values: LeadFormValues) => {
    setIsSaving(true);
    try {
      if (editingLead) {
        // Update existing lead
        const leadRef = doc(db, "leads", editingLead.id);
        await updateDoc(leadRef, values);
        setLeads((prev) =>
          prev.map((lead) =>
            lead.id === editingLead.id ? { ...lead, ...values } : lead
          )
        );
        toast({
          title: "Lead Updated",
          description: "The lead's details have been saved.",
        });
      } else {
        // Add new lead
        const newLeadData = { 
            ...values, 
            createdAt: new Date().toISOString(),
            status: 'Active',
            afc_step: 0,
            hasEngaged: false,
            onFollowList: false,
            traits: [],
            insights: [],
            commitmentSnapshot: {},
        };
        const docRef = await addDoc(collection(db, "leads"), newLeadData);
        const newLead: Lead = {
          id: docRef.id,
          ...newLeadData,
        };
        setLeads((prev) => [newLead, ...prev]);
        toast({
          title: "Lead Added",
          description: "A new lead has been created successfully.",
        });
      }
      setIsDialogOpen(false);
      setEditingLead(null);
    } catch (error) {
      console.error("Error saving lead:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save lead.",
      });
    } finally {
        setIsSaving(false);
    }
  };

  const handleEnrich = async (leadToEnrich: Lead) => {
    const result = await enrichLeadAction(leadToEnrich);
    if (result.success && result.additionalInformation) {
      try {
        const leadRef = doc(db, "leads", leadToEnrich.id);
        const enrichedData = {
          additionalInformation: result.additionalInformation,
          lastEnriched: new Date().toISOString(),
        };
        await updateDoc(leadRef, enrichedData);

        setLeads((prevLeads) =>
          prevLeads.map((lead) =>
            lead.id === leadToEnrich.id
              ? { ...lead, ...enrichedData }
              : lead
          )
        );
        toast({
          title: "Lead Enriched!",
          description: "AI has added new information to the lead.",
        });
      } catch (error) {
        console.error("Error updating enriched lead:", error);
        toast({
          variant: "destructive",
          title: "Update Failed",
          description: "Could not save enriched information.",
        });
      }
    } else {
      toast({
        variant: "destructive",
        title: "Enrichment Failed",
        description: result.error || "Could not fetch additional information.",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Logo className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="bg-card border-b p-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          <Logo className="h-8 w-8 text-primary hidden sm:block" />
          <h1 className="text-xl font-bold tracking-tight">All Leads</h1>
        </div>
        <Button onClick={handleAddClick}>
          <Plus className="mr-2 h-4 w-4" />
          Add Lead
        </Button>
      </header>

      <main className="flex-1 p-4 sm:p-6 md:p-8">
        {leads.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {leads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                onEdit={handleEditClick}
                onDelete={handleDelete}
                onEnrich={handleEnrich}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 h-[60vh] text-center text-muted-foreground">
            <Users2 className="h-16 w-16 mb-4" />
            <h2 className="text-2xl font-semibold text-foreground">
              No leads yet
            </h2>
            <p className="mt-2 max-w-xs">
              Click the &quot;Add Lead&quot; button to create your first contact and
              start tracking.
            </p>
          </div>
        )}
      </main>

      <LeadDialog
        isOpen={isDialogOpen}
        setIsOpen={setIsDialogOpen}
        onSave={handleSaveLead}
        leadToEdit={editingLead}
        isSaving={isSaving}
      />
    </div>
  );
}
