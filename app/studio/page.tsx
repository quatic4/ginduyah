import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-nav";
import { Studio } from "@/components/studio/studio";
import "./studio.css";

export const metadata: Metadata = { title: "Team studio · Ginduyah", robots: { index: false, follow: false } };
export default function StudioPage() {
  return <><SiteHeader /><main className="studio"><Studio /></main></>;
}
