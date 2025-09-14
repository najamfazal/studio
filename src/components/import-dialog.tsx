
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
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Switch } from "./ui/switch";
import { useToast } from "@/hooks/use-toast";

interface ImportDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSave: (data: { file: File, relationship: string, isNew: boolean }) => void;
  relationshipTypes: string[];
}

export function ImportDialog({
  isOpen,
  setIsOpen,
  onSave,
  relationshipTypes,
}: ImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [relationship, setRelationship] = useState<string>("Lead");
  const [isNew, setIsNew] = useState(true);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleSave = () => {
    if (!file) {
      toast({
        variant: "destructive",
        title: "No file selected",
        description: "Please select a CSV file to import.",
      });
      return;
    }
    onSave({ file, relationship, isNew });
  };
  
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Reset state when closing
      setFile(null);
      setRelationship("Lead");
      setIsNew(true);
    }
    setIsOpen(open);
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Contacts from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file to bulk-add or update contacts. Ensure your file
            has columns for 'name', 'email', and 'phone'.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="csv-file">CSV File</Label>
            <Input id="csv-file" type="file" accept=".csv" onChange={handleFileChange} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="relationship-type">Relationship</Label>
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
                    {isNew ? "Create new contacts." : "Update existing contacts matching email."}
                </p>
            </div>
            <div className="flex items-center space-x-2">
                <Label htmlFor="import-mode" className="text-sm font-normal text-muted-foreground">Existing</Label>
                <Switch id="import-mode" checked={isNew} onCheckedChange={setIsNew} />
                <Label htmlFor="import-mode" className="text-sm font-normal">New</Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!file}>
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

