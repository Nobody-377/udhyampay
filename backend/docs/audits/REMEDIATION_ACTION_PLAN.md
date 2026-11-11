# Udyam PAY — Cross-Layer Remediation & Architecture Improvement Report

> **Audit Mode Notice:** Generated from verified cross-layer inspection across `udhyam-pay-backend` and `udyam-pay-frontend`. **Zero application code, Prisma schemas, configs, `package.json` dependencies, or tests were modified.**
>
> **Supporting Audit Reports:**
> - [`BACKEND_UTILIZATION_AUDIT.md`](./BACKEND_UTILIZATION_AUDIT.md)
> - [`FRONTEND_UTILIZATION_AUDIT.md`](./FRONTEND_UTILIZATION_AUDIT.md)
> - [`FEATURE_TO_API_MATRIX.md`](./FEATURE_TO_API_MATRIX.md)
> - [`DEAD_CODE_CANDIDATES.md`](./DEAD_CODE_CANDIDATES.md)
> - [`FULL_SYSTEM_UTILIZATION_SUMMARY.md`](./FULL_SYSTEM_UTILIZATION_SUMMARY.md)

---

## Executive Summary

Across **113 core backend files** (+ **111** unintended nested duplicate files), **95 frontend files**, **19 Prisma models**, **23 enums**, **34 backend HTTP endpoints**, and **31 frontend API wrappers**, the Udyam PAY core architecture is sound—particularly its PostgreSQL/Prisma + in-memory `AppStores` abstraction, append-only ledger guards, strict fail-closed `ProductionDisabledLenderAdapter`, circuit breaker, and 15-state application state machine.

However, the audit uncovered **five systemic friction patterns** that create security gaps, silent PostgreSQL runtime bugs, duplicated effort, and inconsistent FE/BE behavior:

1. **Unused dependencies & an accidental nested repo copy** (`jose`, `qrcode`, `@types/qrcode`, `file:../udhyam-pay-backend`, and `udhyam-pay-backend/udhyam-pay-backend/`).
2. **Broken or incomplete wiring in critical paths** (`/auth/me` mounted before `authMiddleware`, `WebhookService` using an in-memory-only map missing in `PrismaStore`, RBAC excluding `SYSTEM_ADMIN`/`OPS_AGENT` on application/offer routes, missing Zod `bigint` coercion on lender config updates, and incomplete application cancellation / checkout consumption / token-version invalidation).
3. **Already-built backend capabilities sitting idle** (`requireMerchantStatus`, `ExpirationWorker`, `CommissionService.accrue()`/`reverse()`, `buildPaginationMeta`, `EmiCalculator` schedules, waterfall retry/fallback flags, and tested `AppStores` list/consent/anonymization methods).
4. **FE/BE contract & UX drift** (incomplete `openapi.json` covering only 11 paths, inconsistent `BigInt`/nullable formatting, hidden KFS offer terms in `OfferCard`, unmasked customer phones despite existing `maskPhone`, and stale markdown docs).
5. **Preserve-at-all-costs lender integration boundaries** that must remain untouched during cleanup so real NBFC/FinBox/LSP integrations drop in cleanly later.

---

## 1. Remove Genuinely Unnecessary Code and Dependencies

### 1.1 Safe Immediate Dependency Removals

| Repo | Target | Line / Location | Evidence of Zero Usage | Recommended Action |
| :--- | :--- | :--- | :--- | :--- |
| Backend | `"jose": "^5.9.6"` | `package.json:47` | `0` imports across `src/`, `scripts/`, `tests/`. `TokenService` (`src/modules/auth/token.ts`) signs/verifies HS256 JWTs directly via `node:crypto`. | Uninstall & remove from `dependencies`. |
| Backend | `"qrcode": "^1.5.4"` | `package.json:50` | `0` imports anywhere in backend. `CheckoutService` only emits `qrPayload` URL strings; QR SVG rendering lives in frontend (`QrTicketCard.tsx:20` via `qrcode.react`). | Uninstall & remove from `dependencies`. |
| Backend | `"@types/qrcode": "^1.5.5"` | `package.json:59` | `0` usage (`qrcode` itself is unused). | Uninstall & remove from `devDependencies`. |
| Frontend | `"udyam-pay-backend": "file:../udhyam-pay-backend"` | `package.json:29` | `0` TS/CSS/config imports (only 2 UI prose string mentions in `UtilitiesPage.tsx:141` and `FaqPage.tsx:19`). Local `file:` linkage brittle across CI/builds. | Remove local package link from `package.json`; replace with generated OpenAPI/shared-contract types in Goal 5. |

