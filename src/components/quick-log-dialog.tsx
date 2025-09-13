
"use client";

import { useState } from "react";
import { addDoc, collection } from "firebase/firestore";
import { Loader2, Send } from "lucide-react";

import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { QuickLogType, Lead, Interaction, AppSettings } from "@/lib/types";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";

interface QuickLogDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  lead: Lead | null;
  onLogSaved: () => void;
  appSettings: AppSettings | null;
}

const quickLogOptions: { value: QuickLogType; label: string }[] = [
  { value: "Enrolled", label: "Enrolled" },
  { value: "Unresponsive", label: "Unresponsive" },
  { value: "Unchanged", label: "Unchanged" },
];

export function QuickLogDialog({
  isOpen,
  setIsOpen,
  lead,
  onLogSaved,
  appSettings,
}: QuickLogDialogProps) {
  if (!lead) return null;
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingType, setSubmittingType] = useState<QuickLogType | null>(null);
  const [step, setStep] = useState<'initial' | 'withdrawn'>('initial');
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);

  const { toast } = useToast();
  
  const resetState = () => {
    setIsSubmitting(false);
    setSubmittingType(null);
    setStep('initial');
    setSelectedReasons([]);
  }
  
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resetState();
    }
    setIsOpen(open);
  }

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
      handleOpenChange(false);
    } catch (error) {
      console.error("Error logging interaction:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to log interaction.",
      });
    } finally {
        // Keep dialog open if it was a step change, otherwise it will close
        setIsSubmitting(false);
        setSubmittingType(null);
    }
  };

  const handleQuickLog = (type: QuickLogType) => {
    if (type === 'Withdrawn') {
        setStep('withdrawn');
    } else {
        handleSave({ quickLogType: type });
    }
  };
  
  const handleToggleReason = (reason: string) => {
    setSelectedReasons(prev => 
      prev.includes(reason) ? prev.filter(r => r !== reason) : [...prev, reason]
    );
  }

  const handleLogWithdrawn = () => {
    handleSave({
      quickLogType: 'Withdrawn',
      withdrawalReasons: selectedReasons,
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quick Log Interaction</DialogTitle>
        </DialogHeader>

        {step === 'initial' && (
          <div className="grid grid-cols-2 gap-2 py-4">
            <Button
                variant="outline"
                onClick={() => handleQuickLog('Withdrawn')}
                disabled={isSubmitting}
            >
                Withdrawn
            </Button>
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
        )}
        
        {step === 'withdrawn' && (
          <div className="py-4 space-y-4">
            <div>
              <h3 className="font-medium text-center mb-3">Select Withdrawal Reason(s)</h3>
              <div className="flex flex-wrap gap-2 justify-center">
                {(appSettings?.withdrawalReasons || []).map(reason => (
                  <Badge
                    key={reason}
                    variant={selectedReasons.includes(reason) ? 'default' : 'secondary'}
                    onClick={() => handleToggleReason(reason)}
                    className="cursor-pointer"
                  >
                    {reason}
                  </Badge>
                ))}
                {(appSettings?.withdrawalReasons || []).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center">No withdrawal reasons configured in settings.</p>
                )}
              </div>
            </div>
             <Separator />
            <DialogFooter className="gap-2 sm:justify-between">
               <Button variant="ghost" onClick={() => setStep('initial')}>Back</Button>
               <Button onClick={handleLogWithdrawn} disabled={isSubmitting || selectedReasons.length === 0}>
                {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : <Send className="mr-2 h-4 w-4"/>}
                 Log Withdrawn
               </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
