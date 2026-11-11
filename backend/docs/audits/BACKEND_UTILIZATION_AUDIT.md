# Udyam PAY — Backend Utilization Audit

**Audit Scope:** `udhyam-pay-backend` (Cross-referenced against `udyam-pay-frontend`)  
**Audit Nature:** Strictly read-only, evidence-based cross-layer code audit  
**Source of Truth:** Express route registrations, TypeScript services, repository interfaces/implementations, Prisma schema, SQL migrations, fixtures, scripts, and tests.

---

## 1. Executive Summary & Metrics

| Metric | Count / Finding | Notes |
| --- | --- | --- |
| Total non-generated files in `udhyam-pay-backend` (excl. `node_modules`, `dist`, `.git`, nested duplicate) | **113 files** | Plus **111 files** in accidental nested copy `udhyam-pay-backend/udhyam-pay-backend/` (including `udhyam-pay-backend-complete.zip`) |
| Total registered HTTP endpoints | **34** | 2 app OpenAPI routes + 2 health routes + 30 `/api/v1/*` routes |
| Endpoints **USED** by frontend UI | **27** | Actively called via React Query / `apiClient` from pages/layouts |
| Endpoints **BACKEND_EXPOSED_NOT_USED** | **5** | 3 domain endpoints wrapped in FE API client but uncalled by UI (`POST /customers/:id/consents`, `DELETE /customers/:id/consents/:consentId`, `GET /purchases/:id`) + 2 docs endpoints (`GET /docs`, `GET /api/docs`) |
| Endpoints **INTERNAL_OR_SYSTEM_ONLY** | **1** | `POST /api/v1/webhooks/lenders/:code` (server-to-server HMAC callback; contains a `PrismaStore` lookup defect) |
| Endpoints **BROKEN_OR_MISWIRED** | **1** (+ webhook bug) | `GET /api/v1/auth/me` mounted before `authMiddleware` -> `req.user` is always `undefined` |
| OpenAPI coverage (`src/docs/openapi.json`) | **11 / 34 paths** | Only 11 paths documented; 23 live endpoints (including all `/admin/*`, `/merchants/*`, `/customers/*`, `/health`, `/ready`) missing from OpenAPI spec |
| Prisma schema scale (`prisma/schema.prisma`) | **19 models**, **23 enums** | Supported by `001_constraints.sql` / `20261031120000_init/migration.sql` |
| `AppStores` repository interfaces (`src/modules/persistence/stores.ts`) | **17 store interfaces** | **84 methods** total (`README.md` inaccurately states "13 domain repository interfaces") |
| Declared `package.json` dependencies | **13 runtime**, **15 dev** | 3 completely unused packages: `jose`, `qrcode`, `@types/qrcode` |

---

## 2. Backend → Frontend Traceability Matrix (All 34 HTTP Endpoints)

Classification legend:
- **USED**: Active runtime HTTP route wired end-to-end and triggered by a live frontend screen or hook.
- **BACKEND_EXPOSED_NOT_USED**: Valid backend route with zero active UI trigger (either wrapped in frontend API client without UI callers, or docs/inspection only).
- **INTERNAL_OR_SYSTEM_ONLY**: Designed for external server callbacks or ops/CLI execution rather than browser UI.
- **BROKEN_OR_MISWIRED**: Route/handler fails its intended contract under live production/Prisma execution.

