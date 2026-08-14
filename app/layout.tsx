import type { Metadata } from "next";
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://ginduyah.vercel.app"),
  title: "Ginduyah — Reddit Story Card Maker",
  description: "Turn Reddit posts, comments, and replies into downloadable story cards for Shorts, TikTok, and Reels.",
  icons: { icon: "/ginduyah-avatar.png", shortcut: "/ginduyah-avatar.png", apple: "/ginduyah-avatar.png" },
  openGraph: {
    title: "Ginduyah — Reddit Story Card Maker",
    description: "Turn Reddit posts, comments, and replies into scroll-stopping story cards.",
    url: "https://ginduyah.vercel.app",
    siteName: "Ginduyah",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ginduyah — Reddit Story Card Maker",
    description: "Turn Reddit posts, comments, and replies into scroll-stopping story cards.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<Analytics /><SpeedInsights /></body></html>;
}