### 1.2 Remove Accidental Nested Snapshot Directory

- **Target:** `udhyam-pay-backend/udhyam-pay-backend/` (gitignored; **111 files**, including `udhyam-pay-backend-complete.zip` produced by `scripts/package.ps1:6`).
- **Risk:** Causes recursive file-search noise, duplicate source hits, and inflated local disk footprint.
- **Action:** Delete the nested `udhyam-pay-backend/udhyam-pay-backend/` folder. Update `scripts/package.ps1` (if kept) so archive output targets an isolated temp or release output directory outside the workspace source tree.

### 1.3 Remove Dead / Redundant Backend Code

| File & Symbol / Block | Location | Finding | Recommended Action |
| :--- | :--- | :--- | :--- |
| `OfferService.getOffer(offerId)` | `src/modules/offers/offer.service.ts:33-37` | `0` callers in `src/`, `scripts/`, and `tests/`. | Delete dead method (or expose behind a guarded `GET /api/v1/offers/:offerId` route only if needed). |
| Duplicate `/docs` & `/api/docs` handlers | `src/app.ts:73-92` | Identical handlers dynamically importing `node:fs`/`node:path` per request and catching errors with a minimal `{ openapi: '3.1.0', info: { title: 'Udyam PAY' } }` stub. | Keep one canonical OpenAPI spec loader/handler (with `/api/docs` redirecting or sharing the same single middleware) and fail loudly on missing spec during startup/build. |
| Legacy `MockLenderAdapter` | `src/modules/lenders/adapters/mock-lender.ts` | `0` runtime callers (`nonPersist=2` self-only); `provider-factory.ts` instantiates `JsonMockLenderAdapter` instead. Still referenced by `scripts` (`7`) and `tests` (`10`). | Migrate remaining script/test references to `JsonMockLenderAdapter` + fixture config, then remove `mock-lender.ts`. |

### 1.4 Conditional Removals (Wait Until Prerequisites Complete)

1. **`src/types/express.d.ts`, `src/types/node.d.ts`, `src/types/vitest.d.ts`**:
   - **Do NOT delete right now.** `tsconfig.json:7` sets `"types": []` and `tsconfig.verify.json:12` explicitly depends on `src/types/**/*.d.ts` + `scripts/verify-logic.ts`.
   - **Action:** Only remove these ambient declaration files *after* restoring standard `@types/node`, `@types/express`, and `vitest` resolution in `tsconfig.json`/`tsconfig.verify.json` and verifying `npm run typecheck` and `npm run test:verify`.
2. **Frontend Auth Helper & Future Placeholders**:
   - `authStore.ts:118` (`isMerchantRole`): Currently `0` callers; keep only if consolidating scattered merchant role checks (Objective 5), otherwise remove.
   - `src/types/future.ts` (`UtilityBillerProvider`, `UtilityBillFetchResponse`, `KycStepCode`) & `KycPrimitives.tsx` (`KycStepCard`): `0` runtime/test references today; keep only as documented roadmap scaffolding for BBPS/KYC Phase 5 (Objective 6), and purge if roadmap scope changes.
   - **Do NOT remove** unused FE API wrappers (`authApi.getMe`, `purchaseApi.getPurchase`, `customerApi.grantConsent`, `customerApi.revokeConsent`) or `lib/utils.ts:21` (`maskPhone`)—these represent broken or disconnected capabilities addressed in Objectives 2–4.

---

## 2. Fix Broken or Incorrectly Connected Functionality

### 2.1 `GET /api/v1/auth/me` Runs Unauthenticated
- **Where:** `src/routes/index.ts:46` mounts `router.use('/auth', createAuthRouter(deps.authService))` *before* `router.use(authMiddleware)` at `:53`. Inside `src/modules/auth/auth.routes.ts:75-77`, `GET /me` returns `sendSuccess(res, { user: req.user })`.
- **Impact:** `req.user` is always `undefined` on `/api/v1/auth/me`, leaving `authApi.getMe` (`authApi.ts:65`) unusable on frontend session bootstrap.
- **Fix:** Pass `authMiddleware` into `createAuthRouter(deps.authService, authMiddleware)` (same pattern as `createCheckoutRouter` at `src/routes/index.ts:50`), mount `authMiddleware` on `GET /me`, fetch fresh safe user claims from `stores.users.findById(req.user.id)` (excluding password hash), and wire `useSessionBootstrap.ts` / `authApi.getMe`.

