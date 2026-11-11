# Udyam PAY — Dead Code, Unwired Capabilities & Cleanup Candidates

**Audit Policy (`NO FRONTEND CALL != USELESS`)**:
Code lacking a frontend UI call is **never** automatically classified as dead code. Internal security enforcement, cryptographic rotation, server-to-server webhooks, database integrity stores, compliance workers, and tests are preserved with explicit risk ratings.

Risk levels:
- **DO NOT REMOVE**: Essential security, compliance, state machine, persistence, or test infrastructure.
- **HIGH**: Removing blindly breaks tests, TypeScript builds, or future planned integration boundaries.
- **MEDIUM**: Requires coordinated cleanup across imports/config/docs/tests before removal or wiring.
- **LOW**: Truly unreferenced package, duplicate artifact, or trivial dead export safe to prune after verification.

Final verdicts: **KEEP** | **CONNECT** | **REVIEW / REWORK** | **POSSIBLY REMOVE**

---

## 1. Backend Candidates (`udhyam-pay-backend`)

### A. Miswired, Unwired & Bypassed Backend Logic (Wire/Fix — Do NOT Blindly Delete)

| Candidate | Location | Evidence / Call Counts | `NO FE CALL != USELESS` Evaluation | Risk | Verdict |
| --- | --- | --- | --- | --- | --- |
| `GET /api/v1/auth/me` | `src/modules/auth/auth.routes.ts:75`, `src/routes/index.ts:46` | Route exists; mounted **before** `authMiddleware` (`:53`); returns `{ user: req.user }`; FE `authApi.getMe` has `0` callers | Essential session introspection endpoint needed for cookie auth and operator profile display | **HIGH** | **CONNECT** *(move route behind `authMiddleware` and wire UI)* |
| `requireMerchantStatus` | `src/modules/auth/auth.middleware.ts:75` | `nonPersist=1` (definition only), `scripts=0`, `tests=0` | Critical RBAC/compliance control to block `PENDING_VERIFICATION` / `SUSPENDED` merchants from creating purchases or applications | **DO NOT REMOVE** | **CONNECT** *(mount on purchase, checkout, application, offer routes)* |
| `ExpirationWorker` | `src/modules/workers/expiration.worker.ts:10` | `nonPersist=1`, `scripts=2` (`verify-logic.ts`), `tests=2`; never started in `src/server.ts` | Required background sweeper for `CheckoutSession` & `FinancingApplication` expiry | **DO NOT REMOVE** | **CONNECT** *(schedule interval/worker in `src/server.ts`)* |
| `CheckoutService.consumeSession` & `revokeSession` | `src/modules/checkout/checkout.service.ts:108,120` | `0` callers in `src/` routes/services; tested in `verify-logic.ts` | Required single-use QR consumption & revocation security controls | **DO NOT REMOVE** | **CONNECT** *(consume when customer/merchant completes QR session; add revoke route)* |
| `CommissionService.accrue` & `reverse` | `src/modules/ledger/commission.service.ts:33,69` | `0` runtime callers outside `commission.service.ts` (`webhook.service.ts:237` calls `stores.commissions.accrue` directly); `reverse` has `0` runtime callers | Core financial double-entry ledger logic; bypassing `CommissionService.accrue()` risks drift | **DO NOT REMOVE** | **CONNECT** *(route `WebhookService` through `CommissionService.accrue()` and expose reversal workflow)* |
| `WebhookService.processWebhook` (`lenderApplicationsMap` lookup) | `src/modules/webhooks/webhook.service.ts:163` | Active S2S route `POST /webhooks/lenders/:code`; casts `(this.stores as any).lenderApplicationsMap` | Mandatory S2S lender callback receiver; currently broken in PostgreSQL mode when resolving by `externalReference` | **DO NOT REMOVE** | **REVIEW / REWORK** *(replace with `LenderApplicationStore.findByExternalReference` + call `CommissionService.accrue`)* |
| `stores.merchants.list` & `stores.users.listUsers` | `src/modules/persistence/stores.ts`, `prisma-store.ts`, `in-memory-store.ts` | `0` callers in `src/`, `scripts/`, `tests/` | Needed directly by blocked Admin Directory APIs (`GET /admin/merchants`, staff list) | **HIGH** | **CONNECT** *(expose admin list routes)* |
| `stores.lenderApplications.listByApplication`, `transactions.findByApplication`, `disbursements.listByLenderApp`, `consents.listByCustomer`, `customers.anonymizeCustomer` | `src/modules/persistence/stores.ts` | `0` runtime `src/` callers (scripts/tests only for some; `0` anywhere for `consents.listByCustomer`, `disbursements.listByLenderApp`) | DPDP right-to-erasure & ledger/underwriting traceability stores | **DO NOT REMOVE** | **CONNECT / KEEP** *(expose inspection & DPDP erasure workflows)* |
| `LenderConfiguration` routing fields (`fallbackOnDecline`, `maxSafeRetries`, `routingRules`) | `prisma/schema.prisma`, `admin.service.ts`, `waterfall.ts` | Persisted by Admin/Seed (`nonP=1` write); unread by `WaterfallOrchestrator` | Needed for per-lender routing & retry configuration | **HIGH** | **CONNECT** *(honor config flags in `waterfall.ts`)* |

