import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface EditableCellProps {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  className?: string;
  placeholder?: string;
}

export function EditableCell({ value, onSave, className, placeholder }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const handleSave = async () => {
    if (editValue === value) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(editValue);
      setEditing(false);
    } catch {
      setEditValue(value);
    }
    setSaving(false);
  };

  const handleCancel = () => {
    setEditValue(value);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") handleCancel();
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          className="h-7 text-sm px-2 py-1"
          disabled={saving}
        />
      </div>
    );
  }

  return (
    <span
      className={cn(
        "cursor-pointer rounded px-1 py-0.5 -mx-1 hover:bg-accent/50 transition-colors border border-transparent hover:border-border",
        !value && "text-muted-foreground italic",
        className
      )}
      onClick={(e) => { e.stopPropagation(); setEditing(true); setEditValue(value); }}
      title="Click to edit"
    >
      {value || placeholder || "—"}
    </span>
  );
}
