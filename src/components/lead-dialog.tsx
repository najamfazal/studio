
"use client";

import { useEffect } from "react";
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
import type { Lead } from "@/lib/types";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { cn } from "@/lib/utils";


interface LeadDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSave: (values: LeadFormValues) => void;
  leadToEdit: Lead | null;
  isSaving?: boolean;
  courseNames: string[];
  relationshipTypes: string[];
}

export function LeadDialog({
  isOpen,
  setIsOpen,
  onSave,
  leadToEdit,
  isSaving,
  courseNames,
  relationshipTypes,
}: LeadDialogProps) {
  const form = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      name: "",
      email: "",
      phones: [{ number: "", type: "both" }],
      course: "",
      relationship: "Lead",
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
          course: leadToEdit.commitmentSnapshot?.course || "",
          relationship: leadToEdit.relationship || 'Lead',
        });
      } else {
        form.reset({
          name: "",
          email: "",
          phones: [{ number: "", type: "both" }],
          course: "",
          relationship: "Lead",
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
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{leadToEdit ? "Edit Contact" : "Add New Contact"}</DialogTitle>
          <DialogDescription>
            {leadToEdit
              ? "Update the details for this contact."
              : "Enter the details for the new contact."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
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
                <FormItem>
                  <FormLabel>Relationship</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a relationship type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {relationshipTypes.map(name => (
                        <SelectItem key={name} value={name}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="course"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Course of Interest</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a course" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {courseNames.map(name => (
                        <SelectItem key={name} value={name}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-4">
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
