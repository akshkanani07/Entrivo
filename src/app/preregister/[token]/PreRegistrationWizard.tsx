"use client";

import { useEffect, useMemo, useState } from "react";
import { CameraCapture } from "@/components/visitor/CameraCapture";
import { SignatureCanvas } from "@/components/visitor/SignatureCanvas";

type Step = "LANGUAGE" | "PERSONAL" | "ID" | "PHOTO" | "VEHICLE" | "PRIVACY" | "NDA" | "REVIEW";
type StepKey = "LANGUAGE" | "PERSONAL" | "ID" | "PHOTO" | "VEHICLE" | "PRIVACY" | "NDA";

interface PreRegistrationDraft {
  personal?: { name?: string; phone?: string; company?: string | null };
  idProofType?: string;
  idProofNumber?: string;
  idProofNumberMasked?: string;
  idNumberNeedsReentry?: boolean;
  photoFileId?: string;
  vehicle?: { plateDisplay?: string; type?: string; make?: string; color?: string; foreignPlate?: boolean };
  locale?: string;
  consent?: boolean;
  signatureFileId?: string;
}

interface PageData {
  status: string;
  rejectionReason: string | null;
  visitor: { name: string; email: string; phone: string; company: string | null; idProofType: string | null };
  invitation: {
    date: string;
    startTime: string;
    endTime: string;
    purpose: string;
    organizationName: string;
    hostName: string;
  };
  draft: PreRegistrationDraft;
  requirements: {
    requireCompany: boolean;
    requirePhone: boolean;
    requireIdProof: boolean;
    requireIdNumber: boolean;
    requirePhoto: boolean;
    requiresNda: boolean;
    ndaAlreadyValid: boolean;
  };
  priorVehicle: {
    plateDisplay: string;
    type: string;
    make: string | null;
    color: string | null;
    foreignPlate: boolean;
  } | null;
  photoPreview: string | null;
  ndaContent: string;
  ndaVersion: string | null;
  legalVersion: string;
  bringIdChecklist: string;
  languageOptions: string[];
}

const steps: Step[] = ["LANGUAGE", "PERSONAL", "ID", "PHOTO", "VEHICLE", "PRIVACY", "NDA", "REVIEW"];
const stepNames: Record<Step, string> = {
  LANGUAGE: "Language",
  PERSONAL: "Personal details",
  ID: "ID details",
  PHOTO: "Photo",
  VEHICLE: "Vehicle",
  PRIVACY: "Privacy",
  NDA: "NDA",
  REVIEW: "Review",
};

function stepKey(step: Step): StepKey | null {
  return step === "REVIEW" ? null : step;
}