### 2.2 `WebhookService` Breaks in PostgreSQL (`PrismaStore`) When Matching `externalReference`
- **Where:** `src/modules/webhooks/webhook.service.ts:162-170`:
  ```ts
  for (const la of (this.stores as any).lenderApplicationsMap?.values() ?? []) {
    if (la.lenderId === lenderId && la.externalReference === externalRef) {
  ```
- **Impact:** `PrismaStore` has no `lenderApplicationsMap` property. Any webhook delivering `externalReference` without `applicationId` silently fails to resolve `lenderApp` and `app` when running against PostgreSQL.
- **Fix:** Add `findByExternalReference(lenderId: string, externalReference: string): Promise<LenderApplicationEntity | null>` to `LenderApplicationStore`, implement it in both `InMemoryStores` and `PrismaStore`, and eliminate the `(this.stores as any)` cast.

### 2.3 RBAC Drift Across Application & Offer Routes + Missing Merchant Guard on `/cancel`
- **Where:**
  - `src/modules/applications/application.routes.ts:62`: `if (!req.user?.merchantId && req.user?.role !== 'ADMIN')` blocks `SYSTEM_ADMIN` and `OPS_AGENT`.
  - `src/modules/applications/application.routes.ts:69,88` and `src/modules/offers/offer.routes.ts:31`: `req.user?.role === 'ADMIN' ? 'ADMIN_USER' : 'MERCHANT_USER'` misattributes `SYSTEM_ADMIN` and `OPS_AGENT` transitions as `MERCHANT_USER`.
  - `src/modules/applications/application.routes.ts:82`: `POST /:id/cancel` lacks the `!req.user?.merchantId` check present on `/submit` at `:62`.
- **Impact:** Inconsistent RBAC vs `admin.routes.ts:21`, `auth.middleware.ts:81-84`, and frontend `authStore.ts:114-116` (all three treat `ADMIN | SYSTEM_ADMIN | OPS_AGENT` as platform admins).
- **Fix:** Extract one shared authorization helper (`isPlatformAdmin(role)` / `resolveActorType(role)`) and enforce `!req.user?.merchantId` consistently for merchant users across `submit`, `cancel`, and `acceptOffer`.

### 2.4 `PUT /api/v1/admin/lenders/:id/config` Unvalidated Raw Body & Missing `BigInt` Coercion
- **Where:** `src/modules/admin/admin.routes.ts:33-36` forwards raw `req.body` into `adminService.updateLenderConfig` (`admin.service.ts:71-72`), which expects `bigint | null` for `minAmountPaise` and `maxAmountPaise`. JSON requests cannot represent `BigInt` directly, forcing `AdminLendersPage.tsx:55` to omit min/max fields and render `(BACKEND CHANGE REQUIRED)`.
- **Fix:** Add a strict Zod schema in `admin.routes.ts` parsing numeric strings/numbers/`null` into `bigint | null` for `minAmountPaise` and `maxAmountPaise` (plus range validation `min <= max` and strict typing for `priority`, `timeoutMs`, `maxSafeRetries`, `fallbackOnDecline`, `routingRules`, `enabled`), then restore min/max editing inputs in `AdminLendersPage.tsx`.

### 2.5 Application Cancellation Leaves Offers & Lender Attempts Dangling
- **Where:** `src/modules/applications/application.service.ts:172-199` transitions the application to `CANCELLED`, leaving `ACTIVE` offers open (`OfferStatus.WITHDRAWN` has `0` uses across `src/`, `scripts/`, `tests/`) and never calling `LenderAdapter.cancelApplication` (already implemented on `JsonMockLenderAdapter` at `json-mock-lender.ts:279-281`).
- **Fix:** On cancellation, withdraw all `ACTIVE` offers (`OfferStatus.WITHDRAWN`), dispatch `cancelApplication` to adapters for open lender attempts, and persist non-fatal cancellation failure details in audit metadata rather than leaving ghost active offers.

