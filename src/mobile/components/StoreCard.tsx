import React, { memo } from "react";
import { Store, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TYPE_COLORS: Record<string, string> = {
  RETAIL: "text-blue-700",
  RESTAURANT: "text-orange-700",
  WHOLESALE: "text-green-700",
  DEFAULT: "text-slate-700",
};

const TYPE_ACCENTS: Record<string, string> = {
  RETAIL: "bg-blue-500",
  RESTAURANT: "bg-orange-500",
  WHOLESALE: "bg-green-500",
  DEFAULT: "bg-slate-400",
};

function getTypeColor(typeName: string) {
  const key = typeName?.toUpperCase();
  return TYPE_COLORS[key] ?? TYPE_COLORS.DEFAULT;
}

function getTypeAccent(typeName: string) {
  const key = typeName?.toUpperCase();
  return TYPE_ACCENTS[key] ?? TYPE_ACCENTS.DEFAULT;
}

export interface StoreCardItem {
  id: string;
  name: string;
  display_id: string;
  photo_url: string | null;
  outstanding: number;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  route_id: string | null;
  is_active: boolean;
  store_type_id: string | null;
  customer_id: string | null;
  last_activity_at: string | null;
  customers: { id: string; name: string; phone: string | null } | null;
  store_types: { id: string; name: string } | null;
  routes: { name: string } | null;
}

export interface StoreCardAction {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
}

interface StoreCardProps {
  store: StoreCardItem;
  onOpenStore: () => void;
  actions: StoreCardAction[];
}

function formatAddress(address: string | null): string {
  if (!address) return "";
  return address.replace(/\s+/g, " ").trim();
}

/** Small helper to separate inline meta items with a dot, skipping empty ones. */
function Dot() {
  return <span className="text-slate-300 dark:text-slate-600">•</span>;
}

export const StoreCard = memo(function StoreCard({
  store,
  onOpenStore,
  actions,
}: StoreCardProps) {
  const outstandingAmount = Number(store.outstanding || 0);
  const hasOutstanding = outstandingAmount > 0;
  const formattedAddress = formatAddress(store.address);
  const typeName = store.store_types?.name ?? "";

  const metaItems = [
    store.display_id && (
      <span key="id" className="font-mono text-slate-500 dark:text-slate-400 shrink-0">
        {store.display_id}
      </span>
    ),
    typeName && (
      <span key="type" className={cn("font-semibold", getTypeColor(typeName))}>
        {typeName}
      </span>
    ),
    store.routes?.name && (
      <span key="route" className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 min-w-0">
        <MapPin className="h-3 w-3 shrink-0" />
        <span className="truncate">{store.routes.name}</span>
      </span>
    ),
  ].filter(Boolean);

  return (
    <Card
      className="relative overflow-hidden shadow-sm hover:shadow-md transition-all active:scale-[0.98] cursor-pointer border-0 ring-1 ring-slate-200/60 dark:ring-slate-700/60"
      onClick={onOpenStore}
    >
      {/* Type accent bar */}
      <div className={cn("absolute left-0 top-0 h-full w-1", getTypeAccent(typeName))} />

      <div className="p-4 pl-5">
        <div className="flex gap-4 items-start">
          {/* Photo column */}
          <div className="shrink-0">
            <div className="h-24 w-24 rounded-xl bg-slate-100 dark:bg-slate-700 overflow-hidden ring-1 ring-slate-200/50">
              {store.photo_url ? (
                <img
                  src={store.photo_url}
                  alt={store.name}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-700 dark:to-slate-600">
                  <Store className="h-7 w-7 text-slate-400" />
                </div>
              )}
            </div>
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0">
            <span className="text-sm font-bold text-slate-900 dark:text-white leading-tight truncate block">
              {store.name}
            </span>

            {store.customers?.name && (
              <p className="text-sm text-slate-600 dark:text-slate-300 font-medium truncate mt-0.5">
                {store.customers.name}
              </p>
            )}

            {formattedAddress && (
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 mt-1">
                {formattedAddress}
              </p>
            )}
          </div>
        </div>

        {/* Meta row: Store ID • Type • Route • Amount — full width, starts below the image */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50 text-xs">
          {metaItems.map((item, i) => (
            <React.Fragment key={i}>
              {i > 0 && <Dot />}
              {item}
            </React.Fragment>
          ))}
          <span
            className={cn(
              "ml-auto text-sm font-black tabular-nums leading-none shrink-0",
              hasOutstanding ? "text-red-600" : "text-emerald-600"
            )}
          >
            ₹{outstandingAmount.toLocaleString("en-IN")}
          </span>
        </div>
      </div>

      {/* Action Buttons Row */}
      {actions.length > 0 && (
        <div
          className="flex items-center gap-2 px-4 pb-4 pl-5"
          onClick={(e) => e.stopPropagation()}
        >
          {actions.map((action) => (
            <button
              key={action.id}
              title={action.label}
              disabled={action.disabled}
              onClick={(e) => {
                e.stopPropagation();
                action.onClick();
              }}
              className={cn(
                "flex-1 h-9 inline-flex items-center justify-center rounded-lg border text-xs font-semibold active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm",
                action.className ||
                "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
              )}
            >
              <action.icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      )}
    </Card>
  );
});

StoreCard.displayName = "StoreCard";