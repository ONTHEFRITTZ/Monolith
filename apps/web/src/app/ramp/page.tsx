import type { Metadata } from "next";
import { OnOffRampView } from "@/components/ramp/OnOffRampView";

export const metadata: Metadata = {
  title: "Mon-olith · Fiat On/Off Ramp",
  description: "Institutional wiring, custody, and payout controls for the Mon-olith bridge.",
};

export default function RampPage() {
  return <OnOffRampView />;
}
