# Udyam PAY — Frontend Implementation Report

## 1. Project Overview

**Udyam PAY** (`udyam-pay-frontend`) is a standalone React + TypeScript + Vite web application built as a sibling project to `udhyam-pay-backend`. It implements the verified Merchant POS & Financing Workspace, Admin Operations Console, Public QR Checkout Session Inspector, and honest Future-Ready preview surfaces (Utility Bill Payments, Customer Self-Service KYC/e-Sign/e-Mandate) strictly aligned with real backend contracts—without inventing fake APIs or modifying backend business logic.

- **Brand Identity**: Udyam PAY (`Udyam` + neon lime `PAY`)
- **Primary Architecture Pattern**: Centralized API client (`apiClient`) -> domain API modules -> TanStack Query server state + Zustand auth session -> role-guarded React Router views
- **Backend Modification Policy**: Zero modifications to `udhyam-pay-backend` source code (`git status --short` clean). Any backend fixes/missing contracts are explicitly flagged below as `BACKEND API REQUIRED` or `BACKEND CHANGE REQUIRED`.

---

## 2. Frontend Architecture

| Layer | Responsibility | Implementation |
| --- | --- | --- |
| **HTTP & Resilience** | Base URL, JSON envelope parsing, `Authorization: Bearer`, `X-Request-Id`, `Idempotency-Key`, `AbortSignal`, single-flight `401` refresh & replay | `src/lib/api/client.ts`, `src/lib/api/error.ts` |
| **Domain Services** | Typed wrappers for Auth, Merchant, Customer, Purchase, Checkout, Application, Offer, Ledger, Admin, Health | `src/lib/api/*Api.ts` |
| **Monetary Precision** | Exact integer-paise `bigint` math & `en-IN` INR formatting (zero IEEE-754 float math on ledger/offer sums) | `src/lib/money/paise.ts`, `src/components/financial/MoneyDisplay.tsx` |
| **Validation** | Strict schema checks matching backend constraints (E.164 phones, DPDP consent, INR amounts, tenures `1–36`, UUIDs) | `src/lib/validation/schemas.ts` |
| **Session & RBAC** | In-memory `accessToken`, `sessionStorage` refresh snapshot, role-based workspace redirects | `src/stores/authStore.ts`, `src/routes/guards.tsx` |
| **Data Fetching** | TanStack Query caching, request cancellation via `signal`, automated polling (`10s`) for async pending states | `src/app/App.tsx`, feature pages |

---

## 3. Folder Structure

