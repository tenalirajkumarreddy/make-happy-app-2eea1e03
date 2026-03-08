import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Camera, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ImageUploadProps {
  folder: string; // e.g. "products", "customers", "stores"
  currentUrl?: string | null;
  onUploaded: (url: string) => void;
  onRemoved?: () => void;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function ImageUpload({ folder, currentUrl, onUploaded, onRemoved, className = "", size = "md" }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl || null);
  const inputRef = useRef<HTMLInputElement>(null);

  const sizeClasses = {
    sm: "h-16 w-16",
    md: "h-24 w-24",
    lg: "h-32 w-32",
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large. Max 5MB.");
      return;
    }

    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage.from("entity-photos").upload(path, file);
    if (error) {
      toast.error("Upload failed: " + error.message);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("entity-photos").getPublicUrl(path);
    const url = urlData.publicUrl;
    setPreview(url);
    onUploaded(url);
    setUploading(false);
  };

  const handleRemove = () => {
    setPreview(null);
    onRemoved?.();
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className={`relative inline-block ${className}`}>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
      {preview ? (
        <div className={`relative ${sizeClasses[size]} rounded-lg overflow-hidden border bg-muted`}>
          <img src={preview} alt="Upload" className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute top-0.5 right-0.5 rounded-full bg-destructive/80 p-0.5 text-destructive-foreground hover:bg-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className={`${sizeClasses[size]} flex flex-col items-center justify-center gap-1 border-dashed`}
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5 text-muted-foreground" />}
          <span className="text-[10px] text-muted-foreground">Photo</span>
        </Button>
      )}
    </div>
  );
}