### 2.6 Checkout Session Lifecycle (`consumeSession` / `revokeSession`) Never Triggered
- **Where:** `src/modules/checkout/checkout.service.ts:108-128` implements `consumeSession` and `revokeSession`, both with `0` runtime callers.
- **Fix:** Invoke `checkoutService.consumeSession` (updating `consumedAt`) when a checkout session initiates an active loan application, and expose `POST /api/v1/checkout/sessions/:token/revoke` so merchants/admins can invalidate unused QR checkout sessions.

### 2.7 `AuthService.logout` Does Not Invalidate Active Access Tokens
- **Where:** `src/modules/auth/auth.middleware.ts:45` validates `user.tokenVersion !== payload.tokenVersion`, yet `AuthService.logout` revokes the refresh session without bumping `tokenVersion`.
- **Fix:** Increment `user.tokenVersion` during full session revocation / security logout (or provide an explicit revoke-all option alongside single-device refresh revocation) so compromised/logged-out JWTs fail immediately instead of remaining valid until expiry.

---

## 3. Connect Existing Backend Capabilities Instead of Duplicating Them

| Capability Already Built | Current File / Symbol | Gap Today | Action to Connect |
| :--- | :--- | :--- | :--- |
| Merchant status gatekeeper | `requireMerchantStatus` (`src/modules/auth/auth.middleware.ts:75-111`) | `0` callers anywhere. `PENDING_VERIFICATION` / `SUSPENDED` merchants are only warned by FE UI banners (`MerchantOverviewPage`). | Mount `requireMerchantStatus(['ACTIVE'])` on purchase creation, checkout session creation, application creation/submission, and offer acceptance routes. |
| Background expiry sweeper | `ExpirationWorker` (`src/modules/workers/expiration.worker.ts:10-72`) | `0` runtime callers in `src/`. Expired checkouts/offers/applications accumulate unless lazily checked. | Register `ExpirationWorker` startup & clean shutdown interval in `src/server.ts` with configurable interval in `src/config/env.ts`. |
| Validated commission accrual & reversal | `CommissionService.accrue()` & `.reverse()` (`src/modules/ledger/commission.service.ts:33-69`) | `WebhookService.processWebhook` (`webhook.service.ts:237`) calls `stores.commissions.accrue(...)` directly, bypassing `CONFIRMED` & duplicate-entry guards; `reverse()` has `0` HTTP routes. | Inject `CommissionService` into `WebhookService`; expose `POST /api/v1/admin/commissions/:id/reverse` for ops adjustments/reversals. |
| Tested `AppStores` list & directory methods | `stores.merchants.list` (`0` callers everywhere), `stores.lenders.list`, `stores.users.listUsers` (`0` callers everywhere) | Admin merchants & lenders pages display missing-backend notices (`AdminMerchantsPage.tsx:78`, `AdminLendersPage.tsx:55`); `PartnersPage` hardcodes `DEMO_PARTNERS`; staff management claimed in `STATUS.md:31` lacks endpoints. | Expose `GET /api/v1/admin/merchants`, `GET /api/v1/admin/lenders`, `GET /api/v1/admin/users`, sanitized `GET /api/v1/lenders/public`, and merchant-scoped staff listing. |
| Lender attempt, tx, disbursement & consent reads + retention | `stores.lenderApplications.listByApplication`, `stores.transactions.findByApplication`, `stores.disbursements.listByLenderApp`, `stores.consents.listByCustomer`, `stores.customers.anonymizeCustomer` (`0` runtime `src/` callers) | Stored in DB / tested in `AppStores`, never returned to FE detail views or customer privacy endpoints. | Enrich `GET /api/v1/applications/:id` with lender attempts, transactions, and disbursements; expose `GET /api/v1/customers/:id/consents` and admin DPDP anonymization endpoint. |
| Waterfall routing & retry rules | `LenderConfiguration.{fallbackOnDecline,maxSafeRetries,routingRules}` & `LenderApplication.reconcileAttempts` | Ignored by `WaterfallOrchestrator` (`waterfall.ts:83-200`). | Wire `maxSafeRetries`, `fallbackOnDecline`, and rule evaluation inside `WaterfallOrchestrator` instead of fixed single-pass iteration. |
| Persisted EMI amortization schedule | `EmiCalculator` computes `schedule`; `ResultApplier` (`result-applier.ts:93`) sets `repaymentSchedule: null` | Schedule is discarded rather than saved on `FinancingOffer`. | Forward computed or lender-provided schedule through `OfferProposal` -> `ResultApplier` -> `FinancingOffer.repaymentSchedule` for zero-recalculation FE display. |
| Shared pagination helper | `buildPaginationMeta` (`src/common/pagination.ts:15-25`) | `0` runtime `src/` callers; `purchase.routes.ts:73` & `application.routes.ts:115` emit `{ page, pageSize, total }` without `totalPages`, forcing FE (`MerchantPurchasesPage`, `MerchantApplicationsPage`) to duplicate `Math.ceil(...)`. | Adopt `buildPaginationMeta` uniformly across paginated list endpoints and consume backend `totalPages` in FE. |

