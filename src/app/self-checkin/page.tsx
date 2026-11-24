import type { Metadata } from "next";
import { SelfCheckinClient } from "./SelfCheckinClient";

export const metadata: Metadata = {
  title: "Visitor Self Check-in",
  referrer: "no-referrer",
};

export default function SelfCheckinPage() {
  return <SelfCheckinClient />;
}