export function PreRegistrationWizard({ token }: { token: string }) {
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [step, setStep] = useState<Step>("LANGUAGE");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [personal, setPersonal] = useState({ name: "", phone: "", company: "" });
  const [idProofType, setIdProofType] = useState("");
  const [idProofNumber, setIdProofNumber] = useState("");
  const [idProofNumberMasked, setIdProofNumberMasked] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState({
    plateDisplay: "",
    type: "OTHER",
    make: "",
    color: "",
    foreignPlate: false,
  });
  const [locale, setLocale] = useState("en");
  const [consent, setConsent] = useState(false);
  const [signatureSaved, setSignatureSaved] = useState(false);
  const [signatureData, setSignatureData] = useState("");

  const visibleSteps = useMemo(
    () => steps.filter((item) => item !== "NDA" || pageData?.requirements.requiresNda),
    [pageData]
  );

  useEffect(() => {
    let active = true;
    fetch(`/api/public/preregister/${encodeURIComponent(token)}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
      .then(async (res) => {
        const result = await res.json();
        if (!res.ok || !result.success) throw new Error(result.error || "This link is unavailable.");
        if (!active) return;
        const data = result.data as PageData;
        setPageData(data);
        setPersonal({
          name: data.draft.personal?.name || data.visitor.name || "",
          phone: data.draft.personal?.phone || data.visitor.phone || "",
          company: data.draft.personal?.company ?? data.visitor.company ?? "",
        });
        setIdProofType(data.draft.idProofType || data.visitor.idProofType || "");
        setIdProofNumber(data.draft.idProofNumber || "");
        setIdProofNumberMasked(data.draft.idProofNumberMasked || "");
        setPhoto(data.photoPreview);
        setVehicle({
          plateDisplay: data.draft.vehicle?.plateDisplay || data.priorVehicle?.plateDisplay || "",
          type: data.draft.vehicle?.type || data.priorVehicle?.type || "OTHER",
          make: data.draft.vehicle?.make || data.priorVehicle?.make || "",
          color: data.draft.vehicle?.color || data.priorVehicle?.color || "",
          foreignPlate: data.draft.vehicle?.foreignPlate ?? data.priorVehicle?.foreignPlate ?? false,
        });
        setLocale(data.draft.locale || "en");
        setConsent(data.draft.consent === true);
        setSignatureSaved(Boolean(data.draft.signatureFileId));
        if (data.status === "SUBMITTED" || data.status === "APPROVED") setSubmitted(true);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function save(stepName: StepKey, data: Record<string, unknown>) {
    const res = await fetch(`/api/public/preregister/${encodeURIComponent(token)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: stepName, data }),
    });
    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.error || "Unable to save this step.");
  }

  async function continueStep() {
    setError("");
    const currentKey = stepKey(step);
    if (currentKey) {
      if (currentKey === "LANGUAGE") {
        await save(currentKey, { locale });
      } else if (currentKey === "PERSONAL") {
        if (!personal.name.trim() || (pageData?.requirements.requirePhone && !personal.phone.trim())) {
          setError("Enter the required personal details.");
          return;
        }
        await save(currentKey, personal);
      } else if (currentKey === "ID") {
        if (pageData?.requirements.requireIdProof && !idProofType) {
          setError("Select an ID type.");
          return;
        }
        if (
          pageData?.requirements.requireIdNumber &&
          !idProofNumber.trim() &&
          (!idProofNumberMasked || pageData.draft.idNumberNeedsReentry)
        ) {
          setError("Enter your ID number again. For privacy, the full number is not retained in this draft.");
          return;
        }
        if (idProofNumber.trim()) {
          await save(currentKey, { idProofType, idProofNumber });
        }
      } else if (currentKey === "PHOTO") {
        if (photo && photo.startsWith("data:")) {
          await save(currentKey, { dataUrl: photo });
          setPhoto(null);
          const refreshed = await fetch(`/api/public/preregister/${encodeURIComponent(token)}`, { cache: "no-store" });
          const result = await refreshed.json();
          if (result.success) {
            setPageData(result.data);
            setPhoto(result.data.photoPreview);
          }
        } else if (pageData?.requirements.requirePhoto && !pageData.draft.photoFileId) {
          setError("Capture a photo before continuing.");
          return;
        }
      } else if (currentKey === "VEHICLE") {
        await save(currentKey, vehicle);
      } else if (currentKey === "PRIVACY") {
        if (!consent) {
          setError("Please review and accept the privacy notice to continue.");
          return;
        }
        await save(currentKey, { locale, consent: true });
      } else if (currentKey === "NDA" && !pageData?.requirements.ndaAlreadyValid) {
        if (!signatureSaved) {
          setError("Sign the NDA before continuing.");
          return;
        }
        if (signatureData) await save(currentKey, { dataUrl: signatureData });
      }
    }

    const index = visibleSteps.indexOf(step);
    setStep(visibleSteps[Math.min(index + 1, visibleSteps.length - 1)]);
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/public/preregister/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website: honeypot, idProofNumber }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || "Unable to submit.");
      setSubmitted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to submit.");
    } finally {
      setBusy(false);
    }
  }

  function previousStep() {
    const index = visibleSteps.indexOf(step);
    setStep(visibleSteps[Math.max(index - 1, 0)]);
    setError("");
  }

  if (loading) {
    return <main className="min-h-screen bg-slate-950 text-white grid place-items-center p-6">Loading secure form...</main>;
  }
  if (!pageData || error && !pageData) {
    return (
      <main className="min-h-screen bg-slate-950 text-white grid place-items-center p-6">
        <section className="max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
          <h1 className="text-xl font-bold">This link is unavailable</h1>
          <p className="mt-2 text-sm text-slate-300">{error || "Contact your host for a new link."}</p>
        </section>
      </main>
    );
  }
  if (submitted) {
    return (
      <main className="min-h-screen bg-slate-950 text-white grid place-items-center p-6">
        <section className="max-w-md rounded-2xl border border-emerald-800 bg-slate-900 p-6 text-center">
          <h1 className="text-xl font-bold">Pre-registration submitted</h1>
          <p className="mt-2 text-sm text-slate-300">
            Your information has been sent to {pageData.invitation.hostName} for review.
          </p>
        </section>
      </main>
    );
  }

  const stepIndex = visibleSteps.indexOf(step);
  const progress = Math.round(((stepIndex + 1) / visibleSteps.length) * 100);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-xl">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-300">
            {pageData.invitation.organizationName}
          </p>
          <h1 className="mt-2 text-2xl font-bold">Visitor pre-registration</h1>
          <p className="mt-1 text-sm text-slate-300">
            Visit with {pageData.invitation.hostName} · {new Date(pageData.invitation.date).toLocaleDateString()}
          </p>
        </header>

        <nav aria-label="Form progress" className="mb-6">
          <div className="mb-2 flex justify-between text-xs text-slate-300">
            <span>{stepNames[step]}</span><span>{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-800" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-2 rounded-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <ol className="sr-only">
            {visibleSteps.map((item, index) => (
              <li key={item} aria-current={item === step ? "step" : undefined}>{index + 1}. {stepNames[item]}</li>
            ))}
          </ol>
        </nav>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl sm:p-7">
          {pageData.status === "REJECTED" && pageData.rejectionReason && (
            <p role="status" className="mb-5 rounded-lg border border-amber-800 bg-amber-950/30 p-3 text-sm text-amber-200">
              Please update your information: {pageData.rejectionReason}
            </p>
          )}
          {step === "LANGUAGE" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Choose a language</h2>
              <label className="block text-sm" htmlFor="locale">Language</label>
              <select id="locale" value={locale} onChange={(e) => setLocale(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3">
                <option value="en">English</option><option value="hi">Hindi</option><option value="gu">Gujarati</option>
              </select>
              <p className="text-xs text-slate-400">Localized instructions will be available in a later language rollout.</p>
            </div>
          )}

          {step === "PERSONAL" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Personal details</h2>
              <label className="block text-sm" htmlFor="name">Name *</label>
              <input id="name" autoComplete="name" value={personal.name} onChange={(e) => setPersonal({ ...personal, name: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3" />
              <label className="block text-sm" htmlFor="phone">Phone{pageData.requirements.requirePhone ? " *" : ""}</label>
              <input id="phone" type="tel" autoComplete="tel" value={personal.phone} onChange={(e) => setPersonal({ ...personal, phone: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3" />
              <label className="block text-sm" htmlFor="company">Company{pageData.requirements.requireCompany ? " *" : ""}</label>
              <input id="company" autoComplete="organization" value={personal.company} onChange={(e) => setPersonal({ ...personal, company: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3" />
              <p className="text-xs text-slate-400">Email: {pageData.visitor.email}</p>
            </div>
          )}

          {step === "ID" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Government ID details</h2>
              <label className="block text-sm" htmlFor="idType">ID type{pageData.requirements.requireIdProof ? " *" : ""}</label>
              <select id="idType" value={idProofType} onChange={(e) => { setIdProofType(e.target.value); setIdProofNumber(""); }} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3">
                <option value="">Select ID type</option><option>Aadhaar</option><option>Passport</option><option>Driver License</option><option>National ID</option><option>Other</option>
              </select>
              <label className="block text-sm" htmlFor="idNumber">ID number{pageData.requirements.requireIdNumber ? " *" : ""}</label>
              <input id="idNumber" type="password" inputMode="text" autoComplete="off" value={idProofNumber} onChange={(e) => setIdProofNumber(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3" />
              {idProofNumberMasked && !idProofNumber && <p className="text-xs text-slate-400">{pageData.draft.idNumberNeedsReentry ? `Saved masked ID: ${idProofNumberMasked}. Re-enter the full number to continue.` : `Saved ID on file: ${idProofNumberMasked}. Leave blank to keep it, or enter a replacement.`}</p>}
              <p className="text-xs text-slate-400">Your ID number is protected. Aadhaar-like numbers are stored only as a masked value with the last four digits.</p>
            </div>
          )}

          {step === "PHOTO" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Visitor photo</h2>
              <p className="text-sm text-slate-300">Use your camera or upload a clear face photo. Image metadata is removed before storage.</p>
              <CameraCapture
                autoStart={false}
                initialImage={photo}
                onCapture={(dataUrl) => { setPhoto(dataUrl); }}
                onClear={() => setPhoto(null)}
              />
              {!pageData.requirements.requirePhoto && <p className="text-xs text-slate-400">Photo is optional under your host&apos;s policy.</p>}
            </div>
          )}

          {step === "VEHICLE" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Vehicle (optional)</h2>
              <label className="block text-sm" htmlFor="plate">Vehicle plate</label>
              <input id="plate" autoComplete="off" value={vehicle.plateDisplay} onChange={(e) => setVehicle({ ...vehicle, plateDisplay: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3" />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={vehicle.foreignPlate}
                  onChange={(e) => setVehicle({ ...vehicle, foreignPlate: e.target.checked })}
                />
                Other or foreign registration
              </label>
              <label className="block text-sm" htmlFor="vehicleType">Vehicle type</label>
              <select id="vehicleType" value={vehicle.type} onChange={(e) => setVehicle({ ...vehicle, type: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3">
                <option value="CAR">Car</option><option value="BIKE">Bike</option><option value="EV">Electric vehicle</option><option value="OTHER">Other</option>
              </select>
              <label className="block text-sm" htmlFor="vehicleMake">Make (optional)</label>
              <input id="vehicleMake" maxLength={80} value={vehicle.make} onChange={(e) => setVehicle({ ...vehicle, make: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3" />
              <label className="block text-sm" htmlFor="vehicleColor">Color (optional)</label>
              <input id="vehicleColor" maxLength={40} value={vehicle.color} onChange={(e) => setVehicle({ ...vehicle, color: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3" />
            </div>
          )}

          {step === "PRIVACY" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Privacy notice and consent</h2>
              <p className="text-sm leading-6 text-slate-300">
                The organization uses the information you provide to verify your identity, prepare visitor access, and administer this visit. Your consent is recorded with notice version {pageData.legalVersion}.
              </p>
              <p className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm">{pageData.bringIdChecklist}</p>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4" />
                <span>I have read the privacy notice and consent to the use of my information for this visit.</span>
              </label>
              <label className="block text-sm" htmlFor="localePrivacy">Preferred language</label>
              <select id="localePrivacy" value={locale} onChange={(e) => setLocale(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3">
                <option value="en">English</option><option value="hi">Hindi</option><option value="gu">Gujarati</option>
              </select>
            </div>
          )}

          {step === "NDA" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Non-disclosure agreement</h2>
              {pageData.requirements.ndaAlreadyValid ? (
                <p className="rounded-lg border border-emerald-800 bg-emerald-950/30 p-3 text-sm text-emerald-200">A valid NDA is already on file. No new signature is required.</p>
              ) : (
                <>
                  <article className="max-h-60 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 p-4 text-sm leading-6 whitespace-pre-wrap" aria-label="NDA terms">
                    {pageData.ndaContent}
                  </article>
                  <p className="text-xs text-slate-400">Agreement version {pageData.ndaVersion || "current"}</p>
                  <SignatureCanvas
                    onSave={(dataUrl) => { setSignatureData(dataUrl); setSignatureSaved(true); }}
                    onClear={() => { setSignatureData(""); setSignatureSaved(false); }}
                  />
                  {signatureSaved && <p className="text-xs text-emerald-300">Signature saved.</p>}
                </>
              )}
            </div>
          )}

          {step === "REVIEW" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Review and submit</h2>
              <dl className="grid grid-cols-1 gap-3 text-sm">
                <div><dt className="text-slate-400">Name</dt><dd>{personal.name}</dd></div>
                <div><dt className="text-slate-400">Phone</dt><dd>{personal.phone}</dd></div>
                <div><dt className="text-slate-400">Company</dt><dd>{personal.company || "Not provided"}</dd></div>
                <div><dt className="text-slate-400">ID</dt><dd>{idProofType || "Not provided"} {idProofNumber || idProofNumberMasked ? "·••••" : ""}</dd></div>
                <div><dt className="text-slate-400">Vehicle</dt><dd>{vehicle.plateDisplay || "None"}</dd></div>
                <div><dt className="text-slate-400">Privacy consent</dt><dd>{consent ? `Accepted (${pageData.legalVersion})` : "Not accepted"}</dd></div>
              </dl>
              <label className="sr-only" htmlFor="website">Website</label>
              <input id="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} className="absolute -left-[10000px] h-px w-px" aria-hidden="true" />
            </div>
          )}

          {error && <p role="alert" className="mt-4 rounded-lg border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</p>}

          <div className="mt-6 flex justify-between gap-3">
            {stepIndex > 0 ? (
              <button type="button" onClick={previousStep} disabled={busy} className="rounded-lg border border-slate-700 px-4 py-3 text-sm font-semibold hover:bg-slate-800 disabled:opacity-50">Back</button>
            ) : <span />}
            {step === "REVIEW" ? (
              <button type="button" onClick={submit} disabled={busy} className="rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50">
                {busy ? "Submitting..." : "Submit pre-registration"}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try { await continueStep(); }
                  catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save this step."); }
                  finally { setBusy(false); }
                }}
                className="rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50"
              >
                {busy ? "Saving..." : "Save and continue"}
              </button>
            )}
          </div>
        </section>

        <p className="mt-4 text-center text-xs text-slate-500">Your progress is saved securely as you continue. This page is private; avoid sharing its link.</p>
      </div>
    </main>
  );
}