---

## 4. Improve Frontend-Backend Consistency

### 4.1 Normalize JSON Money (`BigInt`) and Optional Nullable Fields
- `sendSuccess` (`src/common/response.ts:27-46`) already recursively converts every `BigInt` via `serializeBigInts`.
- **Inconsistency:** `purchase.routes.ts`, `application.routes.ts`, and `offer.routes.ts` duplicate manual `.toString()` spreads and disagree on optional fields (`offer.routes.ts:40-42` coerces optional BigInts with `?? null`, while `offer.routes.ts:20-21` and `application.routes.ts:135-136` emit `undefined`/omitted keys; `taxesPaise` and `otherChargesPaise` lack uniform `null` coercion).
- **Fix:** Let `sendSuccess` handle `BigInt` serialization centrally and standardize DTO mapper helpers so every optional numeric/string field (`downPaymentPaise`, `processingFeePaise`, `totalRepayablePaise`, `taxesPaise`, `otherChargesPaise`, `aprPercent`, `termsVersion`, `termsUrl`) consistently returns explicit `null` when absent.

### 4.2 Close OpenAPI Spec & Documentation Drift
- **OpenAPI completeness:** `src/docs/openapi.json` documents only **11 endpoints**, whereas `34` routes are registered (`STATUS.md:47` incorrectly claims all 10 domain route groups are documented). Add schemas & paths for `/auth/logout`, `/auth/me`, `/merchants/*`, `/customers/*`, `/offers/*`, `/admin/*`, `/health`, and `/ready` (noting intentionally un-enveloped probe responses `/health` & `/ready`).
- **Stale repository docs & seed data mismatches:**
  - `README.md:31`: states `13` store interfaces (actual: `17`).
  - `STATUS.md:17`: references unused `jose` and `qrcode`.
  - `STATUS.md:31`: claims merchant staff management is implemented (no route exists in `merchant.routes.ts`).
  - `STATUS.md:45`: overstates cross-route RBAC alignment.
  - `prisma/seed-demo.ts:4`: uses `FINTECH_LSP`, whereas Prisma `LenderType` enum only defines `BANK | NBFC | OTHER`.

### 4.3 Align Frontend UI & Client Wrappers with Actual Backend Payloads
- **Wire unused FE API wrappers:** Connect `purchaseApi.getPurchase` (`purchaseApi.ts:42`) for purchase detail inspection and connect `customerApi.grantConsent` / `revokeConsent` (`customerApi.ts:28,39`) alongside the new `GET /customers/:id/consents` route.
- **Mask PII consistently:** `lib/utils.ts:21` exports `maskPhone` (`0` callers today), while `MerchantApplicationDetailPage.tsx:222` and `AdminApplicationsPage.tsx:138` display full unmasked customer phone numbers. Apply `maskPhone` in list and summary views.
- **Surface hidden financial/audit fields already returned by APIs:**
  - `OfferCard.tsx` (`1-141`): currently omits `downPaymentPaise`, `aprPercent`, `taxesPaise`, `otherChargesPaise`, `termsVersion`, `termsUrl`, `expiresAt`, and `repaymentSchedule`. Add Key Facts / APR / Terms disclosure cleanly to meet fintech transparency standards.
  - `MerchantOverviewPage` / `MerchantSettingsPage`: render `Merchant.suspendedAt` when non-null.
  - `MerchantCommissionsPage`: surface `note`, `ruleSnapshot`, and `reversesEntryId`.
  - `AdminAuditLogsPage`: render `metadata` drawer/expandable JSON and `merchantId` column.