### B. Unused / Unreferenced Backend Symbols, Routes & Enum Values

| Candidate | Location | Evidence | Risk | Verdict |
| --- | --- | --- | --- | --- |
| `OfferService.getOffer` | `src/modules/offers/offer.service.ts:33` | `0` callers anywhere in `src/`, `scripts/`, `tests/` | **LOW** | **POSSIBLY REMOVE** *(unless a `GET /offers/:offerId` endpoint is planned)* |
| `ServiceUnavailableError` | `src/common/errors.ts:83` | `0` callers anywhere (`nonPersist=1`, `scripts=0`, `tests=0`) | **LOW** | **KEEP** *(standard HTTP 503 error hierarchy sibling, ~5 lines)* |
| `ValidationError` | `src/common/errors.ts:36` | `0` runtime callers (`nonPersist=1`), `tests=2` (`error-handler.ts` inline-creates `new AppError` instead) | **LOW** | **REVIEW / REWORK** *(use `ValidationError` inside `error-handler.ts` or keep for tests)* |
| `buildPaginationMeta` | `src/common/pagination.ts:15` | `0` runtime callers (`nonPersist=1`), `tests=2` (routes inline `{ page, pageSize, total }` without `totalPages`) | **LOW** | **CONNECT** *(use across list routes so backend returns `totalPages` consistently)* |
| `MockLenderAdapter` | `src/modules/lenders/adapters/mock-lender.ts` | `0` runtime callers (`provider-factory.ts` uses `JsonMockLenderAdapter`); still imported by `scripts/verify-logic.ts` and `tests/unit/mock-lender.test.ts` + `waterfall.test.ts` | **MEDIUM** | **REVIEW / REWORK** *(consolidate tests onto `JsonMockLenderAdapter`, then remove legacy `mock-lender.ts`)* |
| `LenderAdapter.checkEligibility`, `pollStatus`, `cancelApplication` | `src/modules/lenders/lender-adapter.interface.ts:72-75` | `checkEligibility` used only in `verify-journey.ts:154` & unit test; `pollStatus` & `cancelApplication` have `0` callers anywhere | **MEDIUM** | **REVIEW / REWORK** *(keep interface contract for upcoming live aggregator integration, OR wire `cancelApplication` into `ApplicationService.cancelApplication`)* |
| `ProductionDisabledLenderAdapter` | `src/modules/lenders/provider-factory.ts:24` | Always blocks non-simulated lenders even when credentials exist | **DO NOT REMOVE** | **KEEP (until live FinBox/aggregator adapter is built)** *(vital fail-closed safeguard preventing fake live approvals)* |
| `GET /api/docs` (duplicate of `GET /docs`) | `src/app.ts:73,83` | Two identical routes serving partial `openapi.json` (`11/34` paths) | **LOW** | **REVIEW / REWORK** *(keep `/api/docs` or `/docs` with redirect, and update `openapi.json` to cover all 34 endpoints)* |
| `stores.lenderApplications.findByRequestKey`, `refreshSessions.revokeUserSessions`, `transactions.confirmTransaction` | `src/modules/persistence/stores.ts` | `0` callers in `src/`, `scripts/`, `tests/` | **LOW–MEDIUM** | **KEEP / CONNECT** *(`revokeUserSessions` & `confirmTransaction` are valuable security/reconciliation primitives)* |
| `EmiCalculator` `schedule` return value | `src/modules/lenders/emi-calculator.ts` | `schedule: RepaymentInstallment[]` generated in calculator, discarded in `json-mock-lender.ts`; `result-applier.ts:93` writes `repaymentSchedule: null` | **LOW** | **CONNECT** *(pass schedule through `OfferProposal` so `FinancingOffer.repaymentSchedule` is populated cleanly)* |
| Unused Enum Values (`OfferType.INDICATIVE_ELIGIBILITY`, `OfferStatus.WITHDRAWN`, `TransactionType.{PURCHASE_PAYMENT,MERCHANT_SETTLEMENT,REFUND}`, `CommissionEntryType.ADJUSTMENT`, `LenderAttemptOutcome.RECONCILING`, `WebhookProcessingStatus.IGNORED_OUT_OF_ORDER`, `ReconciliationStatus.{UNRECONCILED,MISMATCHED}`, `RateType.{FIXED,FLOATING,UNSPECIFIED}`) | `prisma/schema.prisma` | `0` runtime `nonPersist` hits (some in Zod schema or migration default only) | **HIGH** *(schema/enum removal requires Postgres enum migration)* | **KEEP** *(domain-complete ledger & aggregator lifecycle vocabulary; keep in Postgres schema, wire as aggregator/reconciliation features land)* |
| `DemoLenderType` vs `LenderType` drift (`FINTECH_LSP`) | `prisma/seed-demo.ts:4` vs `prisma/schema.prisma` | Uses `'FINTECH_LSP'` while Prisma `LenderType` is `BANK \| NBFC \| OTHER` | **LOW** | **REVIEW / REWORK** *(align `seed-demo.ts` type with `LenderType`)* |

