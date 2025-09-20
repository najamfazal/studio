
"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Textarea } from "./ui/textarea";

interface ImportDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSave: (data: { jsonData: string; isNew: boolean }) => void;
  isImporting?: boolean;
}

const sampleJson = `[
  {
    "Name": "Thomas",
    "Phone1": "971581942012",
    "Phone1 Type": "Both",
    "Email": "chaithu4k@gmail.com",
    "Course": "AWS"
  },
  {
    "Name": "Pradeep",
    "Phone1": 562286658,
    "Phone1 Type": "Call",
    "Email": "ossasun@hotmail.com",
    "Course": "Data Analytics",
    "Phone2": "971501234567",
    "Phone2 Type": "Chat"
  }
]`;

export function ImportDialog({
  isOpen,
  setIsOpen,
  onSave,
  isImporting,
}: ImportDialogProps) {
  const [jsonData, setJsonData] = useState("");
  const [isNew, setIsNew] = useState(true);
  const { toast } = useToast();

  const handleSave = () => {
    if (!jsonData.trim()) {
      toast({
        variant: "destructive",
        title: "No data pasted",
        description: "Please paste your JSON data to import.",
      });
      return;
    }
    onSave({ jsonData, isNew });
  };
  
  const handleOpenChange = (open: boolean) => {
    if (isImporting) return;
    if (!open) {
      setJsonData("");
      setIsNew(true);
    }
    setIsOpen(open);
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import Contacts from JSON</DialogTitle>
           <DialogDescription>
            Paste an array of contact objects in JSON format.
          </DialogDescription>
        </DialogHeader>
       
        <div className="grid gap-4 py-4">
          <Textarea 
            placeholder="Paste your JSON here..."
            className="h-40 font-mono text-xs"
            value={jsonData}
            onChange={(e) => setJsonData(e.target.value)}
          />
           <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">View example format</summary>
                <pre className="bg-muted p-2 rounded-md mt-1 text-xs whitespace-pre-wrap">{sampleJson}</pre>
            </details>
           <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
            <div className="space-y-0.5">
                <Label>Import Mode</Label>
                <p className="text-xs text-muted-foreground">
                    {isNew ? "Only create new contacts." : "Update existing contacts by email."}
                </p>
            </div>
            <div className="flex items-center space-x-2">
                <Label htmlFor="import-mode" className="text-sm font-normal text-muted-foreground">Update</Label>
                <Switch id="import-mode" checked={isNew} onCheckedChange={setIsNew} />
                <Label htmlFor="import-mode" className="text-sm font-normal">New</Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isImporting}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!jsonData || isImporting}>
            {isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isImporting ? "Processing..." : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

    