---

## 5. Make the Project Easier to Maintain and Extend

1. **Extract Services for Inline-Store Routes:**
   - Move inline `stores.*` orchestration out of `merchant.routes.ts`, `customer.routes.ts`, and `purchase.routes.ts` into dedicated `MerchantService`, `CustomerService`, and `PurchaseService` classes so every domain module follows the same `Routes (Zod validation) -> Service (business rules, masking, audit logging) -> AppStores` architecture already used by `auth`, `checkout`, `applications`, `offers`, `ledger`, and `admin`.
2. **Centralize RBAC & Actor Predicates:**
   - Replace ad-hoc `req.user?.role === 'ADMIN'` checks with shared helpers covering `ADMIN | SYSTEM_ADMIN | OPS_AGENT` vs `MERCHANT_OWNER | MERCHANT_STAFF`, mirrored cleanly with `authStore.ts` (`isAdminRole`, `isMerchantRole`).
3. **Establish a Generated Shared API Contract Layer:**
   - Once `openapi.json` covers all 34+ endpoints, generate strict TypeScript request/response types (replacing manual duplicate FE interfaces and the broken `"udyam-pay-backend": "file:../udhyam-pay-backend"` dependency).
4. **Modularize Large Frontend Pages & Shared UI Controls:**
   - Decompose multi-responsibility pages into focused subcomponents & hooks:
     - `FinancingWizardPage.tsx` (**798 lines**) -> step views, form schemas, and orchestration hook
     - `MerchantOverviewPage.tsx` (**402 lines**) -> status banner, KPI grid, recent activity widgets
     - `MerchantPurchasesPage.tsx` (**349 lines**) -> create modal, table, pagination footer
     - `MerchantApplicationDetailPage.tsx` (**348 lines**) -> header summary, timeline, offers panel, action controls
   - Extract duplicated business category option lists and pagination bars into shared modules consuming backend `buildPaginationMeta`.
5. **Normalize TypeScript Config Hygiene:**
   - Remove `"types": []` workaround in `tsconfig.json:7` and align `tsconfig.verify.json` so standard `@types/*` resolution removes the need for custom `src/types/*.d.ts` ambient overrides.

---

## 6. Preserve Everything Needed for Future Real Lender Integrations (`DO NOT REMOVE`)

To ensure cleanup never strips production lending readiness, **all items below are protected and must stay intact**:

### 6.1 Fail-Closed Provider & Adapter Architecture
- **`ProductionDisabledLenderAdapter` (`src/modules/lenders/provider-factory.ts:24-55,116-150`)**: Critical safety boundary ensuring `PROVIDER_MODE=sandbox|production` fails closed instead of falling back to simulated offers.
- **`LenderAdapter` Interface & DTOs (`src/modules/lenders/lender-adapter.interface.ts:7-77`)**: Preserve `checkEligibility`, `submitApplication`, `pollStatus`, `cancelApplication` (`:72-75`), webhook verification contracts, and full `OfferProposal` KFS fields (`aprPercent`, `downPaymentPaise`, `taxesPaise`, `otherChargesPaise`, `termsVersion`, `termsUrl`).
- **`CircuitBreaker` (`src/modules/lenders/circuit-breaker.ts`)**: Keep per-lender failure isolation intact (later backable by Redis for multi-instance deployments).

### 6.2 Orchestration, State Machine & Calculators
- **`WaterfallOrchestrator` (`waterfall.ts`)**, **`ResultApplier` (`result-applier.ts`)**, and **`EmiCalculator`**.
- **Complete 15-State `ApplicationStatus` Machine (`application-status.ts`, `application-state-machine.ts`)**: Preserve currently unexercised intermediate states—`DRAFT`, `ADDITIONAL_INFORMATION_REQUIRED`, `LENDER_FINAL_CONFIRMATION`, `DISBURSEMENT_PENDING`, and `MANUAL_REVIEW`—which map directly to multi-step real LSP/NBFC callbacks (CKYC, e-mandate, KFS confirmation, and UTR disbursement).

