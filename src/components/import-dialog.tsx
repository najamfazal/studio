
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
import { Loader2 } from "lucide-react";

interface ImportDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSave: (data: { file: File, relationship: string, isNew: boolean }) => void;
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
    if (isImporting) return;
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
            Upload a CSV with columns: name, email, phone1, phone1Type, phone2, phone2Type, relationship, courseName. Only name is required.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="csv-file">CSV File</Label>
            <Input id="csv-file" type="file" accept=".csv" onChange={handleFileChange} />
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
          <Button onClick={handleSave} disabled={!file || isImporting}>
            {isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isImporting ? "Processing..." : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
