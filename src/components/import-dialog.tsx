
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
import { Loader2, ArrowLeft, ArrowRight, AlertTriangle } from "lucide-react";
import { Textarea } from "./ui/textarea";
import { importContactsAction } from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";
import { Badge } from "./ui/badge";

interface ImportDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSuccess: () => void;
}

const sampleJson = `[
  {
    "Name": "Thomas",
    "Phone1": "971581942012",
    "Email": "chaithu4k@gmail.com",
    "d1courses": "AWS",
    "d1price": 500,
    "d1mode": "Online",
    "d1format": "1-1"
  },
  {
    "Name": "Pradeep",
    "Phone1": 562286658,
    "Email": "ossasun@hotmail.com",
    "d1courses": "Data Analytics, Power BI",
    "d1price": 1200
  }
]`;

type ImportStep = "input" | "preview";
type PreviewData = {
    created: number;
    updated: number;
    skipped: number;
    previewData: any[];
    skippedData?: any[];
}


export function ImportDialog({
  isOpen,
  setIsOpen,
  onSuccess,
}: ImportDialogProps) {
  const [step, setStep] = useState<ImportStep>("input");
  const [jsonData, setJsonData] = useState("");
  const [isNew, setIsNew] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);

  const { toast } = useToast();

  const resetState = () => {
    setStep("input");
    setJsonData("");
    setIsNew(true);
    setIsLoading(false);
    setPreview(null);
  };

  const handleOpenChange = (open: boolean) => {
    if (isLoading) return;
    if (!open) {
      resetState();
    }
    setIsOpen(open);
  };
  
  const handlePreview = async () => {
    if (!jsonData.trim()) {
      toast({ variant: "destructive", title: "Please paste your JSON data." });
      return;
    }
    setIsLoading(true);
    try {
      const result = await importContactsAction({ jsonData, isNew, dryRun: true });
      if (result.success) {
        setPreview(result as PreviewData);
        setStep("preview");
      } else {
        throw new Error(result.error || "Failed to generate preview.");
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Preview Error", description: error instanceof Error ? error.message : "An unknown error occurred." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!jsonData.trim()) return;
    setIsLoading(true);
    try {
      const result = await importContactsAction({ jsonData, isNew, dryRun: false });
       if (result.success) {
            const { created = 0, updated = 0, skipped = 0 } = result;
            toast({
                title: "Import Successful",
                description: `${created} created, ${updated} updated, ${skipped} skipped.`,
            });
            onSuccess();
            handleOpenChange(false);
        } else {
            throw new Error(result.error || "An unknown error occurred during import.");
        }
    } catch (error) {
       toast({ variant: "destructive", title: "Import Failed", description: error instanceof Error ? error.message : "An unknown error occurred." });
    } finally {
        setIsLoading(false);
    }
  };
  
  const renderInputStep = () => (
    <>
       <DialogHeader>
          <DialogTitle>Import Contacts from JSON</DialogTitle>
           <DialogDescription>
            Step 1: Paste an array of contact objects in JSON format.
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
                    {isNew ? "Only create new contacts." : "Update existing by email/phone."}
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
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handlePreview} disabled={!jsonData || isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
            Preview Import
          </Button>
        </DialogFooter>
    </>
  );

  const renderPreviewStep = () => (
     <>
       <DialogHeader>
          <DialogTitle>Import Preview</DialogTitle>
           <DialogDescription>
            Step 2: Review the changes and confirm the import.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 bg-green-100 dark:bg-green-900/50 rounded-md">
                    <p className="text-2xl font-bold text-green-700 dark:text-green-400">{preview?.created || 0}</p>
                    <p className="text-xs font-medium">To Be Created</p>
                </div>
                 <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-md">
                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{preview?.updated || 0}</p>
                    <p className="text-xs font-medium">To Be Updated</p>
                </div>
                 <div className="p-2 bg-yellow-100 dark:bg-yellow-900/50 rounded-md">
                    <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{preview?.skipped || 0}</p>
                    <p className="text-xs font-medium">To Be Skipped</p>
                </div>
            </div>

            {preview && preview.previewData.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Data Mapping Preview (up to 3 contacts):</p>
                    <ScrollArea className="h-48">
                        <div className="space-y-3 pr-4">
                        {preview.previewData.map((data, index) => (
                          <Card key={index}>
                              <CardHeader className="p-3">
                                  <CardTitle className="text-base">{data.name}</CardTitle>
                              </CardHeader>
                              <CardContent className="p-3 pt-0 text-xs text-muted-foreground space-y-1">
                                  <p><span className="font-semibold text-foreground">Email:</span> {data.email || 'N/A'}</p>
                                  {(data.commitmentSnapshot?.deals || []).map((deal: any, i: number) => (
                                    <div key={i} className="border-t mt-1 pt-1">
                                      <p><span className="font-semibold text-foreground">Deal {i+1}:</span> {deal.courses.join(', ')} - ${deal.price}</p>
                                    </div>
                                  ))}
                                  <p><span className="font-semibold text-foreground">Phones:</span> {(data.phones || []).map((p: any) => p.number).join(', ')}</p>
                                  {data.autoLogInitiated && <Badge variant="outline" className="mt-1">Will create AFC task</Badge>}
                              </CardContent>
                          </Card>
                        ))}
                        </div>
                    </ScrollArea>
                </div>
            )}
            {preview && preview.skippedData && preview.skippedData.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive"/> Skipped Contacts</p>
                    <ScrollArea className="h-32">
                        <div className="space-y-2 pr-4">
                        {preview.skippedData.map((data, index) => (
                           <div key={index} className="p-2 border rounded-md text-xs">
                               <p className="font-semibold truncate">{data.Name || data.name || 'Unknown Name'}</p>
                               <p className="text-destructive">{data.reason}</p>
                           </div>
                        ))}
                        </div>
                    </ScrollArea>
                </div>
            )}
        </div>
        
        <DialogFooter>
          <Button variant="ghost" onClick={() => setStep('input')} disabled={isLoading}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button onClick={handleConfirmImport} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm Import
          </Button>
        </DialogFooter>
    </>
  )

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
          {step === 'input' ? renderInputStep() : renderPreviewStep()}
      </DialogContent>
    </Dialog>
  );
}
