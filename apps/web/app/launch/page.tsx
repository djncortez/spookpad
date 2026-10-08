import type { Metadata } from "next";
import { LaunchWizard } from "@/components/LaunchWizard";

export const metadata: Metadata = { title: "Launch a coin · SpookPad" };

export default function LaunchPage() {
  return <LaunchWizard />;
}