| # | Method & Path | Route File & Line | Service / Handler | Store / Prisma Models | OpenAPI? | Frontend API Function & Caller(s) | Classification |
| :-: | :--- | :--- | :--- | :--- | :---: | :--- | :--- |
| 1 | `GET /docs` | `src/app.ts:73` | Inline JSON responder (`src/docs/openapi.json`) | None | No | None | **BACKEND_EXPOSED_NOT_USED** |
| 2 | `GET /api/docs` | `src/app.ts:83` | Duplicate inline OpenAPI JSON responder | None | No | None | **BACKEND_EXPOSED_NOT_USED** |
| 3 | `GET /health` | `src/modules/health/health.routes.ts:22` | Inline uptime probe (`{ status: 'ok', uptimeSeconds }`) | None | No | `healthApi.getHealth` → `LandingPage`, `AdminOverviewPage`, `AdminSettingsPage` | **USED** |
| 4 | `GET /ready` | `src/modules/health/health.routes.ts:27` | `readinessCheck` callback (DB `SELECT 1`) | Prisma client query | No | `healthApi.getReadiness` → `AdminOverviewPage`, `AdminSettingsPage` | **USED** |
| 5 | `POST /api/v1/auth/register` | `src/modules/auth/auth.routes.ts:25` | `AuthService.registerMerchantOwner` | `users`, `merchants` (`User`, `Merchant`) | Yes | `authApi.register` → `RegisterPage` | **USED** |
| 6 | `POST /api/v1/auth/login` | `src/modules/auth/auth.routes.ts:40` | `AuthService.login` | `users`, `refreshSessions` (`User`, `RefreshSession`) | Yes | `authApi.login` → `LoginPage` | **USED** |
| 7 | `POST /api/v1/auth/refresh` | `src/modules/auth/auth.routes.ts:58` | `AuthService.refreshTokens` | `refreshSessions`, `users` (`RefreshSession`, `User`) | Yes | `authApi.refresh` → `useSessionBootstrap`, `client.ts` | **USED** |
| 8 | `POST /api/v1/auth/logout` | `src/modules/auth/auth.routes.ts:67` | `AuthService.logout` | `refreshSessions` (`RefreshSession`) | No | `authApi.logout` → `useLogout` (`DashboardLayout`) | **USED** |
| 9 | `GET /api/v1/auth/me` | `src/modules/auth/auth.routes.ts:75` | Returns `{ user: req.user ?? null }` | None (never reaches auth middleware) | No | `authApi.getMe` exists (`0` runtime callers; intentionally skipped) | **BROKEN_OR_MISWIRED** |
| 10 | `POST /api/v1/webhooks/lenders/:code` | `src/modules/webhooks/webhook.routes.ts:9` | `WebhookService.processWebhook` (`webhook.service.ts:60`) | `lenders`, `webhooks`, `lenderApplications`, `applications`, `disbursements`, `transactions`, `commissions`, `offers` | Yes | None (HMAC-SHA256 S2S endpoint; fails `externalReference` lookup under `PrismaStore`) | **INTERNAL_OR_SYSTEM_ONLY** *(contains `PrismaStore` defect)* |
| 11 | `POST /api/v1/checkout/sessions` | `src/modules/checkout/checkout.routes.ts:22` | `CheckoutService.createSession` | `purchases`, `shops`, `checkoutSessions` (`Purchase`, `Shop`, `CheckoutSession`) | Yes | `checkoutApi.createSession` → `MerchantPurchasesPage`, `FinancingWizardPage` | **USED** |
| 12 | `GET /api/v1/checkout/sessions/:token` | `src/modules/checkout/checkout.routes.ts:52` | `CheckoutService.getSessionByToken` | `checkoutSessions`, `purchases` (`CheckoutSession`, `Purchase`) | Yes | `checkoutApi.getPublicSession` → `CheckoutScanPage` | **USED** |
| 13 | `GET /api/v1/merchants/me` | `src/modules/merchants/merchant.routes.ts:16` | Direct `stores.merchants.findById` in route handler | `merchants` (`Merchant`) | No | `merchantApi.getMe` → `MerchantOverviewPage`, `MerchantSettingsPage` | **USED** |
| 14 | `POST /api/v1/merchants/shops` | `src/modules/merchants/merchant.routes.ts:23` | Direct `stores.shops.create` in route handler | `shops` (`Shop`) | No | `merchantApi.createShop` → `MerchantShopsPage` | **USED** |
| 15 | `GET /api/v1/merchants/shops` | `src/modules/merchants/merchant.routes.ts:36` | Direct `stores.shops.listByMerchant` in route handler | `shops` (`Shop`) | No | `merchantApi.listShops` → `MerchantOverviewPage`, `MerchantShopsPage`, `MerchantPurchasesPage`, `MerchantApplicationsPage`, `FinancingWizardPage` | **USED** |
| 16 | `POST /api/v1/customers` | `src/modules/customers/customer.routes.ts:23` | Direct `stores.customers` + `stores.consents.create` | `customers`, `consents` (`Customer`, `CustomerConsent`) | No | `customerApi.registerCustomer` → `FinancingWizardPage` | **USED** |
| 17 | `POST /api/v1/customers/:id/consents` | `src/modules/customers/customer.routes.ts:52` | Direct `stores.consents.create` in route handler | `customers`, `consents` (`Customer`, `CustomerConsent`) | No | `customerApi.grantConsent` exists (`0` UI callers) | **BACKEND_EXPOSED_NOT_USED** |
| 18 | `DELETE /api/v1/customers/:id/consents/:consentId` | `src/modules/customers/customer.routes.ts:73` | Direct `stores.consents.revoke` in route handler | `customers`, `consents` (`Customer`, `CustomerConsent`) | No | `customerApi.revokeConsent` exists (`0` UI callers) | **BACKEND_EXPOSED_NOT_USED** |
| 19 | `POST /api/v1/purchases` | `src/modules/purchases/purchase.routes.ts:29` | Direct `stores.shops.findById` + `stores.purchases.createIdempotent` | `shops`, `purchases` (`Shop`, `Purchase`) | Yes | `purchaseApi.createPurchase` → `MerchantPurchasesPage`, `FinancingWizardPage` | **USED** |
| 20 | `GET /api/v1/purchases` | `src/modules/purchases/purchase.routes.ts:61` | Direct `stores.purchases.listByMerchant` in route handler | `purchases` (`Purchase`) | No | `purchaseApi.listPurchases` → `MerchantOverviewPage`, `MerchantPurchasesPage` | **USED** |
| 21 | `GET /api/v1/purchases/:id` | `src/modules/purchases/purchase.routes.ts:77` | Direct `stores.purchases.findById` in route handler | `purchases` (`Purchase`) | No | `purchaseApi.getPurchase` exists (`0` UI callers; detail modal uses list row) | **BACKEND_EXPOSED_NOT_USED** |
| 22 | `POST /api/v1/applications` | `src/modules/applications/application.routes.ts:26` | `ApplicationService.createApplication` | `shops`, `purchases`, `customers`, `consents`, `applications` | Yes | `applicationApi.createApplication` → `FinancingWizardPage` | **USED** |
| 23 | `POST /api/v1/applications/:id/submit` | `src/modules/applications/application.routes.ts:61` | `ApplicationService.submitApplication` → `WaterfallOrchestrator` | `applications`, `lenders`, `lenderApplications`, `offers` | Yes | `applicationApi.submitApplication` → `FinancingWizardPage`, `MerchantApplicationDetailPage` | **USED** *(RBAC drift on `:62,69`)* |
| 24 | `POST /api/v1/applications/:id/cancel` | `src/modules/applications/application.routes.ts:82` | `ApplicationService.cancelApplication` | `applications` (`FinancingApplication`, `ApplicationStatusHistory`) | No | `applicationApi.cancelApplication` → `MerchantApplicationDetailPage` | **USED** *(RBAC drift `:88`; does not call lender `cancelApplication` or withdraw offers)* |
| 25 | `GET /api/v1/applications` | `src/modules/applications/application.routes.ts:102` | `ApplicationService.listMerchantApplications` | `applications` (`FinancingApplication`) | No | `applicationApi.listApplications` → `MerchantOverviewPage`, `MerchantApplicationsPage` | **USED** |
| 26 | `GET /api/v1/applications/:id` | `src/modules/applications/application.routes.ts:119` | `ApplicationService.getApplication` | `applications`, `offers`, `purchases`, `customers` | No | `applicationApi.getApplication` → `MerchantApplicationDetailPage`, `AdminApplicationsPage` | **USED** |
| 27 | `GET /api/v1/applications/:id/history` | `src/modules/applications/application.routes.ts:146` | `ApplicationService.getApplicationHistory` | `applications` (`ApplicationStatusHistory`) | No | `applicationApi.getHistory` → `MerchantApplicationDetailPage` | **USED** |
| 28 | `GET /api/v1/applications/:id/offers` | `src/modules/offers/offer.routes.ts:8` | `OfferService.listOffers` | `applications`, `offers` (`FinancingOffer`) | No | `offerApi.listOffers` → `FinancingWizardPage` | **USED** *(detail page reads `detail.offers` instead)* |
| 29 | `POST /api/v1/applications/:id/offers/:offerId/accept` | `src/modules/offers/offer.routes.ts:26` | `OfferService.acceptOffer` | `applications`, `offers` (`FinancingOffer`, `FinancingApplication`) | Yes | `offerApi.acceptOffer` → `FinancingWizardPage`, `MerchantApplicationDetailPage` | **USED** *(RBAC drift `:31`)* |
| 30 | `GET /api/v1/ledger/commission` | `src/modules/ledger/ledger.routes.ts:9` | `CommissionService.getMerchantSummary` | `commissions` (`CommissionEntry`) | Yes | `ledgerApi.getCommissionSummary` → `MerchantOverviewPage`, `MerchantCommissionsPage`, `AdminApplicationsPage` | **USED** |
| 31 | `PATCH /api/v1/admin/merchants/:id/status` | `src/modules/admin/admin.routes.ts:23` | `AdminService.verifyMerchant` / `suspendMerchant` | `merchants`, `auditLogs` (`Merchant`, `AuditLog`) | No | `adminApi.updateMerchantStatus` → `AdminMerchantsPage` | **USED** |
| 32 | `PUT /api/v1/admin/lenders/:id/config` | `src/modules/admin/admin.routes.ts:33` | `AdminService.updateLenderConfig` | `lenders`, `auditLogs` (`Lender`, `LenderConfiguration`, `AuditLog`) | No | `adminApi.updateLenderConfig` → `AdminLendersPage` | **USED** *(unvalidated `req.body`)* |
| 33 | `GET /api/v1/admin/audit-logs` | `src/modules/admin/admin.routes.ts:38` | `AdminService.listAuditLogs` | `auditLogs` (`AuditLog`) | No | `adminApi.listAuditLogs` → `AdminOverviewPage`, `AdminAuditLogsPage` | **USED** |
| 34 | `POST /api/v1/admin/applications/:id/manual-review` | `src/modules/admin/admin.routes.ts:45` | `AdminService.resolveManualReview` | `applications`, `auditLogs` | No | `adminApi.resolveManualReview` → `AdminApplicationsPage` | **USED** |

