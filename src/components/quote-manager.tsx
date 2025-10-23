

"use client";

import { produce } from "immer";
import { useState, useEffect } from "react";
import { Copy, PlusCircle, Trash2, Loader2, Sparkles, CopyIcon, Pencil, Check, X } from "lucide-react";

import type { Lead, QuoteLine, PriceVariant, SalesCatalog, CatalogCourse } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./ui/command";
import { cn } from "@/lib/utils";
import { Badge } from "./ui/badge";
import { CheckIcon } from "lucide-react";
import { Textarea } from "./ui/textarea";
import { EditableField } from "./editable-field";


interface QuoteManagerProps {
  lead: Lead;
  salesCatalog: SalesCatalog | null;
  onUpdate: (newQuoteLines: QuoteLine[]) => void;
  onFieldUpdate: (field: string, value: any) => Promise<void>;
}

export function QuoteManager({ lead, salesCatalog, onUpdate, onFieldUpdate }: QuoteManagerProps) {
  const { toast } = useToast();
  const [isQuoteDialogOpen, setIsQuoteDialogOpen] = useState(false);
  const [editingQuoteLine, setEditingQuoteLine] = useState<QuoteLine | null>(null);

  const handleOpenQuoteDialog = (quoteLine: QuoteLine | null) => {
    setEditingQuoteLine(quoteLine);
    setIsQuoteDialogOpen(true);
  }

  const handleSaveQuoteLine = (newQuoteLine: QuoteLine) => {
    const newQuoteLines = produce(lead.commitmentSnapshot?.quoteLines || [], draft => {
      const index = draft.findIndex(ql => ql.id === newQuoteLine.id);
      if (index > -1) {
        draft[index] = newQuoteLine;
      } else {
        draft.push(newQuoteLine);
      }
    });
    onUpdate(newQuoteLines);
    setIsQuoteDialogOpen(false);
    setEditingQuoteLine(null);
  };

  const handleRemoveQuoteLine = (id: string) => {
    const newQuoteLines = (lead.commitmentSnapshot?.quoteLines || []).filter(ql => ql.id !== id);
    onUpdate(newQuoteLines);
  };

  const copyToClipboard = () => {
    let quoteText = `Hi ${lead.name},\n\nIt was great speaking with you! As discussed, here are the options for your training:\n\n`;

    (lead.commitmentSnapshot?.quoteLines || []).forEach((ql, index) => {
      const course = salesCatalog?.courses.find(c => c.name === ql.courses[0]);
      
      quoteText += `*Option ${index + 1}: ${ql.courses.join(', ')}*\n`;
      if (course?.valueProposition) {
        quoteText += `* ${course.valueProposition}\n`;
      }
      ql.variants.forEach(variant => {
        quoteText += `* ${variant.mode}, ${variant.format}: *$${variant.price}*\n`;
      });
      quoteText += `\n`;
    });

    quoteText += "Let me know which option works best for you!";
    navigator.clipboard.writeText(quoteText);
    toast({ title: "Quote copied to clipboard!" });
  };
  
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between p-4">
        <CardTitle className="text-lg">Quote</CardTitle>
        <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => handleOpenQuoteDialog(null)}>
                <PlusCircle className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={copyToClipboard} disabled={!lead.commitmentSnapshot?.quoteLines?.length}>
                <CopyIcon className="h-5 w-5" />
            </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        {(lead.commitmentSnapshot?.quoteLines || []).length > 0 ? (
          lead.commitmentSnapshot.quoteLines?.map(ql => (
            <div key={ql.id} className="border rounded-lg p-3">
              <div className="flex justify-between items-start">
                 <div>
                    <h4 className="font-semibold">{ql.courses.join(', ')}</h4>
                    <p className="text-xs text-muted-foreground italic mt-1">
                        {salesCatalog?.courses.find(c => c.name === ql.courses[0])?.valueProposition}
                    </p>
                 </div>
                 <div className="flex items-center">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpenQuoteDialog(ql)}><Pencil className="h-4 w-4"/></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleRemoveQuoteLine(ql.id)}><Trash2 className="h-4 w-4"/></Button>
                 </div>
              </div>
              <div className="mt-2 space-y-1 text-sm">
                {ql.variants.map(variant => (
                  <div key={variant.id} className="flex justify-between items-center text-muted-foreground">
                    <p>{variant.mode}, {variant.format}</p>
                    <p className="font-semibold text-foreground">${variant.price}</p>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No quote options added yet.
          </div>
        )}
         <div className="border-t pt-4">
            <EditableField
                label="Key Notes"
                value={lead.commitmentSnapshot?.keyNotes || ""}
                onSave={(val) => onFieldUpdate('commitmentSnapshot.keyNotes', val)}
                type="textarea"
                placeholder="Add key negotiation points or summary..."
            />
        </div>
      </CardContent>

      {isQuoteDialogOpen && salesCatalog && (
        <QuoteLineDialog 
            isOpen={isQuoteDialogOpen}
            onClose={() => { setIsQuoteDialogOpen(false); setEditingQuoteLine(null); }}
            onSave={handleSaveQuoteLine}
            salesCatalog={salesCatalog}
            quoteLineToEdit={editingQuoteLine}
        />
      )}
    </Card>
  );
}


interface QuoteLineDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (quoteLine: QuoteLine) => void;
  salesCatalog: SalesCatalog;
  quoteLineToEdit: QuoteLine | null;
}

