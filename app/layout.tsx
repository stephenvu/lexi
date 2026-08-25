import type { Metadata } from "next";
import { Geist, Geist_Mono, Figtree, Outfit, Noto_Serif, Noto_Sans } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { TabBar } from "@/components/tab-bar";

const outfitHeading = Outfit({subsets:['latin'],variable:'--font-heading'});

const figtree = Figtree({subsets:['latin'],variable:'--font-sans'});

// Headword display face (`font-serif` utility — see the `--font-serif`
// override in app/globals.css) — headwords are always English, so just the
// latin subset.
const notoSerif = Noto_Serif({ subsets: ["latin"], variable: "--font-serif" });

// Translated word/meaning text (`font-noto` utility) — subsets cover the
// curated non-English languages that use Latin/Cyrillic script (Vietnamese,
// Spanish, French, German, Portuguese, Italian, Russian). Chinese/Japanese/
// Korean/Arabic/Hindi fall back to the browser's own system font for those
// scripts rather than loading 5 more Noto script-specific variants — see
// lib/languages.ts.
const notoSans = Noto_Sans({
  subsets: ["latin", "latin-ext", "vietnamese", "cyrillic"],
  variable: "--font-noto",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lexi — AI Dictionary",
  description: "An AI-powered English dictionary for language learners.",
  appleWebApp: {
    // capable intentionally omitted — it silently fails to render on this
    // Next.js version (rendered directly in the layout JSX instead).
    statusBarStyle: "default",
    title: "Lexi",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full",
        "antialiased",
        geistSans.variable,
        geistMono.variable,
        "font-sans",
        figtree.variable,
        outfitHeading.variable,
        notoSerif.variable,
        notoSans.variable
      )}
    >
      {/* Rendered directly (React 19 hoists title/meta/link into <head>
          regardless of where they're rendered) rather than via the
          Metadata API's appleWebApp.capable — that field silently fails
          to render on this Next.js version; see AGENTS.md. */}
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="theme-color" content="#008236" />
      <body className="min-h-full flex flex-col pb-24">
        {children}
        <TabBar />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
