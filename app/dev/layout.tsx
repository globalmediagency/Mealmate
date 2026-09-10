import type { Metadata } from "next";

/** Never indexed: these pages are tooling, not product. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
