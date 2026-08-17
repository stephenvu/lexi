import type { MetadataRoute } from "next"

// Colors below are hex equivalents of app/globals.css's --primary/--background
// tokens (oklch(0.527 0.154 150.069) / oklch(0.973 0.004 210)) — manifest
// colors don't support oklch(), so these are resolved once here rather than
// duplicating the design tokens in a second, driftable place.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lexi — AI Dictionary",
    short_name: "Lexi",
    description: "An AI-powered English dictionary for language learners.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f7f7",
    theme_color: "#008236",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
