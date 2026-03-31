import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Platemate — Weekly Meal Planning",
    short_name: "Platemate",
    description:
      "Plan dinners, track nutrition, and generate grocery lists. Health-aware meal planning for couples.",
    start_url: "/",
    display: "standalone",
    background_color: "#FAF6F1",
    theme_color: "#B8462B",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