---

## 3. Service, Orchestration, Adapter & Worker Utilization

### A. Domain Services & Orchestration
| Symbol & Location | Method / Capability | Runtime Caller(s) | Script / Test Callers | Utilization Status |
| --- | --- | --- | --- | --- |
| `AuthService` (`src/modules/auth/auth.service.ts`) | `registerMerchantOwner`, `login`, `refreshTokens`, `logout` | `auth.routes.ts` | `verify-logic.ts`, `auth.test.ts` | **USED** (except note: `logout` never increments `tokenVersion`, so existing access tokens remain valid until expiry) |
| `CheckoutService` (`src/modules/checkout/checkout.service.ts`) | `createSession`, `getSessionByToken` | `checkout.routes.ts` | `verify-logic.ts`, `main-flow.test.ts` | **USED** |
| `CheckoutService` (`src/modules/checkout/checkout.service.ts`) | `consumeSession` (`:108`), `revokeSession` (`:120`) | **NONE** (`0` callers in `src/` or routes) | `verify-logic.ts` / unit tests only | **UNWIRED CAPABILITY** — no route or service consumes or revokes checkout sessions! |
| `ApplicationService` (`src/modules/applications/application.service.ts`) | `createApplication`, `submitApplication`, `cancelApplication`, `getApplication`, `listMerchantApplications`, `getApplicationHistory` | `application.routes.ts` | `verify-logic.ts`, `main-flow.test.ts` | **USED** |
| `OfferService` (`src/modules/offers/offer.service.ts`) | `listOffers`, `acceptOffer` | `offer.routes.ts` | `verify-logic.ts`, `main-flow.test.ts` | **USED** |
| `OfferService` (`src/modules/offers/offer.service.ts`) | `getOffer` (`:33`) | **NONE** (`0` callers anywhere in `src/`, `scripts/`, `tests/`) | `0` | **DEAD CODE CANDIDATE** |
| `CommissionService` (`src/modules/ledger/commission.service.ts`) | `getMerchantSummary` | `ledger.routes.ts` | `verify-logic.ts`, `main-flow.test.ts` | **USED** |
| `CommissionService` (`src/modules/ledger/commission.service.ts`) | `accrue` (`:33`), `reverse` (`:69`) | **NONE** (`0` runtime callers outside `commission.service.ts`) | `verify-logic.ts`, tests | **BYPASSED / UNWIRED** — `webhook.service.ts:237` calls `this.stores.commissions.accrue(...)` directly instead of `CommissionService.accrue()`, and `reverse()` has zero HTTP trigger or runtime caller |
| `AdminService` (`src/modules/admin/admin.service.ts`) | `verifyMerchant`, `suspendMerchant`, `updateLenderConfig`, `listAuditLogs`, `resolveManualReview` | `admin.routes.ts` | Tests (`admin` count = 5) | **USED** |
| `WebhookService` (`src/modules/webhooks/webhook.service.ts`) | `processWebhook` | `webhook.routes.ts` | `verify-logic.ts`, `main-flow.test.ts` | **INTERNAL_ONLY + BUGGY** — `webhook.service.ts:163` reads `(this.stores as any).lenderApplicationsMap?.values()` which only exists on `InMemoryStores` and always returns `undefined` under `PrismaStore` |
| `WaterfallOrchestrator` (`src/modules/orchestration/waterfall.ts`) | `evaluateApplication` (`SEQUENTIAL` & `DISCOVERY`) | `ApplicationService.submitApplication` | `verify-logic.ts`, `waterfall.test.ts` | **USED** |
| `ResultApplier` (`src/modules/orchestration/result-applier.ts`) | `applySubmissionResult` | `WaterfallOrchestrator` | `result-applier.test.ts` | **USED** |
| `ExpirationWorker` (`src/modules/workers/expiration.worker.ts`) | `runOnce` (`:14`), `expireCheckoutSessions`, `expireApplications` | **NONE** (not wired in `src/server.ts` or any cron/HTTP route) | `verify-logic.ts`, `expiration.worker.ts` tests | **UNWIRED BACKGROUND WORKER** |

