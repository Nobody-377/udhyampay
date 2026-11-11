# Udyam PAY — Frontend Utilization Audit

**Audit Scope:** `udyam-pay-frontend` (Cross-referenced against `udhyam-pay-backend`)  
**Audit Nature:** Strictly read-only, evidence-based cross-layer code audit  
**Source of Truth:** Vite config, `package.json`, React Router configuration, domain API modules (`src/lib/api/*.ts`), Zustand store, Zod schemas, page components, and tests.

---

## 1. Executive Summary & Metrics

| Metric | Count / Finding | Notes |
| --- | --- | --- |
| Total non-`node_modules`/non-`dist`/non-`.git` files in `udyam-pay-frontend` | **95 files** | **70** runtime `src/` `.ts`/`.tsx` files + **6** `*.test.ts(x)` files + `src/test/setup.ts` + `src/index.css` + **17** root/config/docs files |
| Unimported runtime files in `src/` | **0** *(except `src/vite-env.d.ts` ambient Vite types)* | Note: `src/types/future.ts` has 3 import hits (`ClosingChecklistItem` & `BackendRequiredApiNotice`), though 3 of its 5 exports (`UtilityBillerProvider`, `UtilityBillFetchResponse`, `KycStepCode`) have `0` runtime refs |
| React Router `<Route>` definitions (`src/app/router.tsx`) | **23 route entries** | 19 unique feature page routes + `/merchant/*`, `/admin/*`, `*` catch-all fallback redirects |
| API client modules (`src/lib/api/*Api.ts`) | **11 domain modules** (+ `client.ts`, `error.ts`) | **31** API wrapper methods total |
| API client methods actively called in UI | **27 / 31** | **4 defined methods have 0 runtime UI callers** (`authApi.getMe`, `customerApi.grantConsent`, `customerApi.revokeConsent`, `purchaseApi.getPurchase`) |
| Declared `package.json` dependencies | **15 runtime**, **19 dev** | **1 completely unused local link dependency**: `"udyam-pay-backend": "file:../udhyam-pay-backend"` |
| Pages rendering `BackendRequiredNotice` for unimplemented backend APIs | **10 screens** | Utilities, Customer QR completion, Document upload / KYC / e-Sign / e-Mandate, Admin directories, Merchant analytics/staff/customers |
| Invented / fake backend endpoints called in API layer | **0** | All 31 FE API methods map 1:1 to real Express route handlers in `udhyam-pay-backend` (including `/auth/me`, which exists in backend but is miswired before auth middleware) |

---

## 2. Frontend → Backend Call Chain Audit

### A. Complete Route & Component Matrix (All Feature Pages)

