import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Store, Users, ShoppingCart, ArrowLeftRight, Package } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";

interface SearchResult {
  id: string;
  label: string;
  sublabel?: string;
  type: "customer" | "store" | "sale" | "order" | "transaction";
  href: string;
}

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const debouncedQuery = useDebounce(query, 300);

  // Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Search across entities
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.trim().length < 2) {
      setResults([]);
      return;
    }
    const q = debouncedQuery.trim();
    setLoading(true);

    const run = async () => {
      const term = `%${q}%`;
      const [customers, stores, sales, orders, transactions] = await Promise.all([
        supabase
          .from("customers")
          .select("id, name, display_id")
          .or(`name.ilike.${term},display_id.ilike.${term}`)
          .limit(5),
        supabase
          .from("stores")
          .select("id, name, display_id")
          .or(`name.ilike.${term},display_id.ilike.${term}`)
          .limit(5),
        supabase
          .from("sales")
          .select("id, display_id, total_amount")
          .ilike("display_id", term)
          .limit(5),
        supabase
          .from("orders")
          .select("id, display_id, status")
          .ilike("display_id", term)
          .limit(5),
        supabase
          .from("transactions")
          .select("id, display_id, total_amount")
          .ilike("display_id", term)
          .limit(5),
      ]);

      const mapped: SearchResult[] = [
        ...(customers.data || []).map((c) => ({
          id: c.id,
          label: c.name,
          sublabel: c.display_id,
          type: "customer" as const,
          href: `/customers/${c.id}`,
        })),
        ...(stores.data || []).map((s) => ({
          id: s.id,
          label: s.name,
          sublabel: s.display_id,
          type: "store" as const,
          href: `/stores/${s.id}`,
        })),
        ...(sales.data || []).map((s) => ({
          id: s.id,
          label: s.display_id,
          sublabel: `₹${Number(s.total_amount).toLocaleString("en-IN")}`,
          type: "sale" as const,
          href: `/sales`,
        })),
        ...(orders.data || []).map((o) => ({
          id: o.id,
          label: o.display_id,
          sublabel: o.status,
          type: "order" as const,
          href: `/orders`,
        })),
        ...(transactions.data || []).map((t) => ({
          id: t.id,
          label: t.display_id,
          sublabel: `₹${Number(t.total_amount).toLocaleString("en-IN")}`,
          type: "transaction" as const,
          href: `/transactions`,
        })),
      ];
      setResults(mapped);
      setLoading(false);
    };

    run();
  }, [debouncedQuery]);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      setOpen(false);
      setQuery("");
      navigate(result.href);
    },
    [navigate]
  );

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {});

  const groupMeta: Record<string, { label: string; icon: React.ReactNode }> = {
    customer: { label: "Customers", icon: <Users className="h-3.5 w-3.5" /> },
    store: { label: "Stores", icon: <Store className="h-3.5 w-3.5" /> },
    sale: { label: "Sales", icon: <ArrowLeftRight className="h-3.5 w-3.5" /> },
    order: { label: "Orders", icon: <ShoppingCart className="h-3.5 w-3.5" /> },
    transaction: { label: "Transactions", icon: <Package className="h-3.5 w-3.5" /> },
  };

  const groupOrder = ["customer", "store", "sale", "order", "transaction"] as const;

  return (
    <>
      {/* Search trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="hidden sm:flex items-center gap-2 h-9 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Search...</span>
        <kbd className="ml-1 hidden lg:inline-flex h-5 items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-60">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>
      {/* Mobile icon button */}
      <button
        onClick={() => setOpen(true)}
        className="flex sm:hidden h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        title="Search (Ctrl+K)"
      >
        <Search className="h-5 w-5" />
      </button>

      <CommandDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQuery(""); }}>
        <CommandInput
          placeholder="Search customers, stores, orders, transactions..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {debouncedQuery.trim().length < 2 ? (
            <CommandEmpty>Type at least 2 characters to search.</CommandEmpty>
          ) : loading ? (
            <CommandEmpty>Searching...</CommandEmpty>
          ) : results.length === 0 ? (
            <CommandEmpty>No results found for "{debouncedQuery}".</CommandEmpty>
          ) : (
            groupOrder
              .filter((type) => grouped[type]?.length)
              .map((type, idx) => (
                <span key={type}>
                  {idx > 0 && <CommandSeparator />}
                  <CommandGroup
                    heading={
                      <span className="flex items-center gap-1.5">
                        {groupMeta[type].icon}
                        {groupMeta[type].label}
                      </span>
                    }
                  >
                    {grouped[type].map((result) => (
                      <CommandItem
                        key={result.id}
                        value={`${type}-${result.id}`}
                        onSelect={() => handleSelect(result)}
                        className="flex items-center gap-3 cursor-pointer"
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-md border bg-muted text-muted-foreground shrink-0">
                          {groupMeta[type].icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{result.label}</p>
                          {result.sublabel && (
                            <p className="text-xs text-muted-foreground truncate">{result.sublabel}</p>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </span>
              ))
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