### B. Middleware, Common Utilities & Lender Adapters
| Symbol & Location | Runtime Callers (`src` excl. self) | Scripts / Tests | Status & Finding |
| --- | --- | --- | --- |
| `createAuthMiddleware`, `requireRole` (`src/modules/auth/auth.middleware.ts`) | `src/routes/index.ts`, `admin.routes.ts` | Tested indirectly via integration/e2e | **USED** |
| `requireMerchantStatus` (`src/modules/auth/auth.middleware.ts:75`) | **0 callers** anywhere (`nonPersist=1`, `scripts=0`, `tests=0`) | `0` | **UNUSED MIDDLEWARE** — merchants with `PENDING_VERIFICATION` or `SUSPENDED` can currently call purchase/application routes unless checked elsewhere! |
| `ServiceUnavailableError` (`src/common/errors.ts:83`) | **0 callers** anywhere (`nonPersist=1`, `scripts=0`, `tests=0`) | `0` | **UNUSED ERROR CLASS** |
| `ValidationError` (`src/common/errors.ts:36`) | **0 runtime callers** (`nonPersist=1`) | `tests=2` | **TEST-ONLY ERROR CLASS** (`error-handler.ts` constructs raw `new AppError({ code: 'VALIDATION_ERROR' })` instead) |
| `buildPaginationMeta` (`src/common/pagination.ts:15`) | **0 runtime callers** (`nonPersist=1`) | `tests=2` | **UNUSED PAGINATION HELPER** (route files manually inline `{ page, pageSize, total }` and omit `totalPages`) |
| `EmiCalculator` (`src/modules/lenders/emi-calculator.ts`) | `JsonMockLenderAdapter`, `MockLenderAdapter` | `verify-logic.ts`, `emi-calculator.test.ts` | **PARTIAL** — computes `schedule: RepaymentInstallment[]`, but `json-mock-lender.ts` discards `schedule`, and `result-applier.ts:93` persists `repaymentSchedule: null` |
| `JsonMockLenderAdapter` (`src/modules/lenders/adapters/json-mock-lender.ts`) | `provider-factory.ts` | `verify-journey.ts`, `mock-provider.test.ts` | **USED** in runtime mock mode (`submitApplication` only; `checkEligibility` never called at runtime) |
| `MockLenderAdapter` (`src/modules/lenders/adapters/mock-lender.ts`) | **0 runtime callers** (`nonPersist=2`, self only) | `verify-logic.ts`, `mock-lender.test.ts` | **LEGACY ADAPTER** — superseded at runtime by `JsonMockLenderAdapter` |
| `ProductionDisabledLenderAdapter` (`src/modules/lenders/provider-factory.ts:24`) | `createLenderAdapters` | `tests=3` | **FAIL-CLOSED STUB** — registered for all non-simulated lenders (even when live credentials exist at `:142-148`) |
| `LenderAdapter.checkEligibility` (`lender-adapter.interface.ts:72`) | **0 runtime callers** in `src/` | `verify-journey.ts:154`, `mock-provider.test.ts` | **DEAD INTERFACE METHOD AT RUNTIME** (`WaterfallOrchestrator` invokes `submitApplication` directly) |
| `LenderAdapter.cancelApplication` (`lender-adapter.interface.ts:75`) | **0 callers** anywhere (`src/`, `scripts/`, `tests/`) | `0` | **DEAD INTERFACE METHOD** (neither implemented nor called by `ApplicationService.cancelApplication`) |
| `LenderAdapter.pollStatus` (`lender-adapter.interface.ts:74`) | **0 callers** anywhere | `0` | **DEAD OPTIONAL INTERFACE METHOD** |

