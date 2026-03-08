import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Column<T> {
  header: string | (() => React.ReactNode);
  accessor: keyof T | ((row: T) => React.ReactNode);
  className?: string;
  /** Label used in mobile card view. Defaults to header string. */
  mobileLabel?: string;
  /** Hide this column entirely on mobile card view */
  hideOnMobile?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  searchPlaceholder?: string;
  searchKey?: keyof T;
  onRowClick?: (row: T) => void;
  pageSize?: number;
  /** Custom mobile card renderer. When provided, replaces the default grid card. */
  renderMobileCard?: (row: T, index: number) => React.ReactNode;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  searchPlaceholder = "Search...",
  searchKey,
  onRowClick,
  pageSize: defaultPageSize = 10,
  renderMobileCard,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const filtered = searchKey
    ? data.filter((row) =>
        String(row[searchKey]).toLowerCase().includes(search.toLowerCase())
      )
    : data;

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safeP = Math.min(page, totalPages - 1);
  const paged = filtered.slice(safeP * pageSize, (safeP + 1) * pageSize);

  const handleSearch = (val: string) => {
    setSearch(val);
    setPage(0);
  };

  const getHeaderText = (col: Column<T>): string => {
    if (col.mobileLabel) return col.mobileLabel;
    if (typeof col.header === "string") return col.header;
    return "";
  };

  const getCellValue = (col: Column<T>, row: T): React.ReactNode => {
    if (typeof col.accessor === "function") return col.accessor(row);
    return row[col.accessor] as React.ReactNode;
  };

  return (
    <div className="space-y-4">
      {searchKey && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {/* Desktop table view */}
      <div className="rounded-xl border bg-card overflow-x-auto -mx-3 sm:mx-0 hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              {columns.map((col, i) => (
                <TableHead key={i} className={col.className}>
                  {typeof col.header === "function" ? col.header() : col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  No results found.
                </TableCell>
              </TableRow>
            ) : (
              paged.map((row, i) => (
                <TableRow key={i} className={`hover:bg-muted/30 ${onRowClick ? "cursor-pointer" : ""}`} onClick={() => onRowClick?.(row)}>
                  {columns.map((col, j) => (
                    <TableCell key={j} className={col.className}>
                      {getCellValue(col, row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile card view */}
      <div className="md:hidden space-y-3">
        {paged.length === 0 ? (
          <div className="rounded-xl border bg-card p-6 text-center text-muted-foreground">
            No results found.
          </div>
        ) : renderMobileCard ? (
          paged.map((row, i) => (
            <div
              key={i}
              className={onRowClick ? "cursor-pointer" : ""}
              onClick={() => onRowClick?.(row)}
            >
              {renderMobileCard(row, i)}
            </div>
          ))
        ) : (
          paged.map((row, i) => (
            <div
              key={i}
              className={`rounded-xl border bg-card p-4 ${onRowClick ? "cursor-pointer active:bg-muted/30" : ""}`}
              onClick={() => onRowClick?.(row)}
            >
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {columns
                  .filter((col) => !col.hideOnMobile)
                  .map((col, j) => {
                    const label = getHeaderText(col);
                    const value = getCellValue(col, row);
                    if (!label) {
                      return (
                        <div key={j} className="col-span-2 flex items-center">
                          {value}
                        </div>
                      );
                    }
                    return (
                      <div key={j} className="min-w-0">
                        <p className="text-[11px] text-muted-foreground truncate">{label}</p>
                        <div className="text-sm font-medium truncate">{value}</div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {filtered.length > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Rows per page</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map((s) => (
                  <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span>{safeP * pageSize + 1}–{Math.min((safeP + 1) * pageSize, filtered.length)} of {filtered.length}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={safeP === 0} onClick={() => setPage(safeP - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={safeP >= totalPages - 1} onClick={() => setPage(safeP + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
