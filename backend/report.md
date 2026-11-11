# Udyam PAY — Complete Simplified API & Mock-vs-Real Report

This report lists **every API** across both repositories (`udhyam-pay-backend` and `udyam-pay-frontend`) in plain, simple language. It explains **who uses each API** (frontend vs backend-only) and **where real database logic vs mock/simulated data is used**.

---

## 1. Quick Summary (In Simple Words)

| Category | Count | Meaning |
| --- | --- | --- |
| **Total Backend HTTP Endpoints** | **34** | `2` health probes + `2` API doc endpoints + `29` `/api/v1` app routes + `1` lender webhook receiver |
| **Wrapped in Frontend (`src/lib/api/`)** | **31** | Typed API functions written in the frontend codebase |
| **Actively Called by Frontend UI** | **27** | Actually triggered by buttons, forms, pages, or login/session hooks |
| **Wrapped in Frontend, Unused in UI** | **4** | Coded in `src/lib/api/`, but no screen or button calls them yet |
| **Backend-Only (Never Called by Frontend)** | **3** | `1` server-to-server lender webhook + `2` OpenAPI JSON doc endpoints |
| **Live 3rd-Party External APIs Connected** | **0** | No live bank/NBFC HTTP APIs or BBPS utility APIs are wired yet |

### The 3 Simple Rules of "Real vs Mock" in Udyam PAY
1. **Everything saved in PostgreSQL is REAL:** User accounts, login/JWT tokens, merchants, shops, customers, consents, purchases, QR checkout sessions, applications, audit logs, and commission ledger entries all read/write real rows in PostgreSQL (via `PrismaStore`).
2. **Only Loan Underwriting / Loan Offers are MOCKED (in Dev Mode):** When an application is submitted, `PROVIDER_MODE` defaults to `'mock'` in non-production environments. It uses `JsonMockLenderAdapter` and local JSON files to generate **simulated** EMI loan offers (`isSimulated: true`). In `'sandbox'` or `'production'`, live lender APIs are **not built yet**, so lender calls fail closed (`AGGREGATOR_NOT_CONFIGURED`) and never generate fake offers.
3. **Frontend has a few hardcoded demo cards & unbuilt screens:** The public Partners page uses a hardcoded array, the Financing Wizard has quick-fill demo phone buttons, and unfinished features (like BBPS Utility Bills) display a clear "Backend API required" notice instead of faking data.

---

## 2. Complete Simplified API List

### Group A — System Health & Docs (`4` Endpoints)

| Method & Path | What It Does (Simple) | Frontend Usage | Mock or Real? |
| --- | --- | --- | --- |
| `GET /health` | Checks if the backend server is alive and returns uptime | **Yes** (`LandingPage`, `AdminOverviewPage`, `AdminSettingsPage`) | **Real** (live server status) |
| `GET /ready` | Checks if the backend can reach PostgreSQL | **Yes** (`AdminOverviewPage`, `AdminSettingsPage`) | **Real** (live DB query check) |
| `GET /docs` | Serves the backend OpenAPI specification JSON | **No** (Backend-only) | **Real** (serves `src/docs/openapi.json`) |
| `GET /api/docs` | Same as `/docs` (alternate URL) | **No** (Backend-only) | **Real** (serves `src/docs/openapi.json`) |

---

### Group B — Authentication & User Session (`5` Endpoints)

| Method & Path | What It Does (Simple) | Frontend Usage | Mock or Real? |
| --- | --- | --- | --- |
| `POST /api/v1/auth/register` | Creates a new merchant business, owner account, and login tokens | **Yes** (`RegisterPage`) | **Real** (DB + Argon2 password hashing + JWT) |
| `POST /api/v1/auth/login` | Logs in a merchant or admin user and returns access + refresh tokens | **Yes** (`LoginPage`) | **Real** (DB + JWT; demo logins exist if `seed-demo` ran) |
| `POST /api/v1/auth/refresh` | Exchanges a refresh token for a new access + refresh token pair | **Yes** (`useSessionBootstrap` on page load & `client.ts` on `401`) | **Real** (DB token rotation) |
| `POST /api/v1/auth/logout` | Logs out the user and invalidates their refresh/access tokens | **Yes** (`DashboardLayout` via `useLogout`) | **Real** (DB revocation + `tokenVersion` bump) |
| `GET /api/v1/auth/me` | Returns the current logged-in user (`id`, `email`, `role`, `merchantId`) | **Wrapped only (`authApi.getMe`), Unused in UI** | **Real** (JWT auth middleware fixed in backend) |