```text
udyam-pay-frontend/
├── .env.example
├── index.html
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── vite.config.ts
├── vitest.config.ts
├── docs/
│   └── frontend/
│       └── FRONTEND_IMPLEMENTATION_REPORT.md
└── src/
    ├── vite-env.d.ts
    ├── main.tsx
    ├── index.css
    ├── test/
    │   └── setup.ts
    ├── app/
    │   ├── App.tsx
    │   └── router.tsx
    ├── components/
    │   ├── feedback/
    │   │   ├── AsyncPendingCard.tsx
    │   │   ├── BackendRequiredNotice.tsx
    │   │   ├── EmptyState.tsx
    │   │   ├── ErrorBoundary.tsx
    │   │   └── ErrorState.tsx
    │   ├── financial/
    │   │   ├── ApplicationTimeline.tsx
    │   │   ├── DemoModeBanner.tsx
    │   │   ├── KycPrimitives.tsx
    │   │   ├── MoneyDisplay.tsx
    │   │   ├── OfferCard.tsx
    │   │   ├── QrTicketCard.tsx
    │   │   └── StatusBadge.tsx
    │   └── ui/
    │       ├── Badge.tsx
    │       ├── BrandLogo.tsx
    │       ├── Button.tsx
    │       ├── Card.tsx
    │       ├── FormFields.tsx
    │       ├── Modal.tsx
    │       └── Skeleton.tsx
    ├── features/
    │   ├── admin/
    │   │   ├── AdminApplicationsPage.tsx
    │   │   ├── AdminAuditLogsPage.tsx
    │   │   ├── AdminLendersPage.tsx
    │   │   ├── AdminMerchantsPage.tsx
    │   │   ├── AdminOverviewPage.tsx
    │   │   └── AdminSettingsPage.tsx
    │   ├── checkout/
    │   │   ├── CheckoutScanPage.tsx
    │   │   └── checkout-and-admin.test.tsx
    │   ├── merchant/
    │   │   ├── FinancingWizardPage.tsx
    │   │   ├── MerchantApplicationDetailPage.tsx
    │   │   ├── MerchantApplicationsPage.tsx
    │   │   ├── MerchantCommissionsPage.tsx
    │   │   ├── MerchantOverviewPage.tsx
    │   │   ├── MerchantPurchasesPage.tsx
    │   │   ├── MerchantSettingsPage.tsx
    │   │   ├── MerchantShopsPage.tsx
    │   │   └── merchant-and-offers.test.tsx
    │   └── public/
    │       ├── AboutPage.tsx
    │       ├── FaqPage.tsx
    │       ├── LandingPage.tsx
    │       ├── LoginPage.tsx
    │       ├── PartnersPage.tsx
    │       ├── RegisterPage.tsx
    │       ├── UtilitiesPage.tsx
    │       └── auth-pages.test.tsx
    ├── hooks/
    │   └── useSessionBootstrap.ts
    ├── layouts/
    │   ├── DashboardLayout.tsx
    │   └── PublicLayout.tsx
    ├── lib/
    │   ├── api/
    │   │   ├── adminApi.ts
    │   │   ├── applicationApi.ts
    │   │   ├── authApi.ts
    │   │   ├── checkoutApi.ts
    │   │   ├── client.ts
    │   │   ├── client.test.ts
    │   │   ├── customerApi.ts
    │   │   ├── error.ts
    │   │   ├── healthApi.ts
    │   │   ├── ledgerApi.ts
    │   │   ├── merchantApi.ts
    │   │   ├── offerApi.ts
    │   │   └── purchaseApi.ts
    │   ├── config.ts
    │   ├── idempotency.ts
    │   ├── money/
    │   │   ├── paise.ts
    │   │   └── paise.test.ts
    │   ├── status-meta.ts
    │   ├── utils.ts
    │   └── validation/
    │       └── schemas.ts
    ├── routes/
    │   ├── guards.tsx
    │   └── guards.test.tsx
    ├── stores/
    │   └── authStore.ts
    └── types/
        ├── api.ts
        └── future.ts
```

---

## 4. Routing Table

