import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | number, formatStr: string = "PPP") {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatTime(date: string | Date | number) {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatDateTime(date: string | Date | number) {
  if (!date) return "";
  const d = new Date(date);
  return `${formatDate(d)} at ${formatTime(d)}`;
}