---

### Group C — Merchants & Shops (`3` Endpoints)

| Method & Path | What It Does (Simple) | Frontend Usage | Mock or Real? |
| --- | --- | --- | --- |
| `GET /api/v1/merchants/me` | Gets the logged-in merchant's business profile and verification status | **Yes** (`MerchantOverviewPage`, `MerchantSettingsPage`) | **Real** (PostgreSQL) |
| `POST /api/v1/merchants/shops` | Creates a new shop under the merchant (`VERIFIED` merchants only) | **Yes** (`MerchantShopsPage`) | **Real** (PostgreSQL) |
| `GET /api/v1/merchants/shops` | Lists all shops belonging to the logged-in merchant | **Yes** (`MerchantOverviewPage`, `MerchantShopsPage`, `MerchantPurchasesPage`, `MerchantApplicationsPage`, `FinancingWizardPage`) | **Real** (PostgreSQL) |

---

### Group D — Customers & Consent (`3` Endpoints)

| Method & Path | What It Does (Simple) | Frontend Usage | Mock or Real? |
| --- | --- | --- | --- |
| `POST /api/v1/customers` | Registers a customer (and records initial DPDP consent inline; `VERIFIED` merchants only) | **Yes** (`FinancingWizardPage`) | **Real** (PostgreSQL) |
| `POST /api/v1/customers/:id/consents` | Grants a new consent record for an existing customer (`VERIFIED` merchants only) | **Wrapped only (`customerApi.grantConsent`), Unused in UI** | **Real** (PostgreSQL) |
| `DELETE /api/v1/customers/:id/consents/:consentId` | Revokes a customer's consent (`PENDING_VERIFICATION` or `VERIFIED` merchants) | **Wrapped only (`customerApi.revokeConsent`), Unused in UI** | **Real** (PostgreSQL + strict owner checks) |

---

### Group E — Purchases / Orders (`3` Endpoints)

| Method & Path | What It Does (Simple) | Frontend Usage | Mock or Real? |
| --- | --- | --- | --- |
| `POST /api/v1/purchases` | Records a retail item purchase with atomic idempotency (`VERIFIED` merchants only) | **Yes** (`MerchantPurchasesPage`, `FinancingWizardPage`) | **Real** (PostgreSQL) |
| `GET /api/v1/purchases` | Lists paginated purchases for the logged-in merchant | **Yes** (`MerchantPurchasesPage`, `MerchantOverviewPage`) | **Real** (PostgreSQL) |
| `GET /api/v1/purchases/:id` | Gets details of one specific purchase | **Wrapped only (`purchaseApi.getPurchase`), Unused in UI** | **Real** (PostgreSQL) |

---

### Group F — POS QR Checkout (`2` Endpoints)

| Method & Path | What It Does (Simple) | Frontend Usage | Mock or Real? |
| --- | --- | --- | --- |
| `POST /api/v1/checkout/sessions` | Generates a QR checkout session link/token for a purchase (`VERIFIED` merchants only) | **Yes** (`MerchantPurchasesPage`, `FinancingWizardPage`) | **Real** (PostgreSQL) |
| `GET /api/v1/checkout/sessions/:token` | Public QR scan endpoint showing purchase/shop summary for the customer | **Yes** (`CheckoutScanPage`) | **Real** (PostgreSQL; customer self-submit flow after viewing is not built yet) |

---

### Group G — Financing / Loan Applications (`6` Endpoints)

