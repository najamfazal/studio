
"use client"

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collection, addDoc, query, orderBy, getDocs } from 'firebase/firestore';
import { Loader2, Plus, CalendarIcon, User, ChevronsUpDown, CheckIcon } from 'lucide-react';
import { format } from 'date-fns';

import { db } from '@/lib/firebase';
import type { Lead, Task } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

const manualTaskSchema = z.object({
  description: z.string().min(1, "Description is required."),
  dueDate: z.date().optional(),
  leadId: z.string().optional(),
});
type ManualTaskValues = z.infer<typeof manualTaskSchema>;

export function ManualTaskDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [leads, setLeads] = useState<(Pick<Lead, 'id' | 'name'>)[]>([]);
  const [isLeadsLoading, setIsLeadsLoading] = useState(false);
  const [isContactListOpen, setIsContactListOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<ManualTaskValues>({
    resolver: zodResolver(manualTaskSchema),
    defaultValues: {
      description: "",
    },
  });
  
  const selectedLeadId = form.watch("leadId");
  const selectedLead = leads.find(l => l.id === selectedLeadId);

  const handleOpen = async (open: boolean) => {
    setIsOpen(open);
    if (open && leads.length === 0) {
        setIsLeadsLoading(true);
        try {
            const leadsQuery = query(collection(db, "leads"), orderBy("name"));
            const leadsSnapshot = await getDocs(leadsQuery);
            const leadsData = leadsSnapshot.docs.map(
              (doc) => ({ id: doc.id, name: doc.data().name } as Lead)
            );
            setLeads(leadsData);
        } catch (e) {
            toast({ variant: 'destructive', title: "Could not load contacts" });
        } finally {
            setIsLeadsLoading(false);
        }
    }
    if (!open) {
        form.reset();
    }
  }

  const onSubmit = async (values: ManualTaskValues) => {
    try {
      const leadName = values.leadId ? leads.find(l => l.id === values.leadId)?.name : 'Personal Task';

      await addDoc(collection(db, "tasks"), {
        description: values.description,
        dueDate: values.dueDate,
        completed: false,
        createdAt: new Date(),
        nature: "Procedural",
        leadId: values.leadId || null,
        leadName: leadName,
      });
      toast({ title: "Manual task added!" });
      handleOpen(false);
    } catch (error) {
      console.error("Error adding manual task:", error);
      toast({ variant: "destructive", title: "Failed to add task." });
    }
  };

  const { isSubmitting } = form.formState;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="w-8 h-8">
            <Plus className="h-4 w-4" />
            <span className="sr-only">New Task</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a Manual Task</DialogTitle>
        </DialogHeader>
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
                <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                            <Textarea
                                placeholder="What do you need to do?"
                                {...field}
                                className="min-h-[100px]"
                            />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="leadId"
                    render={({ field }) => (
                         <FormItem className="flex flex-col">
                            <FormLabel>Link to Contact (Optional)</FormLabel>
                             <Popover open={isContactListOpen} onOpenChange={setIsContactListOpen}>
                                <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            className={cn(
                                                "w-full justify-between font-normal",
                                                !field.value && "text-muted-foreground"
                                            )}
                                        >
                                           <div className="flex items-center gap-2">
                                             <User className="h-4 w-4"/>
                                             {selectedLead ? selectedLead.name : "Select a contact"}
                                           </div>
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                     <Command>
                                        <CommandInput placeholder="Search contact..." />
                                        <CommandEmpty>No contact found.</CommandEmpty>
                                        <CommandList>
                                            <CommandGroup>
                                                {leads.map((lead) => (
                                                    <CommandItem
                                                        key={lead.id}
                                                        value={lead.name}
                                                        onSelect={() => {
                                                            form.setValue("leadId", lead.id === field.value ? undefined : lead.id);
                                                            setIsContactListOpen(false);
                                                        }}
                                                    >
                                                        <CheckIcon
                                                            className={cn(
                                                                "mr-2 h-4 w-4",
                                                                field.value === lead.id ? "opacity-100" : "opacity-0"
                                                            )}
                                                        />
                                                        {lead.name}
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                         </FormItem>
                    )}
                />

                 <FormField
                    control={form.control}
                    name="dueDate"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                        <FormLabel>Due Date (Optional)</FormLabel>
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
                                    format(field.value, "PPP")
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
                                selected={field.value}
                                onSelect={field.onChange}
                                initialFocus
                            />
                            </PopoverContent>
                        </Popover>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                <DialogFooter className="pt-4">
                    <Button type="button" variant="ghost" onClick={() => handleOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                        Add Task
                    </Button>
                </DialogFooter>
            </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
