import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, Cormorant_Garamond, DM_Sans, Fraunces, Josefin_Sans, Jost, Manrope, Nunito_Sans, Outfit, Playfair_Display } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { themesCss } from "@/lib/themes/css";
import { currentTheme } from "@/lib/themes/current";
import "./globals.css";

// The shipped design (« Forêt ») is preloaded; the other designs' families are
// declared too (self-hosted by next/font) and fetched only once a page uses them.
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-cormorant", display: "swap", preload: false });
const jost = Jost({ subsets: ["latin"], variable: "--font-jost", display: "swap", preload: false });
const josefin = Josefin_Sans({ subsets: ["latin"], variable: "--font-josefin", display: "swap", preload: false });
const nunito = Nunito_Sans({ subsets: ["latin"], variable: "--font-nunito", display: "swap", preload: false });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair", display: "swap", preload: false });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dmsans", display: "swap", preload: false });
const bodoni = Bodoni_Moda({ subsets: ["latin"], variable: "--font-bodoni", display: "swap", preload: false });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap", preload: false });

const FONT_CLASSES = [manrope, fraunces, cormorant, jost, josefin, nunito, playfair, dmSans, bodoni, outfit].map((font) => font.variable).join(" ");
const THEMES_CSS = themesCss();

export const metadata: Metadata = {
  title: {
    default: "MealMate",
    template: "%s · MealMate",
  },
  description:
    "Un compagnon qui grandit avec tes vrais repas. Nourris-le en photographiant ce que tu manges, fais-le marcher, joue avec lui.",
  applicationName: "MealMate",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MealMate",
  },
  formatDetection: { telephone: false },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

/** The status bar follows the design of the page (the device cookie, or the admin's default). */
export async function generateViewport(): Promise<Viewport> {
  const theme = await currentTheme();
  return {
    themeColor: theme.themeColor,
    colorScheme: theme.mode,
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const theme = await currentTheme();
  return (
    <html lang="fr" data-theme={theme.id} className={FONT_CLASSES}>
      <body className="font-sans antialiased">
        {/* The designs' variables (lib/themes/css.ts): inline, before anything paints, so a page never flashes another design. */}
        <style id="mm-themes" dangerouslySetInnerHTML={{ __html: THEMES_CSS }} />
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
