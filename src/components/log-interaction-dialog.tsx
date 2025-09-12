
"use client";

import { useState } from "react";
import { addDoc, collection, doc, updateDoc } from "firebase/firestore";
import { Calendar as CalendarIcon, Info, CalendarClock, CalendarPlus, ThumbsDown, ThumbsUp, ArrowLeft, Loader2, Circle, CheckCircle2 } from "lucide-react";
import { addDays, format } from "date-fns";

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
import { QuickLogType, Lead, InteractionFeedback, InteractionOutcome } from "@/lib/types";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";

interface LogInteractionDialogProps {
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

const objectionChips = {
    content: ["Not relevant", "Too complex", "Needs more detail", "Unclear"],
    schedule: ["Wrong time/day", "Too long", "Not flexible"],
    price: ["Too expensive", "No budget", "Better offer elsewhere"],
};

const dateQuickPicks = [
    { label: "Yesterday", days: -1 },
    { label: "Tomorrow", days: 1 },
    { label: "In 3 days", days: 3 },
    { label: "In a week", days: 7 },
];

const timeQuickPicks = ["11:00", "14:00", "17:00", "19:00"];

type Step = "initial" | "feedback" | "outcomes";

export function LogInteractionDialog({
  isOpen,
  setIsOpen,
  lead,
  onLogSaved,
}: LogInteractionDialogProps) {
  if (!lead) return null;
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState<Step>("initial");

  // Step 1: Feedback State
  const [feedback, setFeedback] = useState<InteractionFeedback>({});

  // Step 2: Outcomes State
  const [outcomes, setOutcomes] = useState<InteractionOutcome>({});

  const { toast } = useToast();

  const resetForm = () => {
    setIsSubmitting(false);
    setCurrentStep("initial");
    setFeedback({});
    setOutcomes({});
  };

  const handleSave = async (logData: any) => {
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "interactions"), {
        ...logData,
        leadId: lead.id,
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
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleQuickLog = (type: QuickLogType) => {
    handleSave({ quickLogType: type });
  };

  const handleDetailedLogSubmit = () => {
    const logData: any = {
      feedback: feedback,
      outcomes: outcomes,
    };
    handleSave(logData);
  }

  const handleBack = () => {
    if (currentStep === "outcomes") setCurrentStep("feedback");
    else if (currentStep === "feedback") setCurrentStep("initial");
  };

  const toggleObjection = (category: 'content' | 'schedule' | 'price', objection: string) => {
    setFeedback(prev => {
        const existingObjections = prev[category]?.objections || [];
        const newObjections = existingObjections.includes(objection)
            ? existingObjections.filter(o => o !== objection)
            : [...existingObjections, objection];
        return {
            ...prev,
            [category]: {
                ...prev[category],
                objections: newObjections,
            }
        }
    });
  }

  const renderFeedbackSection = (category: 'content' | 'schedule' | 'price', title: string) => (
    <div className="space-y-2">
        <h4 className="font-semibold text-sm">{title}</h4>
        <div className="flex gap-2">
             <Button
                variant={feedback[category]?.perception === 'positive' ? 'default' : 'outline'}
                size="icon"
                onClick={() => setFeedback(p => ({...p, [category]: {...p[category], perception: 'positive'}}))}
            >
                <ThumbsUp />
            </Button>
            <Button
                variant={feedback[category]?.perception === 'negative' ? 'default' : 'outline'}
                size="icon"
                onClick={() => setFeedback(p => ({...p, [category]: {...p[category], perception: 'negative'}}))}
            >
                <ThumbsDown />
            </Button>
        </div>
        {feedback[category]?.perception === 'negative' && (
            <div className="flex flex-wrap gap-2">
                {objectionChips[category].map(obj => (
                    <Button
                        key={obj}
                        variant={feedback[category]?.objections?.includes(obj) ? 'secondary' : 'outline'}
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => toggleObjection(category, obj)}
                    >
                        {obj}
                    </Button>
                ))}
            </div>
        )}
    </div>
  );

  const toggleOutcome = (outcome: 'info' | 'inFuture' | 'event') => {
      setOutcomes(prev => {
          const newOutcomes = {...prev};
          if (newOutcomes[outcome]) {
              delete newOutcomes[outcome];
          } else {
              newOutcomes[outcome] = {};
          }
          return newOutcomes;
      });
  }

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
                  {isSubmitting ? <Loader2 className="animate-spin" /> : label}
                </Button>
              ))}
            </div>
            <div className="relative">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or</span>
                </div>
            </div>
            <Button onClick={() => setCurrentStep('feedback')} className="w-full" size="lg">
              Log a Detailed Interaction
            </Button>
          </div>
        );
      case "feedback":
        return (
            <div className="space-y-4">
                {renderFeedbackSection('content', 'Content Feedback')}
                {renderFeedbackSection('schedule', 'Schedule Feedback')}
                {renderFeedbackSection('price', 'Price Feedback')}
                <Button onClick={() => setCurrentStep('outcomes')} className="w-full">Continue</Button>
            </div>
        )
      case "outcomes":
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
                <Button variant={outcomes.info ? 'default' : 'outline'} onClick={() => toggleOutcome('info')}><Info className="mr-2"/> Info</Button>
                <Button variant={outcomes.inFuture ? 'default' : 'outline'} onClick={() => toggleOutcome('inFuture')}><CalendarPlus className="mr-2"/> In-Future</Button>
                <Button variant={outcomes.event ? 'default' : 'outline'} onClick={() => toggleOutcome('event')}><CalendarClock className="mr-2"/> Event</Button>
            </div>

            {outcomes.info && (
                <Textarea 
                    placeholder="Add notes for 'Needs Info'..."
                    value={outcomes.info.notes || ""}
                    onChange={e => setOutcomes(p => ({...p, info: {...p.info, notes: e.target.value}}))}
                />
            )}

            {outcomes.inFuture && (
                <Popover>
                    <PopoverTrigger asChild>
                    <Button
                        variant={"outline"}
                        className={cn("w-full justify-start text-left font-normal", !outcomes.inFuture.date && "text-muted-foreground")}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {outcomes.inFuture.date ? format(new Date(outcomes.inFuture.date), "PPP") : <span>Pick a future date</span>}
                    </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                        <div className="flex flex-wrap gap-1 p-2 border-b">
                            {dateQuickPicks.map(({label, days}) => (
                                <Button key={label} variant="ghost" size="sm" onClick={() => setOutcomes(p => ({...p, inFuture: {...p.inFuture, date: addDays(new Date(), days).toISOString()}}))}>{label}</Button>
                            ))}
                        </div>
                        <Calendar
                            mode="single"
                            selected={outcomes.inFuture.date ? new Date(outcomes.inFuture.date) : undefined}
                            onSelect={d => setOutcomes(p => ({...p, inFuture: {...p.inFuture, date: d?.toISOString()}}))}
                            initialFocus
                        />
                    </PopoverContent>
                </Popover>
            )}

            {outcomes.event && (
                <div className="space-y-2 p-2 border rounded-md">
                    <Select onValueChange={v => setOutcomes(p => ({...p, event: {...p.event, type: v}}))} value={outcomes.event.type}>
                        <SelectTrigger><SelectValue placeholder="Select event type..." /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Online Meet/Demo">Online Meet/Demo</SelectItem>
                            <SelectItem value="Visit">Visit</SelectItem>
                        </SelectContent>
                    </Select>
                    <Popover>
                        <PopoverTrigger asChild>
                        <Button
                            variant={"outline"}
                            className={cn("w-full justify-start text-left font-normal", !outcomes.event.dateTime && "text-muted-foreground")}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {outcomes.event.dateTime ? format(new Date(outcomes.event.dateTime), "PPP p") : <span>Pick event date & time</span>}
                        </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                             <Calendar
                                mode="single"
                                selected={outcomes.event.dateTime ? new Date(outcomes.event.dateTime) : undefined}
                                onSelect={d => {
                                    const existing = outcomes.event?.dateTime ? new Date(outcomes.event.dateTime) : new Date();
                                    if (d) {
                                        d.setHours(existing.getHours());
                                        d.setMinutes(existing.getMinutes());
                                        setOutcomes(p => ({...p, event: {...p.event, dateTime: d.toISOString()}}))
                                    }
                                }}
                                initialFocus
                            />
                            <div className="flex flex-wrap gap-1 p-2 border-t">
                               {timeQuickPicks.map(time => (
                                   <Button key={time} variant="ghost" size="sm" onClick={() => {
                                       const [h, m] = time.split(':');
                                       const d = outcomes.event?.dateTime ? new Date(outcomes.event.dateTime) : new Date();
                                       d.setHours(parseInt(h, 10), parseInt(m, 10));
                                       setOutcomes(p => ({...p, event: {...p.event, dateTime: d.toISOString()}}))
                                   }}>{format(new Date(`1970-01-01T${time}`), 'p')}</Button>
                               ))}
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>
            )}

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
        </DialogHeader>

        <div className="py-4">{renderStepContent()}</div>

        {currentStep === 'outcomes' && (
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button onClick={handleDetailedLogSubmit} disabled={isSubmitting}>
                {isSubmitting ? <> <Loader2 className="animate-spin mr-2"/> Saving...</> : "Save Log"}
              </Button>
            </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

    