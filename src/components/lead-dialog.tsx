
"use client";

import { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { leadSchema, type LeadFormValues } from "@/lib/schemas";
import type { Lead, LeadStatus } from "@/lib/types";
import { CalendarIcon, Loader2, Plus, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { cn } from "@/lib/utils";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import { format, parseISO } from "date-fns";

const ALL_STATUSES: LeadStatus[] = [
  'Active', 'Paused', 'Snoozed', 'Cooling', 'Dormant', 'Enrolled', 'Withdrawn', 'Archived', 'Graduated'
];

interface LeadDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSave: (values: LeadFormValues) => void;
  leadToEdit: Lead | null;
  isSaving?: boolean;
  relationshipTypes: string[];
}

export function LeadDialog({
  isOpen,
  setIsOpen,
  onSave,
  leadToEdit,
  isSaving,
  relationshipTypes,
}: LeadDialogProps) {
  
  const form = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      name: "",
      email: "",
      phones: [{ number: "", type: "both" }],
      relationship: "Lead",
      status: "Active",
      source: "",
      assignedAt: "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "phones",
  });

  useEffect(() => {
    if (isOpen) {
      if (leadToEdit) {
        form.reset({
          name: leadToEdit.name,
          email: leadToEdit.email,
          phones: leadToEdit.phones?.length ? leadToEdit.phones.map(p => ({ number: p.number || '', type: p.type || 'both' })) : [{ number: "", type: "both" }],
          relationship: leadToEdit.relationship || 'Lead',
          status: leadToEdit.status || 'Active',
          source: leadToEdit.source || "",
          assignedAt: leadToEdit.assignedAt || "",
        });
      } else {
        form.reset({
          name: "",
          email: "",
          phones: [{ number: "", type: "both" }],
          relationship: "Lead",
          status: "Active",
          source: "",
          assignedAt: new Date().toISOString(),
        });
      }
    }
  }, [isOpen, leadToEdit, form]);

  const onSubmit = (values: LeadFormValues) => {
    onSave(values);
  };

  const isSubmitting = form.formState.isSubmitting || isSaving;
  const canSubmit = form.formState.isValid;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{leadToEdit ? "Edit Contact" : "Add New Contact"}</DialogTitle>
          <DialogDescription>
            {leadToEdit
              ? "Update the details for this contact."
              : "Enter the details for the new contact."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. John Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="e.g. john@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div>
              <FormLabel>Phone Numbers</FormLabel>
              <div className="space-y-2 mt-2">
              {fields.map((field, index) => (
                <div key={field.id} className="flex gap-2 items-start">
                   <FormField
                      control={form.control}
                      name={`phones.${index}.number`}
                      render={({ field }) => (
                          <FormItem className="flex-1">
                              <FormControl>
                                  <Input placeholder="e.g. 123-456-7890" {...field} />
                              </FormControl>
                              <FormMessage />
                          </FormItem>
                      )}
                  />
                  <FormField
                      control={form.control}
                      name={`phones.${index}.type`}
                      render={({ field }) => (
                        <FormItem>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="w-[100px]">
                                <SelectValue placeholder="Type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="both">Both</SelectItem>
                              <SelectItem value="calling">Calling</SelectItem>
                              <SelectItem value="chat">Chat</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className={cn(fields.length === 1 && "invisible")}>
                    <Trash2 className="h-4 w-4 text-destructive"/>
                  </Button>
                </div>
              ))}
              </div>
               <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => append({ number: "", type: "both" })}
                >
                  <Plus className="mr-2 h-4 w-4" /> Add Phone
                </Button>
            </div>
            
            <FormField
              control={form.control}
              name="relationship"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Relationship</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex flex-wrap gap-x-4 gap-y-2"
                    >
                      {relationshipTypes.map(name => (
                         <FormItem key={name} className="flex items-center space-x-2 space-y-0">
                          <FormControl>
                            <RadioGroupItem value={name} />
                          </FormControl>
                          <FormLabel className="font-normal">
                            {name}
                          </FormLabel>
                        </FormItem>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                   <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ALL_STATUSES.map(status => (
                            <SelectItem key={status} value={status}>{status}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="source"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Source</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Website, Referral" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

             <FormField
                control={form.control}
                name="assignedAt"
                render={({ field }) => (
                    <FormItem className="flex flex-col">
                    <FormLabel>Assigned Date</FormLabel>
                    <Popover>
                        <PopoverTrigger asChild>
                        <FormControl>
                            <Button
                            variant={"outline"}
                            className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                            )}
                            >
                            {field.value ? (
                                format(parseISO(field.value), "PPP")
                            ) : (
                                <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                        </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                            mode="single"
                            selected={field.value ? parseISO(field.value) : undefined}
                            onSelect={(date) => field.onChange(date?.toISOString())}
                            initialFocus
                        />
                        </PopoverContent>
                    </Popover>
                    <FormMessage />
                    </FormItem>
                )}
            />

            <DialogFooter className="pt-4 sticky bottom-0 bg-background/95 pb-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || !canSubmit}>
                {isSubmitting && <Loader2 className="animate-spin mr-2" />}
                {isSubmitting
                  ? "Processing..."
                  : (leadToEdit ? "Update" : "Save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

    