"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import {
  BrainCircuit,
  FilePenLine,
  Loader2,
  Mail,
  MoreVertical,
  Phone,
  Trash2,
} from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Lead } from "@/lib/types";

interface LeadCardProps {
  lead: Lead;
  onEdit: (lead: Lead) => void;
  onDelete: (id: string) => void;
  onEnrich: (lead: Lead) => Promise<void>;
}

export function LeadCard({
  lead,
  onEdit,
  onDelete,
  onEnrich,
}: LeadCardProps) {
  const [isEnriching, setIsEnriching] = useState(false);

  const handleEnrich = async () => {
    setIsEnriching(true);
    await onEnrich(lead);
    setIsEnriching(false);
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-start justify-between">
        <div className="flex-1">
          <CardTitle className="text-xl">{lead.name}</CardTitle>
          <CardDescription>Lead Contact</CardDescription>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">More options</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(lead)}>
              <FilePenLine className="mr-2 h-4 w-4" />
              <span>Edit</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(lead.id)}
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              <span>Delete</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="space-y-3 flex-1">
        <div className="flex items-center gap-3">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <a
            href={`mailto:${lead.email}`}
            className="text-sm hover:underline"
          >
            {lead.email}
          </a>
        </div>
        <div className="flex items-center gap-3">
          <Phone className="h-4 w-4 text-muted-foreground" />
          <a href={`tel:${lead.phone}`} className="text-sm">
            {lead.phone}
          </a>
        </div>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-4">
        <Button onClick={handleEnrich} disabled={isEnriching} variant="outline">
          {isEnriching ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <BrainCircuit className="mr-2 h-4 w-4 text-accent" />
          )}
          {isEnriching ? "Enriching..." : "Enrich with AI"}
        </Button>
        {lead.additionalInformation && (
          <Accordion type="single" collapsible>
            <AccordionItem value="item-1">
              <AccordionTrigger className="text-sm">
                AI Generated Info
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground space-y-2">
                <p>{lead.additionalInformation}</p>
                {lead.lastEnriched && (
                  <Badge variant="secondary">
                    Last updated: {format(parseISO(lead.lastEnriched), "PPp")}
                  </Badge>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </CardFooter>
    </Card>
  );
}
