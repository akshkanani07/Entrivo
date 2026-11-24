import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

export interface PageBreadcrumb {
  label: string;
  href?: string;
}

export function PageHeader({
  title,
  description,
  breadcrumbs = [],
  actions,
}: {
  title: string;
  description?: string;
  breadcrumbs?: PageBreadcrumb[];
  actions?: ReactNode;
}) {
  return (
    <header className="space-y-3">
      {breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-slate-400">
          {breadcrumbs.map((item, index) => (
            <span key={`${item.label}-${index}`} className="inline-flex items-center gap-1">
              {index > 0 && <ChevronRight aria-hidden="true" className="h-3 w-3 text-slate-600" />}
              {item.href ? (
                <Link href={item.href} className="hover:text-indigo-300 focus-visible:outline focus-visible:outline-indigo-400">
                  {item.label}
                </Link>
              ) : (
                <span aria-current="page" className="text-slate-200">{item.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight text-white">{title}</h1>
          {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
