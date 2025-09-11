
"use client";

import { useState } from "react";
import { addDoc, collection } from "firebase/firestore";
import { Calendar as CalendarIcon, ThumbsDown, ThumbsUp } from "lucide-react";
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

export function LogInteractionDialog({
  isOpen,
  setIsOpen,
  leadId,
  onLogSaved,
}: LogInteractionDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
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
    if (!outcome) {
        toast({ variant: 'destructive', title: 'Please select an outcome.'});
        return;
    }
     if (outcome === 'Schedule Follow-up' && !followUpDate) {
        toast({ variant: 'destructive', title: 'Please select a follow-up date.'});
        return;
    }
    const logData: any = { outcome, notes };
    if (perception) logData.perception = perception;
    if (followUpDate) logData.followUpDate = followUpDate.toISOString();

    handleSave(logData);
  }

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
          <DialogTitle>Log Interaction</DialogTitle>
          <DialogDescription>
            Record a new interaction with this lead.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Quick Logs */}
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
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or Detailed Log
              </span>
            </div>
          </div>
          
          {/* Detailed Log */}
          <div className="space-y-4">
            <div className="space-y-2">
                 <label className="text-sm font-medium">Perception</label>
                 <div className="flex gap-2">
                     <Button variant={perception === 'positive' ? 'default' : 'outline'} onClick={() => setPerception('positive')}><ThumbsUp className="mr-2"/> Positive</Button>
                     <Button variant={perception === 'negative' ? 'destructive' : 'outline'} onClick={() => setPerception('negative')}><ThumbsDown className="mr-2"/> Negative</Button>
                 </div>
            </div>
            
            <Select onValueChange={(value) => setOutcome(value as InteractionOutcome)} value={outcome}>
                <SelectTrigger>
                    <SelectValue placeholder="Select outcome..." />
                </SelectTrigger>
                <SelectContent>
                    {outcomeOptions.map(opt => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                </SelectContent>
            </Select>

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
                        {followUpDate ? format(followUpDate, "PPP") : <span>Pick a date</span>}
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
            />
          </div>

        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsOpen(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleDetailedLog} disabled={isSubmitting || !outcome}>
            {isSubmitting ? "Saving..." : "Save Log"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