| Route Path | Role Access (`guards.tsx`) | Page Component | Hooks / API Functions Called | HTTP Method & Backend Endpoint | Backend Status |
| --- | --- | :--- | :--- | :--- | :--- |
| `/` | Public | `LandingPage` | `healthApi.getHealth` | `GET /health` | Live (**Sample EMI Preview card** hardcoded in UI) |
| `/about` | Public | `AboutPage` | None | None (static architecture showcase) | Static UI |
| `/partners` | Public | `PartnersPage` | None | None | Static `DEMO_PARTNERS` array (`GET /lenders` missing) |
| `/utilities` | Public | `UtilitiesPage` | None | None | Interactive category UI + **`BackendRequiredNotice`** |
| `/faq` | Public | `FaqPage` | None | None | Static FAQ UI |
| `/checkout/:token` | Public | `CheckoutScanPage` | `checkoutApi.getPublicSession` | `GET /api/v1/checkout/sessions/:token` | Live read + **`BackendRequiredNotice`** for customer actions |
| `/login` | PublicOnly | `LoginPage` | `authApi.login` | `POST /api/v1/auth/login` | Live (+ demo quick-fill buttons in demo mode) |
| `/register` | PublicOnly | `RegisterPage` | `authApi.register` | `POST /api/v1/auth/register` | Live |
| `/merchant` | `MERCHANT_OWNER`, `MERCHANT_STAFF` | `MerchantOverviewPage` | `merchantApi.getMe`, `merchantApi.listShops`, `applicationApi.listApplications`, `purchaseApi.listPurchases`, `ledgerApi.getCommissionSummary` | `GET /merchants/me`, `/merchants/shops`, `/applications`, `/purchases`, `/ledger/commission` | Live + **`BackendRequiredNotice`** (staff/customers/settlements) |
| `/merchant/shops` | `MERCHANT_OWNER`, `MERCHANT_STAFF` | `MerchantShopsPage` | `merchantApi.listShops`, `merchantApi.createShop` | `GET/POST /api/v1/merchants/shops` | Live |
| `/merchant/purchases` | `MERCHANT_OWNER`, `MERCHANT_STAFF` | `MerchantPurchasesPage` | `purchaseApi.listPurchases`, `merchantApi.listShops`, `purchaseApi.createPurchase`, `checkoutApi.createSession` | `GET/POST /api/v1/purchases`, `GET /merchants/shops`, `POST /checkout/sessions` | Live (list item reused for detail modal; `getPurchase` uncalled) |
| `/merchant/financing/new` | `MERCHANT_OWNER`, `MERCHANT_STAFF` | `FinancingWizardPage` | `merchantApi.listShops`, `customerApi.registerCustomer`, `purchaseApi.createPurchase`, `checkoutApi.createSession`, `applicationApi.createApplication`, `applicationApi.submitApplication`, `offerApi.listOffers`, `offerApi.acceptOffer` | `GET /merchants/shops`, `POST /customers`, `POST /purchases`, `POST /checkout/sessions`, `POST /applications`, `POST /applications/:id/submit`, `GET /applications/:id/offers`, `POST /applications/:id/offers/:offerId/accept` | Live (+ demo phone suffix helper chips) |
| `/merchant/applications` | `MERCHANT_OWNER`, `MERCHANT_STAFF` | `MerchantApplicationsPage` | `applicationApi.listApplications`, `merchantApi.listShops` | `GET /api/v1/applications`, `GET /api/v1/merchants/shops` | Live |
| `/merchant/applications/:id` | `MERCHANT_OWNER`, `MERCHANT_STAFF` | `MerchantApplicationDetailPage` | `applicationApi.getApplication`, `applicationApi.getHistory`, `applicationApi.submitApplication`, `applicationApi.cancelApplication`, `offerApi.acceptOffer` | `GET /applications/:id`, `GET /applications/:id/history`, `POST /applications/:id/submit`, `POST /applications/:id/cancel`, `POST /applications/:id/offers/:offerId/accept` | Live (`10s` polling for async pending states) + **`DocumentUploadPlaceholder`**, **`VerificationProgress`** (hardcoded `PENDING`) + **`BackendRequiredNotice`** |
| `/merchant/commissions` | `MERCHANT_OWNER`, `MERCHANT_STAFF` | `MerchantCommissionsPage` | `ledgerApi.getCommissionSummary` | `GET /api/v1/ledger/commission` | Live |
| `/merchant/settings` | `MERCHANT_OWNER`, `MERCHANT_STAFF` | `MerchantSettingsPage` | `merchantApi.getMe` | `GET /api/v1/merchants/me` | Live + **`BackendRequiredNotice`** (`PATCH /merchants/me`, `/auth/me`, staff/bank endpoints missing) |
| `/admin` | `ADMIN`, `SYSTEM_ADMIN`, `OPS_AGENT` | `AdminOverviewPage` | `adminApi.listAuditLogs`, `healthApi.getHealth`, `healthApi.getReadiness` | `GET /api/v1/admin/audit-logs`, `GET /health`, `GET /ready` | Live + **`BackendRequiredNotice`** (platform KPIs/directories missing) |
| `/admin/merchants` | `ADMIN`, `SYSTEM_ADMIN`, `OPS_AGENT` | `AdminMerchantsPage` | `adminApi.updateMerchantStatus` | `PATCH /api/v1/admin/merchants/:id/status` | Live UUID action form + **`BackendRequiredNotice`** (`GET /admin/merchants` missing) |
| `/admin/lenders` | `ADMIN`, `SYSTEM_ADMIN`, `OPS_AGENT` | `AdminLendersPage` | `adminApi.updateLenderConfig` | `PUT /api/v1/admin/lenders/:id/config` | Live UUID form (omits `minAmountPaise`/`maxAmountPaise` due to backend BigInt/Zod gap) + **`BackendRequiredNotice`** (`GET /admin/lenders` missing) |
| `/admin/applications` | `ADMIN`, `SYSTEM_ADMIN`, `OPS_AGENT` | `AdminApplicationsPage` | `applicationApi.getApplication`, `adminApi.resolveManualReview`, `ledgerApi.getCommissionSummary` | `GET /applications/:id`, `POST /admin/applications/:id/manual-review`, `GET /ledger/commission?merchantId=` | Live UUID lookup + **`BackendRequiredNotice`** (`GET /admin/applications` missing) |
| `/admin/audit-logs` | `ADMIN`, `SYSTEM_ADMIN`, `OPS_AGENT` | `AdminAuditLogsPage` | `adminApi.listAuditLogs` | `GET /api/v1/admin/audit-logs` | Live |
| `/admin/settings` | `ADMIN`, `SYSTEM_ADMIN`, `OPS_AGENT` | `AdminSettingsPage` | `healthApi.getHealth`, `healthApi.getReadiness` | `GET /health`, `GET /ready` | Live + **`BackendRequiredNotice`** (`GET /auth/me` fix, `GET /admin/config`) |

