
"use client";

import { useState } from "react";
import { addDoc, collection } from "firebase/firestore";
import { Calendar as CalendarIcon, ThumbsDown, ThumbsUp, ArrowLeft } from "lucide-react";
import { format } from "date-fns";

import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { QuickLogType, InteractionOutcome } from "@/lib/types";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";

interface LogInteractionDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  leadId: string;
  onLogSaved: () => void;
}

const quickLogOptions: { value: QuickLogType; label: string }[] = [
  { value: "Enrolled", label: "Enrolled" },
  { value: "Withdrawn", label: "Withdrawn" },
  { value: "Unresponsive", label: "Unresponsive" },
  { value: "Unchanged", label: "Unchanged" },
];

const outcomeOptions: InteractionOutcome[] = [
    "Needs Info",
    "Schedule Follow-up",
    "Event Scheduled",
    "Other",
];

type Step = "initial" | "perception" | "outcome" | "details";


export function LogInteractionDialog({
  isOpen,
  setIsOpen,
  leadId,
  onLogSaved,
}: LogInteractionDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState<Step>("initial");

  const [perception, setPerception] = useState<"positive" | "negative" | null>(null);
  const [outcome, setOutcome] = useState<InteractionOutcome | "">("");
  const [notes, setNotes] = useState("");
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>();

  const { toast } = useToast();

  const resetForm = () => {
    setPerception(null);
    setOutcome("");
    setNotes("");
    setFollowUpDate(undefined);
    setIsSubmitting(false);
    setCurrentStep("initial");
  };

  const handleSave = async (logData: any) => {
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "interactions"), {
        ...logData,
        leadId,
        createdAt: new Date().toISOString(),
      });
      toast({ title: "Interaction Logged" });
      onLogSaved();
      setIsOpen(false);
      resetForm();
    } catch (error) {
      console.error("Error logging interaction:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to log interaction.",
      });
      setIsSubmitting(false);
    }
  };

  const handleQuickLog = (type: QuickLogType) => {
    handleSave({ quickLogType: type });
  };
  
  const handleDetailedLog = () => {
    if (outcome === 'Schedule Follow-up' && !followUpDate) {
        toast({ variant: 'destructive', title: 'Please select a follow-up date.'});
        return;
    }
    const logData: any = { outcome, notes };
    if (perception) logData.perception = perception;
    if (followUpDate) logData.followUpDate = followUpDate.toISOString();

    handleSave(logData);
  }

  const handleBack = () => {
    if (currentStep === "details") setCurrentStep("outcome");
    else if (currentStep === "outcome") setCurrentStep("perception");
    else if (currentStep === "perception") setCurrentStep("initial");
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case "initial":
        return (
          <div className="space-y-4 py-4">
             <div className="grid grid-cols-2 gap-2">
              {quickLogOptions.map(({ value, label }) => (
                <Button
                  key={value}
                  variant="outline"
                  onClick={() => handleQuickLog(value)}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Logging...' : label}
                </Button>
              ))}
            </div>
            <div className="relative">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or</span>
                </div>
            </div>
            <Button onClick={() => setCurrentStep('perception')} className="w-full" size="lg">
              Log a Detailed Interaction
            </Button>
          </div>
        );
      case "perception":
        return (
          <div className="text-center space-y-4">
            <h3 className="font-semibold">How was the interaction perceived?</h3>
            <div className="flex justify-center gap-4">
              <Button variant="outline" size="lg" className="h-20 w-20 flex-col gap-2" onClick={() => { setPerception('positive'); setCurrentStep('outcome'); }}>
                <ThumbsUp className="h-8 w-8 text-green-500" />
                <span>Positive</span>
              </Button>
              <Button variant="outline" size="lg" className="h-20 w-20 flex-col gap-2" onClick={() => { setPerception('negative'); setCurrentStep('outcome'); }}>
                <ThumbsDown className="h-8 w-8 text-red-500" />
                <span>Negative</span>
              </Button>
            </div>
          </div>
        );
      case "outcome":
        return (
           <div className="space-y-4">
            <h3 className="font-semibold text-center">What was the outcome?</h3>
            <Select onValueChange={(value) => { setOutcome(value as InteractionOutcome); setCurrentStep('details'); }} value={outcome}>
                <SelectTrigger className="h-12 text-base">
                    <SelectValue placeholder="Select outcome..." />
                </SelectTrigger>
                <SelectContent>
                    {outcomeOptions.map(opt => (
                        <SelectItem key={opt} value={opt} className="text-base py-2">{opt}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
           </div>
        );
      case "details":
        return (
          <div className="space-y-4">
             {outcome === "Schedule Follow-up" && (
                <Popover>
                    <PopoverTrigger asChild>
                    <Button
                        variant={"outline"}
                        className={cn(
                        "w-full justify-start text-left font-normal",
                        !followUpDate && "text-muted-foreground"
                        )}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {followUpDate ? format(followUpDate, "PPP") : <span>Pick a follow-up date</span>}
                    </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                    <Calendar
                        mode="single"
                        selected={followUpDate}
                        onSelect={setFollowUpDate}
                        initialFocus
                    />
                    </PopoverContent>
              </Popover>
            )}
            <Textarea 
                placeholder="Add any relevant notes here..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={4}
            />
          </div>
        );
    }
  };


  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
        if(!open) {
            resetForm();
            setIsOpen(false);
        } else {
            setIsOpen(true);
        }
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {currentStep !== 'initial' && (
              <Button variant="ghost" size="icon" onClick={handleBack} disabled={isSubmitting}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <DialogTitle>Log Interaction</DialogTitle>
          </div>
          <DialogDescription>
            {currentStep === 'initial' 
              ? "Record a new interaction with this lead."
              : "Follow the steps to log your interaction."
            }
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-[150px] flex flex-col justify-center">
            {renderStepContent()}
        </div>

        {currentStep === 'details' && (
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button onClick={handleDetailedLog} disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save Log"}
              </Button>
            </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