| Route | Component | Access Control | Purpose |
| --- | --- | --- | --- |
| `/` | `LandingPage` | Public | Brand hero, platform overview, lender & POS capabilities |
| `/about` | `AboutPage` | Public | Architecture, security, and DPDP principles |
| `/partners` | `PartnersPage` | Public | Merchant partner onboarding & simulated demo lender details |
| `/utilities` | `UtilitiesPage` | Public | Utility bill categories preview with explicit `BackendRequiredNotice` |
| `/faq` | `FaqPage` | Public | Merchant/operator FAQ covering EMI modes & demo scenarios |
| `/checkout/:token` | `CheckoutScanPage` | Public | POS QR checkout inspection via token |
| `/login` | `LoginPage` | PublicOnly | Email/password login + role-based redirect |
| `/register` | `RegisterPage` | PublicOnly | Merchant owner registration (`PENDING_VERIFICATION` flow) |
| `/merchant` | `MerchantOverviewPage` | `MERCHANT_OWNER`, `MERCHANT_STAFF` | KPI metrics, application pipeline chart, recent activity |
| `/merchant/shops` | `MerchantShopsPage` | `MERCHANT_OWNER`, `MERCHANT_STAFF` | Storefront list & creation modal |
| `/merchant/financing/new` | `FinancingWizardPage` | `MERCHANT_OWNER`, `MERCHANT_STAFF` | 7-step POS financing wizard (Shop -> Customer -> Purchase/QR -> Draft -> Submit -> Offers -> Accept) |
| `/merchant/applications` | `MerchantApplicationsPage` | `MERCHANT_OWNER`, `MERCHANT_STAFF` | Paginated applications table |
| `/merchant/applications/:id` | `MerchantApplicationDetailPage` | `MERCHANT_OWNER`, `MERCHANT_STAFF` | Application detail, offers marketplace, timeline, KYC readiness, cancel modal |
| `/merchant/purchases` | `MerchantPurchasesPage` | `MERCHANT_OWNER`, `MERCHANT_STAFF` | Paginated retail purchases + standalone QR generator |
| `/merchant/commissions` | `MerchantCommissionsPage` | `MERCHANT_OWNER`, `MERCHANT_STAFF` | Commission accrual/reversal summary & ledger entries |
| `/merchant/settings` | `MerchantSettingsPage` | `MERCHANT_OWNER`, `MERCHANT_STAFF` | Merchant verification status & profile summary |
| `/admin` | `AdminOverviewPage` | `ADMIN`, `SYSTEM_ADMIN`, `OPS_AGENT` | Audit summary KPI, API `/health` & `/ready` checks, quick ops links |
| `/admin/merchants` | `AdminMerchantsPage` | `ADMIN`, `SYSTEM_ADMIN`, `OPS_AGENT` | Verify or suspend merchant by UUID |
| `/admin/lenders` | `AdminLendersPage` | `ADMIN`, `SYSTEM_ADMIN`, `OPS_AGENT` | Update lender routing flags & timeouts by Lender UUID |
| `/admin/applications` | `AdminApplicationsPage` | `ADMIN`, `SYSTEM_ADMIN`, `OPS_AGENT` | UUID lookup, manual-review decision resolution, merchant commission lookup |
| `/admin/audit-logs` | `AdminAuditLogsPage` | `ADMIN`, `SYSTEM_ADMIN`, `OPS_AGENT` | Filterable immutable platform audit trail |
| `/admin/settings` | `AdminSettingsPage` | `ADMIN`, `SYSTEM_ADMIN`, `OPS_AGENT` | Operator role & runtime configuration view |
| `*` | `Navigate` (`to="/"`) | Public | Fallback redirect |

---

## 5. Backend Endpoints Integrated

Every endpoint below is verified against `udhyam-pay-backend` source routes:

- **System Health** (`healthApi.ts`)
  - `GET /health`
  - `GET /ready`
