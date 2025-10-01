
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
import type { Lead } from "@/lib/types";
import { Loader2, Plus, Trash2, X, CheckIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { cn } from "@/lib/utils";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./ui/command";
import { Badge } from "./ui/badge";


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
  const [isCoursePopoverOpen, setIsCoursePopoverOpen] = useState(false);
  
  const form = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      name: "",
      email: "",
      phones: [{ number: "", type: "both" }],
      courses: [],
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
          courses: leadToEdit.commitmentSnapshot?.courses || [],
          relationship: leadToEdit.relationship || 'Lead',
        });
      } else {
        form.reset({
          name: "",
          email: "",
          phones: [{ number: "", type: "both" }],
          courses: [],
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
  
  const selectedCourses = form.watch("courses") || [];

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
                      className="flex space-x-2"
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
              name="courses"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Courses of Interest</FormLabel>
                  <Popover open={isCoursePopoverOpen} onOpenChange={setIsCoursePopoverOpen}>
                      <PopoverTrigger asChild>
                          <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={isCoursePopoverOpen}
                              className="w-full justify-start font-normal h-auto min-h-10"
                          >
                            {selectedCourses.length > 0 ? (
                               <div className="flex gap-1 flex-wrap">
                                  {selectedCourses.map(course => (
                                    <Badge key={course} variant="secondary" className="font-normal">{course}</Badge>
                                  ))}
                               </div>
                            ) : (
                              "Select courses..."
                            )}
                          </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                          <Command>
                              <CommandInput placeholder="Search courses..." />
                              <CommandList>
                                <CommandEmpty>No course found.</CommandEmpty>
                                <CommandGroup>
                                    {courseNames.map(course => (
                                        <CommandItem
                                            key={course}
                                            value={course}
                                            onSelect={() => {
                                                const currentCourses = field.value || [];
                                                const newCourses = currentCourses.includes(course)
                                                    ? currentCourses.filter(c => c !== course)
                                                    : [...currentCourses, course];
                                                field.onChange(newCourses);
                                            }}
                                        >
                                            <CheckIcon
                                                className={cn(
                                                    "mr-2 h-4 w-4",
                                                    (field.value || []).includes(course) ? "opacity-100" : "opacity-0"
                                                )}
                                            />
                                            {course}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                              </CommandList>
                          </Command>
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