---

## 4. Persistence (`AppStores`) Method Utilization Audit

Out of **84 methods** declared across the 17 store interfaces in `src/modules/persistence/stores.ts` (implemented in both `InMemoryStores` and `PrismaStore`):

| Classification | Count | Methods (`store.method`) |
| --- | :---: | :--- |
| **Used by runtime `src/`** (non-persistence) | **72** | All core CRUD, auth rotation, idempotent purchase, offer accept/supersede, audit log write/list, etc. |
| **Unused in `src/`, used only in scripts/tests** | **5** | `customers.anonymizeCustomer` (`scripts=1, tests=0`), `lenders.create` (`scripts=10, tests=6`), `lenderApplications.findById` (`tests=1`), `lenderApplications.listByApplication` (`scripts=2, tests=5`), `transactions.findByApplication` (`scripts=1`) |
| **ZERO callers anywhere (`src`, `scripts`, `tests`)** | **7** | `users.listUsers`, `refreshSessions.revokeUserSessions`, `merchants.list`, `consents.listByCustomer`, `lenderApplications.findByRequestKey`, `transactions.confirmTransaction`, `disbursements.listByLenderApp` |

*(Note: `merchants.list`, `users.listUsers`, `consents.listByCustomer`, and `lenderApplications.listByApplication` correspond directly to list/inspector features missing HTTP endpoints in the frontend Admin & Merchant UI!)*