- **Authentication** (`authApi.ts`)
  - `POST /api/v1/auth/register`
  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/refresh`
  - `POST /api/v1/auth/logout`
  - (`GET /api/v1/auth/me` intentionally avoided for auth guard — see Section 8)
- **Merchants & Shops** (`merchantApi.ts`)
  - `GET /api/v1/merchants/me`
  - `GET /api/v1/merchants/shops`
  - `POST /api/v1/merchants/shops`
- **Customers & DPDP Consent** (`customerApi.ts`)
  - `POST /api/v1/customers`
  - `POST /api/v1/customers/:id/consents`
  - `DELETE /api/v1/customers/:customerId/consents/:consentId`
- **Purchases** (`purchaseApi.ts`)
  - `POST /api/v1/purchases` (sends `Idempotency-Key` header + body key)
  - `GET /api/v1/purchases?page=&pageSize=`
  - `GET /api/v1/purchases/:id`
- **Checkout QR Sessions** (`checkoutApi.ts`)
  - `POST /api/v1/checkout/sessions`
  - `GET /api/v1/checkout/sessions/:token` (public scan view)
- **Financing Applications** (`applicationApi.ts`)
  - `POST /api/v1/applications` (sends `Idempotency-Key` header + body key)
  - `POST /api/v1/applications/:id/submit`
  - `POST /api/v1/applications/:id/cancel`
  - `GET /api/v1/applications?page=&pageSize=`
  - `GET /api/v1/applications/:id`
  - `GET /api/v1/applications/:id/history`
- **Lender Offers** (`offerApi.ts`)
  - `GET /api/v1/applications/:id/offers`
  - `POST /api/v1/applications/:id/offers/:offerId/accept`
- **Commission Ledger** (`ledgerApi.ts`)
  - `GET /api/v1/ledger/commission?merchantId=&skip=&take=`
- **Admin Operations** (`adminApi.ts`)
  - `PATCH /api/v1/admin/merchants/:id/status`
  - `PUT /api/v1/admin/lenders/:id/config`
  - `GET /api/v1/admin/audit-logs?entityType=&entityId=`
  - `POST /api/v1/admin/applications/:id/manual-review`

---

## 6. Documented Backend Gaps (`BACKEND API REQUIRED` / `BACKEND CHANGE REQUIRED`)

No missing APIs were faked. All unsupported flows render `BackendRequiredNotice` components listing the exact contracts needed:

1. **Auth & Security Improvements (`BACKEND CHANGE REQUIRED`)**:
   - Protect `GET /api/v1/auth/me` with `authMiddleware` and return `{ user: { id, email, role, merchantId } }`.
   - Issue refresh tokens via `HttpOnly; Secure; SameSite=Strict` cookies and enable CORS `credentials: true` in `udhyam-pay-backend` (`src/app.ts`) for strict XSS-proof refresh persistence.
   - Support role-restricted route enforcement alignment on `GET /api/v1/admin/lenders` and BigInt coercion on `PUT /api/v1/admin/lenders/:id/config` (`minAmountPaise` / `maxAmountPaise` omitted in frontend payload currently to avoid JSON/BigInt serialization gaps).
2. **Self-Service Customer QR Completion (`BACKEND API REQUIRED`)** (`CheckoutScanPage.tsx`):
   - `POST /api/v1/checkout/sessions/:token/consent-and-submit`
   - `GET /api/v1/checkout/sessions/:token/offers`
   - `POST /api/v1/checkout/sessions/:token/offers/:offerId/accept`
   - `POST /api/v1/auth/customer/otp/send`
3. **Supplemental Underwriting Document Upload (`BACKEND API REQUIRED`)** (`MerchantApplicationDetailPage.tsx`):
   - `POST /api/v1/applications/:id/additional-info`
   - `POST /api/v1/documents/upload`
   - Plus future KYC/e-Sign/e-Mandate endpoints (`VerificationProgress` & `DocumentUploadPlaceholder` primitives in `src/components/financial/KycPrimitives.tsx`).
4. **Utility Service Platform (`BACKEND API REQUIRED`)** (`UtilitiesPage.tsx`):
   - Biller directory, bill fetch, BBPS payment initiation, and utility receipt endpoints across Electricity, Water, Piped Gas, Mobile Recharge, DTH, FASTag, and Broadband (`UtilityCategoryCode`).
5. **Admin & Merchant Operations List / Analytics APIs (`BACKEND API REQUIRED`)**:
   - Paginated admin directory list APIs (`GET /api/v1/admin/merchants`, `GET /api/v1/admin/lenders`, `GET /api/v1/admin/applications`) so Admin pages do not rely purely on UUID lookup (`AdminMerchantsPage.tsx`, `AdminLendersPage.tsx`, `AdminApplicationsPage.tsx`, `AdminOverviewPage.tsx`).
   - Merchant customer list, merchant staff invite/RBAC management, webhook event explorer, and settlement payout APIs.

---

## 7. Design System & Theme Decisions

- **Foundation**: Dark charcoal canvas (`#090A0C`), surface `#111317`, elevated panels `#181B21`, crisp hairline borders (`rgba(255,255,255,0.08)`).
- **Accent**: Neon lime (`#C8FF32`, hover `#D7FF66`) reserved strictly for primary CTAs, active navigation indicators, `0% EMI` callouts, and key financial highlights.
- **Demo Safety Signals**: Prominent `DEMO MODE` banner (`DemoModeBanner.tsx`) and `DEMO LENDER` offer pill (`OfferCard.tsx`) whenever `VITE_PROVIDER_MODE_LABEL=demo` or `offer.isSimulated === true`, plus interactive demo phone scenario chips inside `FinancingWizardPage` Step 2 (`+919876543210`, `+919876540010`, `+919876540001`, `+919876540002`, `+919876540007`).
- **Typography**: `Plus Jakarta Sans` UI sans-serif + `JetBrains Mono` monospace (`font-tabular`) loaded cleanly via Google Fonts in `index.html`.
- **Responsive Layout**: Collapsible mobile bottom navigation bar (`MERCHANT_BOTTOM_NAV` / Admin drawer) + desktop sidebar (`DashboardLayout.tsx`).

