
"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, getDocs, query, where, limit } from "firebase/firestore";
import { Brain, RotateCw } from "lucide-react";

import { db } from "@/lib/firebase";
import type { Lead } from "@/lib/types";
import { Logo } from "@/components/icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { SidebarTrigger } from "@/components/ui/sidebar";

const CARD_COUNT = 5;

export default function RecallTrainerPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [flippedCards, setFlippedCards] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  const fetchRandomLeads = useCallback(async () => {
    setIsLoading(true);
    setFlippedCards({});
    try {
      // This is a basic random fetch. For larger datasets, a more sophisticated
      // approach (e.g., using random keys) would be needed to be truly random.
      const q = query(
        collection(db, "leads"),
        where("commitmentSnapshot", "!=", {}),
        limit(CARD_COUNT)
      );
      const querySnapshot = await getDocs(q);
      const leadsData = querySnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as Lead)
      );

       if (leadsData.length < 1) {
        toast({
          variant: 'default',
          title: 'Not enough data',
          description: 'You need contacts with commitment snapshots to use the trainer.',
        });
      }

      setLeads(leadsData);
    } catch (error) {
      console.error("Error fetching leads for recall trainer:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not fetch contacts for the trainer.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchRandomLeads();
  }, [fetchRandomLeads]);

  const handleFlip = (leadId: string) => {
    setFlippedCards((prev) => ({ ...prev, [leadId]: !prev[leadId] }));
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
          <Brain className="h-8 w-8 text-primary hidden sm:block" />
          <h1 className="text-xl font-bold tracking-tight">Recall Trainer</h1>
        </div>
        <Button onClick={fetchRandomLeads} variant="outline" size="sm">
          <RotateCw className="mr-2 h-4 w-4" />
          New Set
        </Button>
      </header>
      <main className="flex-1 p-4 sm:p-6 md:p-8">
        {leads.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            {leads.map((lead) => (
              <div
                key={lead.id}
                className="relative w-full h-64 [transform-style:preserve-3d] cursor-pointer"
                onClick={() => handleFlip(lead.id)}
              >
                {/* Front of card */}
                <Card
                  className={cn(
                    "absolute w-full h-full [backface-visibility:hidden] transition-transform duration-500 flex items-center justify-center",
                    flippedCards[lead.id] && "[transform:rotateY(180deg)]"
                  )}
                >
                  <CardHeader>
                    <CardTitle className="text-2xl">{lead.name}</CardTitle>
                  </CardHeader>
                </Card>

                {/* Back of card */}
                <Card
                  className={cn(
                    "absolute w-full h-full [backface-visibility:hidden] [transform:rotateY(180deg)] transition-transform duration-500 flex flex-col",
                    flippedCards[lead.id] && "[transform:rotateY(0deg)]"
                  )}
                >
                  <CardHeader>
                    <CardTitle className="text-lg">{lead.name}</CardTitle>
                    <CardDescription>Commitment Snapshot</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 text-sm space-y-2">
                    <p><strong>Courses:</strong> {(lead.commitmentSnapshot?.courses || []).join(', ') || 'N/A'}</p>
                    <p><strong>Price:</strong> {lead.commitmentSnapshot?.price || 'N/A'}</p>
                    <p><strong>Schedule:</strong> {lead.commitmentSnapshot?.schedule || 'N/A'}</p>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        ) : (
           <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 h-[60vh] text-center text-muted-foreground">
            <Brain className="h-16 w-16 mb-4" />
            <h2 className="text-2xl font-semibold text-foreground">
              No recall data available
            </h2>
            <p className="mt-2 max-w-xs">
              Create contacts and fill out their "Commitment Snapshot" to start training your recall.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