*(Plus `<Route path="*" element={<Navigate to="/" replace />} />` and layout hooks: `useSessionBootstrap` calls `authApi.refresh` -> `POST /api/v1/auth/refresh`, `useLogout` in `DashboardLayout` calls `authApi.logout` -> `POST /api/v1/auth/logout`.)*

---

## 3. Unused Frontend Exports, Wrappers & Unwired Capabilities

### A. API Client Methods with Zero UI Callers (4 of 31)
1. `authApi.getMe` (`src/lib/api/authApi.ts:65`) — `run=0, test=0`. Intentionally left uncalled because backend `GET /api/v1/auth/me` is mounted before `authMiddleware`.
2. `customerApi.grantConsent` (`src/lib/api/customerApi.ts:28`) + `GrantConsentPayload` (`:11`) — `run=0, test=0`. `POST /api/v1/customers/:id/consents` is never invoked in UI (`FinancingWizardPage` only calls `POST /api/v1/customers` which bundles initial consent).
3. `customerApi.revokeConsent` (`src/lib/api/customerApi.ts:39`) — `run=0, test=0`. `DELETE /api/v1/customers/:id/consents/:consentId` has no UI button/screen.
4. `purchaseApi.getPurchase` (`src/lib/api/purchaseApi.ts:42`) — `run=0, test=0`. `MerchantPurchasesPage` inspects `selectedPurchase` directly from the `listPurchases` table cache rather than refetching `GET /api/v1/purchases/:id`.

### B. Unused Utilities, Store Helpers & Types (`run=0`)
- `maskPhone` (`src/lib/utils.ts:21`) — `run=0, test=0`. Meanwhile, `MerchantApplicationDetailPage.tsx:222` and `AdminApplicationsPage.tsx:138` render raw unmasked `customer.phone`.
- `isMerchantRole` (`src/stores/authStore.ts:118`) — `run=0, test=0`. (`DashboardLayout.tsx:79` only checks `isAdminRole(user?.role)`.)
- `formatBigIntIndian` (`src/lib/money/paise.ts`) — `run=0, test=2` (tested in unit tests; UI exclusively calls `formatPaiseToInr` / `MoneyDisplay`).
- `KycStepCard` (`src/components/financial/KycPrimitives.tsx`) — `run=0, test=0`. Exported alongside `DocumentUploadPlaceholder` and `VerificationProgress` for future aggregator KYC flows, but never imported individually outside `KycPrimitives.tsx`.
- `UtilityBillerProvider`, `UtilityBillFetchResponse`, `KycStepCode` (`src/types/future.ts:19,31,...`) — `run=0, test=0`. Future planning interfaces not yet imported by `UtilitiesPage` or `KycPrimitives`.
- `ShopStatus`, `CommissionEntryType`, `CommissionEntry` (`src/types/api.ts`) — `run=0` externally (unused outside `api.ts`).

### C. Unused Frontend Dependency
- `"udyam-pay-backend": "file:../udhyam-pay-backend"` in `udyam-pay-frontend/package.json:29` — Zero TypeScript or bundler imports anywhere in `src/` or config files (the 2 text matches found for `"udyam-pay-backend"` are documentation strings in `UtilitiesPage.tsx:141` and `FaqPage.tsx:19`).

---

## 4. Ignored Backend Response Fields & Mocked / Planned UI Surfaces

