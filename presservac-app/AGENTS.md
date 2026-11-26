<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Presservac

App de acceso para clientes y equipo de Presservac (base de código tomada del proyecto Kliniu; **sin datos de Kliniu**).

- Local: `npm run dev -- -p 3100` · base local `npx prisma dev --name presservac` (puerto 51221) · `.env.local`.
- Roles: CUSTOMER → `/mi-cuenta`; ADMIN → `/admin` (pide `ADMIN_EXTRA_PIN`); demás roles → `/panel`.
- Login con pestañas Cliente / Administrador: `/login` y `/login?tipo=admin`.
- Paleta: azul #051C46, rojo #D60517, gris #CCCCCC.
- Integraciones (Odoo, WATI, Kommo, Wompi, Supabase, OpenAI) apagadas: sin variables configuradas.
- Cotizaciones (`/panel/cotizaciones`): primer paso del proceso. Basado en `SIMULADOR KLINIU.xlsm` (hojas PAPE/LAMINADO) y el formato `COTIZACIONES NOVIEMBRE 2026.xlsm`. Fórmulas en `lib/bag-pricing.ts`, textos de entrega/condiciones en `lib/quotation-terms.ts`, una sola pantalla de cotizar (`/panel/cotizaciones/nueva`, `_components/quote-builder.tsx`) que guarda todo con `POST /api/panel/quotations/full`; tarifas editables en `/panel/cotizaciones/tarifas` (AppConfig `quotation_pricing`). Consecutivo numérico desde 4823.
- Diseño (`/panel/diseno`): paso 2. Comercial pasa referencias desde la cotización (`DesignPanel`) → diseñador sube versión (queda en revisión interna) → `MODULE_DISENO_APROBAR` aprueba o pide cambios → el comercial (dueño de la cotización o quien pidió) da la aprobación final. Lógica en `lib/design.ts`; se guardan la versión actual + 5 anteriores. Archivos: Supabase si está configurado, si no `.data/diseno` (ignorado en git), siempre servidos por `/api/panel/diseno/archivo/[versionId]`.
- Producción (`/panel/planta`, `MODULE_PLANTA`): paso 3. Al dar comercial la aprobación final del arte se confirma la cantidad y se crea una `PlantOrder` con las fases copiadas de una `PlantRoute` (por ahora solo «Doypack», editable en `/panel/planta/fases`; las fases «solo impresos» se saltan solas). Las fases van en orden (no se inicia una si la anterior está abierta). Lógica en `lib/plant.ts`. Nada que ver con el `ProductionOrder` heredado de Kliniu (inyección).
- Pagos (`/panel/finanzas`, `MODULE_FINANZAS`, rol TESORERIA): paso entre cotización y diseño. Al pasar a diseño sin pago confirmado, los artes quedan `AWAITING_PAYMENT` y la cotización `paymentStatus=REQUESTED`; financiera confirma (anticipo/total/crédito → `QuotationPayment`) y eso los libera a `PENDING`. Comprobantes en `.data/pagos` (o Supabase). Lógica en `lib/finance.ts`.
- Local: `DATABASE_POOL_MAX=1` en `.env.local` porque `prisma dev` cierra conexiones concurrentes ("ConnectionClosed").
- Después de producción (`lib/fulfillment.ts`, `PlantOrder.stage`): producción «Libera a despacho» (`MODULE_PLANTA` crear) → financiera verifica saldo (`/panel/finanzas?tab=saldos`: saldo / ya pagado / crédito) → logística coordina en `/panel/despachos` (`MODULE_LOGISTICA`; vehículo propio, transportadora o recoge) → conductor entra sin sesión por `/entrega/<token>` y registra firma + fotos (o logística lo registra) → financiera «Finaliza pedido» (`?tab=cerrar`). Evidencias en `.data/entregas`. El `/panel/logistica` y `/conductor` heredados de Kliniu no se usan en este flujo.