| Method & Path | What It Does (Simple) | Frontend Usage | Mock or Real? |
| --- | --- | --- | --- |
| `POST /api/v1/applications` | Creates a financing application draft (`VERIFIED` merchants only) | **Yes** (`FinancingWizardPage`) | **Real** (saves application in PostgreSQL) |
| `POST /api/v1/applications/:id/submit` | Sends the application through the lender waterfall to get loan offers (`VERIFIED` merchants only) | **Yes** (`FinancingWizardPage`, `MerchantApplicationDetailPage`) | **Hybrid: Real DB + Mock Lenders (in Dev).** Saves status in PostgreSQL, then calls `JsonMockLenderAdapter` fixtures in mock mode (returns `isSimulated: true`). Fails closed in production because live lenders aren't wired yet. |
| `POST /api/v1/applications/:id/cancel` | Cancels an application (`PENDING_VERIFICATION` or `VERIFIED` merchants, or admin) | **Yes** (`MerchantApplicationDetailPage`) | **Real** (PostgreSQL) |
| `GET /api/v1/applications` | Lists paginated financing applications | **Yes** (`MerchantApplicationsPage`, `MerchantOverviewPage`) | **Real** (PostgreSQL) |
| `GET /api/v1/applications/:id` | Gets one application with its offers, purchase, and customer summary | **Yes** (`MerchantApplicationDetailPage`, `AdminApplicationsPage`) | **Real DB** (attached offers carry `isSimulated: true` if created in mock mode) |
| `GET /api/v1/applications/:id/history` | Gets the full status change timeline of an application | **Yes** (`MerchantApplicationDetailPage`) | **Real** (PostgreSQL) |

---

### Group H — Loan Offers (`2` Endpoints)

| Method & Path | What It Does (Simple) | Frontend Usage | Mock or Real? |
| --- | --- | --- | --- |
| `GET /api/v1/applications/:id/offers` | Lists active EMI loan offers for an application | **Yes** (`FinancingWizardPage`) | **Real DB rows from Mock Lenders (in Dev)** (`isSimulated: true` when generated from fixtures) |
| `POST /api/v1/applications/:id/offers/:offerId/accept` | Accepts one EMI offer and marks others superseded (`VERIFIED` merchants only) | **Yes** (`FinancingWizardPage`, `MerchantApplicationDetailPage`) | **Real DB transaction acting on Simulated Offers (in Dev)** |

---

### Group I — Commission Ledger (`1` Endpoint)

| Method & Path | What It Does (Simple) | Frontend Usage | Mock or Real? |
| --- | --- | --- | --- |
| `GET /api/v1/ledger/commission` | Gets commission totals (accrued, reversed, net) and ledger entries for a merchant | **Yes** (`MerchantOverviewPage`, `MerchantCommissionsPage`, `AdminApplicationsPage`) | **Real** (PostgreSQL; entries are created when disbursement webhooks fire) |

---

### Group J — Admin Controls (`4` Endpoints, Admin/Ops Roles Only)

| Method & Path | What It Does (Simple) | Frontend Usage | Mock or Real? |
| --- | --- | --- | --- |
| `PATCH /api/v1/admin/merchants/:id/status` | Updates merchant onboarding status (`PENDING_VERIFICATION`, `VERIFIED`, `SUSPENDED`) | **Yes** (`AdminMerchantsPage`) | **Real** (PostgreSQL) |
| `PUT /api/v1/admin/lenders/:id/config` | Enables/disables a lender or updates routing priority and rules | **Yes** (`AdminLendersPage`) | **Real** (PostgreSQL; seeded lenders in DB are marked `isSimulated: true`) |
| `GET /api/v1/admin/audit-logs` | Lists platform security and operational audit logs | **Yes** (`AdminOverviewPage`, `AdminAuditLogsPage`) | **Real** (PostgreSQL) |
| `POST /api/v1/admin/applications/:id/manual-review` | Resolves a manual review decision on a financing application | **Yes** (`AdminApplicationsPage`) | **Real** (PostgreSQL) |

---

### Group K — Inbound Lender Webhooks (`1` Endpoint)

