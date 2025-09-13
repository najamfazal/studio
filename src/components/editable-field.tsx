
"use client";

import { useState, useRef, useEffect } from "react";
import { Check, Loader2, Pencil } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { cn } from "@/lib/utils";

interface EditableFieldProps {
  label: string;
  value: string;
  onSave: (value: string) => Promise<void>;
  type?: "input" | "textarea";
  inputType?: string;
  displayFormatter?: (value: string) => React.ReactNode;
}

export function EditableField({
  label,
  value,
  onSave,
  type = "input",
  inputType = "text",
  displayFormatter,
}: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    setCurrentValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    if (currentValue === value) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    await onSave(currentValue);
    setIsSaving(false);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setCurrentValue(value);
    setIsEditing(false);
  };

  const handleIconClick = () => {
    if (isEditing) {
        handleSave();
    } else {
        setIsEditing(true);
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
      return;
    }
    if (e.key === "Enter" && type === "input" && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") {
      handleCancel();
    }
  };

  const InputComponent = type === "textarea" ? Textarea : Input;
  const isRightAligned = inputType === 'number';

  return (
    <div className="space-y-1">
      <p className={cn("font-medium text-muted-foreground text-xs flex items-center", isRightAligned ? "justify-end" : "justify-between")}>
        {!isRightAligned && label}
         <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleIconClick} disabled={isSaving}>
            {isSaving ? <Loader2 className="animate-spin h-3 w-3" /> : (isEditing ? <Check className="h-4 w-4" /> : <Pencil className="h-3 w-3" />)}
            <span className="sr-only">{isEditing ? `Save ${label}` : `Edit ${label}`}</span>
        </Button>
        {isRightAligned && label}
      </p>
      {isEditing ? (
        <div className="flex gap-1 items-start">
          <InputComponent
            ref={inputRef as any}
            value={currentValue}
            onChange={(e) => setCurrentValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className={cn("h-auto", isRightAligned && "text-right")}
            rows={type === 'textarea' ? 3 : 1}
            type={type === 'input' ? inputType : undefined}
            inputMode={inputType === 'number' ? 'decimal' : undefined}
          />
        </div>
      ) : (
        <div className={cn("min-h-[2.25rem] pr-6 whitespace-pre-wrap flex items-center", isRightAligned ? "justify-end" : "justify-start", !value && 'text-muted-foreground/80')}>
             {displayFormatter ? displayFormatter(value) : (value || `No ${label.toLowerCase()} set`)}
        </div>
      )}
    </div>
  );
}
