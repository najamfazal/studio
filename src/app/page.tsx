"use client";

import { useState, useEffect } from "react";
import { Plus, Users2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LeadCard } from "@/components/lead-card";
import { LeadDialog } from "@/components/lead-dialog";
import { Logo } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { enrichLeadAction } from "@/app/actions";
import type { Lead } from "@/lib/types";
import type { LeadFormValues } from "@/lib/schemas";

const initialLeads: Lead[] = [
  {
    id: "1",
    name: "Elon Musk",
    email: "elon@tesla.com",
    phone: "123-456-7890",
  },
  {
    id: "2",
    name: "Jeff Bezos",
    email: "jeff@amazon.com",
    phone: "234-567-8901",
  },
  {
    id: "3",
    name: "Jane Smith",
    email: "jane.smith@example.com",
    phone: "345-678-9012",
  },
];

export default function Home() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    try {
      const storedLeads = localStorage.getItem("leads");
      if (storedLeads) {
        setLeads(JSON.parse(storedLeads));
      } else {
        setLeads(initialLeads);
      }
    } catch (error) {
      console.error("Failed to parse leads from localStorage", error);
      setLeads(initialLeads);
    }
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isMounted) {
      localStorage.setItem("leads", JSON.stringify(leads));
    }
  }, [leads, isMounted]);

  const handleAddClick = () => {
    setEditingLead(null);
    setIsDialogOpen(true);
  };

  const handleEditClick = (lead: Lead) => {
    setEditingLead(lead);
    setIsDialogOpen(true);
  };

  const handleDelete = (leadId: string) => {
    setLeads((prev) => prev.filter((lead) => lead.id !== leadId));
    toast({
      title: "Lead Deleted",
      description: "The lead has been removed successfully.",
    });
  };

  const handleSaveLead = (values: LeadFormValues) => {
    if (editingLead) {
      // Update existing lead
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
      const newLead: Lead = {
        id: crypto.randomUUID(),
        ...values,
      };
      setLeads((prev) => [newLead, ...prev]);
      toast({
        title: "Lead Added",
        description: "A new lead has been created successfully.",
      });
    }
    setIsDialogOpen(false);
    setEditingLead(null);
  };

  const handleEnrich = async (leadToEnrich: Lead) => {
    const result = await enrichLeadAction(leadToEnrich);
    if (result.success && result.additionalInformation) {
      setLeads((prevLeads) =>
        prevLeads.map((lead) =>
          lead.id === leadToEnrich.id
            ? {
                ...lead,
                additionalInformation: result.additionalInformation,
                lastEnriched: new Date().toISOString(),
              }
            : lead
        )
      );
      toast({
        title: "Lead Enriched!",
        description: "AI has added new information to the lead.",
      });
    } else {
      toast({
        variant: "destructive",
        title: "Enrichment Failed",
        description: result.error || "Could not fetch additional information.",
      });
    }
  };

  if (!isMounted) {
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
          <Logo className="h-8 w-8 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">LeadTrack Solo</h1>
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
      />
    </div>
  );
}
