# Udyam PAY — Full System Utilization Summary

**Audited Repositories:**
- **Backend:** `c:\Users\NANDINI PATEL\OneDrive\Desktop\udhyam-pay-backend` (npm package `udyam-pay-backend`, 113 project files + 111 in nested duplicate snapshot)
- **Frontend:** `C:\Users\NANDINI PATEL\OneDrive\Desktop\udyam-pay-frontend` (npm package `udyam-pay-frontend`, 95 project files)

**Cross-Layer Deliverable Suite (`docs/audits/`):**
1. `BACKEND_UTILIZATION_AUDIT.md` — Route-by-route, service, store, middleware, schema & dependency audit
2. `FRONTEND_UTILIZATION_AUDIT.md` — Page-by-page, component, hook, API wrapper, ignored-field & dependency audit
3. `FEATURE_TO_API_MATRIX.md` — End-to-end capability mapping & cross-layer contract drift matrix
4. `DEAD_CODE_CANDIDATES.md` — Risk-rated cleanup & wiring registry (`NO FRONTEND CALL != USELESS`)
5. `FULL_SYSTEM_UTILIZATION_SUMMARY.md` — Executive answers & prioritized action plan *(this document)*

---

## 1. System Utilization Scorecard

| Dimension | Total Audited | Actively Utilized (End-to-End) | Unwired / Exposed Only | Broken / Miswired / Planned Only |
| --- | :---: | :---: | :---: | --- |
| **Backend HTTP Endpoints** | **34** | **27** (`79.4%`) | **6** (`5` exposed unused + `1` S2S webhook) | **1** broken (`GET /auth/me`) + webhook `PrismaStore` defect |
| **OpenAPI (`openapi.json`) Paths** | **34** live vs **11** documented | **11** (`32.4%`) | — | **23** live routes missing from OpenAPI spec |
| **Backend `AppStores` Methods** | **84** across **17** interfaces | **72** in runtime `src/` (`85.7%`) | **12** (`5` scripts/tests + `7` zero callers) | `webhook.service.ts:163` bypasses stores via `(this.stores as any).lenderApplicationsMap` |
| **Prisma Models / Enums** | **19** models / **23** enums | All **19** models active in stores | **4** models write-only in HTTP (`LenderApplication`, `WebhookEvent`, `Transaction`, `DisbursementStatus`) | **10** completely unused enum values; **7+** configured/persisted columns unread in runtime orchestration |
| **Frontend Runtime Source Files** | **70** `.ts`/`.tsx` (`src/`) | **70** (`100%` file import coverage excl. `vite-env.d.ts`) | **11** exported runtime helpers/wrappers/types with `0` UI callers | `10` screens render `BackendRequiredNotice` for missing backend APIs |
| **Frontend API Client Methods** | **31** across **11** `*Api.ts` modules | **27** (`87.1%`) | **4** defined without UI callers (`getMe`, `grantConsent`, `revokeConsent`, `getPurchase`) | **0** invented/fake backend endpoints |
| **Package Dependencies (BE / FE)** | BE **28** / FE **34** | BE **25** / FE **33** | — | **4** unused packages total (`jose`, `qrcode`, `@types/qrcode` in BE; `"udyam-pay-backend"` file link in FE) |

---

## 2. Direct Answers to the 10 Core Audit Questions

### 1. What backend capabilities are actually being used end-to-end?
Core merchant POS financing flows are genuinely wired end-to-end between React and Express:
- `/health` and `/ready` probes.
- Merchant registration, email/password login, single-flight JWT refresh rotation, and session logout (`POST /auth/{register,login,refresh,logout}`).
- Merchant profile lookup and retail shop creation/listing (`GET /merchants/me`, `GET/POST /merchants/shops`).
- Minimal DPDP customer creation with bundled consent (`POST /customers`).
- Idempotent purchase creation/listing (`POST/GET /purchases`) and counter QR ticket creation/public read (`POST /checkout/sessions`, `GET /checkout/sessions/:token`).
- Application create, submit (sequential & discovery mock waterfall), list, detail, audit history, cancel, offer list, offer accept (`POST/GET /applications/*`, `offer.routes.ts`), commission summary (`GET /ledger/commission`), and admin UUID operations + audit logs (`admin.routes.ts`).