### C. Unused Backend Packages & Repository Artifacts

| Candidate | Location | Evidence | Risk | Verdict |
| --- | --- | --- | --- | --- |
| `jose` (`^5.9.6`) | `udhyam-pay-backend/package.json:47` | `0` imports/hits in `src/`, `prisma/`, `scripts/`, `tests/` (`TokenService` uses Node `crypto` HMAC) | **LOW** | **POSSIBLY REMOVE** *(or adopt `jose` in `TokenService`)* |
| `qrcode` (`^1.5.4`) | `udhyam-pay-backend/package.json:50` | `0` imports/hits (`qrPayload` URL returned as string; rendered on frontend) | **LOW** | **POSSIBLY REMOVE** |
| `@types/qrcode` (`^1.5.5`) | `udhyam-pay-backend/package.json:59` | `0` hits anywhere | **LOW** | **POSSIBLY REMOVE** |
| `src/types/{express,node,vitest}.d.ts` | `src/types/*.d.ts` | Offline ambient declaration shims alongside installed `@types/node`, `@types/express`, `vitest` | **HIGH** *(required while `tsconfig.json` specifies `"types": []` and included by `tsconfig.verify.json`)* | **REVIEW / REWORK** *(keep as-is OR remove only after updating `tsconfig.json` & `tsconfig.verify.json`)* |
| Accidental nested copy `./udhyam-pay-backend/` + `udhyam-pay-backend-complete.zip` | `udhyam-pay-backend/udhyam-pay-backend/` (111 files, `~1.11 MB`) | Gitignored duplicate snapshot created during earlier packaging; unrelated to runtime build | **LOW** | **POSSIBLY REMOVE** *(safe to delete redundant nested directory once confirmed backups are unnecessary)* |
| Stale Claims in `AUDIT_REPORT.md`, `STATUS.md`, `FINAL_VERIFICATION_REPORT.md`, `README.md` | Repo root | Historical snapshot docs claiming 13 store interfaces, live staff APIs, full 10-group OpenAPI coverage, and `jose`/`qrcode` usage | **LOW** | **REVIEW / REWORK** *(update or archive superseded progress snapshots)* |

