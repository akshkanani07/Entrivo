import { Suspense } from "react";
import { Metadata } from "next";
import { VerifyEmailClient } from "./VerifyEmailClient";

export const metadata: Metadata = {
  title: "Verify Workplace Email — Entrivo",
  description: "Confirm your registered workplace email address for Entrivo Access Management.",
};

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#070b14] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <VerifyEmailClient />
    </Suspense>
  );
}

