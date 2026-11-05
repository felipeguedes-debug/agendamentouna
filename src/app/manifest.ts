import type { MetadataRoute } from "next";

/** Web app manifest of the professional's PWA (PRD 11, D-76). The app opens on the day's agenda. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/pwa",
    name: "Agenda do profissional",
    short_name: "Agenda",
    description: "Agenda do dia, próximo atendimento e confirmações dos pacientes.",
    lang: "pt-BR",
    start_url: "/pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F4F6F5",
    theme_color: "#0F766E",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