---

## 5. Prisma Schema Utilization Audit (19 Models & 23 Enums)

### A. Unused or Write-Only Prisma Models & Fields (`src` excl. `persistence`)
Every one of the **19 models** has a table/store implementation in `PrismaStore` and `InMemoryStores`:
1. `Merchant`, 2. `User`, 3. `RefreshSession`, 4. `Shop`, 5. `Customer`, 6. `CustomerConsent`, 7. `Purchase`, 8. `CheckoutSession`, 9. `Lender`, 10. `LenderConfiguration`, 11. `FinancingApplication`, 12. `ApplicationStatusHistory`, 13. `LenderApplication`, 14. `FinancingOffer`, 15. `WebhookEvent`, 16. `Transaction`, 17. `DisbursementStatus`, 18. `CommissionEntry`, 19. `AuditLog`.

However, several columns are **written but never read** or **configured but ignored** at runtime (`nonP` hits reflect `src/` excl. `persistence`):
- **Lender routing configuration fields persisted by Admin / Seed, never read by `WaterfallOrchestrator` (`waterfall.ts`)**:
  - `LenderConfiguration.fallbackOnDecline` (`nonP=1` — only default write)
  - `LenderConfiguration.maxSafeRetries` (`nonP=1`)
  - `LenderConfiguration.routingRules` (`nonP=1`)
- **Orchestration & Offer fields never populated or never read**:
  - `LenderApplication.reconcileAttempts` (`nonP=2` — written `0` in `waterfall.ts:154,275`, never incremented/queried)
  - `FinancingOffer.offerType` (`nonP=1` — hardcoded `'FIRM_OFFER'` in `result-applier.ts`)
  - `FinancingOffer.taxesPaise` (`nonP=1` — propagated as `undefined`/`null`)
  - `FinancingOffer.otherChargesPaise` (`nonP=1` — propagated as `undefined`/`null`)
  - `FinancingOffer.repaymentSchedule` (`nonP=1` — hardcoded `null` in `result-applier.ts:93` even though `EmiCalculator` builds `schedule`)