| Method & Path | What It Does (Simple) | Frontend Usage | Mock or Real? |
| --- | --- | --- | --- |
| `POST /api/v1/webhooks/lenders/:code` | Receives async lender events (`LOAN_DISBURSED`, `DISBURSEMENT_SUCCESSFUL`, `LOAN_DECLINED`), verifies HMAC signature + timestamp, prevents replays, updates loan status, and accrues commission atomically | **No** (Backend S2S endpoint only) | **Real webhook engine, simulated callers in Dev:** Uses real crypto verification & DB transactions, triggered in dev/testing via scripts/curl with test secrets because no live lender hits it yet |

---

## 3. Frontend vs Backend Breakdown

### A. Actively Used in Frontend UI (`27` APIs)
- **Public & Health:** `GET /health`, `GET /ready`, `GET /api/v1/checkout/sessions/:token`
- **Auth:** `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`
- **Merchant Portal:** `GET /api/v1/merchants/me`, `GET /api/v1/merchants/shops`, `POST /api/v1/merchants/shops`, `POST /api/v1/customers`, `POST /api/v1/purchases`, `GET /api/v1/purchases`, `POST /api/v1/checkout/sessions`, `POST /api/v1/applications`, `POST /api/v1/applications/:id/submit`, `POST /api/v1/applications/:id/cancel`, `GET /api/v1/applications`, `GET /api/v1/applications/:id`, `GET /api/v1/applications/:id/history`, `GET /api/v1/applications/:id/offers`, `POST /api/v1/applications/:id/offers/:offerId/accept`, `GET /api/v1/ledger/commission`
- **Admin Console:** `PATCH /api/v1/admin/merchants/:id/status`, `PUT /api/v1/admin/lenders/:id/config`, `GET /api/v1/admin/audit-logs`, `POST /api/v1/admin/applications/:id/manual-review`

### B. Written in Frontend `src/lib/api/`, But Not Called by Any Screen Yet (`4` APIs)
1. `authApi.getMe()` -> `GET /api/v1/auth/me` *(Note: `AdminSettingsPage.tsx` still displays an older note mentioning `/auth/me` middleware bug; that backend bug has already been fixed.)*
2. `customerApi.grantConsent()` -> `POST /api/v1/customers/:id/consents` *(UI currently grants consent inline during `registerCustomer`)*
3. `customerApi.revokeConsent()` -> `DELETE /api/v1/customers/:id/consents/:consentId`
4. `purchaseApi.getPurchase()` -> `GET /api/v1/purchases/:id` *(UI currently reads purchases via the list table)*

### C. Backend-Only APIs (`3` APIs)
1. `POST /api/v1/webhooks/lenders/:code` — Server-to-server callback from lenders to Udyam PAY.
2. `GET /docs` — Raw OpenAPI JSON documentation.
3. `GET /api/docs` — Alias for `/docs`.

### D. Frontend Screens Waiting for New Backend APIs (Show `BackendRequiredNotice`)
Instead of faking features with mock responses, the frontend intentionally pauses these flows with a clear notice until backend endpoints are added:
- **Utility / BBPS Bill Pay (`UtilitiesPage.tsx`):** Missing `/api/v1/utilities/*` endpoints (`categories`, `providers`, `bills/fetch`, pay).
- **Customer Mobile Self-Service QR Completion (`CheckoutScanPage.tsx`):** Customer can view the QR purchase summary, but needs public/OTP routes (`.../consent-and-submit`, `.../offers`, `.../accept`) to finish checkout from their phone.
- **Additional Underwriting Document Upload (`MerchantApplicationDetailPage.tsx`):** Missing `POST /api/v1/applications/:id/additional-info` and `POST /api/v1/documents/upload`.
- **Merchant Staff & Customer Directory (`MerchantOverviewPage.tsx`, `MerchantSettingsPage.tsx`):** Missing `GET /api/v1/customers`, `/api/v1/merchants/staff`, `/api/v1/transactions`.
- **Admin Directories & Analytics (`AdminOverviewPage.tsx`, `AdminApplicationsPage.tsx`, `AdminMerchantsPage.tsx`, `AdminLendersPage.tsx`):** Missing list/analytics APIs (`GET /api/v1/admin/applications`, `/merchants`, `/lenders`, `/users`, `/analytics/overview`, `/transactions`, `/webhooks`). Admins currently look up records by UUID directly.

