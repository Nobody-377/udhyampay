import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FlaskConical,
  QrCode,
  Send,
  Store,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/FormFields';
import { KpiGridSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { MoneyDisplay } from '@/components/financial/MoneyDisplay';
import { OfferCard } from '@/components/financial/OfferCard';
import { QrTicketCard } from '@/components/financial/QrTicketCard';
import { ApplicationStatusBadge } from '@/components/financial/StatusBadge';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { applicationApi } from '@/lib/api/applicationApi';
import { checkoutApi } from '@/lib/api/checkoutApi';
import { customerApi } from '@/lib/api/customerApi';
import { offerApi } from '@/lib/api/offerApi';
import { purchaseApi } from '@/lib/api/purchaseApi';
import { merchantApi } from '@/lib/api/merchantApi';
import { isDemoEnvironment } from '@/lib/config';
import { createIdempotencyKey } from '@/lib/idempotency';
import { parseInrInputToPaise, toPaiseBigInt } from '@/lib/money/paise';
import { APPLICATION_STATUS_META } from '@/lib/status-meta';
import { cn } from '@/lib/utils';
import {
  createApplicationSchema,
  createPurchaseSchema,
  registerCustomerSchema,
  type CreateApplicationFormValues,
  type CreatePurchaseFormValues,
  type RegisterCustomerFormValues,
} from '@/lib/validation/schemas';
import {
  PRODUCT_CATEGORIES,
  type CheckoutSessionCreateResponse,
  type Customer,
  type FinancingApplication,
  type FinancingOffer,
  type Purchase,
  type Shop,
} from '@/types/api';

const WIZARD_STEPS = [
  { num: 1, title: 'Shop' },
  { num: 2, title: 'Customer' },
  { num: 3, title: 'Purchase' },
  { num: 4, title: 'Financing' },
  { num: 5, title: 'Submit' },
  { num: 6, title: 'Offers' },
  { num: 7, title: 'Accept' },
] as const;

const DEMO_PHONE_SCENARIOS = [
  { label: 'Multi-Offer Approve', phone: '+919876543210' },
  { label: '0% Promo EMI', phone: '+919876540010' },
  { label: 'Policy Decline', phone: '+919876540001' },
  { label: 'Additional Info', phone: '+919876540002' },
  { label: 'Async Pending', phone: '+919876540007' },
] as const;

export function FinancingWizardPage() {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [stepError, setStepError] = useState<unknown>(null);

  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [qrSession, setQrSession] = useState<CheckoutSessionCreateResponse | null>(null);
  const [application, setApplication] = useState<FinancingApplication | null>(null);
  const [offers, setOffers] = useState<FinancingOffer[]>([]);
  const [acceptedOffer, setAcceptedOffer] = useState<FinancingOffer | null>(null);

  const purchaseDraftIdempotencyKey = useMemo(() => createIdempotencyKey('purch'), []);
  const appDraftIdempotencyKey = useMemo(() => createIdempotencyKey('app'), []);

  const shopsQuery = useQuery({
    queryKey: ['merchant', 'shops'],
    queryFn: ({ signal }) => merchantApi.listShops(signal),
  });

  // Step 2 Form: Customer & DPDP Consent
  const customerForm = useForm<RegisterCustomerFormValues>({
    resolver: zodResolver(registerCustomerSchema),
    defaultValues: {
      fullName: '',
      phone: '',
      consentNoticeVersion: 'v1.0-2026',
      consentAccepted: undefined as unknown as true,
    },
  });

  const registerCustomerMutation = useMutation({
    mutationFn: (values: RegisterCustomerFormValues) =>
      customerApi.registerCustomer({
        fullName: values.fullName,
        phone: values.phone,
        consentNoticeVersion: values.consentNoticeVersion,
        captureMethod: 'CUSTOMER_CHECKOUT_SESSION',
      }),
    onSuccess: (res) => {
      setCustomer(res.customer);
      setStepError(null);
      if (selectedShop) {
        purchaseForm.setValue('shopId', selectedShop.id);
        purchaseForm.setValue('customerId', res.customer.id);
      }
      setStep(3);
    },
    onError: (err) => setStepError(err),
  });

  // Step 3 Form: Purchase + Optional QR
  const purchaseForm = useForm<CreatePurchaseFormValues>({
    resolver: zodResolver(createPurchaseSchema),
    defaultValues: {
      shopId: '',
      customerId: '',
      productCategory: 'TELEVISION',
      productDescription: '',
      amountRupees: '',
    },
  });

  const createPurchaseMutation = useMutation({
    mutationFn: (values: CreatePurchaseFormValues) =>
      purchaseApi.createPurchase({
        shopId: selectedShop!.id,
        customerId: customer?.id,
        productCategory: values.productCategory,
        productDescription: values.productDescription || undefined,
        amountPaise: parseInrInputToPaise(values.amountRupees).toString(),
        idempotencyKey: purchaseDraftIdempotencyKey,
      }),
    onSuccess: (created) => {
      setPurchase(created);
      setStepError(null);
      queryClient.invalidateQueries({ queryKey: ['merchant', 'purchases'] });
      applicationForm.setValue(
        'requestedAmountRupees',
        (toPaiseBigInt(created.amountPaise) / 100n).toString(),
      );
    },
    onError: (err) => setStepError(err),
  });

  const generateQrMutation = useMutation({
    mutationFn: () =>
      checkoutApi.createSession({
        shopId: selectedShop!.id,
        purchaseId: purchase!.id,
        validityMinutes: 30,
      }),
    onSuccess: (session) => {
      setQrSession(session);
      setStepError(null);
    },
    onError: (err) => setStepError(err),
  });

  // Step 4 Form: Financing Application
  const applicationForm = useForm<CreateApplicationFormValues>({
    resolver: zodResolver(createApplicationSchema),
    defaultValues: {
      requestedAmountRupees: '',
      downPaymentRupees: '0',
      requestedTenureMonths: 6,
      routingMode: 'SEQUENTIAL',
    },
  });

  const createApplicationMutation = useMutation({
    mutationFn: (values: CreateApplicationFormValues) =>
      applicationApi.createApplication({
        shopId: selectedShop!.id,
        purchaseId: purchase!.id,
        customerId: customer!.id,
        requestedAmountPaise: parseInrInputToPaise(values.requestedAmountRupees).toString(),
        downPaymentPaise: parseInrInputToPaise(values.downPaymentRupees || '0').toString(),
        requestedTenureMonths: values.requestedTenureMonths,
        routingMode: values.routingMode,
        idempotencyKey: appDraftIdempotencyKey,
      }),
    onSuccess: (createdApp) => {
      setApplication(createdApp);
      setStepError(null);
      queryClient.invalidateQueries({ queryKey: ['merchant', 'applications'] });
      setStep(5);
    },
    onError: (err) => setStepError(err),
  });

  // Step 5: Submit Application to Waterfall Engine
  const submitApplicationMutation = useMutation({
    mutationFn: async () => {
      const updated = await applicationApi.submitApplication(application!.id);
      if (updated.status === 'OFFER_AVAILABLE') {
        const fetchedOffers = await offerApi.listOffers(updated.id);
        return { updated, fetchedOffers };
      }
      return { updated, fetchedOffers: [] as FinancingOffer[] };
    },
    onSuccess: ({ updated, fetchedOffers }) => {
      setApplication(updated);
      setOffers(fetchedOffers);
      setStepError(null);
      queryClient.invalidateQueries({ queryKey: ['merchant', 'applications'] });
      if (updated.status === 'OFFER_AVAILABLE') {
        setStep(6);
      }
    },
    onError: (err) => setStepError(err),
  });

  // Step 6 -> 7: Accept Offer
  const acceptOfferMutation = useMutation({
    mutationFn: (offerId: string) => offerApi.acceptOffer(application!.id, offerId),
    onSuccess: (result) => {
      setAcceptedOffer(result.offer);
      setApplication((prev) =>
        prev ? { ...prev, status: result.applicationStatus as FinancingApplication['status'] } : prev,
      );
      setStepError(null);
      queryClient.invalidateQueries({ queryKey: ['merchant', 'applications'] });
      setStep(7);
    },
    onError: (err) => setStepError(err),
  });

  const shops = shopsQuery.data ?? [];

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F8FAFC]">
            New Financing Request
          </h1>
          <p className="text-sm text-[#9CA3AF]">
            7-step POS customer financing workflow from store selection to offer acceptance.
          </p>
        </div>

        {/* Desktop Progress Indicator */}
        <Card className="p-4 hidden sm:block">
          <ol className="grid grid-cols-7 gap-2">
            {WIZARD_STEPS.map((s) => {
              const completed = step > s.num;
              const current = step === s.num;
              return (
                <li key={s.num} className="flex flex-col items-center text-center gap-1.5">
                  <div
                    className={cn(
                      'h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                      completed
                        ? 'bg-[#34D399] text-[#090A0C]'
                        : current
                          ? 'bg-[#C8FF32] text-[#090A0C] shadow-limeGlow'
                          : 'bg-[#181B21] text-[#6B7280] border border-[rgba(255,255,255,0.08)]',
                    )}
                  >
                    {completed ? <CheckCircle2 className="h-4 w-4" /> : s.num}
                  </div>
                  <span
                    className={cn(
                      'text-[11px] font-semibold',
                      current ? 'text-[#C8FF32]' : completed ? 'text-[#F8FAFC]' : 'text-[#6B7280]',
                    )}
                  >
                    {s.title}
                  </span>
                </li>
              );
            })}
          </ol>
        </Card>

        {/* Mobile Compact Progress Indicator */}
        <Card className="p-4 sm:hidden space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[#C8FF32]">
              Step {step} of {WIZARD_STEPS.length}
            </span>
            <span className="font-semibold text-[#F8FAFC]">
              {WIZARD_STEPS[step - 1]?.title}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-[#181B21] overflow-hidden">
            <div
              className="h-full bg-[#C8FF32] transition-all duration-300"
              style={{ width: `${(step / WIZARD_STEPS.length) * 100}%` }}
            />
          </div>
        </Card>

        {stepError ? <ErrorState error={stepError} /> : null}

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -14 }}
            transition={{ duration: 0.18 }}
          >
            {/* STEP 1: SHOP */}
            {step === 1 ? (
              <Card className="p-6 space-y-5">
                <div>
                  <h2 className="text-lg font-bold text-[#F8FAFC]">1. Select Retail Shop</h2>
                  <p className="text-xs text-[#9CA3AF] mt-1">
                    Loaded from <code className="font-mono">/api/v1/merchants/shops</code>.
                  </p>
                </div>

                {shopsQuery.isLoading ? (
                  <KpiGridSkeleton count={2} />
                ) : shopsQuery.error ? (
                  <ErrorState error={shopsQuery.error} onRetry={() => shopsQuery.refetch()} />
                ) : shops.length === 0 ? (
                  <EmptyState
                    icon={<Store className="h-5 w-5" />}
                    title="No active shops found"
                    description="Create a storefront shop before starting a customer financing request."
                    action={
                      <Link to="/merchant/shops">
                        <Button>Go to Shop Management</Button>
                      </Link>
                    }
                  />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {shops.map((shop) => {
                      const active = selectedShop?.id === shop.id;
                      return (
                        <button
                          key={shop.id}
                          type="button"
                          onClick={() => {
                            setSelectedShop(shop);
                            purchaseForm.setValue('shopId', shop.id);
                          }}
                          className={cn(
                            'rounded-2xl border p-4 text-left transition-all',
                            active
                              ? 'border-[#C8FF32] bg-[rgba(200,255,50,0.08)] shadow-limeGlow'
                              : 'border-[rgba(255,255,255,0.08)] bg-[#181B21] hover:border-[rgba(255,255,255,0.2)]',
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-sm text-[#F8FAFC]">{shop.name}</span>
                            <Badge variant={shop.status === 'ACTIVE' ? 'success' : 'neutral'}>
                              {shop.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-[#9CA3AF] mt-1">
                            {shop.city}, {shop.state}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <Button
                    disabled={!selectedShop}
                    onClick={() => setStep(2)}
                    rightIcon={<ArrowRight className="h-4 w-4" />}
                  >
                    Continue to Customer
                  </Button>
                </div>
              </Card>
            ) : null}

            {/* STEP 2: CUSTOMER */}
            {step === 2 ? (
              <Card className="p-6 space-y-5">
                <div>
                  <h2 className="text-lg font-bold text-[#F8FAFC]">
                    2. Customer &amp; DPDP Consent
                  </h2>
                  <p className="text-xs text-[#9CA3AF] mt-1">
                    Only minimal customer fields supported by{' '}
                    <code className="font-mono">/api/v1/customers</code> are collected. No PAN,
                    Aadhaar, or bank details are requested here.
                  </p>
                </div>

                {isDemoEnvironment ? (
                  <div className="rounded-xl border border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.07)] p-3.5 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#FBBF24]">
                      <FlaskConical className="h-3.5 w-3.5" />
                      <span>Demo Phone Suffix Scenarios (Simulated Mock Lenders)</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {DEMO_PHONE_SCENARIOS.map((sc) => (
                        <button
                          key={sc.phone}
                          type="button"
                          onClick={() => {
                            customerForm.setValue('phone', sc.phone);
                            if (!customerForm.getValues('fullName')) {
                              customerForm.setValue('fullName', 'Kavita Iyer');
                            }
                          }}
                          className="rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#111317] px-2.5 py-1 text-[11px] font-mono text-[#F8FAFC] hover:border-[#C8FF32]"
                        >
                          {sc.label} ({sc.phone.slice(-4)})
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <form
                  onSubmit={customerForm.handleSubmit((values) =>
                    registerCustomerMutation.mutate(values),
                  )}
                  className="space-y-4"
                  noValidate
                >
                  <Input
                    id="cust-name"
                    label="Customer Full Name"
                    placeholder="Kavita Iyer"
                    error={customerForm.formState.errors.fullName?.message}
                    {...customerForm.register('fullName')}
                  />
                  <Input
                    id="cust-phone"
                    label="Mobile Phone (E.164)"
                    placeholder="+919876543210"
                    hint="Must include country code, e.g. +919876543210"
                    error={customerForm.formState.errors.phone?.message}
                    {...customerForm.register('phone')}
                  />
                  <Input
                    id="cust-notice"
                    label="Privacy Notice Version"
                    error={customerForm.formState.errors.consentNoticeVersion?.message}
                    {...customerForm.register('consentNoticeVersion')}
                  />

                  <label className="flex items-start gap-3 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181B21] p-4 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-[#C8FF32]"
                      {...customerForm.register('consentAccepted')}
                    />
                    <span className="text-xs text-[#9CA3AF] leading-relaxed">
                      Customer explicitly grants DPDP consent for{' '}
                      <code className="font-mono text-[#F8FAFC]">
                        FINANCING_APPLICATION_PROCESSING
                      </code>{' '}
                      to evaluate lender eligibility for this retail purchase.
                    </span>
                  </label>
                  {customerForm.formState.errors.consentAccepted?.message ? (
                    <p role="alert" className="text-xs text-[#F87171]">
                      {customerForm.formState.errors.consentAccepted.message}
                    </p>
                  ) : null}

                  <div className="flex justify-between pt-2">
                    <Button
                      variant="ghost"
                      onClick={() => setStep(1)}
                      leftIcon={<ArrowLeft className="h-4 w-4" />}
                    >
                      Back
                    </Button>
                    <Button
                      type="submit"
                      loading={registerCustomerMutation.isPending}
                      rightIcon={<ArrowRight className="h-4 w-4" />}
                    >
                      Save Customer &amp; Consent
                    </Button>
                  </div>
                </form>
              </Card>
            ) : null}

            {/* STEP 3: PURCHASE + OPTIONAL QR */}
            {step === 3 ? (
              <Card className="p-6 space-y-5">
                <div>
                  <h2 className="text-lg font-bold text-[#F8FAFC]">
                    3. Retail Purchase &amp; Optional QR Checkout
                  </h2>
                  <p className="text-xs text-[#9CA3AF] mt-1">
                    Customer: <span className="text-[#F8FAFC]">{customer?.fullName}</span> (
                    <span className="font-mono">{customer?.phone}</span>)
                  </p>
                </div>

                {!purchase ? (
                  <form
                    onSubmit={purchaseForm.handleSubmit((values) =>
                      createPurchaseMutation.mutate(values),
                    )}
                    className="space-y-4"
                    noValidate
                  >
                    <Select
                      id="wiz-category"
                      label="Product Category"
                      error={purchaseForm.formState.errors.productCategory?.message}
                      {...purchaseForm.register('productCategory')}
                    >
                      {PRODUCT_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </Select>
                    <Input
                      id="wiz-desc"
                      label="Product Description (Optional)"
                      placeholder="Sony Bravia 55 inch 4K HDR"
                      error={purchaseForm.formState.errors.productDescription?.message}
                      {...purchaseForm.register('productDescription')}
                    />
                    <Input
                      id="wiz-amount"
                      label="Total Purchase Price in INR (₹)"
                      placeholder="65000"
                      hint="Sent as integer paise via Idempotency-Key."
                      error={purchaseForm.formState.errors.amountRupees?.message}
                      {...purchaseForm.register('amountRupees')}
                    />
                    <div className="flex justify-between pt-2">
                      <Button
                        variant="ghost"
                        onClick={() => setStep(2)}
                        leftIcon={<ArrowLeft className="h-4 w-4" />}
                      >
                        Back
                      </Button>
                      <Button type="submit" loading={createPurchaseMutation.isPending}>
                        Create Idempotent Purchase
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-5">
                    <Card elevated className="p-4 flex items-center justify-between">
                      <div>
                        <span className="text-xs text-[#34D399] font-semibold">
                          Purchase Recorded
                        </span>
                        <p className="text-base font-bold text-[#F8FAFC]">
                          {purchase.productDescription || purchase.productCategory}
                        </p>
                      </div>
                      <MoneyDisplay
                        paise={purchase.amountPaise}
                        className="text-2xl font-extrabold text-[#C8FF32]"
                      />
                    </Card>

                    {qrSession ? (
                      <QrTicketCard session={qrSession} shopName={selectedShop?.name} />
                    ) : (
                      <Button
                        variant="secondary"
                        loading={generateQrMutation.isPending}
                        onClick={() => generateQrMutation.mutate()}
                        leftIcon={<QrCode className="h-4 w-4" />}
                      >
                        Generate Customer QR Ticket (Optional)
                      </Button>
                    )}

                    <div className="flex justify-end pt-2">
                      <Button
                        onClick={() => setStep(4)}
                        rightIcon={<ArrowRight className="h-4 w-4" />}
                      >
                        Continue to Financing Terms
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            ) : null}

            {/* STEP 4: FINANCING APPLICATION */}
            {step === 4 ? (
              <Card className="p-6 space-y-5">
                <div>
                  <h2 className="text-lg font-bold text-[#F8FAFC]">
                    4. Configure Financing Application
                  </h2>
                  <p className="text-xs text-[#9CA3AF] mt-1">
                    Purchase total: <MoneyDisplay paise={purchase?.amountPaise} />. Requested loan
                    cannot exceed purchase amount.
                  </p>
                </div>

                <form
                  onSubmit={applicationForm.handleSubmit((values) =>
                    createApplicationMutation.mutate(values),
                  )}
                  className="space-y-4"
                  noValidate
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      id="app-req-amount"
                      label="Requested Loan Amount (₹)"
                      placeholder="65000"
                      error={applicationForm.formState.errors.requestedAmountRupees?.message}
                      {...applicationForm.register('requestedAmountRupees')}
                    />
                    <Input
                      id="app-down-payment"
                      label="Down Payment (₹)"
                      placeholder="0"
                      error={applicationForm.formState.errors.downPaymentRupees?.message}
                      {...applicationForm.register('downPaymentRupees')}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      id="app-tenure"
                      label="Requested Tenure (1–36 Months)"
                      type="number"
                      min={1}
                      max={36}
                      error={applicationForm.formState.errors.requestedTenureMonths?.message}
                      {...applicationForm.register('requestedTenureMonths')}
                    />
                    <Select
                      id="app-routing"
                      label="Lender Routing Mode"
                      error={applicationForm.formState.errors.routingMode?.message}
                      {...applicationForm.register('routingMode')}
                    >
                      <option value="SEQUENTIAL">SEQUENTIAL (Priority Waterfall)</option>
                      <option value="DISCOVERY">DISCOVERY (Parallel Evaluation)</option>
                    </Select>
                  </div>

                  <div className="flex justify-between pt-2">
                    <Button
                      variant="ghost"
                      onClick={() => setStep(3)}
                      leftIcon={<ArrowLeft className="h-4 w-4" />}
                    >
                      Back
                    </Button>
                    <Button
                      type="submit"
                      loading={createApplicationMutation.isPending}
                      rightIcon={<ArrowRight className="h-4 w-4" />}
                    >
                      Create Application
                    </Button>
                  </div>
                </form>
              </Card>
            ) : null}

            {/* STEP 5: SUBMIT APPLICATION */}
            {step === 5 && application ? (
              <Card className="p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold text-[#F8FAFC]">
                      5. Submit to Multi-Lender Waterfall
                    </h2>
                    <p className="font-mono text-xs text-[#6B7280] mt-1">{application.id}</p>
                  </div>
                  <ApplicationStatusBadge status={application.status} />
                </div>

                <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181B21] p-4 space-y-2 text-sm">
                  <p className="font-semibold text-[#F8FAFC]">
                    {APPLICATION_STATUS_META[application.status].label}
                  </p>
                  <p className="text-xs text-[#9CA3AF]">
                    {APPLICATION_STATUS_META[application.status].description}
                  </p>
                </div>

                {application.status === 'CUSTOMER_CONSENT_PENDING' ? (
                  <Button
                    size="lg"
                    className="w-full"
                    loading={submitApplicationMutation.isPending}
                    onClick={() => submitApplicationMutation.mutate()}
                    leftIcon={<Send className="h-4 w-4" />}
                  >
                    Submit Application for Underwriting
                  </Button>
                ) : (
                  <div className="flex flex-wrap justify-between gap-3 pt-2">
                    <Link to={`/merchant/applications/${application.id}`}>
                      <Button variant="secondary">Open Full Application Workspace</Button>
                    </Link>
                    {application.status === 'OFFER_AVAILABLE' ? (
                      <Button
                        onClick={() => setStep(6)}
                        rightIcon={<ArrowRight className="h-4 w-4" />}
                      >
                        Compare Returned Offers
                      </Button>
                    ) : null}
                  </div>
                )}
              </Card>
            ) : null}

            {/* STEP 6: OFFERS */}
            {step === 6 ? (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-[#F8FAFC]">6. Compare Lender Offers</h2>
                    <p className="text-xs text-[#9CA3AF] mt-1">
                      Select an active offer below to lock terms and advance to lender confirmation.
                    </p>
                  </div>
                  <Badge variant="neutral">{offers.length} offer(s)</Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {offers.map((offer) => (
                    <OfferCard
                      key={offer.id}
                      offer={offer}
                      canAccept={offer.status === 'ACTIVE'}
                      isAccepting={acceptOfferMutation.isPending}
                      onAccept={(offerId) => acceptOfferMutation.mutate(offerId)}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {/* STEP 7: ACCEPTED */}
            {step === 7 && acceptedOffer && application ? (
              <Card elevated limeHighlight className="p-8 text-center space-y-5">
                <div className="mx-auto h-14 w-14 rounded-2xl bg-[rgba(52,211,153,0.14)] text-[#34D399] flex items-center justify-center">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2">
                    <ApplicationStatusBadge status={application.status} />
                    {acceptedOffer.isSimulated ? <Badge variant="demo">DEMO LENDER</Badge> : null}
                  </div>
                  <h2 className="text-2xl font-extrabold text-[#F8FAFC]">Offer Accepted</h2>
                  <p className="text-sm text-[#9CA3AF] max-w-md mx-auto">
                    Offer{' '}
                    <span className="font-mono text-[#F8FAFC]">
                      {acceptedOffer.lenderOfferReference}
                    </span>{' '}
                    selected for {acceptedOffer.tenureMonths} months at{' '}
                    <MoneyDisplay paise={acceptedOffer.emiPaise} className="text-[#C8FF32]" />/mo.
                    Commission ledger accrues once lender confirms disbursement via webhook.
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <Link to={`/merchant/applications/${application.id}`}>
                    <Button>Inspect Application Timeline</Button>
                  </Link>
                  <Link to="/merchant/applications">
                    <Button variant="secondary">All Applications</Button>
                  </Link>
                </div>
              </Card>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </DashboardLayout>
  );
}