- **Schema models written in backend only (no HTTP GET/read endpoint exposed anywhere)**:
  - `LenderApplication` (written in `waterfall.ts`, never exposed in any HTTP response)
  - `WebhookEvent` (written in `webhook.service.ts`, never exposed in any HTTP response)
  - `Transaction` (created in `webhook.service.ts`, `confirmTransaction` uncalled, no GET endpoint)
  - `DisbursementStatus` (created in `webhook.service.ts`, never exposed in any HTTP response)

### B. Unused / Low-Usage Prisma Enum Values (across 23 Enums)
Exact scan across `src/` (excl. `persistence`), `persistence`, `prisma`, `scripts`, `tests`:

| Enum | Value | Usage Status | Exact Finding |
| --- | --- | --- | --- |
| `OfferType` | `INDICATIVE_ELIGIBILITY` | **COMPLETELY UNUSED** | `nonP=0, scripts=0, tests=0` |
| `OfferStatus` | `WITHDRAWN` | **COMPLETELY UNUSED** | `nonP=0, scripts=0, tests=0` (`cancelApplication` never withdraws offers) |
| `OfferStatus` | `SUPERSEDED` | **PERSISTENCE ONLY** | `nonP=0, persist=3` (written indirectly inside `offers.supersedeOthers`, never read by UI) |
| `TransactionType` | `PURCHASE_PAYMENT`, `MERCHANT_SETTLEMENT`, `REFUND` | **COMPLETELY UNUSED** | `nonP=0, scripts=0, tests=0` for all 3 (only `LOAN_DISBURSEMENT` is used) |
| `CommissionEntryType` | `ADJUSTMENT` | **COMPLETELY UNUSED** | `nonP=0, scripts=0, tests=0` |
| `LenderAttemptOutcome` | `RECONCILING` | **COMPLETELY UNUSED** | `nonP=0, scripts=0, tests=0` |
| `LenderType` | `OTHER` | **SCHEMA / TYPE ONLY** | `nonP=2` (Zod fixture enum & type only; no runtime lender uses it) |
| `ReconciliationStatus` | `UNRECONCILED`, `MISMATCHED` | **PERSISTENCE / SCHEMA ONLY** | `nonP=0` for both (`webhook.service.ts` hardcodes `'MATCHED'`) |
| `WebhookProcessingStatus` | `IGNORED_OUT_OF_ORDER` | **PERSISTENCE / SCHEMA ONLY** | `nonP=0, scripts=0, tests=0` |
| `RateType` | `FIXED`, `FLOATING`, `UNSPECIFIED` | **FIXTURE / SCHEMA ONLY** | `nonP=1` (`fixture-schema.ts` Zod enum only; `EmiCalculator` handles `FLAT` and `REDUCING_BALANCE`) |
| `ApplicationStatus` | `DRAFT` | **UNREACHABLE IN HTTP API** | `ApplicationService.createApplication` initializes directly to `CUSTOMER_CONSENT_PENDING` |
| `ApplicationStatus` | `ADDITIONAL_INFORMATION_REQUIRED` | **DEAD-END STATE IN HTTP API** | Entered via mock scenario, but no resume/upload API exists (`resolveManualReview` only resolves `MANUAL_REVIEW`) |

*(Also note type drift in `prisma/seed-demo.ts:4`: local `type DemoLenderType = 'BANK' | 'NBFC' | 'FINTECH_LSP'` diverges from Prisma `enum LenderType = 'BANK' | 'NBFC' | 'OTHER'`.)*

---

## 6. Dependencies, Configs, Scripts, Fixtures, Docs & Build Artifacts Audit

### A. `package.json` Dependencies (`udhyam-pay-backend`)
- **Runtime `dependencies` (13)**: `@prisma/client`, `argon2`, `cors`, `dotenv`, `express`, `express-rate-limit`, `helmet`, `pino`, `pino-http`, `tsx`, `zod` are actively used (`tsx` is invoked by npm scripts `dev`, `start:demo`, `seed:demo`, `prisma.seed`). **2 runtime dependencies are COMPLETELY UNUSED**:
  - `jose` (`^5.9.6`): `0` imports anywhere in `src/`, `prisma/`, `scripts/`, `tests/`. (`TokenService` uses custom HMAC-SHA256 `node:crypto` instead!)
  - `qrcode` (`^1.5.4`): `0` imports anywhere in the backend (`CheckoutService` only returns `qrPayload` URL string; QR rendering happens on the frontend via `qrcode.react`!).
