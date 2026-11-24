"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

export interface DataTableColumn<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T>({
  rows,
  columns,
  getRowKey,
  renderMobileCard,
  searchValue,
  onSearchChange,
  resetKey,
  searchPlaceholder = "Search",
  filters,
  emptyTitle = "No results found",
  emptyDescription = "Try changing your search or filters.",
  pageSize = 10,
}: {
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowKey: (row: T) => string;
  renderMobileCard: (row: T) => ReactNode;
  searchValue: string;
  onSearchChange: (value: string) => void;
  resetKey?: string;
  searchPlaceholder?: string;
  filters?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  pageSize?: number;
}) {
  const searchId = useId();
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const visibleRows = rows.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [rows.length, searchValue, resetKey]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  return (
    <section className="overflow-hidden rounded-2xl border border-surface-border bg-surface-glass shadow-card">
      <div className="flex flex-col gap-3 border-b border-surface-border p-4 sm:flex-row sm:items-center">
        <label htmlFor={searchId} className="relative min-w-0 flex-1">
          <span className="sr-only">{searchPlaceholder}</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            id={searchId}
            type="search"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="min-h-11 w-full rounded-lg border border-surface-border bg-surface px-10 py-2 text-sm text-text placeholder:text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          />
        </label>
        {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}
      </div>

      {rows.length === 0 ? (
        <div className="px-5 py-12 text-center" role="status">
          <p className="font-semibold text-text">{emptyTitle}</p>
          <p className="mt-1 text-sm text-text-muted">{emptyDescription}</p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-surface-border md:hidden">
            {visibleRows.map((row) => (
              <article key={getRowKey(row)} className="p-4">
                {renderMobileCard(row)}
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-xs uppercase tracking-wide text-text-muted">
                <tr>
                  {columns.map((column) => (
                    <th key={column.key} scope="col" className={`px-4 py-3 font-semibold ${column.className || ""}`}>
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {visibleRows.map((row) => (
                  <tr key={getRowKey(row)} className="transition-colors hover:bg-surface-hover/50">
                    {columns.map((column) => (
                      <td key={column.key} className={`px-4 py-3 align-top ${column.className || ""}`}>
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {rows.length > 0 && (
        <nav
          aria-label="Table pagination"
          className="flex flex-col gap-3 border-t border-surface-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-text-muted" aria-live="polite">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, rows.length)} of {rows.length}
          </p>
          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1}
              className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-surface-border px-3 text-sm font-medium text-text disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
              Previous
            </button>
            <span className="px-2 text-sm text-text-muted" aria-label={`Page ${page} of ${pageCount}`}>
              {page} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
              disabled={page === pageCount}
              className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-surface-border px-3 text-sm font-medium text-text disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </nav>
      )}
    </section>
  );
}
