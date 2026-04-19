import React, { useEffect, useState } from 'react';
import { ShareTarget } from '@capgo/capacitor-share-target';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Loader2, Share2, Image as ImageIcon, CheckCircle2 } from 'lucide-react';

interface SharedFile {
  name: string;
  type: string;
  uri: string;
}

export const ShareTargetReceiver = () => {
  const { user } = useAuth();
  const [sharedFile, setSharedFile] = useState<SharedFile | null>(null);
  const [actionType, setActionType] = useState<'expense' | 'transfer'>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [recipientId, setRecipientId] = useState('');
  const [staffUsers, setStaffUsers] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Register listener for share events
    const listener = ShareTarget.addListener('shareReceived', (data: any) => {
      console.log('Share received:', data);
      if (data.files && data.files.length > 0) {
        // We take the first file for now
        const file = data.files[0];
        setSharedFile({
          name: file.name || 'shared_image.jpg',
          type: file.type || 'image/jpeg',
          uri: file.uri
        });
        setIsOpen(true);
      }
    });

    return () => {
      listener.remove();
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchContextData();
    }
  }, [isOpen]);

  const fetchContextData = async () => {
    try {
      // Fetch categories for expenses
      const { data: cats } = await supabase
        .from('expense_categories')
        .select('*')
        .eq('is_active', true);
      setCategories(cats || []);

      // Fetch staff users for transfers
      const { data: staff } = await supabase
        .from('profiles')
        .select('id, full_name')
        .neq('id', user?.id);
      setStaffUsers(staff || []);
    } catch (err) {
      console.error('Error fetching context:', err);
    }
  };

  const handleUpload = async () => {
    if (!sharedFile || !amount || (actionType === 'transfer' && !recipientId)) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsUploading(true);
    try {
      // 1. Fetch the file blob from the URI
      const response = await fetch(sharedFile.uri);
      const blob = await response.blob();
      const fileExt = sharedFile.type.split('/')[1] || 'jpg';
      const fileName = `${user?.id}/${Date.now()}.${fileExt}`;
      const filePath = `receipts/${fileName}`;

      // 2. Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(filePath, blob, {
          contentType: sharedFile.type,
          upsert: true
        });

      if (uploadError) throw uploadError;

      // 3. Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('receipts')
        .getPublicUrl(filePath);

      // 4. Create DB record
      if (actionType === 'expense') {
        // Generate display ID for expense claim
        const { data: displayId, error: displayIdError } = await supabase.rpc("generate_display_id", {
          prefix: "EXC",
          seq_name: "expense_claims_display_seq"
        });
        if (displayIdError) throw displayIdError;
        if (!displayId) throw new Error("Failed to generate display ID");

        const { error: dbError } = await supabase
          .from('expense_claims')
          .insert({
            user_id: user?.id,
            amount: parseFloat(amount),
            description: description || 'Shared from external app',
            receipt_url: publicUrl,
            status: 'pending',
            display_id: displayId
          });
        if (dbError) throw dbError;
        toast.success('Expense claim submitted for approval');
      } else {
        const { error: dbError } = await supabase
          .from('handovers')
          .insert({
            user_id: user?.id,
            handed_to: recipientId,
            cash_amount: parseFloat(amount),
            receipt_url: publicUrl,
            status: 'pending',
            handover_date: new Date().toISOString().split('T')[0]
          });
        if (dbError) throw dbError;
        toast.success('Transfer submitted for confirmation');
      }

      setIsOpen(false);
      setSharedFile(null);
      setAmount('');
      setDescription('');
    } catch (error: any) {
      console.error('Upload failed:', error);
      toast.error(`Failed to process: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-blue-500" />
            Process Shared File
          </DialogTitle>
          <DialogDescription>
            Attach this proof to a business action.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="flex items-center justify-center p-4 bg-muted/50 rounded-xl border-2 border-dashed border-muted-foreground/20">
            {sharedFile?.uri ? (
              <img 
                src={sharedFile.uri} 
                alt="Shared preview" 
                className="max-h-32 rounded-md object-contain" 
              />
            ) : (
              <ImageIcon className="h-10 w-10 text-muted-foreground" />
            )}
          </div>

          <div className="space-y-2">
            <Label>Action Type</Label>
            <div className="flex gap-2">
              <Button 
                variant={actionType === 'expense' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setActionType('expense')}
              >
                Expense Claim
              </Button>
              <Button 
                variant={actionType === 'transfer' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setActionType('transfer')}
              >
                P2P Transfer
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Amount (₹)</Label>
            <Input
              id="amount"
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          {actionType === 'transfer' && (
            <div className="space-y-2">
              <Label>Handed To (Staff)</Label>
              <Select onValueChange={setRecipientId} value={recipientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Recipient" />
                </SelectTrigger>
                <SelectContent>
                  {staffUsers.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="desc">Notes (Optional)</Label>
            <Input
              id="desc"
              placeholder="What is this for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button 
            onClick={handleUpload} 
            disabled={isUploading}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Submit Action
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