---

## 4. Exact Map of Mock Data vs Real Data

### Where Real Data Lives
- **Backend Database (`PostgreSQL` via `src/modules/persistence/prisma-store.ts`):** Every user, merchant, shop, customer, consent, purchase, QR session, financing application, status history, lender configuration, webhook event, commission ledger entry, and audit log is persisted in real tables. (`InMemoryStores` is used only in automated tests.)

### Where Mock / Simulated Data Lives in Backend
| File / Component | What It Mocks | When It Runs |
| --- | --- | --- |
| `src/modules/lenders/adapters/json-mock-lender.ts` | Generates simulated eligibility checks, delays, declines, and EMI loan offers (`isSimulated: true`) | Active when `PROVIDER_MODE=mock` (default in dev/test; forbidden in `NODE_ENV=production`) |
| `src/modules/lenders/fixtures/demo-lenders.json` | Defines 3 fake demo lenders (`DEMO_BANK_ALPHA`, `DEMO_NBFC_BETA`, `DEMO_GAMMA_CREDIT`) | Loaded by `provider-factory.ts` in `mock` mode (plus legacy test aliases `LENDER_ALPHA`, `LENDER_BETA`) |
| `src/modules/lenders/fixtures/scenario-fixtures.json` | Maps customer phone suffixes (`0001`–`0010`) to deterministic outcomes (`DECLINE`, `ADDITIONAL_INFO`, `TIMEOUT`, `ASYNC`, `PROMOTIONAL_ZERO_EMI`, etc.) | Used by `JsonMockLenderAdapter` during `POST /api/v1/applications/:id/submit` |
| `src/modules/lenders/fixtures/eligibility-rules.json` | Mock min/max amount, phone restriction, and category tenure rules | Used by `JsonMockLenderAdapter.checkEligibility()` |
| `src/modules/lenders/provider-factory.ts` | Instantiates `ProductionDisabledLenderAdapter` in `sandbox` / `production` mode (always returns `UNAVAILABLE` / `AGGREGATOR_NOT_CONFIGURED`, `isSimulated: false`) | Active when `PROVIDER_MODE=production` or `sandbox` (live aggregator client not implemented yet) |
| `prisma/seed-demo.ts` & `prisma/seed.ts` | Seeds sample demo lenders (`isSimulated: true`), sample admin (`admin@udyam.example`), and sample merchant/shop (`owner@apex.example` / `Apex Digital Retail Private Limited`) | Only when explicitly run via CLI seed command (blocked in production unless `ALLOW_DEMO_SEED=true`) |

### Where Hardcoded Demo Data Lives in Frontend (`udyam-pay-frontend/src/`)
| File | What Is Hardcoded / Demo | Makes API Call? |
| --- | --- | --- |
| `features/public/PartnersPage.tsx` | `DEMO_PARTNERS` static array (`DEMO_BANK_ALPHA`, `DEMO_NBFC_BETA`, `DEMO_GAMMA_CREDIT` rates/tickets) | **No** (pure static frontend array) |
| `features/merchant/FinancingWizardPage.tsx` | `DEMO_PHONE_SCENARIOS` preset buttons (`+919876543210`, `+919876540010`, etc.) to trigger backend phone-suffix mock scenarios | **Helper buttons only** (submits through real backend APIs) |
| `features/public/LandingPage.tsx` | Static `"SAMPLE PREVIEW / 0% EMI EXAMPLE"` illustration card (`₹10,833.33 / mo` on `₹65,000`) | **No** (visual marketing preview; page separately calls real `GET /health`) |
| `components/financial/DemoModeBanner.tsx` & `OfferCard.tsx` | Displays `DEMO` / `SIMULATED` badges whenever `VITE_PROVIDER_MODE_LABEL !== 'production'` or `offer.isSimulated === true` | **No** (UI safety indicator) |

