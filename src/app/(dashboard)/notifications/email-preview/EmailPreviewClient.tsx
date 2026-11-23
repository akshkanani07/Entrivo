"use client";

import { useState } from "react";

type PreviewTemplate = {
  name: string;
  subject: string;
  html: string;
  text: string;
};

export function EmailPreviewClient({ templates }: { templates: PreviewTemplate[] }) {
  const [selectedName, setSelectedName] = useState(templates[0]?.name || "");
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const selected = templates.find((template) => template.name === selectedName);

  if (!selected) {
    return <p className="text-sm text-slate-400">No email templates are available to preview.</p>;
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Email preview</h1>
          <p className="mt-1 text-sm text-slate-400">Preview all transactional templates with sample data.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setViewport("desktop")}
            aria-pressed={viewport === "desktop"}
            className={`rounded-lg px-3 py-2 text-sm ${viewport === "desktop" ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-300"}`}
          >
            Desktop
          </button>
          <button
            type="button"
            onClick={() => setViewport("mobile")}
            aria-pressed={viewport === "mobile"}
            className={`rounded-lg px-3 py-2 text-sm ${viewport === "mobile" ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-300"}`}
          >
            Mobile
          </button>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav className="max-h-[70vh] space-y-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/70 p-2" aria-label="Email templates">
          {templates.map((template) => (
            <button
              key={template.name}
              type="button"
              onClick={() => setSelectedName(template.name)}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm capitalize ${
                selected.name === template.name ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              {template.name.replace(/-/g, " ")}
            </button>
          ))}
        </nav>

        <div className="min-w-0 space-y-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <h2 className="text-sm font-semibold text-white">{selected.subject}</h2>
            <p className="mt-1 text-xs text-slate-400">Template: {selected.name}</p>
          </div>
          <div className="overflow-auto rounded-xl border border-slate-700 bg-slate-200 p-3">
            <iframe
              title={`${selected.name} email preview`}
              srcDoc={selected.html}
              sandbox=""
              style={{ display: "block", width: viewport === "mobile" ? "390px" : "100%", minHeight: "680px", maxWidth: "100%", margin: "0 auto", border: 0, background: "#ffffff" }}
            />
          </div>
          <details className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-200">Plain-text alternative</summary>
            <pre className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-slate-300">{selected.text}</pre>
          </details>
        </div>
      </div>
    </section>
  );
}
