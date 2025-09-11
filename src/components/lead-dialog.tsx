
"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
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

interface LeadDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSave: (values: LeadFormValues) => void;
  leadToEdit: Lead | null;
}

export function LeadDialog({
  isOpen,
  setIsOpen,
  onSave,
  leadToEdit,
}: LeadDialogProps) {
  const form = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      course: "",
    },
  });

  useEffect(() => {
    if (isOpen) {
      if (leadToEdit) {
        form.reset({
          name: leadToEdit.name,
          email: leadToEdit.email,
          phone: leadToEdit.phone,
          course: leadToEdit.commitmentSnapshot?.course || "",
        });
      } else {
        form.reset({ name: "", email: "", phone: "", course: "" });
      }
    }
  }, [isOpen, leadToEdit, form]);

  const onSubmit = (values: LeadFormValues) => {
    onSave(values);
  };

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{leadToEdit ? "Edit Lead" : "Add New Lead"}</DialogTitle>
          <DialogDescription>
            {leadToEdit
              ? "Update the details for this lead."
              : "Enter the details for the new lead."}
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
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. 123-456-7890" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="course"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Course</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Full-Stack Development" {...field} />
                  </FormControl>
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
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? (leadToEdit ? "Updating..." : "Saving...")
                  : (leadToEdit ? "Update" : "Save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
