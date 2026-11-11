import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OfferCard } from '@/components/financial/OfferCard';
import { ApplicationStatusBadge } from '@/components/financial/StatusBadge';
import { MerchantOverviewPage } from '@/features/merchant/MerchantOverviewPage';
import {
  createApplicationSchema,
  createPurchaseSchema,
  registerCustomerSchema,
} from '@/lib/validation/schemas';
import { useAuthStore } from '@/stores/authStore';
import type { FinancingOffer } from '@/types/api';

const BASE_OFFER: FinancingOffer = {
  id: 'offer-1',
  applicationId: 'app-1',
  lenderApplicationId: 'la-1',
  merchantId: 'm-1',
  lenderId: 'l-1',
  offerType: 'FIRM_OFFER',
  status: 'ACTIVE',
  lenderOfferReference: 'DEMO_BANK_ALPHA-OFFER-6M',
  principalPaise: '6500000',
  downPaymentPaise: '0',
  tenureMonths: 6,
  interestRatePercent: '0.00',
  rateType: 'FLAT',
  aprPercent: '0.00',
  emiPaise: '1083333',
  processingFeePaise: '0',
  taxesPaise: '0',
  otherChargesPaise: '0',
  totalRepayablePaise: '6500000',
  repaymentSchedule: null,
  termsVersion: 'DEMO-v1.0',
  termsUrl: null,
  expiresAt: null,
  isSimulated: true,
  createdAt: '2026-11-11T10:00:00Z',
  updatedAt: '2026-11-11T10:00:00Z',
};

describe('Offer rendering, demo safety, status badges, validation, and Merchant Overview', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    useAuthStore.getState().setSession(
      { id: 'u1', email: 'owner@apex.example', role: 'MERCHANT_OWNER', merchantId: 'm1' },
      { accessToken: 'tok', refreshToken: 'ref', expiresIn: 900 },
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    useAuthStore.getState().clearSession();
    vi.restoreAllMocks();
  });

  it('renders DEMO LENDER and 0% EMI badges when offer is simulated promotional zero-cost', () => {
    render(<OfferCard offer={BASE_OFFER} canAccept onAccept={() => {}} />);

    expect(screen.getByText('DEMO LENDER')).toBeInTheDocument();
    expect(screen.getByText('0% EMI')).toBeInTheDocument();
    expect(screen.getByText('₹10,833.33')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Accept Offer/i })).toBeInTheDocument();
  });

  it('omits DEMO LENDER when isSimulated is false and omits 0% EMI on non-zero rates', () => {
    render(
      <OfferCard
        offer={{ ...BASE_OFFER, isSimulated: false, interestRatePercent: '14.00' }}
      />,
    );

    expect(screen.queryByText('DEMO LENDER')).not.toBeInTheDocument();
    expect(screen.queryByText('0% EMI')).not.toBeInTheDocument();
  });

  it('renders backend application status labels accurately', () => {
    render(
      <div>
        <ApplicationStatusBadge status="OFFER_AVAILABLE" />
        <ApplicationStatusBadge status="DISBURSED" />
        <ApplicationStatusBadge status="ADDITIONAL_INFORMATION_REQUIRED" />
        <ApplicationStatusBadge status="DECLINED" />
      </div>,
    );

    expect(screen.getByText('Offers Available')).toBeInTheDocument();
    expect(screen.getByText('Disbursed')).toBeInTheDocument();
    expect(screen.getByText('Additional Info Required')).toBeInTheDocument();
    expect(screen.getByText('Declined')).toBeInTheDocument();
  });

  it('validates financing wizard Zod schemas strictly', () => {
    const badCust = registerCustomerSchema.safeParse({
      fullName: 'A',
      phone: '9876543210', // missing +country code
      consentNoticeVersion: 'v1.0',
      consentAccepted: false,
    });
    expect(badCust.success).toBe(false);

    const okCust = registerCustomerSchema.safeParse({
      fullName: 'Kavita Iyer',
      phone: '+919876543210',
      consentNoticeVersion: 'v1.0',
      consentAccepted: true,
    });
    expect(okCust.success).toBe(true);

    const badPurch = createPurchaseSchema.safeParse({
      shopId: 'not-a-uuid',
      productCategory: 'TELEVISION',
      amountRupees: '0',
    });
    expect(badPurch.success).toBe(false);

    const okApp = createApplicationSchema.safeParse({
      requestedAmountRupees: '65000',
      downPaymentRupees: '5000',
      requestedTenureMonths: 12,
      routingMode: 'DISCOVERY',
    });
    expect(okApp.success).toBe(true);
  });

  it('renders Merchant Dashboard metrics from real backend response shapes', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/api/v1/merchants/me')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: {
                merchant: {
                  id: 'm1',
                  legalName: 'Apex Digital Retail Private Limited',
                  tradeName: 'Apex Electronics',
                  status: 'VERIFIED',
                  verifiedAt: '2026-11-10T10:00:00Z',
                  suspendedAt: null,
                  suspensionReason: null,
                  createdAt: '2026-11-10T10:00:00Z',
                  updatedAt: '2026-11-10T10:00:00Z',
                },
              },
            }),
            { status: 200 },
          ),
        );
      }
      if (url.endsWith('/api/v1/merchants/shops')) {
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, data: { shops: [{ id: 's1', name: 'Flagship' }] } }), { status: 200 }),
        );
      }
      if (url.includes('/api/v1/purchases')) {
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, data: [], meta: { total: 0 } }), { status: 200 }),
        );
      }
      if (url.includes('/api/v1/applications')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: [
                {
                  id: 'app-1',
                  merchantId: 'm1',
                  shopId: 's1',
                  purchaseId: 'p1',
                  customerId: 'c1',
                  createdByUserId: 'u1',
                  status: 'DISBURSED',
                  routingMode: 'SEQUENTIAL',
                  requestedAmountPaise: '6500000',
                  downPaymentPaise: '0',
                  requestedTenureMonths: 6,
                  idempotencyKey: 'app_1',
                  version: 1,
                  submittedAt: null,
                  expiresAt: null,
                  terminalAt: null,
                  createdAt: '2026-11-11T10:00:00Z',
                  updatedAt: '2026-11-11T10:00:00Z',
                },
              ],
              meta: { page: 1, pageSize: 50, total: 1 },
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes('/api/v1/ledger/commission')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: {
                summary: {
                  totalAccruedPaise: '97500',
                  totalReversedPaise: '0',
                  netCommissionPaise: '97500',
                  entries: [],
                },
              },
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ success: true, data: {} }), { status: 200 }));
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <MerchantOverviewPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Apex Electronics')).toBeInTheDocument();
    });
    expect(screen.getAllByText('₹65,000.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('₹975.00')).toBeInTheDocument();
    expect(screen.getByText('Disbursed')).toBeInTheDocument();
  });
});
