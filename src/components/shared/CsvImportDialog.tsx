import { useState, useRef } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileText, AlertCircle, CheckCircle2, Download } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

interface CsvField {
  key: string;
  label: string;
  required?: boolean;
}

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: CsvField[];
  onImport: (rows: Record<string, string>[]) => Promise<{ success: number; errors: string[] }>;
  templateName: string;
}

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const rows = lines.slice(1).map((line) => {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; }
      else if (char === "," && !inQuotes) { values.push(current.trim()); current = ""; }
      else { current += char; }
    }
    values.push(current.trim());
    return values;
  });
  return { headers, rows };
}

export function CsvImportDialog({ open, onOpenChange, fields, onImport, templateName }: CsvImportDialogProps) {
  const [parsed, setParsed] = useState<Record<string, string>[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { headers, rows } = parseCsv(text);
      const fieldKeys = fields.map((f) => f.key);
      const errs: string[] = [];

      // Check required headers
      const requiredFields = fields.filter((f) => f.required);
      requiredFields.forEach((f) => {
        if (!headers.includes(f.key)) {
          errs.push(`Missing required column: "${f.label}" (expected header: ${f.key})`);
        }
      });

      if (errs.length > 0) {
        setErrors(errs);
        setParsed(null);
        return;
      }

      const mapped = rows.map((row, i) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, j) => {
          if (fieldKeys.includes(h)) {
            obj[h] = row[j] || "";
          }
        });
        // Validate required fields per row
        requiredFields.forEach((f) => {
          if (!obj[f.key]?.trim()) {
            errs.push(`Row ${i + 2}: "${f.label}" is empty`);
          }
        });
        return obj;
      });

      setErrors(errs);
      setParsed(errs.length === 0 ? mapped : null);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!parsed) return;
    setImporting(true);
    try {
      const res = await onImport(parsed);
      setResult(res);
      if (res.success > 0) {
        toast.success(`${res.success} records imported successfully`);
      }
    } catch (err: any) {
      toast.error(err.message || "Import failed");
    }
    setImporting(false);
  };

  const downloadTemplate = () => {
    const csv = fields.map((f) => f.key).join(",") + "\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${templateName}_template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setParsed(null);
      setErrors([]);
      setResult(null);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import from CSV</DialogTitle>
          <DialogDescription>Upload a CSV file with the required columns.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="mr-2 h-4 w-4" /> Download Template
          </Button>

          <div className="text-xs text-muted-foreground">
            <p className="font-medium mb-1">Expected columns:</p>
            <div className="flex flex-wrap gap-1">
              {fields.map((f) => (
                <span key={f.key} className={`px-2 py-0.5 rounded-md border text-xs ${f.required ? "bg-primary/10 border-primary/30 font-medium" : "bg-muted"}`}>
                  {f.key}{f.required ? " *" : ""}
                </span>
              ))}
            </div>
          </div>

          <div
            className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-muted-foreground/25 p-6 cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Click to select a CSV file</p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
          </div>

          {errors.length > 0 && (
            <ScrollArea className="max-h-40">
              <div className="space-y-1 rounded-lg bg-destructive/10 p-3">
                {errors.map((e, i) => (
                  <p key={i} className="text-xs text-destructive flex items-start gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{e}
                  </p>
                ))}
              </div>
            </ScrollArea>
          )}

          {parsed && !result && (
            <div className="rounded-lg bg-accent/50 p-3">
              <p className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4" /> {parsed.length} rows ready to import
              </p>
            </div>
          )}

          {result && (
            <div className="rounded-lg bg-accent/50 p-3 space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" /> {result.success} imported
              </p>
              {result.errors.length > 0 && (
                <ScrollArea className="max-h-32">
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-destructive">{e}</p>
                  ))}
                </ScrollArea>
              )}
            </div>
          )}

          {parsed && !result && (
            <Button onClick={handleImport} disabled={importing} className="w-full">
              {importing ? "Importing..." : `Import ${parsed.length} Records`}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
