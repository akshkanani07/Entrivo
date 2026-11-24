"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { DEFAULT_LOCALE, normalizeLocale, type Locale } from "@/i18n/locale";
import { persistLocalePreference } from "@/i18n/client";
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
function stepKey(step: Step): StepKey | null {
  return step === "REVIEW" ? null : step;
}

export function PreRegistrationWizard({ token }: { token: string }) {
  const router = useRouter();
  const requestLocale = normalizeLocale(useLocale()) ?? DEFAULT_LOCALE;
  const t = useTranslations("preregistration");
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
  const [locale, setLocale] = useState<Locale>(requestLocale);
  const [consent, setConsent] = useState(false);
  const [signatureSaved, setSignatureSaved] = useState(false);
  const [signatureData, setSignatureData] = useState("");

  const visibleSteps = useMemo(
    () => steps.filter((item) => item !== "NDA" || pageData?.requirements.requiresNda),
    [pageData]
  );
  const stepNames: Record<Step, string> = {
    LANGUAGE: t("stepLanguage"),
    PERSONAL: t("stepPersonal"),
    ID: t("stepId"),
    PHOTO: t("stepPhoto"),
    VEHICLE: t("stepVehicle"),
    PRIVACY: t("stepPrivacy"),
    NDA: t("stepNda"),
    REVIEW: t("stepReview"),
  };

  async function changeLocale(value: string) {
    const nextLocale = normalizeLocale(value);
    if (!nextLocale) {
      setError(t("invalidLocale"));
      return;
    }
    try {
      await persistLocalePreference(nextLocale);
      setLocale(nextLocale);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error && cause.message !== "LOCALE_CHANGE_FAILED"
        ? cause.message
        : t("localeSaveFailed"));
    }
  }

  useEffect(() => {
    let active = true;
    fetch(`/api/public/preregister/${encodeURIComponent(token)}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
      .then(async (res) => {
        const result = await res.json();
        if (!res.ok || !result.success) throw new Error(result.error || t("linkUnavailable"));
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
        setLocale(requestLocale);
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
  }, [requestLocale, router, t, token]);

  async function save(stepName: StepKey, data: Record<string, unknown>) {
    const res = await fetch(`/api/public/preregister/${encodeURIComponent(token)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: stepName, data }),
    });
    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.error || t("saveFailed"));
  }

  async function continueStep() {
    setError("");
    const currentKey = stepKey(step);
    if (currentKey) {
      if (currentKey === "LANGUAGE") {
        await save(currentKey, { locale });
      } else if (currentKey === "PERSONAL") {
        if (!personal.name.trim() || (pageData?.requirements.requirePhone && !personal.phone.trim())) {
          setError(t("personalRequired"));
          return;
        }
        await save(currentKey, personal);
      } else if (currentKey === "ID") {
        if (pageData?.requirements.requireIdProof && !idProofType) {
          setError(t("idTypeRequired"));
          return;
        }
        if (
          pageData?.requirements.requireIdNumber &&
          !idProofNumber.trim() &&
          (!idProofNumberMasked || pageData.draft.idNumberNeedsReentry)
        ) {
          setError(t("idNumberReentry"));
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
          setError(t("photoRequired"));
          return;
        }
      } else if (currentKey === "VEHICLE") {
        await save(currentKey, vehicle);
      } else if (currentKey === "PRIVACY") {
        if (!consent) {
          setError(t("consentRequired"));
          return;
        }
        await save(currentKey, { locale, consent: true });
      } else if (currentKey === "NDA" && !pageData?.requirements.ndaAlreadyValid) {
        if (!signatureSaved) {
          setError(t("ndaSignatureRequired"));
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
      if (!res.ok || !result.success) throw new Error(result.error || t("submitFailed"));
      setSubmitted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("submitFailed"));
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
    return <main className="min-h-screen bg-slate-950 text-white grid place-items-center p-6">{t("loading")}</main>;
  }
  if (!pageData || error && !pageData) {
    return (
      <main className="min-h-screen bg-slate-950 text-white grid place-items-center p-6">
        <section className="max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
          <h1 className="text-xl font-bold">{t("linkUnavailable")}</h1>
          <p className="mt-2 text-sm text-slate-300">{error || t("contactHost")}</p>
        </section>
      </main>
    );
  }
  if (submitted) {
    return (
      <main className="min-h-screen bg-slate-950 text-white grid place-items-center p-6">
        <section className="max-w-md rounded-2xl border border-emerald-800 bg-slate-900 p-6 text-center">
          <h1 className="text-xl font-bold">{t("submittedTitle")}</h1>
          <p className="mt-2 text-sm text-slate-300">
            {t("submittedDescription", { host: pageData.invitation.hostName })}
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
          <h1 className="mt-2 text-2xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-sm text-slate-300">
            {t("visitWith", { host: pageData.invitation.hostName, date: new Date(pageData.invitation.date).toLocaleDateString() })}
          </p>
        </header>

        <nav aria-label={t("formProgress")} className="mb-6">
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
              {t("updateInformation", { reason: pageData.rejectionReason })}
            </p>
          )}
          {step === "LANGUAGE" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">{t("chooseLanguage")}</h2>
              <label className="block text-sm" htmlFor="locale">{t("language")}</label>
              <select id="locale" value={locale} onChange={(e) => changeLocale(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3">
                <option value="en">English</option><option value="hi">Hindi</option><option value="gu">Gujarati</option>
              </select>
            </div>
          )}

          {step === "PERSONAL" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">{t("personalDetails")}</h2>
              <label className="block text-sm" htmlFor="name">{t("nameRequired")}</label>
              <input id="name" autoComplete="name" value={personal.name} onChange={(e) => setPersonal({ ...personal, name: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3" />
              <label className="block text-sm" htmlFor="phone">{t("phone")}{pageData.requirements.requirePhone ? " *" : ""}</label>
              <input id="phone" type="tel" autoComplete="tel" value={personal.phone} onChange={(e) => setPersonal({ ...personal, phone: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3" />
              <label className="block text-sm" htmlFor="company">{t("company")}{pageData.requirements.requireCompany ? " *" : ""}</label>
              <input id="company" autoComplete="organization" value={personal.company} onChange={(e) => setPersonal({ ...personal, company: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3" />
              <p className="text-xs text-slate-400">{t("email")}: {pageData.visitor.email}</p>
            </div>
          )}

          {step === "ID" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">{t("governmentIdDetails")}</h2>
              <label className="block text-sm" htmlFor="idType">{t("idType")}{pageData.requirements.requireIdProof ? " *" : ""}</label>
              <select id="idType" value={idProofType} onChange={(e) => { setIdProofType(e.target.value); setIdProofNumber(""); }} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3">
                <option value="">{t("selectIdType")}</option><option>{t("aadhaar")}</option><option>{t("passport")}</option><option>{t("driverLicense")}</option><option>{t("nationalId")}</option><option>{t("other")}</option>
              </select>
              <label className="block text-sm" htmlFor="idNumber">{t("idNumber")}{pageData.requirements.requireIdNumber ? " *" : ""}</label>
              <input id="idNumber" type="password" inputMode="text" autoComplete="off" value={idProofNumber} onChange={(e) => setIdProofNumber(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3" />
              {idProofNumberMasked && !idProofNumber && <p className="text-xs text-slate-400">{pageData.draft.idNumberNeedsReentry ? t("maskedIdReentry", { id: idProofNumberMasked }) : t("maskedIdSaved", { id: idProofNumberMasked })}</p>}
              <p className="text-xs text-slate-400">{t("idProtection")}</p>
            </div>
          )}

          {step === "PHOTO" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">{t("visitorPhoto")}</h2>
              <p className="text-sm text-slate-300">{t("photoInstructions")}</p>
              <CameraCapture
                autoStart={false}
                initialImage={photo}
                onCapture={(dataUrl) => { setPhoto(dataUrl); }}
                onClear={() => setPhoto(null)}
              />
              {!pageData.requirements.requirePhoto && <p className="text-xs text-slate-400">{t("photoOptional")}</p>}
            </div>
          )}

          {step === "VEHICLE" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">{t("vehicleOptional")}</h2>
              <label className="block text-sm" htmlFor="plate">{t("vehiclePlate")}</label>
              <input id="plate" autoComplete="off" value={vehicle.plateDisplay} onChange={(e) => setVehicle({ ...vehicle, plateDisplay: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3" />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={vehicle.foreignPlate}
                  onChange={(e) => setVehicle({ ...vehicle, foreignPlate: e.target.checked })}
                />
                {t("foreignRegistration")}
              </label>
              <label className="block text-sm" htmlFor="vehicleType">{t("vehicleType")}</label>
              <select id="vehicleType" value={vehicle.type} onChange={(e) => setVehicle({ ...vehicle, type: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3">
                <option value="CAR">{t("car")}</option><option value="BIKE">{t("bike")}</option><option value="EV">{t("electricVehicle")}</option><option value="OTHER">{t("other")}</option>
              </select>
              <label className="block text-sm" htmlFor="vehicleMake">{t("makeOptional")}</label>
              <input id="vehicleMake" maxLength={80} value={vehicle.make} onChange={(e) => setVehicle({ ...vehicle, make: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3" />
              <label className="block text-sm" htmlFor="vehicleColor">{t("colorOptional")}</label>
              <input id="vehicleColor" maxLength={40} value={vehicle.color} onChange={(e) => setVehicle({ ...vehicle, color: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3" />
            </div>
          )}

          {step === "PRIVACY" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">{t("privacyConsentTitle")}</h2>
              <p className="text-sm leading-6 text-slate-300">
                {t("privacyNotice", { version: pageData.legalVersion })}
              </p>
              <p className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm">{pageData.bringIdChecklist}</p>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4" />
                <span>{t("privacyConsent")}</span>
              </label>
              <label className="block text-sm" htmlFor="localePrivacy">{t("preferredLanguage")}</label>
              <select id="localePrivacy" value={locale} onChange={(e) => changeLocale(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3">
                <option value="en">English</option><option value="hi">Hindi</option><option value="gu">Gujarati</option>
              </select>
            </div>
          )}

          {step === "NDA" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">{t("ndaTitle")}</h2>
              {pageData.requirements.ndaAlreadyValid ? (
                <p className="rounded-lg border border-emerald-800 bg-emerald-950/30 p-3 text-sm text-emerald-200">{t("ndaAlreadyValid")}</p>
              ) : (
                <>
                  <article className="max-h-60 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 p-4 text-sm leading-6 whitespace-pre-wrap" aria-label={t("ndaTerms")}>
                    {pageData.ndaContent}
                  </article>
                  <p className="text-xs text-slate-400">{t("agreementVersion", { version: pageData.ndaVersion || "current" })}</p>
                  <SignatureCanvas
                    onSave={(dataUrl) => { setSignatureData(dataUrl); setSignatureSaved(true); }}
                    onClear={() => { setSignatureData(""); setSignatureSaved(false); }}
                  />
                  {signatureSaved && <p className="text-xs text-emerald-300">{t("signatureSaved")}</p>}
                </>
              )}
            </div>
          )}

          {step === "REVIEW" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">{t("reviewSubmit")}</h2>
              <dl className="grid grid-cols-1 gap-3 text-sm">
                <div><dt className="text-slate-400">{t("name")}</dt><dd>{personal.name}</dd></div>
                <div><dt className="text-slate-400">{t("phone")}</dt><dd>{personal.phone}</dd></div>
                <div><dt className="text-slate-400">{t("company")}</dt><dd>{personal.company || t("notProvided")}</dd></div>
                <div><dt className="text-slate-400">{t("id")}</dt><dd>{idProofType || t("notProvided")} {idProofNumber || idProofNumberMasked ? "·••••" : ""}</dd></div>
                <div><dt className="text-slate-400">{t("vehicle")}</dt><dd>{vehicle.plateDisplay || t("none")}</dd></div>
                <div><dt className="text-slate-400">{t("privacyConsent")}</dt><dd>{consent ? t("acceptedVersion", { version: pageData.legalVersion }) : t("notAccepted")}</dd></div>
              </dl>
              <label className="sr-only" htmlFor="website">{t("website")}</label>
              <input id="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} className="absolute -left-[10000px] h-px w-px" aria-hidden="true" />
            </div>
          )}

          {error && <p role="alert" className="mt-4 rounded-lg border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</p>}

          <div className="mt-6 flex justify-between gap-3">
            {stepIndex > 0 ? (
              <button type="button" onClick={previousStep} disabled={busy} className="rounded-lg border border-slate-700 px-4 py-3 text-sm font-semibold hover:bg-slate-800 disabled:opacity-50">{t("back")}</button>
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
                {busy ? t("saving") : t("saveContinue")}
              </button>
            )}
          </div>
        </section>

        <p className="mt-4 text-center text-xs text-slate-500">{t("progressNotice")}</p>
      </div>
    </main>
  );
}