### 2. What backend code exists but is NOT being used anywhere by the frontend or runtime flows?
- **Middleware & Workers**: `requireMerchantStatus` (`auth.middleware.ts:75`) and `ExpirationWorker` (`expiration.worker.ts`) are never mounted in routes or `src/server.ts`.
- **Service Methods**: `CheckoutService.consumeSession` & `revokeSession`, `OfferService.getOffer`, `CommissionService.accrue` (bypassed by `webhook.service.ts:237`) & `reverse`, `LenderAdapter.{checkEligibility,pollStatus,cancelApplication}` (`checkEligibility` only in verify/unit tests).
- **HTTP Routes**: `GET /auth/me` (broken ordering), `POST /customers/:id/consents`, `DELETE /customers/:id/consents/:consentId`, `GET /purchases/:id`, `GET /docs`, `GET /api/docs`.
- **Adapters & Config Fields**: `MockLenderAdapter` (`provider-factory.ts` only instantiates `JsonMockLenderAdapter` and `ProductionDisabledLenderAdapter`), `LenderConfiguration.{fallbackOnDecline,maxSafeRetries,routingRules}`, `LenderApplication.reconcileAttempts`, `FinancingOffer.repaymentSchedule`, `EmiCalculator` schedule output.
- **Persistence & Enums**: 7 store methods with zero callers anywhere (`users.listUsers`, `refreshSessions.revokeUserSessions`, `merchants.list`, `consents.listByCustomer`, `lenderApplications.findByRequestKey`, `transactions.confirmTransaction`, `disbursements.listByLenderApp`) and 10 unused enum values across `OfferType`, `OfferStatus`, `TransactionType`, `CommissionEntryType`, `LenderAttemptOutcome`.
- **Packages & Snapshot**: `jose`, `qrcode`, `@types/qrcode`, plus the 111-file nested `udhyam-pay-backend/` copy.

### 3. Which backend capabilities are redundant, obsolete, unreachable, or duplicated?
- **Duplicate OpenAPI route**: `GET /api/docs` duplicates `GET /docs` (`app.ts:73,83`), and `openapi.json` covers only 11 of 34 endpoints.
- **Manual BigInt `.toString()` spreading**: `offer.routes.ts` and `application.routes.ts` manually stringify a subset of BigInt fields even though `sendSuccess` (`response.ts:27`) already recursively serializes all `BigInt` values.
- **Legacy `MockLenderAdapter`**: Replaced at runtime by `JsonMockLenderAdapter`, retained only by older scripts/unit tests.
- **Unreachable / Dead-end Application States**: `ApplicationStatus.DRAFT` is never created by `POST /applications`, `ADDITIONAL_INFORMATION_REQUIRED` has no resume/upload endpoint, and `LENDER_FINAL_CONFIRMATION` / `DISBURSEMENT_PENDING` only step transiently inside webhook processing.
- **Stale Root Docs & Nested Clone**: `udhyam-pay-backend/udhyam-pay-backend/` (111 files) and outdated claims in `STATUS.md` / `README.md` / `AUDIT_REPORT.md` / `FINAL_VERIFICATION_REPORT.md`.

### 4. Which frontend modules are actually being used?
All **19** page routes, **3** guards (`ProtectedRoute`, `PublicOnlyRoute`, `RoleRedirectHome`), `useSessionBootstrap`, `authStore` session state, `apiClient` (`X-Request-Id`, `Idempotency-Key`, `401` single-flight refresh), `paise.ts` (`BigInt` money precision), `schemas.ts` (Zod forms), and all UI/feedback/financial components are imported and active in the router/page graph.

### 5. Which frontend code exists but is never reached, never imported, or unused?
- **API Client Methods**: `authApi.getMe`, `customerApi.grantConsent`, `customerApi.revokeConsent`, `purchaseApi.getPurchase`.
- **Helpers / Components / Types**: `maskPhone` (`lib/utils.ts:21`), `isMerchantRole` (`authStore.ts:118`), `KycStepCard` (`KycPrimitives.tsx`), `formatBigIntIndian` (`paise.ts`, unit-tested only), and unused planning types `UtilityBillerProvider`, `UtilityBillFetchResponse`, `KycStepCode` (`src/types/future.ts`), `ShopStatus`, `CommissionEntryType`, `CommissionEntry` (`src/types/api.ts`).
- **Dependency**: `"udyam-pay-backend": "file:../udhyam-pay-backend"` in `udyam-pay-frontend/package.json:29` has `0` code imports.

### 6. Which frontend screens depend on backend APIs that do NOT actually exist?
**Zero** frontend pages issue calls to non-existent endpoints; every API call maps to a real Express route. Instead, **10 pages** render explicit `BackendRequiredNotice` components where backend capabilities do not exist (`UtilitiesPage`, `CheckoutScanPage`, `MerchantApplicationDetailPage`, `MerchantOverviewPage`, `MerchantSettingsPage`, `AdminOverviewPage`, `AdminMerchantsPage`, `AdminLendersPage`, `AdminApplicationsPage`, `AdminSettingsPage`), plus `PartnersPage` renders a static `DEMO_PARTNERS` array in place of a missing `GET /lenders` API.

### 7. Which backend APIs exist with no frontend consumer?
- **3 working, wrapped in FE client (`0` UI callers)**: `POST /api/v1/customers/:id/consents`, `DELETE /api/v1/customers/:id/consents/:consentId`, `GET /api/v1/purchases/:id`.
- **2 OpenAPI routes**: `GET /docs`, `GET /api/docs`.
- **1 server-to-server webhook**: `POST /api/v1/webhooks/lenders/:code`.
- **1 broken auth route**: `GET /api/v1/auth/me` (FE has `authApi.getMe` waiting on backend fix).

