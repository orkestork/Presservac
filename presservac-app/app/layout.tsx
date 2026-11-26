import type { Metadata } from "next";
import { headers } from "next/headers";
import { DM_Sans, Figtree, Poppins } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { CartProvider } from "./components/cart-provider";
import { ProductsProvider } from "./components/products-provider";
import { SaleModeProvider } from "./components/sale-mode-provider";
import AuthHistoryGuard from "./components/auth-history-guard";
import ConditionalShell from "./components/conditional-shell";
import { ConfirmProvider } from "./components/confirm-dialog";
import CookieConsent from "./components/cookie-consent";
import { getProducts } from "@/lib/products";
import { getSessionFromCookies } from "@/lib/auth";
import { getUserById } from "@/lib/users";
import { getCartItemsForUser } from "@/lib/cart";
import { getSaleMode } from "@/lib/sale-mode";
import { MAIN_WHATSAPP, SITE_URL } from "@/lib/site";

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
});
// Tipografías del panel (estilo Workezt): DM Sans para texto y Poppins para títulos.
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
const poppins = Poppins({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-poppins" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Presservac — Empaques flexibles y al vacío",
    template: "%s — Presservac",
  },
  description: "Empaques flexibles, doypack y al vacío para la industria en Colombia.",
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
  },
};

const localBusinessJsonLd = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: "Presservac Colombia",
  url: SITE_URL,
  logo: `${SITE_URL}/logo.png`,
  image: `${SITE_URL}/logo.png`,
  telephone: `+${MAIN_WHATSAPP}`,
  address: {
    "@type": "PostalAddress",
    streetAddress: "Calle 4 #34a-48",
    addressLocality: "Bogotá",
    addressCountry: "CO",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const nonce = requestHeaders.get("x-nonce") ?? undefined;
  const pathname = requestHeaders.get("x-pathname") ?? "";
  const isAuthOnlyRoute = pathname.startsWith("/login") || pathname.startsWith("/registro") || pathname.startsWith("/conductor") || pathname.startsWith("/entrega") || pathname.startsWith("/seguimiento");

  const [initialProducts, session, initialSaleMode] = await Promise.all([
    isAuthOnlyRoute ? Promise.resolve([]) : getProducts(),
    getSessionFromCookies(),
    isAuthOnlyRoute ? Promise.resolve("cart" as const) : getSaleMode(),
  ]);
  const [currentUser, initialCartItems] = session
    ? await Promise.all([
        getUserById(session.userId).catch(() => null),
        isAuthOnlyRoute ? Promise.resolve([]) : getCartItemsForUser(session.userId).catch(() => []),
      ])
    : [null, []];
  const cartProviderKey = `${currentUser?.id ?? "guest"}:${initialCartItems
    .map((item) => `${item.id}:${item.cantidad}`)
    .join("|")}`;

  return (
    <html
      lang="es"
      className={`${figtree.variable} ${dmSans.variable} ${poppins.variable} h-full antialiased`}
      data-scroll-behavior="smooth"
      // La app Android del conductor (Capacitor) inyecta --safe-area-inset-* en el style antes de hidratar.
      suppressHydrationWarning
    >
      <head>
        {/* Consent Mode v2: todo denegado por defecto, antes de GTM; se concede si ya aceptó cookies. */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){window.dataLayer=window.dataLayer||[];function g(){dataLayer.push(arguments);}
g('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',wait_for_update:500});
try{if(localStorage.getItem('presservac_cookie_consent')==='accepted'){g('consent','update',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted',analytics_storage:'granted'});}}catch(e){}
})();`,
          }}
        />
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd) }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-[#050C14]">
        <AuthHistoryGuard />
        <ConfirmProvider>
          <SaleModeProvider initialMode={initialSaleMode}>
            <ProductsProvider initialProducts={initialProducts}>
              <CartProvider
                key={cartProviderKey}
                initialItems={initialCartItems}
                currentUserId={currentUser?.id ?? null}
              >
                <ConditionalShell
                  currentUser={
                    currentUser
                      ? { fullName: currentUser.fullName, role: currentUser.role, avatarUrl: currentUser.avatarUrl }
                      : null
                  }
                >
                  {children}
                </ConditionalShell>
              </CartProvider>
            </ProductsProvider>
          </SaleModeProvider>
        </ConfirmProvider>
        <SpeedInsights />
        <CookieConsent nonce={nonce} />
      </body>
    </html>
  );
}
