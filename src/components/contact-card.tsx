
"use client";

import Link from 'next/link';
import {
  FilePenLine,
  Mail,
  MoreVertical,
  Phone,
  Trash2,
  GitMerge,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import type { Lead } from "@/lib/types";
import { cn } from '@/lib/utils';

interface ContactCardProps {
  lead: Lead;
  onEdit: (lead: Lead) => void;
  onDelete: (id: string) => void;
  onMerge: (id: string) => void;
}

export function ContactCard({
  lead,
  onEdit,
  onDelete,
  onMerge,
}: ContactCardProps) {
  return (
    <Card className="p-4 flex flex-col">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 space-y-1 pr-2 min-w-0">
            <Link href={`/contacts/${lead.id}`} className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-base hover:underline leading-tight truncate max-w-[150px]">{lead.name}</h3>
              <p className="text-xs text-muted-foreground">{lead.relationship || 'Lead'}</p>
            </Link>
             <Badge variant={lead.status === 'Active' ? "default" : "secondary"} className="text-xs mt-1">{lead.status || 'Active'}</Badge>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0">
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">More options</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(lead)}>
              <FilePenLine className="mr-2 h-4 w-4" />
              <span>Edit</span>
            </DropdownMenuItem>
             <DropdownMenuItem onClick={() => onMerge(lead.id)}>
              <GitMerge className="mr-2 h-4 w-4" />
              <span>Merge</span>
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
      </div>

      <CardContent className="p-0 text-sm flex flex-col items-start justify-between mt-auto">
         <div className="space-y-1">
            {(lead.phones || []).map((phone, index) => (
                <div key={index} className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <a href={`tel:${phone.number}`} className="truncate text-xs">
                      {phone.number}
                    </a>
                </div>
            ))}
             {(lead.phones || []).length === 0 && (
                 <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                    <p className="text-xs">No phone number</p>
                 </div>
             )}
        </div>
      </CardContent>
    </Card>
  );
}