---

## 8. Authentication & Security Decisions

- **Access Token Storage**: Kept exclusively in JavaScript memory (`useAuthStore` in `src/stores/authStore.ts`); never written to `localStorage` or `sessionStorage`.
- **Refresh Persistence**: Because backend CORS currently specifies `credentials: false` and JSON refresh-token rotation, `refreshToken` and non-sensitive user identity metadata (`id`, `email`, `role`, `merchantId`) are stored in `sessionStorage` (`udyam_pay_session_v1`) to survive tab reloads while clearing when the browser tab closes. `localStorage` is untouched.
- **Single-Flight `401` Refresh**: `src/lib/api/client.ts` deduplicates concurrent `401 Unauthorized` refresh requests into one in-flight `refreshPromise` and replays queued callers with the rotated Bearer token. If refresh fails, session state clears cleanly.
- **Zero PII/KYC Browser Persistence**: Customer phone numbers, purchase metadata, PAN, Aadhaar, and bank account data are never persisted in browser storage.
- **Role-Based Route Protection**: `ProtectedRoute` (`src/routes/guards.tsx`) restricts `/merchant/*` strictly to `MERCHANT_OWNER` & `MERCHANT_STAFF`, and `/admin/*` strictly to `ADMIN`, `SYSTEM_ADMIN`, & `OPS_AGENT`. Unauthorized roles redirect deterministically to their own home portal.

---

## 9. Validation Rules Implemented (`src/lib/validation/schemas.ts`)

- **Login (`loginSchema`)**: Valid trimmed email; non-empty password.
- **Merchant Registration (`registerMerchantSchema`)**: Valid business email, password minimum 8 characters, legal name minimum 2 characters, optional trade name.
- **Shop Creation (`createShopSchema`)**: Name, city, state minimum 2 characters each.
- **Customer & DPDP Consent (`registerCustomerSchema`)**: Full name minimum 2 characters, E.164 phone `/^\+[1-9]\d{7,14}$/`, notice version, mandatory explicit `consentAccepted: true`.
- **Purchase (`createPurchaseSchema`)**: UUID `shopId`, optional UUID `customerId`, allowed `ProductCategory` enum (`SMARTPHONE`, `TELEVISION`, `REFRIGERATOR`, `WASHING_MACHINE`, `AIR_CONDITIONER`, `LAPTOP`, `OTHER_ELECTRONICS`), optional description `<= 255` chars, positive INR decimal amount converted exactly via `parseInrInputToPaise`.
- **Application Draft (`createApplicationSchema`)**: Positive requested INR amount, non-negative down payment INR amount (default `0`), integer tenure `1–36` months, routing mode (`SEQUENTIAL` | `DISCOVERY`).

---

## 10. State Management & Data Fetching Strategy