function QuoteLineDialog({ isOpen, onClose, onSave, salesCatalog, quoteLineToEdit }: QuoteLineDialogProps) {
    const [quoteLine, setQuoteLine] = useState<QuoteLine>({ id: '', courses: [], variants: [] });

    useEffect(() => {
        if (quoteLineToEdit) {
            setQuoteLine(quoteLineToEdit);
        } else {
            setQuoteLine({ id: `ql_${Date.now()}`, courses: [], variants: [] });
        }
    }, [quoteLineToEdit, isOpen]);

    const handleCourseSelection = (courseName: string) => {
        const course = salesCatalog.courses.find(c => c.name === courseName);
        if (!course) return;

        setQuoteLine(produce(draft => {
            draft.courses = [course.name]; // For now, we handle single course selection
            // Automatically populate standard prices
            draft.variants = course.standardPrices || [];
        }));
    };

    const addVariant = () => {
        setQuoteLine(produce(draft => {
            draft.variants.push({
                id: `v_${Date.now()}`,
                mode: 'Online',
                format: '1-1',
                price: 0
            });
        }));
    };
    
    const updateVariant = (id: string, field: keyof PriceVariant, value: string | number) => {
         setQuoteLine(produce(draft => {
            const variant = draft.variants.find(v => v.id === id);
            if (variant) {
                (variant as any)[field] = value;
            }
        }));
    };

    const removeVariant = (id: string) => {
        setQuoteLine(produce(draft => {
            draft.variants = draft.variants.filter(v => v.id !== id);
        }));
    };

    const handleSubmit = () => {
        onSave(quoteLine);
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{quoteLineToEdit ? 'Edit' : 'Add'} Quote Option</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div>
                        <Label>Course Package</Label>
                        <Select onValueChange={handleCourseSelection} value={quoteLine.courses[0]}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select course..." />
                            </SelectTrigger>
                            <SelectContent>
                                {salesCatalog.courses.map(course => (
                                    <SelectItem key={course.id} value={course.name}>
                                        {course.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-3">
                         <Label>Price Variants</Label>
                         {quoteLine.variants.map(variant => (
                             <div key={variant.id} className="grid grid-cols-10 gap-2 items-center">
                                <div className="col-span-3">
                                  <Select value={variant.mode} onValueChange={(val) => updateVariant(variant.id, 'mode', val)}>
                                    <SelectTrigger><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Online">Online</SelectItem>
                                        <SelectItem value="In-person">In-person</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="col-span-3">
                                   <Select value={variant.format} onValueChange={(val) => updateVariant(variant.id, 'format', val)}>
                                    <SelectTrigger><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1-1">1-on-1</SelectItem>
                                        <SelectItem value="Batch">Batch</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="col-span-3">
                                  <Input 
                                    type="number"
                                    value={variant.price}
                                    onChange={(e) => updateVariant(variant.id, 'price', parseFloat(e.target.value) || 0)}
                                    placeholder="Price"
                                   />
                                </div>
                                <div className="col-span-1">
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeVariant(variant.id)}><Trash2 className="h-4 w-4"/></Button>
                                </div>
                             </div>
                         ))}
                          <Button variant="outline" size="sm" onClick={addVariant}><PlusCircle className="mr-2 h-4 w-4"/>Add Variant</Button>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSubmit}>Save Option</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
