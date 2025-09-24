
"use client";

import { useState } from "react";
import Link from 'next/link';
import {
  FilePenLine,
  Loader2,
  Mail,
  MoreVertical,
  Phone,
  Trash2,
} from "lucide-react";

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
}

export function LeadCard({
  lead,
  onEdit,
  onDelete,
}: LeadCardProps) {
  return (
    <Card className="flex flex-col">
       <CardHeader className="flex flex-row items-start justify-between">
        <Link href={`/contacts/${lead.id}`} className="flex-1">
            <CardTitle className="text-xl hover:underline">{lead.name}</CardTitle>
            <div className="flex items-center gap-2 mt-1">
                <CardDescription>{lead.status || 'Active'}</CardDescription>
                <Badge variant="outline">{lead.relationship || 'Lead'}</Badge>
            </div>
        </Link>
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
        {(lead.phones || []).length > 0 && (
          <div className="flex items-center gap-3">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <a href={`tel:${lead.phones[0].number}`} className="text-sm">
              {lead.phones[0].number}
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
