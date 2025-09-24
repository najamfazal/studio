
"use client";

import { useState, useEffect, useMemo } from 'react';
import { addDays, set, format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { ArrowLeft } from 'lucide-react';

interface DateTimePickerProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (date: Date) => void;
    initialDate?: Date;
}

type Step = 'date' | 'time';

const quickTimes = [
    { label: "Noon", time: { hours: 12, minutes: 0 } },
    { label: "3:00 PM", time: { hours: 15, minutes: 0 } },
    { label: "7:00 PM", time: { hours: 19, minutes: 0 } },
];

export function DateTimePicker({ isOpen, onClose, onSelect, initialDate }: DateTimePickerProps) {
    const [step, setStep] = useState<Step>('date');
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(initialDate || new Date());
    const [selectedHour, setSelectedHour] = useState<string | undefined>();
    const [selectedMinute, setSelectedMinute] = useState<string | undefined>();
    const [selectedPeriod, setSelectedPeriod] = useState<string | undefined>();

    useEffect(() => {
        if (isOpen) {
            const date = initialDate || new Date();
            setSelectedDate(date);
            
            const initialHour = date.getHours();
            const period = initialHour >= 12 ? 'PM' : 'AM';
            setSelectedPeriod(period);
            
            let displayHour = initialHour % 12;
            if (displayHour === 0) displayHour = 12; // 0 AM/PM should be 12
            setSelectedHour(displayHour.toString());
            
            setSelectedMinute(date.getMinutes().toString().padStart(2, '0'));

            setStep('date');
        }
    }, [isOpen, initialDate]);

    const finalDate = useMemo(() => {
        if (!selectedDate || !selectedHour || !selectedMinute || !selectedPeriod) {
            return null;
        }
        let hour = parseInt(selectedHour, 10);
        if (selectedPeriod === 'PM' && hour < 12) {
            hour += 12;
        }
        if (selectedPeriod === 'AM' && hour === 12) {
            hour = 0;
        }
        return set(selectedDate, { hours: hour, minutes: parseInt(selectedMinute, 10) });
    }, [selectedDate, selectedHour, selectedMinute, selectedPeriod]);

    const handleSelectDate = (date: Date | undefined) => {
        if(date) {
            setSelectedDate(date);
            setStep('time');
        }
    }

    const handleSelectTime = () => {
        if (finalDate) {
            onSelect(finalDate);
            onClose();
        }
    }

    const handleQuickTime = (time: { hours: number; minutes: number }) => {
        const period = time.hours >= 12 ? 'PM' : 'AM';
        setSelectedPeriod(period);
        
        let displayHour = time.hours % 12;
        if (displayHour === 0) displayHour = 12;
        setSelectedHour(displayHour.toString());

        setSelectedMinute(time.minutes.toString().padStart(2,'0'));
    }

    const title = step === 'date' ? 'Select a Date' : 'Select a Time';
    const subTitle = step === 'time' && finalDate ? format(finalDate, 'PPP p') : ' ';

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <div className="flex items-center gap-2">
                        {step === 'time' && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setStep('date')}><ArrowLeft/></Button>}
                        <div>
                             <DialogTitle>{title}</DialogTitle>
                             <p className="text-sm text-muted-foreground h-5">{subTitle}</p>
                        </div>
                    </div>
                </DialogHeader>
                
                {step === 'date' && (
                    <div className="flex flex-col items-center space-y-4">
                        <Calendar
                            mode="single"
                            selected={selectedDate}
                            onSelect={handleSelectDate}
                        />
                        <div className="flex gap-2">
                            <Button size="sm" variant="ghost" onClick={() => handleSelectDate(new Date())}>Today</Button>
                            <Button size="sm" variant="ghost" onClick={() => handleSelectDate(addDays(new Date(), 1))}>Tomorrow</Button>
                            <Button size="sm" variant="ghost" onClick={() => handleSelectDate(addDays(new Date(), 2))}>In 2 days</Button>
                        </div>
                    </div>
                )}

                {step === 'time' && (
                    <div className="space-y-4 pt-2">
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-center">Hour</p>
                             <ToggleGroup type="single" value={selectedHour} onValueChange={setSelectedHour} className="grid grid-cols-6 gap-2">
                                {Array.from({ length: 12 }, (_, i) => i + 1).map(hour => (
                                    <ToggleGroupItem key={hour} value={hour.toString()} className="h-9">{hour}</ToggleGroupItem>
                                ))}
                            </ToggleGroup>
                        </div>
                        <div className="space-y-2">
                             <p className="text-sm font-medium text-center">Minute</p>
                             <ToggleGroup type="single" value={selectedMinute} onValueChange={setSelectedMinute} className="grid grid-cols-4 gap-2">
                                <ToggleGroupItem value="00">00</ToggleGroupItem>
                                <ToggleGroupItem value="15">15</ToggleGroupItem>
                                <ToggleGroupItem value="30">30</ToggleGroupItem>
                                <ToggleGroupItem value="45">45</ToggleGroupItem>
                            </ToggleGroup>
                        </div>
                         <div className="grid grid-cols-2 gap-4 pt-2">
                             <Button variant={selectedPeriod === 'AM' ? 'default' : 'outline'} onClick={() => setSelectedPeriod('AM')}>AM</Button>
                             <Button variant={selectedPeriod === 'PM' ? 'default' : 'outline'} onClick={() => setSelectedPeriod('PM')}>PM</Button>
                        </div>
                         <div className="flex justify-center gap-2 pt-2">
                            {quickTimes.map(qt => (
                                <Button key={qt.label} size="sm" variant="ghost" onClick={() => handleQuickTime(qt.time)}>{qt.label}</Button>
                            ))}
                        </div>
                    </div>
                )}
                
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    {step === 'time' && <Button onClick={handleSelectTime} disabled={!finalDate}>Set Time</Button>}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

