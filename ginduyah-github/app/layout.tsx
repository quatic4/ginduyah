import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ginduyah — Reddit Story Card Maker",
  description: "Turn Reddit posts into downloadable vertical PNG story cards.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