### A. Backend Data Returned by APIs but Ignored/Hidden in Frontend UI
1. **`FinancingOffer` (`src/components/financial/OfferCard.tsx`, `src/types/api.ts`)**: `OfferCard` displays `lenderOfferReference`, `isSimulated`, `offerStatus`, `emiPaise`, `tenureMonths`, `principalPaise`, `interestRatePercent`, `rateType`, `processingFeePaise`, `totalRepayablePaise`, and `offerType`. It ignores: `downPaymentPaise`, `aprPercent`, `taxesPaise`, `otherChargesPaise`, `repaymentSchedule`, `termsVersion`, `termsUrl`, `expiresAt`, and `lenderId` / `lenderApplicationId`.
2. **`Merchant` (`MerchantOverviewPage.tsx`, `MerchantSettingsPage.tsx`)**: `Merchant.suspendedAt` is typed in `api.ts` and returned by `GET /merchants/me`, but never displayed (only `status`, `verifiedAt`, and `suspensionReason` appear).
3. **`FinancingApplication` (`MerchantApplicationsPage.tsx`, `MerchantApplicationDetailPage.tsx`)**: `version`, `expiresAt`, `terminalAt`, `submittedAt`, `createdByUserId`, and `idempotencyKey` are returned by the API but largely undisplayed in application tables/headers.
4. **`CommissionEntry` (`MerchantCommissionsPage.tsx:93-135`)**: `note`, `ruleSnapshot`, and `reversesEntryId` are omitted from the ledger table.
5. **`AuditLogEntry` (`AdminAuditLogsPage.tsx:101-152`)**: `metadata` JSON and `merchantId` are omitted from the audit log table.
6. **`Customer` (`FinancingWizardPage.tsx`, `MerchantApplicationDetailPage.tsx`)**: `retentionExpiresAt` and `anonymizedAt` (DPDP lifecycle timestamps) are never surfaced in the UI.

### B. Hardcoded / Simulated / Planned-Only UI Elements
- `LandingPage.tsx:118-146`: Hardcoded `SAMPLE PREVIEW` illustrative ₹10,833.33 EMI widget (clearly labeled as preview/demo, no fake API call).
- `PartnersPage.tsx:7-32`: Hardcoded `DEMO_PARTNERS` array (`DEMO_BANK_ALPHA`, `DEMO_NBFC_BETA`, `DEMO_GAMMA_CREDIT`) because no public or admin `GET /lenders` endpoint exists.
- `UtilitiesPage.tsx`: 7 interactive utility category cards + honest `BackendRequiredNotice` stating BBPS / utility backend APIs do not exist yet.
- `MerchantApplicationDetailPage.tsx:91-110,242-254,287-311`: Renders `DocumentUploadPlaceholder` and `VerificationProgress` with hardcoded `'PENDING'` checklist items (`futureClosingChecklist`) whenever supplemental verification is unavailable.
- `LoginPage.tsx:93-116` & `FinancingWizardPage.tsx:67-73`: Demo quick-fill credential buttons and `DEMO_PHONE_SCENARIOS` pills gated behind `isDemoEnvironment` (`VITE_PROVIDER_MODE_LABEL=demo`).

### C. Explicit `BACKEND API REQUIRED` List Surfaced in Frontend
| Missing Capability | Surfaces Blocked | Missing Endpoints / Changes Documented in Frontend |
| --- | --- | --- |
| Auth user introspection & cookie refresh | `AdminSettingsPage`, `MerchantSettingsPage`, `useSessionBootstrap` | Fix `GET /api/v1/auth/me` behind `authMiddleware`; support HttpOnly refresh cookies + `credentials: true` CORS |
| Customer self-service QR journey | `CheckoutScanPage` | `POST /checkout/sessions/:token/consent-and-submit`, `GET /checkout/sessions/:token/offers`, `POST /checkout/sessions/:token/offers/:offerId/accept`, customer OTP auth |
| Utility billing platform (BBPS) | `UtilitiesPage` | Biller directory, bill fetch, BBPS payment initiation & receipts |
| Supplemental docs, KYC, e-Sign & e-Mandate | `MerchantApplicationDetailPage`, `KycPrimitives` | `POST /applications/:id/additional-info`, `POST /documents/upload`, aggregator webview/KYC/KFS/e-Sign/e-Mandate APIs |
| Admin directories & analytics | `AdminOverviewPage`, `AdminMerchantsPage`, `AdminLendersPage`, `AdminApplicationsPage`, `PartnersPage` | `GET /admin/merchants`, `GET /admin/lenders`, `GET /admin/applications`, platform metrics endpoint, plus Zod/BigInt support on `PUT /admin/lenders/:id/config` |
| Merchant CRM, staff & payouts | `MerchantOverviewPage`, `MerchantSettingsPage`, `MerchantPurchasesPage` | `GET /customers`, `GET/POST /merchants/staff`, `PATCH /merchants/me`, webhook event inspector & settlement payouts |

