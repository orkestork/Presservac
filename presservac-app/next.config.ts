import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La caché persistente de desarrollo llegó a 1,3 GB en minutos y llenó el disco; se apaga en local.
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },
  // La generación de PDF usa Chromium. En Vercel no se puede empaquetar el
  // navegador de Playwright, así que se usa el binario de @sparticuz/chromium:
  // hay que incluirlo en el trace de las funciones y no dejar que Next lo
  // intente bundlear.
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core"],
  outputFileTracingIncludes: {
    // playwright-core lee browsers.json en runtime y el trace no lo detecta: sin él, todo PDF falla en Vercel.
    "/api/**/*": ["./node_modules/@sparticuz/chromium/bin/**/*", "./node_modules/playwright-core/*.json"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
  },
  async redirects() {
    // La pantalla vieja de empaque vive ahora dentro del panel (Operaciones → Empaque).
    // Módulos de Kliniu que Presservac no usa: fuera del menú y sus direcciones vuelven al panel.
    const sinUso = [
      "/panel/combos/:path*", "/panel/mis-combos/:path*", "/panel/outlet/:path*", "/panel/banners/:path*",
      "/panel/videos-soluciones/:path*", "/panel/material-comercial/:path*", "/panel/ensamble/:path*",
      "/panel/odoo/:path*", "/panel/produccion",
    ].map((source) => ({ source, destination: "/panel", permanent: false }));
    return [{ source: "/empaque/:path*", destination: "/panel/empaque", permanent: true }, ...sinUso];
  },
  async headers() {
    // CSP se genera por request (con nonce) en proxy.ts, no aquí.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
      {
        // La página del conductor comparte su ubicación; el resto del sitio la sigue bloqueando.
        source: "/conductor/:path*",
        headers: [{ key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" }],
      },
    ];
  },
};

export default nextConfig;
