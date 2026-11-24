"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraCapture } from "@/components/visitor/CameraCapture";
import { SignatureCanvas } from "@/components/visitor/SignatureCanvas";
import { SelfCheckinPassScanner } from "./SelfCheckinPassScanner";

type Stage = "LOADING" | "IDENTIFY" | "WALKIN" | "OTP" | "DETAILS" | "WAITING" | "DONE" | "ERROR";
type Host = { id: string; name: string };
type Requirements = {
  requireCompany: boolean;
  requirePhone: boolean;
  requirePurpose: boolean;
  requireIdProof: boolean;
  requireIdNumber: boolean;
  requirePhoto: boolean;
  requireNda: boolean;
  requireHost: boolean;
};

const translations = {
  en: {
    title: "Visitor self check-in",
    scan: "Scan the current QR code shown at the reception desk.",
    invite: "Invitation code or pass",
    verify: "Continue",
    walkin: "I'm a walk-in visitor",
    email: "Email address",
    sendCode: "Send verification code",
    code: "6-digit email code",
    verifyCode: "Verify code",
    details: "Visitor details",
    name: "Full name",
    phone: "Phone",
    company: "Company",
    host: "Host",
    purpose: "Purpose of visit",
    idType: "ID proof type",
    idNumber: "ID proof number",
    photo: "Visitor photo",
    nda: "NDA signature",
    consent: "I consent to Entrivo processing my visitor details for access management.",
    submit: "Submit for confirmation",
    waiting: "Waiting for confirmation",
    done: "Confirmed. Please proceed to reception.",
    rejected: "This check-in was not approved. Please speak to reception.",
    expired: "This check-in session expired. Scan the current desk QR again.",
    offline: "You are offline. Reconnect to continue; no check-in was submitted.",
    unavailable: "Self check-in is unavailable. Please ask reception for help.",
  },
  hi: {
    title: "आगंतुक स्वयं चेक-इन",
    scan: "रिसेप्शन डेस्क पर दिख रहे वर्तमान QR कोड को स्कैन करें।",
    invite: "निमंत्रण कोड या पास",
    verify: "जारी रखें",
    walkin: "मैं बिना पूर्व निमंत्रण आया हूँ",
    email: "ईमेल पता",
    sendCode: "सत्यापन कोड भेजें",
    code: "6 अंकों का ईमेल कोड",
    verifyCode: "कोड सत्यापित करें",
    details: "आगंतुक विवरण",
    name: "पूरा नाम",
    phone: "फोन",
    company: "कंपनी",
    host: "मेज़बान",
    purpose: "आने का उद्देश्य",
    idType: "पहचान पत्र का प्रकार",
    idNumber: "पहचान पत्र संख्या",
    photo: "आगंतुक की फोटो",
    nda: "NDA हस्ताक्षर",
    consent: "मैं प्रवेश प्रबंधन के लिए Entrivo द्वारा मेरे आगंतुक विवरण के उपयोग से सहमत हूँ।",
    submit: "पुष्टि के लिए जमा करें",
    waiting: "पुष्टि की प्रतीक्षा है",
    done: "पुष्टि हो गई। कृपया रिसेप्शन पर जाएँ।",
    rejected: "चेक-इन स्वीकृत नहीं हुआ। कृपया रिसेप्शन से बात करें।",
    expired: "चेक-इन सत्र समाप्त हो गया। वर्तमान डेस्क QR फिर से स्कैन करें।",
    offline: "आप ऑफलाइन हैं। जारी रखने के लिए इंटरनेट से जुड़ें; चेक-इन जमा नहीं हुआ।",
    unavailable: "स्वयं चेक-इन उपलब्ध नहीं है। कृपया रिसेप्शन से सहायता लें।",
  },
  gu: {
    title: "મુલાકાતી સ્વ-ચેક-ઇન",
    scan: "રિસેપ્શન ડેસ્ક પર દર્શાવેલ વર્તમાન QR કોડ સ્કેન કરો.",
    invite: "આમંત્રણ કોડ અથવા પાસ",
    verify: "આગળ વધો",
    walkin: "હું વૉક-ઇન મુલાકાતી છું",
    email: "ઇમેઇલ સરનામું",
    sendCode: "ચકાસણી કોડ મોકલો",
    code: "6 અંકનો ઇમેઇલ કોડ",
    verifyCode: "કોડ ચકાસો",
    details: "મુલાકાતીની વિગતો",
    name: "પૂરું નામ",
    phone: "ફોન",
    company: "કંપની",
    host: "હોસ્ટ",
    purpose: "મુલાકાતનો હેતુ",
    idType: "ઓળખ પુરાવાનો પ્રકાર",
    idNumber: "ઓળખ પુરાવા નંબર",
    photo: "મુલાકાતીનો ફોટો",
    nda: "NDA સહી",
    consent: "ઍક્સેસ વ્યવસ્થાપન માટે Entrivo મારી મુલાકાતી વિગતો પર પ્રક્રિયા કરે તે માટે હું સંમત છું.",
    submit: "પુષ્ટિ માટે મોકલો",
    waiting: "પુષ્ટિની રાહ જોઈ રહ્યા છીએ",
    done: "પુષ્ટિ થઈ. કૃપા કરીને રિસેપ્શન પર જાઓ.",
    rejected: "ચેક-ઇન મંજૂર થયું નથી. કૃપા કરીને રિસેપ્શન સાથે વાત કરો.",
    expired: "ચેક-ઇન સત્ર સમાપ્ત થયું. વર્તમાન ડેસ્ક QR ફરી સ્કેન કરો.",
    offline: "તમે ઑફલાઇન છો. ચાલુ રાખવા માટે ફરીથી જોડાઓ; ચેક-ઇન સબમિટ થયું નથી.",
    unavailable: "સ્વ-ચેક-ઇન ઉપલબ્ધ નથી. કૃપા કરીને રિસેપ્શનની મદદ લો.",
  },
} as const;

