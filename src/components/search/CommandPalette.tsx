"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Users,
  UserCheck,
  Calendar,
  ShieldCheck,
  Clock,
  ArrowRight,
  X,
  History,
  Trash2,
  CornerDownLeft,
} from "lucide-react";

export interface SearchResult {
  type: string;
  title: string;
  subtitle: string;
  url: string;
}

interface RecentSearchItem {
  query: string;
  title: string;
  subtitle: string;
  url: string;
  type: string;
  timestamp: number;
}

const RECENT_SEARCHES_KEY = "entrivo_recent_searches";
const MAX_RECENT_ITEMS = 6;

export function CommandPalette({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recentItems, setRecentItems] = useState<RecentSearchItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (stored) {
        setRecentItems(JSON.parse(stored));
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [isOpen]);

  // Auto focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Debounced search query
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setIsLoading(false);
      setSelectedIndex(0);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        if (data.results) {
          setResults(data.results);
          setSelectedIndex(0);
        }
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [query]);

  // Save selected item to recents
  const saveToRecents = (item: SearchResult) => {
    try {
      const updated: RecentSearchItem[] = [
        {
          query: query.trim() || item.title,
          title: item.title,
          subtitle: item.subtitle || "",
          url: item.url,
          type: item.type,
          timestamp: Date.now(),
        },
        ...recentItems.filter((r) => r.url !== item.url),
      ].slice(0, MAX_RECENT_ITEMS);

      setRecentItems(updated);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    } catch {
      // Ignore localStorage errors
    }
  };

  const clearRecents = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
      setRecentItems([]);
    } catch {
      // Ignore
    }
  };

  const handleSelect = (item: SearchResult) => {
    saveToRecents(item);
    onClose();
    router.push(item.url);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const listLength = query.trim().length >= 2 ? results.length : recentItems.length;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (listLength > 0 ? (prev + 1) % listLength : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (listLength > 0 ? (prev - 1 + listLength) % listLength : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (query.trim().length >= 2 && results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      } else if (query.trim().length < 2 && recentItems[selectedIndex]) {
        handleSelect(recentItems[selectedIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (resultsContainerRef.current) {
      const activeEl = resultsContainerRef.current.querySelector('[data-selected="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  const currentDisplayList = query.trim().length >= 2 ? results : recentItems;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/80 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="relative border-b border-slate-800 p-4 flex items-center gap-3 bg-slate-950">
          <Search className={`w-5 h-5 flex-shrink-0 ${isLoading ? "animate-pulse text-indigo-400" : "text-slate-400"}`} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search visitor name, phone digits, company, host, badge, or date..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
          />
          {query ? (
            <button
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="text-slate-500 hover:text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-900 text-slate-500 border border-slate-800">
              ESC to close
            </span>
          )}
        </div>

        {/* Results / Recents Body */}
        <div ref={resultsContainerRef} className="overflow-y-auto p-2 space-y-1 divide-y divide-slate-800/40">
          {query.trim().length >= 2 ? (
            /* Live Results */
            results.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                {isLoading ? "Searching across enterprise records..." : `No matches found for "${query}"`}
              </div>
            ) : (
              <div>
                <div className="px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Matches ({results.length})
                </div>
                {results.map((r, idx) => {
                  const isSelected = selectedIndex === idx;
                  return (
                    <div
                      key={r.url + idx}
                      data-selected={isSelected}
                      onClick={() => handleSelect(r)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${
                        isSelected ? "bg-indigo-600/20 border border-indigo-500/40" : "hover:bg-slate-800/60"
                      }`}
                    >
                      <div className="flex items-center gap-3 truncate">
                        <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0">
                          {r.type === "VISITOR" && <Users className="w-4 h-4 text-indigo-400" />}
                          {r.type === "EMPLOYEE" && <UserCheck className="w-4 h-4 text-cyan-400" />}
                          {r.type === "INVITATION" && <Calendar className="w-4 h-4 text-amber-400" />}
                          {r.type === "ACTIVE_BADGE" && <ShieldCheck className="w-4 h-4 text-emerald-400" />}
                        </div>
                        <div className="truncate">
                          <span className="text-xs font-bold text-white block truncate">{r.title}</span>
                          <span className="text-[11px] text-slate-400 block truncate">{r.subtitle}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                        <span
                          className={`text-[9px] font-mono px-2 py-0.5 rounded uppercase font-semibold ${
                            r.type === "VISITOR"
                              ? "bg-indigo-950 text-indigo-300 border border-indigo-800"
                              : r.type === "EMPLOYEE"
                              ? "bg-cyan-950 text-cyan-300 border border-cyan-800"
                              : r.type === "INVITATION"
                              ? "bg-amber-950 text-amber-300 border border-amber-800"
                              : "bg-emerald-950 text-emerald-300 border border-emerald-800"
                          }`}
                        >
                          {r.type.replace("_", " ")}
                        </span>
                        {isSelected && <CornerDownLeft className="w-3.5 h-3.5 text-indigo-400" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            /* Recent Searches */
            <div>
              <div className="px-3 py-1.5 flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" /> Recent Items
                </span>
                {recentItems.length > 0 && (
                  <button
                    onClick={clearRecents}
                    className="hover:text-rose-400 transition-colors flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Clear
                  </button>
                )}
              </div>

              {recentItems.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  Type 2 or more characters to search visitors, phone numbers, hosts, or badges.
                </div>
              ) : (
                recentItems.map((r, idx) => {
                  const isSelected = selectedIndex === idx;
                  return (
                    <div
                      key={r.url + idx}
                      data-selected={isSelected}
                      onClick={() => handleSelect(r)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${
                        isSelected ? "bg-indigo-600/20 border border-indigo-500/40" : "hover:bg-slate-800/60"
                      }`}
                    >
                      <div className="flex items-center gap-3 truncate">
                        <History className="w-4 h-4 text-slate-500 flex-shrink-0" />
                        <div className="truncate">
                          <span className="text-xs font-semibold text-white block truncate">{r.title}</span>
                          <span className="text-[10px] text-slate-400 block truncate">{r.query}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                        <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800 uppercase">
                          {r.type.replace("_", " ")}
                        </span>
                        {isSelected && <CornerDownLeft className="w-3.5 h-3.5 text-indigo-400" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Footer Navigation Hints */}
        <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-[10px] text-slate-400">↑↓</kbd> navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-[10px] text-slate-400">↵</kbd> select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-[10px] text-slate-400">esc</kbd> close
            </span>
          </div>
          <span className="font-mono text-[10px] text-slate-600">Entrivo Omnisearch</span>
        </div>
      </div>
    </div>
  );
}
