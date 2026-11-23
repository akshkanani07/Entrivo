import React from "react";
import { PairingClient } from "./PairingClient";

export const metadata = {
  title: "Pair Lobby Kiosk | Entrivo",
  description: "One-time hardware pairing for Entrivo lobby self-service kiosk terminals.",
};

export default function KioskPairPage() {
  return <PairingClient />;
}

