"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteNav() {
  const pathname = usePathname();
  return <nav className="site-nav" aria-label="Main navigation">
    <Link href="/" aria-current={pathname === "/" ? "page" : undefined}>Reddit generator</Link>
    <Link href="/studio" aria-current={pathname === "/studio" ? "page" : undefined}>Team studio</Link>
    <Link href="/stats" aria-current={pathname === "/stats" ? "page" : undefined}>Site stats</Link>
  </nav>;
}

export function SiteHeader() {
  return <><header><Link href="/" className="brand" style={{ color: "inherit", textDecoration: "none" }}><span className="brand-mark"><img src="/ginduyah-avatar.png" alt="" /></span><span>ginduyah</span></Link><span className="studio-header-note">Made for the next upload.</span></header><SiteNav /></>;
}
