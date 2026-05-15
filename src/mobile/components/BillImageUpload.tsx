import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Camera, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface BillImageUploadProps {
  onUploaded: (url: string) => void;
  onRemoved?: () => void;
}

export function BillImageUpload({ onUploaded, onRemoved }: BillImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large. Max 10MB.");
      return;
    }

    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `expenses/${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage.from("expense-bills").upload(path, file);
    if (error) {
      toast.error("Upload failed: " + error.message);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("expense-bills").getPublicUrl(path);
    onUploaded(urlData.publicUrl);
    setUploading(false);
  };

  return (
    <div className="flex items-center gap-2">
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="h-10 px-4 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:border-blue-300 dark:hover:border-blue-600 hover:text-blue-500 dark:hover:text-blue-400 transition-all disabled:opacity-50"
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        Add Photo
      </button>
    </div>
  );
}

interface BillImagesProps {
  urls: string[];
  onAdd: (url: string) => void;
  onRemove: (url: string) => void;
}

export function BillImages({ urls, onAdd, onRemove }: BillImagesProps) {
  return (
    <div className="space-y-2">
      {urls.map((url) => (
        <div key={url} className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 h-20">
          <img src={url} alt="Bill" className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={() => onRemove(url)}
            className="absolute top-1 right-1 rounded-full bg-destructive/80 p-1 text-destructive-foreground hover:bg-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      {urls.length < 3 && (
        <div className="flex items-center gap-2">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            id="bill-upload-input"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 10 * 1024 * 1024) {
                toast.error("File too large. Max 10MB.");
                return;
              }
              const ext = file.name.split(".").pop();
              const path = `expenses/${crypto.randomUUID()}.${ext}`;
              const { error } = await supabase.storage.from("expense-bills").upload(path, file);
              if (error) {
                toast.error("Upload failed: " + error.message);
                return;
              }
              const { data: urlData } = supabase.storage.from("expense-bills").getPublicUrl(path);
              onAdd(urlData.publicUrl);
              e.target.value = "";
            }}
          />
          <label
            htmlFor="bill-upload-input"
            className="h-10 px-4 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:border-blue-300 dark:hover:border-blue-600 hover:text-blue-500 dark:hover:text-blue-400 transition-all cursor-pointer"
          >
            <Camera className="h-4 w-4" />
            Add Photo
          </label>
        </div>
      )}
      <p className="text-[10px] text-slate-400">{urls.length}/3 photos added</p>
    </div>
  );
}