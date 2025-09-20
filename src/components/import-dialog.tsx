
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
import { Input } from "./ui/input";

interface ImportDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSave: (data: { file: File; isNew: boolean }) => void;
  isImporting?: boolean;
}

export function ImportDialog({
  isOpen,
  setIsOpen,
  onSave,
  isImporting,
}: ImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isNew, setIsNew] = useState(true);
  const { toast } = useToast();

  const handleSave = () => {
    if (!file) {
      toast({
        variant: "destructive",
        title: "No file selected",
        description: "Please select a CSV file to import.",
      });
      return;
    }
    onSave({ file, isNew });
  };
  
  const handleOpenChange = (open: boolean) => {
    if (isImporting) return;
    if (!open) {
      setFile(null);
      setIsNew(true);
    }
    setIsOpen(open);
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import Contacts from CSV</DialogTitle>
          <DialogDescription>
            Select a CSV file to import. Required columns: Name. Optional columns: Email, Phone, Course.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="csv-file">CSV File</Label>
            <Input 
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
            />
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
