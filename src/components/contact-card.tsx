
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
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <Link href={`/contacts/${lead.id}`} className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-lg hover:underline">{lead.name}</h3>
            <p className="text-sm text-muted-foreground">{lead.relationship || 'Lead'}</p>
            <Badge variant={lead.status === 'Active' ? "default" : "secondary"}>{lead.status || 'Active'}</Badge>
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
      </div>

      <CardContent className="p-0 mt-3 text-sm">
         <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
                {(lead.phones || []).map((phone, index) => (
                    <div key={index} className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <a href={`tel:${phone.number}`} className="truncate">
                          {phone.number}
                        </a>
                    </div>
                ))}
            </div>
            {lead.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <a
                    href={`mailto:${lead.email}`}
                    className="hover:underline truncate"
                  >
                    {lead.email}
                  </a>
                </div>
            )}
        </div>
      </CardContent>
    </Card>
  );
}
