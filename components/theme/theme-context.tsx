"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { isThemeId, type ThemeId } from "@/lib/themes/catalog";

const ThemeIdContext = createContext<ThemeId | null>(null);

/** Gives the pages the design resolved for the account (the `(app)` layout), so server and client agree on the first render. */
export function ThemeProvider({ theme, children }: { theme: ThemeId; children: ReactNode }) {
  return <ThemeIdContext.Provider value={theme}>{children}</ThemeIdContext.Provider>;
}

function readDocumentTheme(): ThemeId | null {
  if (typeof document === "undefined") return null;
  const value = document.documentElement.dataset.theme;
  return isThemeId(value) ? value : null;
}

/**
 * The design in force on the page: the provider's value first (what the server
 * rendered), then whatever `data-theme` says once mounted, followed live (the
 * picker on « Plus » switches it at once, `ThemeSync` corrects the cookie's).
 */
export function useThemeId(): ThemeId {
  const provided = useContext(ThemeIdContext);
  const [live, setLive] = useState<ThemeId | null>(null);
  useEffect(() => {
    setLive(readDocumentTheme());
    const observer = new MutationObserver(() => setLive(readDocumentTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return live ?? provided ?? "foret";
}