- **Server State**: TanStack Query v5 (`QueryClient` with stale times, retry safeguards, request cancellation via `signal`). `MerchantApplicationDetailPage` polls every `10,000ms` automatically while an application is in async pending states (`APPLICATION_STATUS_META[status].isAsyncPending`).
- **Client Auth State**: Zustand store (`useAuthStore`) wired to `apiClient` via `registerTokenBridge()`.
- **Exact Money Handling**: All API monetary fields (`*Paise` strings) stay in `bigint` via `toPaiseBigInt`, `sumPaise`, `parseInrInputToPaise`, and `formatPaiseToInr` (`en-IN` grouping).
- **Idempotency & Traceability**: `apiClient` injects unique `X-Request-Id` on every request and preserves `requestId` in `ApiClientError` for operator support banners; draft mutations (`purchases`, `applications`) attach persistent `Idempotency-Key` tokens via `createIdempotencyKey()`.

---

## 11. Verification & Test Results

All checks below ran cleanly after the final code edit:

| Check | Command | Result | Scope / Notes |
| --- | --- | --- | --- |
| **TypeScript Check** | `npm run typecheck` (`tsc --noEmit`) | **PASS** (0 errors) | Strict root TypeScript check |
| **TypeScript Project Build** | `npm run build` (`tsc -b && vite build`) | **PASS** (2500 modules transformed, built in 7.70s) | Strict `tsconfig.app.json` + `tsconfig.node.json` (`noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`) + production Vite bundle (`dist/assets/index-CzBL7PzJ.js`, 1,060.12 kB; chunk splitting optimization noted in Section 13) |
| **ESLint** | `npm run lint` (`eslint .`) | **PASS** (0 errors, 0 warnings) | All `src/**/*.{ts,tsx}` and config files |
| **Unit & Component Tests** | `npm test` (`vitest run`) | **PASS** (6 test files, 21/21 tests passed, 0 skipped, 0 failed) | jsdom + React Testing Library using mocked `globalThis.fetch` matching backend JSON contracts: `paise.test.ts` (4), `client.test.ts` (3), `guards.test.tsx` (3), `auth-pages.test.tsx` (2), `merchant-and-offers.test.tsx` (5), `checkout-and-admin.test.tsx` (4) |
| **Live Full-Stack E2E** | *Not run* | **NOT TESTED LOCALLY** | Backend `.env` / PostgreSQL instance was absent in the workspace (`Test-Path .env -> False`), so end-to-end live browser tests against `npm run start:demo` remain to be executed in a booted DB environment |

---

## 12. Backend Integrity Verification

Checked inside `C:\Users\NANDINI PATEL\OneDrive\Desktop\udhyam-pay-backend`:
- `git status --short`: **empty (clean working tree, zero backend files modified)**.
- `npm run typecheck` (`tsc --noEmit`): **PASS** (exit code 0).

---

## 13. Known Limitations

1. **Simulated Demo Environment**: When connected to a backend running in `mock` / `demo` mode, lender offers reflect deterministic simulated phone-suffix fixtures and carry `DEMO LENDER` warnings.
2. **Backend Directory Listings Missing**: Several Admin views (`AdminMerchantsPage`, `AdminLendersPage`, `AdminApplicationsPage`) operate by UUID lookup until paginated list endpoints are added to `udhyam-pay-backend`.
3. **Utility & Self-Service Customer Flows Gated**: Utility bill fetch/pay and customer mobile OTP completion stop cleanly at documented `BackendRequiredNotice` states rather than simulating fake payments.
4. **Bundle Optimization**: Vite emits a single main JS chunk (`dist/assets/index-CzBL7PzJ.js`, `1,060.12 kB`) because routes and Recharts/Framer Motion are statically imported; route-level `React.lazy()` code-splitting can be added before production CDN rollout.

---

## 14. Startup & Verification Instructions

### Frontend Setup & Dev Server

```powershell
cd "c:\Users\NANDINI PATEL\OneDrive\Desktop\udyam-pay-frontend"
copy .env.example .env
npm install
npm run dev
```

Frontend serves on `http://localhost:5173`. Ensure `udhyam-pay-backend` `.env` sets:

```env
CORS_ALLOWED_ORIGINS=http://localhost:5173
```

### Verification Commands

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