---

## 2. Frontend Candidates (`udyam-pay-frontend`)

### A. Unwired API Wrappers (`src/lib/api/*.ts`)

| Candidate | Location | Evidence | Risk | Verdict |
| --- | --- | --- | --- | --- |
| `authApi.getMe` | `src/lib/api/authApi.ts:65` | `run=0, test=0`; intentionally avoided while backend `GET /auth/me` is miswired | **LOW** | **CONNECT** *(enable after backend puts `GET /auth/me` behind `authMiddleware`)* |
| `customerApi.grantConsent` & `GrantConsentPayload` | `src/lib/api/customerApi.ts:11,28` | `run=0, test=0`; corresponds to working backend `POST /customers/:id/consents` | **LOW** | **CONNECT** *(wire when `LENDER_DATA_SHARING` re-consent UI is added)* |
| `customerApi.revokeConsent` | `src/lib/api/customerApi.ts:39` | `run=0, test=0`; corresponds to working backend `DELETE /customers/:id/consents/:consentId` | **LOW** | **CONNECT** *(wire DPDP consent withdrawal UI in customer/application detail)* |
| `purchaseApi.getPurchase` | `src/lib/api/purchaseApi.ts:42` | `run=0, test=0`; corresponds to `GET /purchases/:id` | **LOW** | **CONNECT** *(use for deep-linking or authoritative single-purchase refresh instead of reusing list cache)* |

### B. Unused Utilities, Store Helpers, Future Types & Packages

| Candidate | Location | Evidence | Risk | Verdict |
| --- | --- | --- | --- | --- |
| `maskPhone` | `src/lib/utils.ts:21` | `run=0, test=0` (UI currently shows unmasked phone numbers in `MerchantApplicationDetailPage:222` and `AdminApplicationsPage:138`) | **LOW** | **CONNECT** *(apply `maskPhone` in application/detail views to protect customer PII)* |
| `isMerchantRole` | `src/stores/authStore.ts:118` | `run=0, test=0` | **LOW** | **KEEP** *(clean symmetric helper alongside `isAdminRole`)* |
| `formatBigIntIndian` | `src/lib/money/paise.ts` | `run=0, test=2` (unit-tested internal/formatting helper) | **LOW** | **KEEP** |
| `KycStepCard` | `src/components/financial/KycPrimitives.tsx` | `run=0, test=0` (defined beside used `DocumentUploadPlaceholder` and `VerificationProgress`) | **LOW** | **CONNECT / KEEP** *(ready for aggregator KYC step rendering)* |
| `UtilityBillerProvider`, `UtilityBillFetchResponse`, `KycStepCode` | `src/types/future.ts` | `run=0, test=0` | **LOW** | **KEEP / CONNECT** *(future contract types for Utilities & KYC)* |
| `"udyam-pay-backend": "file:../udhyam-pay-backend"` | `udyam-pay-frontend/package.json:29` | `0` code imports (`src/` hits are two prose strings in `FaqPage` and `UtilitiesPage`) | **LOW** | **POSSIBLY REMOVE** *(broken/unused local tarball/folder dependency; note spelling `udyam` vs `udhyam`)* |
| Placeholder Checklists & Demo Arrays (`DEMO_PARTNERS` in `PartnersPage.tsx`, `SAMPLE PREVIEW` in `LandingPage.tsx`, `futureClosingChecklist` in `MerchantApplicationDetailPage.tsx`) | Feature pages | Honest preview/placeholder UI clearly labeled and/or accompanied by `BackendRequiredNotice` | **MEDIUM** | **CONNECT** *(replace static arrays once `GET /lenders` and document/KYC endpoints exist)* |

