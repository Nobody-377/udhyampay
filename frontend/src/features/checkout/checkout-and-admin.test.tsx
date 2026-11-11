import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminAuditLogsPage } from '@/features/admin/AdminAuditLogsPage';
import { CheckoutScanPage } from '@/features/checkout/CheckoutScanPage';
import { FinancingWizardPage } from '@/features/merchant/FinancingWizardPage';
import { useAuthStore } from '@/stores/authStore';

function renderWithQuery(ui: React.ReactNode, initialEntries: string[] = ['/']) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Checkout QR Scan, Financing Wizard Flow, and Admin Audit Logs', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    useAuthStore.getState().clearSession();
    vi.restoreAllMocks();
  });

  it('renders an ACTIVE public checkout session with paise conversion and explicit backend gap notice', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            sessionId: 'sess-1234',
            status: 'ACTIVE',
            expiresAt: '2026-11-11T15:00:00Z',
            purchase: {
              amountPaise: '6500000',
              currency: 'INR',
              productCategory: 'TELEVISION',
              productDescription: 'Sony 55 Inch 4K OLED',
            },
          },
        }),
        { status: 200 },
      ),
    );

    renderWithQuery(
      <Routes>
        <Route path="/checkout/:token" element={<CheckoutScanPage />} />
      </Routes>,
      ['/checkout/tok-active-1'],
    );

    await waitFor(() => {
      expect(screen.getByText('POS Checkout Ticket')).toBeInTheDocument();
    });
    expect(screen.getByText('₹65,000.00')).toBeInTheDocument();
    expect(screen.getByText('Sony 55 Inch 4K OLED')).toBeInTheDocument();
    expect(screen.getByText(/Self-Service Customer Offer Flow Stops Here/i)).toBeInTheDocument();
  });

  it('renders honest unavailable state when public checkout token fails or expires', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Checkout session expired or not found',
          },
        }),
        { status: 404 },
      ),
    );

    renderWithQuery(
      <Routes>
        <Route path="/checkout/:token" element={<CheckoutScanPage />} />
      </Routes>,
      ['/checkout/tok-expired'],
    );

    await waitFor(() => {
      expect(screen.getByText('Checkout Session Unavailable')).toBeInTheDocument();
    });
    expect(screen.getByText(/Checkout session expired or not found/i)).toBeInTheDocument();
  });

  it('progresses Financing Wizard from Shop selection (Step 1) to Customer & DPDP Consent (Step 2)', async () => {
    useAuthStore.getState().setSession(
      { id: 'u1', email: 'owner@apex.example', role: 'MERCHANT_OWNER', merchantId: 'm1' },
      { accessToken: 'tok-m', refreshToken: 'ref-m', expiresIn: 900 },
    );

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/api/v1/merchants/shops')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: {
                shops: [
                  {
                    id: '22222222-2222-4222-8222-222222222222',
                    merchantId: 'm1',
                    name: 'Indiranagar Storefront',
                    city: 'Bengaluru',
                    state: 'Karnataka',
                    status: 'ACTIVE',
                    createdAt: '2026-11-10T09:00:00Z',
                    updatedAt: '2026-11-10T09:00:00Z',
                  },
                ],
              },
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ success: true, data: {} }), { status: 200 }));
    });

    renderWithQuery(<FinancingWizardPage />);

    await waitFor(() => {
      expect(screen.getByText('Indiranagar Storefront')).toBeInTheDocument();
    });

    const continueBtn = screen.getByRole('button', { name: /Continue to Customer/i });
    expect(continueBtn).toBeDisabled();

    fireEvent.click(screen.getByText('Indiranagar Storefront'));
    expect(continueBtn).toBeEnabled();

    fireEvent.click(continueBtn);

    await waitFor(() => {
      expect(screen.getByText(/2\. Customer & DPDP Consent/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Demo Phone Suffix Scenarios/i)).toBeInTheDocument();
  });

  it('renders Admin Audit Logs from real backend endpoint and supports entity filter query', async () => {
    useAuthStore.getState().setSession(
      { id: 'admin-1', email: 'admin@udyam.example', role: 'ADMIN', merchantId: null },
      { accessToken: 'tok-a', refreshToken: 'ref-a', expiresIn: 900 },
    );

    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: [
              {
                id: 'audit-1',
                actorType: 'USER',
                actorUserId: 'admin-1',
                action: 'MERCHANT_VERIFIED',
                entityType: 'Merchant',
                entityId: 'merch-99999999',
                requestId: 'req-audit-77',
                metadata: {},
                createdAt: '2026-11-11T09:30:00Z',
              },
            ],
            meta: { total: 1, limit: 20, offset: 0 },
          }),
          { status: 200 },
        ),
      ),
    );
    globalThis.fetch = fetchMock;

    renderWithQuery(<AdminAuditLogsPage />);

    await waitFor(() => {
      expect(screen.getByText('MERCHANT_VERIFIED')).toBeInTheDocument();
    });
    expect(screen.getByText('Merchant')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Entity Type'), {
      target: { value: 'Merchant' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Apply Filter/i }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('entityType=Merchant'))).toBe(
        true,
      );
    });
  });
});

