import type { Metadata } from "next";
import { Geist, Geist_Mono, Figtree, Outfit } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Header } from "@/components/header";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { TabBar } from "@/components/tab-bar";

const outfitHeading = Outfit({subsets:['latin'],variable:'--font-heading'});

const figtree = Figtree({subsets:['latin'],variable:'--font-sans'});

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
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans", figtree.variable, outfitHeading.variable)}
    >
      {/* Rendered directly (React 19 hoists title/meta/link into <head>
          regardless of where they're rendered) rather than via the
          Metadata API's appleWebApp.capable — that field silently fails
          to render on this Next.js version; see AGENTS.md. */}
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="theme-color" content="#008236" />
      <body className="min-h-full flex flex-col pb-24">
        {children}
        <Header />
        <TabBar />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
