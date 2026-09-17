import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-nav";
import { SiteStats } from "@/components/site-stats";
import "../studio/studio.css";
import "./stats.css";

export const metadata: Metadata = { title: "Site stats · Ginduyah" };
export default function StatsPage() {
  return <><SiteHeader /><main className="studio stats-page"><SiteStats /></main></>;
}
