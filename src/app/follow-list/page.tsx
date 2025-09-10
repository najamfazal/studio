"use client";

import { useState, useEffect } from "react";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import Link from "next/link";
import { UserCheck, Users2 } from "lucide-react";

import { db } from "@/lib/firebase";
import type { Lead } from "@/lib/types";
import { Logo } from "@/components/icons";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function FollowListPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchFollowLeads = async () => {
      try {
        const q = query(
          collection(db, "leads"),
          where("onFollowList", "==", true),
          orderBy("name", "asc")
        );
        const querySnapshot = await getDocs(q);
        const leadsData = querySnapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as Lead)
        );
        setLeads(leadsData);
      } catch (error) {
        console.error("Error fetching follow list leads:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to fetch follow list.",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchFollowLeads();
  }, [toast]);

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
          <UserCheck className="h-8 w-8 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">Follow List</h1>
        </div>
      </header>
      <main className="flex-1 p-4 sm:p-6 md:p-8">
        {leads.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {leads.map((lead) => (
              <Link href={`/leads/${lead.id}`} key={lead.id}>
                <Card className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <CardTitle>{lead.name}</CardTitle>
                    <CardDescription>{lead.email}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 h-[60vh] text-center text-muted-foreground">
            <Users2 className="h-16 w-16 mb-4" />
            <h2 className="text-2xl font-semibold text-foreground">
              Your follow list is empty
            </h2>
            <p className="mt-2 max-w-xs">
              Add leads to the follow list from their detail page to nurture them over time.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