- **`devDependencies` (15)**: ESLint, Prettier, Vitest, Supertest, Prisma CLI, TypeScript, `pino-pretty`, `@types/*` are active toolchain packages, **except 1 completely unused**:
  - `@types/qrcode` (`^1.5.5`): `0` uses anywhere (accompanies unused `qrcode`).
- **Note on `src/types/*.d.ts` (`express.d.ts`, `node.d.ts`, `vitest.d.ts`)**: Because `tsconfig.json` specifies `"types": []`, TypeScript relies on these offline ambient declaration files during `typecheck` and `npm run test:verify` (`tsconfig.verify.json` explicitly includes `"src/types/**/*.d.ts"`). Do **not** blindly delete them without removing `"types": []` and verifying full `tsc --noEmit` & `npm run test:verify`.

### B. Accidental Duplicate Copy & Documentation Drift
- **Nested Duplicate Directory**: `udhyam-pay-backend/udhyam-pay-backend/` (gitignored, 111 files including `udhyam-pay-backend-complete.zip` generated by `scripts/package.ps1`) is an unreferenced duplicate snapshot of the repo.
- **Root Documentation Drift**:
  - `STATUS.md:17` falsely claims `argon2, jose, qrcode` are used and `:31` claims `merchant.routes.ts` implements staff management (none exists).
  - `STATUS.md:45` claims role consistency across admin/merchant routes (`application.routes.ts:62,69,88` and `offer.routes.ts:31` still check only `'ADMIN'`).
  - `STATUS.md:47` and `README.md:16` claim full OpenAPI 3.1 coverage for all 10 domain route groups, whereas `src/docs/openapi.json` documents only **11 of 34** routes.
  - `README.md:31` states `13` store interfaces when `stores.ts` actually defines **17**.

---

## 7. Confirmed Backend Defects Found During Audit

1. **Broken Auth Introspection Endpoint (`GET /api/v1/auth/me`)**: Mounted at `src/routes/index.ts:46` **before** `router.use(authMiddleware)` at `:53`. Requests never populate `req.user`, returning `{ user: null }` or `undefined` regardless of Authorization header.
2. **Webhook Runtime Defect on PostgreSQL (`PrismaStore`)**: `webhook.service.ts:163` attempts `(this.stores as any).lenderApplicationsMap?.values()` to resolve `externalReference` and calls `this.stores.commissions.accrue(...)` directly (`:237`), bypassing `CommissionService.accrue()` and failing whenever webhooks omit internal `lenderApplicationId` in PostgreSQL mode.
3. **RBAC Role Drift on Applications & Offers Routes**: `application.routes.ts:62,69,88` and `offer.routes.ts:31` compare `req.user?.role === 'ADMIN'` / `!== 'ADMIN'`, excluding `SYSTEM_ADMIN` and `OPS_AGENT` (unlike `admin.routes.ts` and `auth.middleware.ts`).
4. **Missing Validation on `PUT /api/v1/admin/lenders/:id/config`**: `admin.routes.ts:34` forwards raw `req.body` without Zod validation or `BigInt` coercion for `minAmountPaise` / `maxAmountPaise`, forcing the frontend to omit them.
5. **Unwired `requireMerchantStatus` Middleware**: Defined at `auth.middleware.ts:75`, never mounted in `merchant.routes.ts`, `purchase.routes.ts`, `checkout.routes.ts`, or `application.routes.ts`.
6. **Redundant & Inconsistent Offer BigInt Mapping**: `sendSuccess` (`src/common/response.ts:41`) already converts all `bigint` fields via `serializeBigInts`, making manual `.toString()` mapping in `offer.routes.ts` and `application.routes.ts` redundant — and inconsistent (`acceptOffer` normalizes missing `downPaymentPaise`/`processingFeePaise`/`totalRepayablePaise` to `null`, whereas `listOffers` and `getApplication` omit them as `undefined`, and none normalize `taxesPaise`/`otherChargesPaise`).

