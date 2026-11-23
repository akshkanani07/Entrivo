"use client";

import { useState } from "react";

const categories = [
  ["WAIT_TIME", "Wait time"],
  ["STAFF", "Staff"],
  ["PROCESS", "Process"],
  ["FACILITIES", "Facilities"],
  ["PARKING", "Parking"],
] as const;

export function FeedbackForm({
  kind,
  token,
  initialScore,
}: {
  kind: "EMAIL" | "VISIT_QR" | "GENERIC_QR";
  token: string;
  initialScore?: number;
}) {
  const [score, setScore] = useState<number | null>(
    initialScore !== undefined && initialScore >= 0 && initialScore <= 10 ? initialScore : null
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(kind !== "EMAIL");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    if (score === null) {
      setMessage("Please choose a score.");
      return;
    }
    setSubmitting(true);
    setMessage(null);
    const response = await fetch("/api/public/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        token,
        npsScore: score,
        categories: selected,
        comment,
        locale: typeof navigator !== "undefined" ? navigator.language : "en-IN",
        isAnonymous,
        honeypot,
      }),
    });
    const data = await response.json().catch(() => null);
    if (response.ok && data?.success) {
      setMessage("Thank you. Your feedback has been submitted.");
    } else if (response.status === 410 || data?.generic) {
      setMessage("This feedback link is expired or has already been used.");
    } else {
      setMessage(data?.error || "Unable to submit feedback.");
    }
    setSubmitting(false);
  }

  if (message?.startsWith("Thank you")) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center">
          <div className="text-5xl mb-4">✓</div>
          <h1 className="text-2xl font-bold">Thank you</h1>
          <p className="mt-3 text-slate-300">{message}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white px-4 py-10">
      <div className="mx-auto w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-900 p-6 md:p-8">
        <p className="text-xs font-bold uppercase tracking-widest text-indigo-300">Visitor feedback</p>
        <h1 className="mt-2 text-2xl font-bold">How was your visit?</h1>
        <p className="mt-2 text-sm text-slate-400">Choose 0–10. Zero means not at all likely, 10 means extremely likely.</p>

        <div className="mt-6 grid grid-cols-6 gap-2 sm:grid-cols-11" role="radiogroup" aria-label="Net promoter score">
          {Array.from({ length: 11 }, (_, value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={score === value}
              onClick={() => setScore(value)}
              className={`h-11 rounded-lg border text-sm font-bold ${score === value ? "border-indigo-400 bg-indigo-600" : "border-slate-700 bg-slate-950 hover:border-slate-500"}`}
            >
              {value}
            </button>
          ))}
        </div>

        <fieldset className="mt-7">
          <legend className="text-sm font-semibold">What should we know?</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {categories.map(([value, label]) => {
              const active = selected.includes(value);
              return (
                <button
                  type="button"
                  key={value}
                  onClick={() => setSelected((current) => active ? current.filter((item) => item !== value) : [...current, value])}
                  className={`rounded-full border px-3 py-2 text-xs ${active ? "border-indigo-400 bg-indigo-950 text-indigo-200" : "border-slate-700 text-slate-300"}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="mt-6 block text-sm font-semibold" htmlFor="feedback-comment">Comment (optional)</label>
        <textarea
          id="feedback-comment"
          value={comment}
          maxLength={5000}
          onChange={(event) => setComment(event.target.value)}
          className="mt-2 min-h-32 w-full resize-y rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm outline-none focus:border-indigo-400"
          placeholder="Share details about your experience"
        />

        <div className="mt-4" style={{ position: "absolute", left: "-10000px" }} aria-hidden="true">
          <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} />
        </div>

        {kind === "EMAIL" && (
          <label className="mt-4 flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={isAnonymous} onChange={(event) => setIsAnonymous(event.target.checked)} />
            Submit anonymously
          </label>
        )}

        {message && <p className="mt-4 rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-200">{message}</p>}
        <button
          type="button"
          disabled={submitting}
          onClick={submit}
          className="mt-5 w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold hover:bg-indigo-500 disabled:opacity-60"
        >
          {submitting ? "Submitting…" : "Submit feedback"}
        </button>
      </div>
    </main>
  );
}
