
"use client";

import { useEffect, useState } from "react";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { dealSchema, type DealFormValues } from "@/lib/schemas";
import type { Deal } from "@/lib/types";
import { Loader2, Plus, Trash2, CheckIcon, Pencil } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";
import { Command, CommandInput, CommandEmpty, CommandList, CommandGroup, CommandItem } from "./ui/command";
import { cn } from "@/lib/utils";
import { Badge } from "./ui/badge";

interface DealDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (deal: Deal) => void;
  dealToEdit: Deal | null;
  courseNames: string[];
}

export function DealDialog({
  isOpen,
  onClose,
  onSave,
  dealToEdit,
  courseNames,
}: DealDialogProps) {
  const [isCoursePopoverOpen, setIsCoursePopoverOpen] = useState(false);
  
  const form = useForm<DealFormValues>({
    resolver: zodResolver(dealSchema),
    defaultValues: {
      id: "",
      courses: [],
      price: 0,
      mode: "Online",
      format: "1-1",
    },
  });

  useEffect(() => {
    if (isOpen) {
      if (dealToEdit) {
        form.reset({
          ...dealToEdit,
          price: dealToEdit.price || 0,
        });
      } else {
        form.reset({
          id: `deal_${Date.now()}`,
          courses: [],
          price: 0,
          mode: "Online",
          format: "1-1",
        });
      }
    }
  }, [isOpen, dealToEdit, form]);
  
  const watchedCourses = form.watch("courses");

  const handleToggleCourse = (course: string) => {
    const currentCourses = form.getValues("courses");
    const newCourses = currentCourses.includes(course)
      ? currentCourses.filter(c => c !== course)
      : [...currentCourses, course];
    form.setValue("courses", newCourses, { shouldValidate: true });
  }

  const onSubmit = (values: DealFormValues) => {
    onSave(values as Deal);
  };

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dealToEdit ? "Edit Deal" : "Add New Deal"}</DialogTitle>
          <DialogDescription>
            Define the package details for this commitment.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
            
            <FormField
              control={form.control}
              name="courses"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Courses</FormLabel>
                   <Popover open={isCoursePopoverOpen} onOpenChange={setIsCoursePopoverOpen}>
                      <PopoverTrigger asChild>
                          <Button variant="outline" role="combobox" className="w-full justify-start font-normal h-auto min-h-10">
                              <div className="flex gap-1 flex-wrap">
                                  {watchedCourses.length > 0 ? (
                                      watchedCourses.map(course => <Badge key={course} variant="secondary">{course}</Badge>)
                                  ) : (
                                      <span className="text-muted-foreground">Select courses...</span>
                                  )}
                              </div>
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
                                              onSelect={() => handleToggleCourse(course)}
                                          >
                                              <CheckIcon className={cn("mr-2 h-4 w-4", watchedCourses.includes(course) ? "opacity-100" : "opacity-0")} />
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

            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Price</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="e.g. 500" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-2 gap-4">
               <FormField
                control={form.control}
                name="mode"
                render={({ field }) => (
                    <FormItem className="space-y-3">
                    <FormLabel>Mode</FormLabel>
                    <FormControl>
                        <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex gap-4">
                            <FormItem className="flex items-center space-x-2 space-y-0">
                                <FormControl><RadioGroupItem value="Online" /></FormControl>
                                <FormLabel className="font-normal">Online</FormLabel>
                            </FormItem>
                            <FormItem className="flex items-center space-x-2 space-y-0">
                                <FormControl><RadioGroupItem value="In-person" /></FormControl>
                                <FormLabel className="font-normal">In-person</FormLabel>
                            </FormItem>
                        </RadioGroup>
                    </FormControl>
                    </FormItem>
                )}
                />
                 <FormField
                control={form.control}
                name="format"
                render={({ field }) => (
                    <FormItem className="space-y-3">
                    <FormLabel>Format</FormLabel>
                    <FormControl>
                        <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex gap-4">
                            <FormItem className="flex items-center space-x-2 space-y-0">
                                <FormControl><RadioGroupItem value="1-1" /></FormControl>
                                <FormLabel className="font-normal">1-on-1</FormLabel>
                            </FormItem>
                            <FormItem className="flex items-center space-x-2 space-y-0">
                                <FormControl><RadioGroupItem value="Batch" /></FormControl>
                                <FormLabel className="font-normal">Batch</FormLabel>
                            </FormItem>
                        </RadioGroup>
                    </FormControl>
                    </FormItem>
                )}
                />
            </div>
            
            <DialogFooter className="pt-4 sticky bottom-0 bg-background/95 pb-1">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="animate-spin mr-2" />}
                {dealToEdit ? "Update Deal" : "Save Deal"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
