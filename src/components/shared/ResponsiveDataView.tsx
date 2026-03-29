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
  hideOnMobile?: boolean;
}

interface ResponsiveDataViewProps<T> {
  columns: Column<T>[];
  data: T[];
  searchPlaceholder?: string;
  searchKey?: keyof T;
  onRowClick?: (row: T) => void;
  height?: string | number;
  emptyMessage?: string;
  renderMobileCard?: (row: T) => React.ReactNode;
  renderDesktopCard?: (row: T) => React.ReactNode;
  useCardLayoutOnDesktop?: boolean;
}

export function ResponsiveDataView<T extends Record<string, any>>({
  columns,
  data,
  searchPlaceholder = "Search...",
  searchKey,
  onRowClick,
  height = "600px",
  emptyMessage = "No results found.",
  renderMobileCard,
  renderDesktopCard,
  useCardLayoutOnDesktop = false,
}: ResponsiveDataViewProps<T>) {
  const [search, setSearch] = useState("");
  const parentRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

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
    estimateSize: () => (isMobile ? 120 : useCardLayoutOnDesktop ? 180 : 50),
    overscan: 5,
  });

  // Determine rendering mode
  const shouldRenderMobileCards = isMobile && !!renderMobileCard;
  const shouldRenderDesktopCards = !isMobile && useCardLayoutOnDesktop && !!renderDesktopCard;
  const shouldRenderTable = !shouldRenderMobileCards && !shouldRenderDesktopCards;

  return (
    <div className="space-y-4">
      {/* Search bar */}
      {searchKey && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {/* Virtualized container */}
      <div
        ref={parentRef}
        className="overflow-auto border rounded-lg bg-background"
        style={{ height }}
      >
        {filteredData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {/* Mobile card layout */}
            {shouldRenderMobileCards &&
              rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = filteredData[virtualRow.index];
                return (
                  <div
                    key={virtualRow.key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className="px-3 py-1.5"
                    onClick={() => onRowClick?.(row)}
                  >
                    {renderMobileCard!(row)}
                  </div>
                );
              })}

            {/* Desktop card layout */}
            {shouldRenderDesktopCards && (
              <div className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const row = filteredData[virtualRow.index];
                    return (
                      <div
                        key={virtualRow.key}
                        onClick={() => onRowClick?.(row)}
                        className="cursor-pointer"
                      >
                        {renderDesktopCard!(row)}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Table layout */}
            {shouldRenderTable && (
              <>
                {/* Table header - sticky */}
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 bg-muted/50 backdrop-blur-sm z-10 border-b">
                    <tr>
                      {columns.map((col, idx) => {
                        if (isMobile && col.hideOnMobile) return null;
                        return (
                          <th
                            key={idx}
                            className={cn(
                              "px-4 py-3 text-left text-sm font-semibold text-muted-foreground",
                              col.className
                            )}
                          >
                            {typeof col.header === 'function' ? col.header() : col.header}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                      const row = filteredData[virtualRow.index];
                      return (
                        <tr
                          key={virtualRow.key}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: `${virtualRow.size}px`,
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                          className={cn(
                            "border-b transition-colors hover:bg-muted/50",
                            onRowClick && "cursor-pointer"
                          )}
                          onClick={() => onRowClick?.(row)}
                        >
                          {columns.map((col, idx) => {
                            if (isMobile && col.hideOnMobile) return null;
                            const content =
                              typeof col.accessor === 'function'
                                ? col.accessor(row)
                                : row[col.accessor];
                            return (
                              <td
                                key={idx}
                                className={cn("px-4 py-3 text-sm", col.className)}
                              >
                                {content}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