### 6.3 Full Prisma Schema, Unused Enums & PostgreSQL Constraints
- **Preserve all 19 Prisma models and 23 enums**, including enum values not yet hit by mock flows:
  - `OfferType.INDICATIVE_ELIGIBILITY`
  - `OfferStatus.WITHDRAWN`
  - `TransactionType.{PURCHASE_PAYMENT, MERCHANT_SETTLEMENT, REFUND}`
  - `CommissionEntryType.ADJUSTMENT`
  - `LenderAttemptOutcome.RECONCILING`
  - `WebhookProcessingStatus.IGNORED_OUT_OF_ORDER`
  - `ReconciliationStatus.{UNRECONCILED, MISMATCHED}`
  - `RateType.{FIXED, FLOATING, UNSPECIFIED}`
- **Preserve database-level financial integrity**: `WebhookEvent`, `LenderApplication` (with `reconcileAttempts`), `Transaction`, `DisbursementStatus`, and PostgreSQL `001_constraints.sql` / `20261031120000_init/migration.sql` check constraints + append-only ledger triggers.

### 6.4 Frontend Future-Readiness Scaffolding
- Preserve `BackendRequiredNotice` (retiring individual notices progressively as Phase 3 endpoints land), `KycPrimitives.tsx` (`KycStepCard`, `DocumentUploadPlaceholder`, `VerificationProgress`), `DemoModeBanner` & `isSimulated` badges (RBI Digital Lending disclosure alignment), and `src/types/future.ts` planning contracts (`UtilityBillerProvider`, `UtilityBillFetchResponse`, `KycStepCode`).

---

## 7. Prioritized Implementation Roadmap & Verification Gates

| Phase | Scope | Key Actions | Verification Gate |
| :--- | :--- | :--- | :--- |
| **Phase 1: Safe Cleanup & Critical Bug Fixes** | Dead deps, broken `/auth/me`, PG webhook lookup, RBAC, `BigInt` validation, cancel & logout gaps | Remove `jose`, `qrcode`, `@types/qrcode`, FE `udyam-pay-backend` link, nested `udhyam-pay-backend/`, `getOffer`, duplicate `/docs`; fix `/auth/me` middleware, `findByExternalReference`, unified admin RBAC + cancel guard, `PUT /lenders/:id/config` Zod schema, `cancelApplication` offer withdrawal + adapter cancel, `logout` `tokenVersion` bump | Backend `npm run typecheck`, `npm run test:verify`; Prisma `WebhookService` + RBAC tests; FE `npm run build` |
| **Phase 2: Wire Existing Backend Capabilities** | Security middleware, background jobs, ledger safety, waterfall & EMI output | Mount `requireMerchantStatus(['ACTIVE'])`; start `ExpirationWorker` in `server.ts`; route webhook commission through `CommissionService.accrue()`; call `consumeSession`; adopt `buildPaginationMeta`; persist `repaymentSchedule`; honor `fallbackOnDecline`/`maxSafeRetries` | Full backend test suite (`PrismaStore` + `InMemoryStores`); verify ledger/commission invariants |
| **Phase 3: Expose Tested `AppStores` & Close FE Gaps** | Admin directories, consents, PII masking, KFS offer fields | Add `GET /admin/merchants`, `GET /admin/lenders`, `GET /admin/users`, `GET /customers/:id/consents`, `POST /admin/commissions/:id/reverse`, `POST /checkout/sessions/:token/revoke`, `POST /admin/customers/:id/anonymize`; hydrate attempts/tx/disbursements in application detail; connect FE pages, `maskPhone`, and full `OfferCard` fields | End-to-end smoke checks across Merchant + Admin UI workflows; FE `npm run build` |
| **Phase 4: Maintainability & Contract Sync** | Service extraction, OpenAPI completeness, FE component splits, `tsconfig` cleanup | Extract `MerchantService`/`CustomerService`/`PurchaseService`; complete `openapi.json` across all routes + generate FE API types; split `FinancingWizardPage` (798 lines) & other large views; remove `"types": []` + ambient shims; update `README.md`/`STATUS.md`/`seed-demo.ts` | Backend `npm run typecheck`, `npm run test:verify`; FE typecheck + `npm run build` |
| **Phase 5: Real Aggregator & Utility Expansion** | Production NBFC/LSP adapters, KYC & BBPS | Implement concrete `LenderAdapter` providers behind `provider-factory.ts`; add encrypted PII + CKYC/AA KYC & BBPS endpoints to unlock `KycPrimitives` and `future.ts` contracts | Sandbox certification tests with `PROVIDER_MODE=sandbox` |