export function SelfCheckinClient() {
  const [locale, setLocale] = useState<"en" | "hi" | "gu">("en");
  const [stage, setStage] = useState<Stage>("LOADING");
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const [sessionToken, setSessionToken] = useState("");
  const [hosts, setHosts] = useState<Host[]>([]);
  const [requirements, setRequirements] = useState<Requirements>({
    requireCompany: false,
    requirePhone: true,
    requirePurpose: false,
    requireIdProof: false,
    requireIdNumber: false,
    requirePhoto: false,
    requireNda: false,
    requireHost: true,
  });
  const [allowWalkIn, setAllowWalkIn] = useState(false);
  const [invitationCode, setInvitationCode] = useState("");
  const [method, setMethod] = useState<"PREREG_QR" | "WALKIN" | "">("");
  const [hostName, setHostName] = useState("");
  const [needsNda, setNeedsNda] = useState(false);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [hostEmployeeId, setHostEmployeeId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [idProofType, setIdProofType] = useState("");
  const [idProofNumber, setIdProofNumber] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [signatureUrl, setSignatureUrl] = useState("");
  const [consentGiven, setConsentGiven] = useState(false);
  const [consentVersion, setConsentVersion] = useState("v1.0");
  const [status, setStatus] = useState("");
  const [badgeNumber, setBadgeNumber] = useState("");
  const [parking, setParking] = useState("");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const submitIdempotencyKey = useRef<string | null>(null);
  const t = translations[locale];

  const request = useCallback(async (action: string, data: Record<string, unknown> = {}, idempotencyKey?: string) => {
    const response = await fetch("/api/public/self-checkin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify({ action, website: "", ...data }),
      cache: "no-store",
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) {
      throw new Error(result?.error || t.unavailable);
    }
    return result.data;
  }, [sessionToken, t.unavailable]);

  useEffect(() => {
    const updateOffline = () => setOffline(!navigator.onLine);
    updateOffline();
    window.addEventListener("online", updateOffline);
    window.addEventListener("offline", updateOffline);
    return () => {
      window.removeEventListener("online", updateOffline);
      window.removeEventListener("offline", updateOffline);
    };
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const token = fragment.get("deskToken") || "";
    window.history.replaceState(null, "", "/self-checkin");
    if (!token) {
      setStage("ERROR");
      setError(t.scan);
      return;
    }
    void fetch("/api/public/self-checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", deskToken: token, website: "" }),
      cache: "no-store",
    }).then(async (res) => {
      const result = await res.json().catch(() => null);
      if (!res.ok || !result?.success) throw new Error(result?.error || t.unavailable);
      setSessionToken(result.data.sessionToken);
      setHosts(result.data.hosts || []);
      if (result.data.requirements) setRequirements(result.data.requirements);
      setAllowWalkIn(Boolean(result.data.allowWalkIn));
      setConsentVersion(result.data.consentVersion || "v1.0");
      setStage("IDENTIFY");
    }).catch((err) => {
      setError(err instanceof Error ? err.message : t.unavailable);
      setStage("ERROR");
    });
  }, [t.scan, t.unavailable]);

  useEffect(() => {
    if (stage !== "WAITING" || !sessionToken) return;
    let active = true;
    const poll = async () => {
      if (!navigator.onLine) return;
      try {
        const data = await request("status");
        if (!active) return;
        setStatus(data.status);
        if (data.status === "COMPLETED") {
          setBadgeNumber(data.badgeNumber || "");
          setParking(data.parking ? `${data.parking.lot} · ${data.parking.slot}` : "");
          setStage("DONE");
        } else if (data.status === "REJECTED") {
          setStage("ERROR");
          setError(t.rejected);
        } else if (data.status === "EXPIRED") {
          setStage("ERROR");
          setError(t.expired);
        }
      } catch {
        if (active && navigator.onLine) setError(t.unavailable);
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 4000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [request, sessionToken, stage, t.expired, t.rejected, t.unavailable]);

  const identifyPass = async () => {
    setBusy(true);
    setError("");
    try {
      const data = await request("identify", { invitationCode: extractPassCode(invitationCode) });
      setMethod("PREREG_QR");
      setHostName(data.hostName || "");
      setNeedsNda(Boolean(data.needsNda));
      setStage("DETAILS");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.unavailable);
    } finally {
      setBusy(false);
    }
  };

  const sendOtp = async () => {
    setBusy(true);
    setError("");
    try {
      await request("send-otp", { email });
      setMethod("WALKIN");
      setStage("OTP");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.unavailable);
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    setBusy(true);
    setError("");
    try {
      await request("verify-otp", { code: otp });
      setStage("DETAILS");
      setNeedsNda(requirements.requireNda);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.unavailable);
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!consentGiven) {
      setError("Consent is required to continue.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const idempotencyKey = submitIdempotencyKey.current || crypto.randomUUID();
      submitIdempotencyKey.current = idempotencyKey;
      const data = await request("submit", {
        consentGiven: true,
        consentVersion,
        photoUrl: photoUrl || undefined,
        signatureUrl: signatureUrl || undefined,
        ...(method === "WALKIN" ? {
          name,
          email,
          phone,
          company: company || undefined,
          hostEmployeeId,
          purpose: purpose || undefined,
          idProofType: idProofType || undefined,
          idProofNumber: idProofNumber || undefined,
        } : {}),
        vehicle: vehiclePlate ? { plateDisplay: vehiclePlate, type: "OTHER" } : undefined,
      }, idempotencyKey);
      setStatus(data.status);
      if (data.status === "COMPLETED") {
        setBadgeNumber(data.badgeNumber || "");
        setParking(data.parking ? `${data.parking.lot} · ${data.parking.slot}` : "");
        setStage("DONE");
      } else {
        setHostName(data.waitingFor || hostName);
        setStage("WAITING");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.unavailable);
    } finally {
      setBusy(false);
    }
  };

  const inputClass = "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400";
  const buttonClass = "w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white disabled:opacity-50";

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900">
      <div className="mx-auto max-w-xl space-y-5">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Entrivo</p>
            <h1 className="text-2xl font-bold">{t.title}</h1>
          </div>
          <select
            aria-label="Language"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2"
            value={locale}
            onChange={(event) => setLocale(event.target.value as "en" | "hi" | "gu")}
          >
            <option value="en">English</option>
            <option value="hi">हिन्दी</option>
            <option value="gu">ગુજરાતી</option>
          </select>
        </header>

        {offline && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">{t.offline}</div>}
        {error && <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-rose-800">{error}</div>}

        {stage === "LOADING" && <div className="rounded-2xl bg-white p-6 text-center shadow">{t.scan}</div>}
        {stage === "IDENTIFY" && (
          <section className="space-y-4 rounded-2xl bg-white p-5 shadow">
            <p className="text-slate-600">{t.scan}</p>
            <SelfCheckinPassScanner onScan={(value) => {
              setInvitationCode(extractPassCode(value));
              setError("");
            }} />
            <label className="block space-y-2">
              <span className="font-medium">{t.invite}</span>
              <input className={inputClass} value={invitationCode} onChange={(event) => setInvitationCode(event.target.value)} autoComplete="off" />
            </label>
            <button type="button" className={buttonClass} disabled={busy || !invitationCode || offline} onClick={() => void identifyPass()}>{t.verify}</button>
            {allowWalkIn && <button type="button" className="w-full rounded-xl border border-indigo-300 px-4 py-3 font-semibold text-indigo-700 disabled:opacity-50" disabled={offline} onClick={() => setStage("WALKIN")}>{t.walkin}</button>}
          </section>
        )}
        {stage === "WALKIN" && (
          <section className="space-y-4 rounded-2xl bg-white p-5 shadow">
            <label className="block space-y-2">
              <span className="font-medium">{t.email}</span>
              <input type="email" autoComplete="email" className={inputClass} value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <button type="button" className={buttonClass} disabled={busy || offline || !email} onClick={() => void sendOtp()}>{t.sendCode}</button>
          </section>
        )}
        {stage === "OTP" && (
          <section className="space-y-4 rounded-2xl bg-white p-5 shadow">
            <p className="text-slate-600">A verification code was sent to {email}.</p>
            <label className="block space-y-2">
              <span className="font-medium">{t.code}</span>
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} className={inputClass} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} />
            </label>
            <button type="button" className={buttonClass} disabled={busy || offline || otp.length !== 6} onClick={() => void verifyOtp()}>{t.verifyCode}</button>
          </section>
        )}
        {stage === "DETAILS" && (
          <section className="space-y-5 rounded-2xl bg-white p-5 shadow">
            <h2 className="text-lg font-semibold">{t.details}</h2>
            {method === "WALKIN" && (
              <>
                <input className={inputClass} placeholder={t.name} value={name} onChange={(event) => setName(event.target.value)} />
                <input className={inputClass} placeholder={t.phone} inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
                <input className={inputClass} placeholder={t.company} value={company} onChange={(event) => setCompany(event.target.value)} />
                <select className={inputClass} aria-label={t.host} value={hostEmployeeId} onChange={(event) => setHostEmployeeId(event.target.value)}>
                  <option value="">{t.host}</option>
                  {hosts.map((host) => <option key={host.id} value={host.id}>{host.name}</option>)}
                </select>
                <input className={inputClass} placeholder={t.purpose} value={purpose} onChange={(event) => setPurpose(event.target.value)} />
                <input className={inputClass} placeholder={t.idType} value={idProofType} onChange={(event) => setIdProofType(event.target.value)} />
                <input className={inputClass} placeholder={t.idNumber} value={idProofNumber} onChange={(event) => setIdProofNumber(event.target.value)} />
              </>
            )}
            {method === "PREREG_QR" && hostName && <p className="rounded-xl bg-indigo-50 p-3 text-sm">Host: {hostName}</p>}
            <input className={inputClass} placeholder="Vehicle plate (optional)" value={vehiclePlate} onChange={(event) => setVehiclePlate(event.target.value.toUpperCase())} />
            {requirements.requirePhoto && (
              <div className="space-y-2">
                <h3 className="font-medium">{t.photo}</h3>
                <CameraCapture autoStart={false} onCapture={setPhotoUrl} onClear={() => setPhotoUrl("")} />
              </div>
            )}
            {needsNda && (
              <div className="space-y-2">
                <h3 className="font-medium">{t.nda}</h3>
                <SignatureCanvas onSave={setSignatureUrl} onClear={() => setSignatureUrl("")} />
              </div>
            )}
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={consentGiven} onChange={(event) => setConsentGiven(event.target.checked)} />
              <span>{t.consent}</span>
            </label>
            <button type="button" className={buttonClass} disabled={busy || offline || (requirements.requirePhoto && !photoUrl) || (needsNda && !signatureUrl)} onClick={() => void submit()}>{t.submit}</button>
          </section>
        )}
        {stage === "WAITING" && (
          <section className="space-y-3 rounded-2xl bg-white p-6 text-center shadow" aria-live="polite">
            <div className="mx-auto h-10 w-10 animate-pulse rounded-full bg-indigo-100" />
            <h2 className="text-lg font-semibold">{t.waiting}</h2>
            <p className="text-slate-600">Waiting for {hostName || "reception"}.</p>
            <p className="text-xs text-slate-500">{status}</p>
          </section>
        )}
        {stage === "DONE" && (
          <section className="space-y-3 rounded-2xl bg-white p-6 text-center shadow" aria-live="polite">
            <h2 className="text-xl font-bold text-emerald-700">{t.done}</h2>
            {badgeNumber && <p className="text-slate-700">Badge number: <strong>{badgeNumber}</strong></p>}
            {parking && <p className="text-slate-700">Parking: <strong>{parking}</strong></p>}
          </section>
        )}
        {stage === "ERROR" && !error && <div className="rounded-2xl bg-white p-6 text-center shadow">{t.unavailable}</div>}
      </div>
    </main>
  );
}

function extractPassCode(value: string): string {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/pass\/([^/]+)\/?$/);
    if (match) return decodeURIComponent(match[1]);
  } catch {
    return trimmed;
  }
  return trimmed;
}
