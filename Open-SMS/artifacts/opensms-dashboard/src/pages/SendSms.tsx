import { useState } from "react";
import { useSendMessage, useListTemplates } from "@workspace/api-client-react";
import { Card, Button, Input, Textarea, Badge } from "@/components/ui/Shared";
import { Send, Smartphone, FileCode2, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function SendSms() {
  const { toast } = useToast();
  const { data: templatesData } = useListTemplates();
  const sendMessageMutation = useSendMessage();

  const [to, setTo] = useState("");
  const [template, setTemplate] = useState<string>("");
  const [body, setBody] = useState("");
  const [vars, setVars] = useState<Record<string, string>>({});

  const selectedTemplateDef = templatesData?.templates.find(t => t.name === template);

  const handleVarChange = (key: string, value: string) => {
    setVars(prev => ({ ...prev, [key]: value }));
  };

  const handleSend = () => {
    if (!to) {
      toast({ title: "Error", description: "Phone number is required", variant: "destructive" });
      return;
    }

    if (!template && !body) {
      toast({ title: "Error", description: "Select a template or provide a message body", variant: "destructive" });
      return;
    }

    sendMessageMutation.mutate({
      data: {
        to,
        template: template || undefined,
        body: !template ? body : undefined,
        vars: template ? vars : undefined
      }
    }, {
      onSuccess: (data) => {
        toast({
          title: "Message Queued",
          description: `ID: ${data.messageId} - Status: ${data.status}`,
        });
        // Reset form slightly
        setTo("");
        setBody("");
        setVars({});
      },
      onError: (error: any) => {
        toast({
          title: "Failed to send",
          description: error.data?.error || error.message || "Unknown error occurred",
          variant: "destructive"
        });
      }
    });
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-12">
      <header>
        <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">Send SMS</h1>
        <p className="text-muted-foreground mt-2">Queue a new message through the gateway.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 space-y-6">
            <div className="space-y-3">
              <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-primary" /> Recipient
              </label>
              <Input 
                placeholder="+1234567890 (E.164 format)" 
                value={to} 
                onChange={(e) => setTo(e.target.value)}
                className="text-lg"
              />
            </div>

            <div className="space-y-3">
              <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                <FileCode2 className="w-4 h-4 text-secondary" /> Message Template
              </label>
              <div className="relative">
                <select 
                  className="flex h-12 w-full appearance-none rounded-xl border border-border/50 bg-input px-4 py-2 text-sm text-foreground shadow-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 font-mono cursor-pointer"
                  value={template}
                  onChange={(e) => {
                    setTemplate(e.target.value);
                    setVars({});
                    setBody("");
                  }}
                >
                  <option value="">-- Custom Raw Message --</option>
                  {templatesData?.templates.map(t => (
                    <option key={t.id} value={t.name}>{t.name}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinelinejoin="round" className="text-muted-foreground"><path d="m6 9 6 6 6-6"/></svg>
                </div>
              </div>
            </div>

            {template && selectedTemplateDef ? (
              <div className="space-y-4 p-5 rounded-xl border border-border/50 bg-muted/20">
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">Template Variables</h3>
                {selectedTemplateDef.vars.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No variables required for this template.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedTemplateDef.vars.map(v => (
                      <div key={v} className="space-y-2">
                        <label className="text-xs font-mono text-muted-foreground uppercase">{v}</label>
                        <Input 
                          placeholder={`Enter ${v}`} 
                          value={vars[v] || ''}
                          onChange={(e) => handleVarChange(v, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="mt-6 pt-4 border-t border-border/50">
                  <p className="text-xs text-muted-foreground mb-2">Preview (approximate):</p>
                  <p className="text-sm font-mono text-foreground/80 whitespace-pre-wrap break-words">
                    {selectedTemplateDef.body.replace(/\{\{(\w+)\}\}/g, (match, p1) => vars[p1] || match)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                  Raw Body
                </label>
                <Textarea 
                  placeholder="Type your message here..." 
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="min-h-[160px]"
                />
                <p className="text-xs text-muted-foreground text-right">{body.length} / 640 chars</p>
              </div>
            )}

            <div className="pt-4 flex justify-end">
              <Button 
                size="lg" 
                className="w-full sm:w-auto"
                onClick={handleSend}
                isLoading={sendMessageMutation.isPending}
              >
                <Send className="w-5 h-5 mr-2" />
                Dispatch Message
              </Button>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6 bg-gradient-to-br from-card to-muted/30 border-secondary/20">
            <h3 className="font-display font-bold text-lg mb-3 flex items-center gap-2">
              <Info className="w-5 h-5 text-secondary" />
              How it works
            </h3>
            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
              Messages submitted here are instantly pushed to your Android device's in-memory queue via local network.
            </p>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" /> End-to-end latency &lt; 3s</li>
              <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-warning mt-1.5 shrink-0" /> Max 1000 items in queue</li>
              <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-secondary mt-1.5 shrink-0" /> Respects app rate limits</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
