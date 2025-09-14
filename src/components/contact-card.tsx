
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

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
    <Card className="flex flex-col">
       <CardHeader className="flex flex-row items-start justify-between pb-3">
        <Link href={`/contacts/${lead.id}`} className="flex-1 space-y-1">
            <CardTitle className="text-lg hover:underline">{lead.name}</CardTitle>
            <div className="flex items-center gap-2">
                <Badge variant={lead.status === 'Active' ? "default" : "secondary"}>{lead.status || 'Active'}</Badge>
                <CardDescription>{lead.relationship || 'Lead'}</CardDescription>
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
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center gap-3">
          <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <a
            href={`mailto:${lead.email}`}
            className="hover:underline truncate"
          >
            {lead.email}
          </a>
        </div>
        {(lead.phones || []).length > 0 && (
          <div className="flex items-center gap-3">
            <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <a href={`tel:${lead.phones[0].number}`} className="truncate">
              {lead.phones[0].number}
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
