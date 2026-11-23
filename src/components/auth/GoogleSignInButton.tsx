"use client";

import React, { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface GoogleSignInButtonProps {
  onStart?: () => void;
  onError?: (msg: string) => void;
}

interface GoogleOnboarding {
  token: string;
  email: string;
  name: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              shape?: "rectangular" | "pill" | "circle" | "square";
              logo_alignment?: "left" | "center";
              width?: string | number;
            }
          ) => void;
          prompt: () => void;
        };
      };
    };
  }
}

export function GoogleSignInButton({ onStart, onError }: GoogleSignInButtonProps) {
  const router = useRouter();
  const btnContainerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [onboarding, setOnboarding] = useState<GoogleOnboarding | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const isConfigured = Boolean(
    clientId && clientId.trim() !== "" && !clientId.startsWith("mock_")
  );

  const showError = (error: unknown, fallback: string) => {
    const message = error instanceof Error ? error.message : fallback;
    setFormError(message);
    onError?.(message);
    toast.error(message);
  };

  const completeSignIn = () => {
    toast.success("Google authentication successful!");
    router.push("/");
    router.refresh();
  };

  const handleCredentialResponse = async (response: { credential: string }) => {
    setLoading(true);
    setFormError(null);
    onStart?.();
    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: response.credential }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Google authentication failed");
      }

      if (data.needsOnboarding && data.onboardingToken) {
        setOnboarding({
          token: data.onboardingToken,
          email: data.identity.email,
          name: data.identity.name,
        });
        setFullName(data.identity.name);
        return;
      }
      if (data.requires2FA && data.challengeToken) {
        setChallengeToken(data.challengeToken);
        toast.info("Enter your authenticator or backup code to continue.");
        return;
      }

      completeSignIn();
    } catch (error: unknown) {
      showError(error, "Google authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const credentialHandlerRef = useRef(handleCredentialResponse);
  credentialHandlerRef.current = handleCredentialResponse;

  const handleOnboardingSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onboarding || !agreeTerms) return;

    setLoading(true);
    setFormError(null);
    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          onboardingToken: onboarding.token,
          companyName,
          name: fullName,
          phone,
          agreeTerms,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Google signup failed");
      }
      completeSignIn();
    } catch (error: unknown) {
      showError(error, "Google signup failed");
    } finally {
      setLoading(false);
    }
  };

  const handleTwoFactorSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!challengeToken) return;

    setLoading(true);
    setFormError(null);
    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken, code: twoFactorCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Two-factor verification failed");
      }
      completeSignIn();
    } catch (error: unknown) {
      showError(error, "Two-factor verification failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isConfigured || !clientId) return;

    const initializeGIS = () => {
      if (!window.google?.accounts?.id || !btnContainerRef.current || initializedRef.current) return;

      initializedRef.current = true;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => credentialHandlerRef.current(response),
      });
      window.google.accounts.id.renderButton(btnContainerRef.current, {
        theme: "filled_black",
        size: "large",
        width: Math.max(200, btnContainerRef.current.clientWidth - 16),
        text: "continue_with",
        shape: "rectangular",
      });
    };

    if (window.google?.accounts?.id) {
      initializeGIS();
      return;
    }

    const existingScript = document.getElementById("google-gsi-script");
    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "google-gsi-script";
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = initializeGIS;
      document.body.appendChild(script);
    } else {
      existingScript.addEventListener("load", initializeGIS);
    }
  }, [clientId, isConfigured]);

  if (!isConfigured) return null;

  return (
    <div className="my-3 flex w-full flex-col items-center justify-center">
      {!onboarding && !challengeToken && (
        <div className="mb-5 flex w-full items-center gap-3 text-[11px] font-medium text-slate-500">
          <span className="h-px flex-1 bg-white/[0.09]" />
          <span>or continue with</span>
          <span className="h-px flex-1 bg-white/[0.09]" />
        </div>
      )}
      {loading && (
        <div className="flex items-center gap-2 text-xs text-indigo-400 py-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Verifying Google Identity...</span>
        </div>
      )}
      {!onboarding && !challengeToken && (
        <div
          ref={btnContainerRef}
          className="flex min-h-12 w-full items-center justify-center rounded-xl border border-slate-700/80 bg-slate-950/40 px-2 py-1 transition-colors hover:border-slate-500"
        />
      )}

      {formError && (
        <p role="alert" className="w-full mt-2 text-xs text-rose-300">
          {formError}
        </p>
      )}

      {onboarding && (
        <form onSubmit={handleOnboardingSubmit} className="w-full mt-4 space-y-3">
          <p className="text-sm font-semibold text-white">Set up your Entrivo workplace</p>
          <p className="text-xs text-slate-400">{onboarding.email}</p>
          <label className="block text-xs text-slate-300">
            Company / organization name
            <input
              required
              minLength={2}
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-slate-300">
            Full name
            <input
              required
              minLength={2}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-slate-300">
            Phone
            <input
              required
              minLength={7}
              type="tel"
              pattern="\+?[0-9\s().-]{7,20}"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="flex items-start gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={agreeTerms}
              onChange={(event) => setAgreeTerms(event.target.checked)}
              className="mt-0.5 accent-indigo-500"
            />
            <span>
              I agree to the{" "}
              <Link href="/terms" target="_blank" className="text-indigo-400 hover:underline">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" target="_blank" className="text-indigo-400 hover:underline">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          <button
            type="submit"
            disabled={loading || !agreeTerms}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Create workplace
          </button>
        </form>
      )}

      {challengeToken && (
        <form onSubmit={handleTwoFactorSubmit} className="w-full mt-4 space-y-3">
          <label className="block text-xs text-slate-300">
            Authenticator or backup code
            <input
              required
              value={twoFactorCode}
              onChange={(event) => setTwoFactorCode(event.target.value)}
              autoComplete="one-time-code"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Verify and sign in
          </button>
        </form>
      )}
    </div>
  );
}