### 8. Which frontend features are planned/visible but cannot work due to missing backend APIs?
1. **Utility Bill Payments (BBPS)** (`UtilitiesPage` — no biller list, bill fetch, or payment backend routes).
2. **Self-Service Customer QR Completion** (`CheckoutScanPage` — customer OTP login, remote consent grant, lender offer fetch, and offer acceptance via `:token` do not exist).
3. **Supplemental KYC Upload, KFS, e-Sign & e-Mandate** (`MerchantApplicationDetailPage` — `DocumentUploadPlaceholder` and hardcoded `'PENDING'` `VerificationProgress` await `POST /applications/:id/additional-info`, `POST /documents/upload`, and aggregator KYC/e-Sign/e-Mandate models & routes).
4. **Admin Directory Lists & Analytics** (`AdminMerchantsPage`, `AdminLendersPage`, `AdminApplicationsPage`, `AdminOverviewPage` — all operate purely by UUID lookup because `GET /admin/{merchants,lenders,applications}` are absent).
5. **Merchant Staff / Customer CRM / Webhook & Settlement Inspectors** (`MerchantOverviewPage`, `MerchantSettingsPage`).

### 9. High-Level Recommendation Summary (Keep / Connect / Rework / Possibly Remove)

- **KEEP**: Core Express 5 security stack (`helmet`, `cors`, rate limiters, Pino PII redaction), 15-state `application-state-machine.ts`, SQL constraints/append-only triggers, `BigInt` paise precision across both layers, `ProductionDisabledLenderAdapter` fail-closed guard, frontend `BackendRequiredNotice` pattern, and full Prisma domain enum/table vocabulary for upcoming aggregator & reconciliation phases.
- **CONNECT**:
  1. Fix `GET /api/v1/auth/me` placement behind `authMiddleware` and connect `authApi.getMe`.
  2. Mount `requireMerchantStatus(stores, 'VERIFIED')` on purchase/checkout/application/offer routes.
  3. Start `ExpirationWorker` inside `src/server.ts`.
  4. Wire `CheckoutService.consumeSession`/`revokeSession`, `CommissionService.accrue()` (inside `WebhookService`), `buildPaginationMeta()`, `EmiCalculator` schedules, and `LenderConfiguration` routing flags (`fallbackOnDecline`, `maxSafeRetries`, `routingRules`).
  5. Expose already-built store list methods (`merchants.list`, `users.listUsers`, `lenderApplications.listByApplication`) via Admin/Merchant GET endpoints; wire `customerApi.{grantConsent,revokeConsent}` and `maskPhone` in UI.
- **REVIEW / REWORK**:
  1. Fix `WebhookService.processWebhook` (`webhook.service.ts:163`) so `PrismaStore` supports `externalReference` lookup cleanly via a typed `LenderApplicationStore` method.
  2. Unify RBAC checks in `application.routes.ts:62,69,88` and `offer.routes.ts:31` to recognize `ADMIN`, `SYSTEM_ADMIN`, and `OPS_AGENT` consistently.
  3. Add Zod validation + `BigInt` coercion on `PUT /api/v1/admin/lenders/:id/config` and update `src/docs/openapi.json` to match all 34 endpoints.
  4. Standardize `FinancingOffer` display in `OfferCard` (`aprPercent`, `taxesPaise`, `downPaymentPaise`, `termsUrl`) and clean up redundant `.toString()` spreads in routes.
- **POSSIBLY REMOVE**:
  1. Unused npm dependencies: `jose`, `qrcode`, `@types/qrcode` (`udhyam-pay-backend/package.json`) and `"udyam-pay-backend"` file dependency (`udyam-pay-frontend/package.json:29`).
  2. Accidental 111-file nested snapshot directory `udhyam-pay-backend/udhyam-pay-backend/` (+ `udhyam-pay-backend-complete.zip` once archived externally).
  3. Legacy `MockLenderAdapter` (after migrating `verify-logic.ts` and unit tests to `JsonMockLenderAdapter`) and unused `OfferService.getOffer` (unless a single-offer GET route is added).

### 10. Overall Verdict
**Architecture is well-factored and honest, with zero hallucinated APIs**, **79.4%** of backend endpoints (`27/34`) and **87.1%** of frontend API client methods (`27/31`) actively connected end-to-end in mock JSON lender mode. However, several critical **production-hardening and operational pieces are built in backend services/stores but left unwired** (`requireMerchantStatus`, `ExpirationWorker`, `CheckoutService.consumeSession`, `WebhookService` PostgreSQL `externalReference` lookup, `merchants.list`), while **Utilities (BBPS), Customer Self-Service QR Checkout, Admin Directories, Staff/Customer CRM, and Live Aggregator KYC/e-Sign/e-Mandate** remain explicitly stubbed or gated by `BackendRequiredNotice` awaiting backend endpoints and vendor sandbox credentials.

