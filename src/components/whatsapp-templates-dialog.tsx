
"use client"

import { useState, useMemo } from 'react';
import { Lead, MessageTemplate } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';

interface WhatsAppTemplatesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead | null;
  templates: MessageTemplate[];
}

export function WhatsAppTemplatesDialog({ isOpen, onClose, lead, templates }: WhatsAppTemplatesDialogProps) {
  const { toast } = useToast();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const populateTemplate = (template: string) => {
    if (!lead) return template;
    
    let populated = template;
    populated = populated.replace(/{Name}/g, lead.name.split(' ')[0]);
    populated = populated.replace(/{InquiredCourse}/g, lead.commitmentSnapshot?.inquiredFor || '');

    const quotes = lead.commitmentSnapshot?.quoteLines?.map((ql, index) => {
      let quoteText = `*Option ${index + 1}: ${ql.courses.join(', ')}*`;
      ql.variants.forEach(v => {
        quoteText += `\n- ${v.mode}, ${v.format}: *$${v.price}*`;
      });
      return quoteText;
    }).join('\n\n') || '';
    
    populated = populated.replace(/{Quotes}/g, quotes);

    return populated;
  };

  const handleCopy = (text: string, templateId: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to clipboard!' });
    setCopiedId(templateId);
    setTimeout(() => {
        onClose();
        setCopiedId(null);
    }, 500); // Close dialog after a short delay
  };

  const newTemplates = useMemo(() => templates.filter(t => t.type === 'new'), [templates]);
  const followupTemplates = useMemo(() => templates.filter(t => t.type === 'followup'), [templates]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Select a WhatsApp Template</DialogTitle>
          <DialogDescription>
            Choose a message to copy for {lead?.name}.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
            <Tabs defaultValue="new">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="new">New</TabsTrigger>
                    <TabsTrigger value="followup">Follow-up</TabsTrigger>
                </TabsList>
                <ScrollArea className="h-72 mt-4 pr-3">
                    <TabsContent value="new" className="mt-0 space-y-3">
                        {newTemplates.map(template => {
                            const message = populateTemplate(template.template);
                            return (
                                <Card key={template.id}>
                                    <CardContent className="p-3">
                                        <div className="flex justify-between items-start">
                                            <div className="space-y-1">
                                                <p className="font-semibold">{template.name}</p>
                                                <p className="text-xs text-muted-foreground whitespace-pre-wrap truncate max-h-16">{message}</p>
                                            </div>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={() => handleCopy(message, template.id)}>
                                                {copiedId === template.id ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            )
                        })}
                    </TabsContent>
                    <TabsContent value="followup" className="mt-0 space-y-3">
                         {followupTemplates.map(template => {
                            const message = populateTemplate(template.template);
                            return (
                                <Card key={template.id}>
                                    <CardContent className="p-3">
                                        <div className="flex justify-between items-start">
                                            <div className="space-y-1">
                                                <p className="font-semibold">{template.name}</p>
                                                <p className="text-xs text-muted-foreground whitespace-pre-wrap truncate max-h-16">{message}</p>
                                            </div>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={() => handleCopy(message, template.id)}>
                                                 {copiedId === template.id ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            )
                        })}
                    </TabsContent>
                </ScrollArea>
            </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
