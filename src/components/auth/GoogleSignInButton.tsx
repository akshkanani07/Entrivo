"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface GoogleSignInButtonProps {
  onStart?: () => void;
  onError?: (msg: string) => void;
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
  const [loading, setLoading] = useState(false);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const isConfigured = Boolean(
    clientId && clientId.trim() !== "" && !clientId.startsWith("mock_")
  );

  useEffect(() => {
    if (!isConfigured || !clientId) return;

    const handleCredentialResponse = async (response: { credential: string }) => {
      setLoading(true);
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

        toast.success("Google Workspace identity verified!");
        router.push("/");
        router.refresh();
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Google authentication failed";
        onError?.(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    };

    const loadGoogleScript = () => {
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
        script.onload = () => initializeGIS();
        document.body.appendChild(script);
      } else {
        existingScript.addEventListener("load", initializeGIS);
      }
    };

    const initializeGIS = () => {
      if (!window.google?.accounts?.id || !btnContainerRef.current) return;

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredentialResponse,
      });

      window.google.accounts.id.renderButton(btnContainerRef.current, {
        theme: "filled_black",
        size: "large",
        width: 380,
        text: "continue_with",
        shape: "rectangular",
      });
    };

    loadGoogleScript();
  }, [clientId, isConfigured, onStart, onError, router]);

  if (!isConfigured) {
    return null;
  }

  return (
    <div className="w-full flex flex-col items-center justify-center my-3">
      {loading && (
        <div className="flex items-center gap-2 text-xs text-indigo-400 py-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Verifying Google Identity...</span>
        </div>
      )}
      <div ref={btnContainerRef} className="w-full flex justify-center min-h-[40px]" />
    </div>
  );
}

