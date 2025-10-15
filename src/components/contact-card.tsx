
"use client";

import { useRouter } from 'next/navigation';
import {
  FilePenLine,
  Mail,
  MoreVertical,
  Phone,
  Trash2,
  GitMerge,
  Book,
  CheckSquare,
  Square,
  Copy,
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
import { Checkbox } from './ui/checkbox';
import { useToast } from '@/hooks/use-toast';

interface ContactCardProps {
  lead: Lead;
  onEdit: (lead: Lead) => void;
  onDelete: (id: string) => void;
  onMerge: (lead: Lead) => void;
  isSelectionMode: boolean;
  isSelected: boolean;
  onToggleSelect: (leadId: string) => void;
}

export function ContactCard({
  lead,
  onEdit,
  onDelete,
  onMerge,
  isSelectionMode,
  isSelected,
  onToggleSelect,
}: ContactCardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const contactName = lead.name || "";
  const truncatedName = contactName.length > 12 ? `${contactName.substring(0, 12)}...` : contactName;
  const email = lead.email || "";
  const truncatedEmail = email.length > 10 ? `${email.substring(0, 10)}...` : email;

  const stopPropagation = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
  };

  const handleCopyToClipboard = (text: string, e: React.MouseEvent) => {
    stopPropagation(e);
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard", description: text });
  };
  
  const handleCardClick = (e: React.MouseEvent) => {
    if (isSelectionMode) {
      // Let clicks on checkbox handle themselves
      if ((e.target as HTMLElement).closest('[role="checkbox"]')) {
        return;
      }
      onToggleSelect(lead.id);
    } else {
        router.push(`/contacts/${lead.id}`);
    }
  }


  return (
    <Card 
        className={cn(
            "p-4 flex flex-col transition-all cursor-pointer",
            isSelected && "ring-2 ring-primary bg-primary/5"
        )}
        onClick={handleCardClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 space-y-1 pr-2 min-w-0">
            <div className="flex items-center gap-2 flex-wrap" title={contactName}>
              <h3 className={cn("font-semibold text-base leading-tight truncate hover:underline")}>{truncatedName}</h3>
              <p className="text-xs text-muted-foreground">{lead.relationship || 'Lead'}</p>
            </div>
             <Badge variant={lead.status === 'Active' ? "default" : "secondary"} className="text-xs mt-1">{lead.status || 'Active'}</Badge>
        </div>
        {isSelectionMode ? (
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleSelect(lead.id)}
              className="h-5 w-5"
              onClick={stopPropagation}
            />
        ) : (
            <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={stopPropagation}>
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">More options</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={stopPropagation}>
                 <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onToggleSelect(lead.id); }}>
                    <CheckSquare className="mr-2 h-4 w-4" />
                    <span>Select</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEdit(lead)}>
                <FilePenLine className="mr-2 h-4 w-4" />
                <span>Edit</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onMerge(lead)}>
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
        )}
      </div>
      <CardContent className="p-0 text-sm flex flex-col items-start justify-between mt-auto space-y-2">
         <div className="space-y-1.5 w-full">
            {(lead.commitmentSnapshot?.courses || []).length > 0 && (
                 <div className="flex items-center gap-2">
                    <Book className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <p className="text-xs truncate">{(lead.commitmentSnapshot.courses || []).join(', ')}</p>
                 </div>
            )}
             <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                 <a href={`mailto:${email}`} className="truncate text-xs hover:underline" title={email} onClick={stopPropagation}>
                    {truncatedEmail}
                </a>
             </div>
            {(lead.phones || []).map((phone, index) => (
                <div key={index} className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <a href={`tel:${phone.number}`} className="truncate text-xs hover:underline" onClick={stopPropagation}>
                      {phone.number}
                    </a>
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => handleCopyToClipboard(phone.number, e)}>
                        <Copy className="h-3 w-3" />
                        <span className="sr-only">Copy phone number</span>
                    </Button>
                </div>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
