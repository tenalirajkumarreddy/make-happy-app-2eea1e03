import { useState } from "react";
import { 
  useListTemplates, 
  useCreateTemplate, 
  useUpdateTemplate, 
  useDeleteTemplate 
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListTemplatesQueryKey } from "@workspace/api-client-react";
import { Card, Button, Input, Textarea, Badge, Modal } from "@/components/ui/Shared";
import { FileCode2, Plus, Edit2, Trash2, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export default function Templates() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useListTemplates();
  
  const createMutation = useCreateTemplate();
  const updateMutation = useUpdateTemplate();
  const deleteMutation = useDeleteTemplate();

  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<{name: string, body: string} | null>(null);
  
  const [formName, setFormName] = useState("");
  const [formBody, setFormBody] = useState("");

  const filteredTemplates = data?.templates.filter(t => 
    t.name.toLowerCase().includes(search.toLowerCase()) || 
    t.body.toLowerCase().includes(search.toLowerCase())
  );

  const openCreateModal = () => {
    setEditingTemplate(null);
    setFormName("");
    setFormBody("");
    setIsModalOpen(true);
  };

  const openEditModal = (template: any) => {
    setEditingTemplate(template);
    setFormName(template.name);
    setFormBody(template.body);
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!formName || !formBody) {
      toast({ title: "Error", description: "Name and body are required", variant: "destructive" });
      return;
    }

    const onSuccess = () => {
      queryClient.invalidateQueries({ queryKey: getListTemplatesQueryKey() });
      setIsModalOpen(false);
      toast({ title: "Success", description: "Template saved successfully" });
    };

    const onError = (e: any) => {
      toast({ title: "Error", description: e.data?.error || "Operation failed", variant: "destructive" });
    };

    if (editingTemplate) {
      updateMutation.mutate({ name: editingTemplate.name, data: { body: formBody } }, { onSuccess, onError });
    } else {
      createMutation.mutate({ data: { name: formName, body: formBody } }, { onSuccess, onError });
    }
  };

  const handleDelete = (name: string) => {
    if (confirm(`Are you sure you want to delete template '${name}'?`)) {
      deleteMutation.mutate({ name }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTemplatesQueryKey() });
          toast({ title: "Deleted", description: "Template removed" });
        },
        onError: (e: any) => {
          toast({ title: "Error", description: e.data?.error || "Deletion failed", variant: "destructive" });
        }
      });
    }
  };

  return (
    <div className="space-y-8 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">Templates</h1>
          <p className="text-muted-foreground mt-2">Manage reusable SMS blueprints with variables.</p>
        </div>
        <Button onClick={openCreateModal} className="shrink-0">
          <Plus className="w-5 h-5 mr-2" />
          New Template
        </Button>
      </header>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input 
          placeholder="Search templates..." 
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3].map(i => (
            <Card key={i} className="h-48 animate-pulse bg-muted/20" />
          ))}
        </div>
      ) : filteredTemplates?.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border rounded-2xl">
          <FileCode2 className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-foreground mb-1">No templates found</h3>
          <p className="text-muted-foreground">Create your first template to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredTemplates?.map((template) => (
            <Card key={template.id} className="flex flex-col hover:border-primary/30 transition-colors group">
              <div className="p-5 border-b border-border/50 flex items-center justify-between bg-white/[0.01]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <FileCode2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground font-mono">{template.name}</h3>
                    <p className="text-xs text-muted-foreground">Updated {format(new Date(template.updatedAt), "MMM d, yyyy")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEditModal(template)} className="p-2 text-muted-foreground hover:text-primary transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(template.name)} className="p-2 text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="p-5 flex-1 flex flex-col">
                <p className="text-sm text-foreground/80 font-mono whitespace-pre-wrap flex-1 mb-4">
                  {template.body}
                </p>
                <div>
                  <div className="flex flex-wrap gap-2">
                    {template.vars.length > 0 ? template.vars.map(v => (
                      <Badge key={v} variant="secondary" className="bg-secondary/5 border-secondary/20">
                        {v}
                      </Badge>
                    )) : (
                      <span className="text-xs italic text-muted-foreground">No variables</span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={editingTemplate ? "Edit Template" : "Create Template"}
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium">Template Name</label>
            <Input 
              value={formName} 
              onChange={(e) => setFormName(e.target.value.toLowerCase().replace(/\s+/g, '_'))} 
              placeholder="e.g. order_shipped"
              disabled={!!editingTemplate}
            />
            {!editingTemplate && <p className="text-xs text-muted-foreground">Lowercase, underscores only. Cannot be changed later.</p>}
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium flex justify-between">
              <span>Message Body</span>
              <span className="text-muted-foreground font-mono text-xs">{formBody.length} / 640</span>
            </label>
            <Textarea 
              value={formBody} 
              onChange={(e) => setFormBody(e.target.value)}
              placeholder="Hi {{name}}, your order {{order_id}} has shipped!"
              className="h-32"
            />
            <p className="text-xs text-muted-foreground">Use {'{{variable_name}}'} syntax to inject variables.</p>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleSave} 
              isLoading={createMutation.isPending || updateMutation.isPending}
            >
              {editingTemplate ? "Save Changes" : "Create Template"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
