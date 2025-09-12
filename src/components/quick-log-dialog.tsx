
"use client";

import { useState } from "react";
import { addDoc, collection } from "firebase/firestore";
import { Loader2 } from "lucide-react";

import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { QuickLogType, Lead, Interaction } from "@/lib/types";

interface QuickLogDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  lead: Lead | null;
  onLogSaved: () => void;
}

const quickLogOptions: { value: QuickLogType; label: string }[] = [
  { value: "Enrolled", label: "Enrolled" },
  { value: "Withdrawn", label: "Withdrawn" },
  { value: "Unresponsive", label: "Unresponsive" },
  { value: "Unchanged", label: "Unchanged" },
];

export function QuickLogDialog({
  isOpen,
  setIsOpen,
  lead,
  onLogSaved,
}: QuickLogDialogProps) {
  if (!lead) return null;
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingType, setSubmittingType] = useState<QuickLogType | null>(null);

  const { toast } = useToast();

  const handleSave = async (logData: Partial<Interaction>) => {
    if (logData.quickLogType) {
        setSubmittingType(logData.quickLogType);
    }
    setIsSubmitting(true);

    try {
      await addDoc(collection(db, "interactions"), {
        ...logData,
        leadId: lead.id,
        createdAt: new Date().toISOString(),
      });
      toast({
        title: "Log Saved",
        description: `Interaction for ${lead.name} has been logged.`,
      });
      onLogSaved();
      setIsOpen(false);
    } catch (error) {
      console.error("Error logging interaction:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to log interaction.",
      });
    } finally {
        setIsSubmitting(false);
        setSubmittingType(null);
    }
  };

  const handleQuickLog = (type: QuickLogType) => {
    handleSave({ quickLogType: type });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quick Log Interaction</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 py-4">
          {quickLogOptions.map(({ value, label }) => (
            <Button
              key={value}
              variant="outline"
              onClick={() => handleQuickLog(value)}
              disabled={isSubmitting}
            >
              {isSubmitting && submittingType === value ? (
                <Loader2 className="animate-spin" />
              ) : (
                label
              )}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

    