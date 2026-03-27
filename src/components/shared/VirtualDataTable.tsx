import React, { useState, useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface Column<T> {
  header: string | (() => React.ReactNode);
  accessor: keyof T | ((row: T) => React.ReactNode);
  className?: string;
  mobileLabel?: string;
}

interface VirtualDataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  searchPlaceholder?: string;
  searchKey?: keyof T;
  onRowClick?: (row: T) => void;
  height?: string | number;
  emptyMessage?: string;
  renderMobileCard?: (row: T) => React.ReactNode;
}

export function VirtualDataTable<T extends Record<string, any>>({
  columns,
  data,
  searchPlaceholder = "Search...",
  searchKey,
  onRowClick,
  height = "600px",
  emptyMessage = "No results found.",
  renderMobileCard
}: VirtualDataTableProps<T>) {
  const [search, setSearch] = useState("");
  const parentRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const shouldRenderCards = isMobile && !!renderMobileCard;

  // Filter data based on searchKey
  const filteredData = useMemo(() => {
    if (!searchKey || !search) return data;
    const lowerSearch = search.toLowerCase();
    return data.filter((row) => {
      const val = row[searchKey];
      return String(val).toLowerCase().includes(lowerSearch);
    });
  }, [data, search, searchKey]);

  const rowVirtualizer = useVirtualizer({
    count: filteredData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => shouldRenderCards ? 120 : 50,
    overscan: 5,
  });

  const getCellValue = (col: Column<T>, row: T) => {
    if (typeof col.accessor === "function") return col.accessor(row);
    return row[col.accessor];
  };

  const getHeaderValue = (col: Column<T>) => {
    if (typeof col.header === "function") return col.header();
    return col.header;
  };

  return (
    <div className="space-y-4">
      {searchKey && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {/* Container with border only on desktop or if not cards */}
      <div className={cn("overflow-hidden", !shouldRenderCards && "rounded-xl border bg-card")}>
        {/* Header Row - Hide on mobile if rendering cards */}
        {!shouldRenderCards && (
          <div className="flex items-center border-b border-border/50 bg-muted/30 font-bold text-muted-foreground text-[10px] uppercase tracking-wider py-2.5 px-0">
             {columns.map((col, i) => (
                <div key={i} className={cn("flex-1 px-4 truncate", col.className)}>
                  {getHeaderValue(col)}
                </div>
             ))}
          </div>
        )}

        {/* Virtual List Body */}
        <div 
          ref={parentRef} 
          className="overflow-auto w-full scrollbar-thin scrollbar-thumb-muted-foreground/20" 
          style={{ height: typeof height === 'number' ? `${height}px` : height }}
        >
          {filteredData.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
              <div className="rounded-full bg-muted/50 p-3">
                <Search className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-medium">{emptyMessage}</p>
            </div>
          ) : (
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = filteredData[virtualRow.index];
                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    className={cn(
                      "absolute top-0 left-0 w-full transition-colors",
                      !shouldRenderCards && "flex items-center border-b px-0 py-2 text-sm hover:bg-muted/50",
                      shouldRenderCards && "pb-3", // Spacing for cards
                      onRowClick && !shouldRenderCards ? "cursor-pointer" : ""
                    )}
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    onClick={() => !shouldRenderCards && onRowClick?.(row)}
                  >
                   {shouldRenderCards ? (
                     renderMobileCard?.(row)
                   ) : (
                     columns.map((col, i) => (
                        <div key={i} className={cn("flex-1 px-4 truncate", col.className)}>
                          {getCellValue(col, row)}
                        </div>
                     ))
                   )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground text-center sm:text-left">
        Showing {filteredData.length} records {shouldRenderCards ? "" : "(virtualized)"}
      </p>
    </div>
  );
}
