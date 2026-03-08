import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Users, Store, Package, ShoppingCart, Receipt } from "lucide-react";

interface SearchResult {
  id: string;
  label: string;
  sub: string;
  path: string;
  type: "customer" | "store" | "product" | "sale" | "order";
}

const typeIcons = {
  customer: Users,
  store: Store,
  product: Package,
  sale: ShoppingCart,
  order: Receipt,
};

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();

  // Cmd+K shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Search on query change
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      const q = `%${query}%`;
      const [custRes, storeRes, prodRes, orderRes] = await Promise.all([
        supabase.from("customers").select("id, name, display_id, phone").ilike("name", q).limit(5),
        supabase.from("stores").select("id, name, display_id, address").ilike("name", q).limit(5),
        supabase.from("products").select("id, name, sku, category").ilike("name", q).limit(5),
        supabase.from("orders").select("id, display_id, status, stores(name)").ilike("display_id", q).limit(5),
      ]);

      const items: SearchResult[] = [];
      (custRes.data || []).forEach((c) =>
        items.push({ id: c.id, label: c.name, sub: c.display_id, path: `/customers/${c.id}`, type: "customer" })
      );
      (storeRes.data || []).forEach((s) =>
        items.push({ id: s.id, label: s.name, sub: s.display_id, path: `/stores/${s.id}`, type: "store" })
      );
      (prodRes.data || []).forEach((p) =>
        items.push({ id: p.id, label: p.name, sub: p.sku, path: `/products`, type: "product" })
      );
      (orderRes.data || []).forEach((o: any) =>
        items.push({ id: o.id, label: o.display_id, sub: o.stores?.name || o.status, path: `/orders`, type: "order" })
      );

      setResults(items);
      setSearching(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const select = (path: string) => {
    setOpen(false);
    setQuery("");
    navigate(path);
  };

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    acc[r.type] = acc[r.type] || [];
    acc[r.type].push(r);
    return acc;
  }, {});

  const groupLabels: Record<string, string> = {
    customer: "Customers",
    store: "Stores",
    product: "Products",
    order: "Orders",
  };

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search customers, stores, products, orders..." value={query} onValueChange={setQuery} />
        <CommandList>
          <CommandEmpty>{searching ? "Searching..." : query.length < 2 ? "Type at least 2 characters..." : "No results found."}</CommandEmpty>
          {Object.entries(grouped).map(([type, items]) => {
            const Icon = typeIcons[type as keyof typeof typeIcons];
            return (
              <CommandGroup key={type} heading={groupLabels[type] || type}>
                {items.map((item) => (
                  <CommandItem key={item.id} onSelect={() => select(item.path)} className="gap-3">
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground truncate">{item.sub}</p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
        </CommandList>
      </CommandDialog>
    </>
  );
}
