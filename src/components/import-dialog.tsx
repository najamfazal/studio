
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Switch } from "./ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Textarea } from "./ui/textarea";

interface ImportDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSave: (data: { jsonData: string, relationship: string, isNew: boolean }) => void;
  relationshipTypes: string[];
  isImporting?: boolean;
}

export function ImportDialog({
  isOpen,
  setIsOpen,
  onSave,
  relationshipTypes,
  isImporting,
}: ImportDialogProps) {
  const [jsonData, setJsonData] = useState("");
  const [relationship, setRelationship] = useState<string>("Lead");
  const [isNew, setIsNew] = useState(true);
  const { toast } = useToast();

  const handleSave = () => {
    if (!jsonData.trim()) {
      toast({
        variant: "destructive",
        title: "No data provided",
        description: "Please paste your JSON data into the text area.",
      });
      return;
    }
    onSave({ jsonData, relationship, isNew });
  };
  
  const handleOpenChange = (open: boolean) => {
    if (isImporting) return;
    if (!open) {
      // Reset state when closing
      setJsonData("");
      setRelationship("Lead");
      setIsNew(true);
    }
    setIsOpen(open);
  }

  const sampleJson = `[
  {
    "name": "John Doe",
    "email": "john.doe@example.com",
    "phone1": "123-456-7890",
    "phone1Type": "calling"
  },
  {
    "name": "Jane Smith",
    "email": "jane.smith@example.com",
    "courseName": "Example Course 1"
  }
]`;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import Contacts from JSON</DialogTitle>
          <DialogDescription>
            Paste an array of contact objects in JSON format. Only 'name' is required.
             <details className="text-xs mt-2 text-muted-foreground">
                <summary>View example format</summary>
                <pre className="bg-muted p-2 rounded-md mt-1 text-xs whitespace-pre-wrap">{sampleJson}</pre>
            </details>
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="json-data">JSON Data</Label>
            <Textarea 
              id="json-data" 
              value={jsonData}
              onChange={(e) => setJsonData(e.target.value)}
              placeholder="Paste your JSON array here..."
              className="h-32"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="relationship-type">Default Relationship</Label>
             <Select value={relationship} onValueChange={setRelationship}>
                <SelectTrigger id="relationship-type">
                    <SelectValue placeholder="Select a relationship type" />
                </SelectTrigger>
                <SelectContent>
                    {relationshipTypes.map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
          </div>
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
          <Button onClick={handleSave} disabled={!jsonData.trim() || isImporting}>
            {isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isImporting ? "Processing..." : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

    