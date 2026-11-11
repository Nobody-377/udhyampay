import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '@/features/public/LoginPage';
import { RegisterPage } from '@/features/public/RegisterPage';
import { useAuthStore } from '@/stores/authStore';

function renderWithProviders(ui: JSX.Element, initialPath: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={initialPath === '/login' ? ui : <div>Login</div>} />
          <Route
            path="/register"
            element={initialPath === '/register' ? ui : <div>Register</div>}
          />
          <Route path="/merchant" element={<div>Merchant Workspace</div>} />
          <Route path="/admin" element={<div>Admin Workspace</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Login and Merchant Registration flows', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    useAuthStore.getState().clearSession();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('logs in a MERCHANT_OWNER and routes to /merchant', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            user: {
              id: 'user-1',
              email: 'owner@apex.example',
              role: 'MERCHANT_OWNER',
              merchantId: 'merch-1',
            },
            tokens: {
              accessToken: 'jwt-1',
              refreshToken: 'ref-1',
              expiresIn: 900,
            },
          },
        }),
        { status: 200 },
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<LoginPage />, '/login');

    await user.type(screen.getByLabelText(/Work Email/i), 'owner@apex.example');
    await user.type(screen.getByLabelText(/Password/i), 'ApexOwner2026!');
    await user.click(screen.getByRole('button', { name: /Sign In/i }));

    await waitFor(() => {
      expect(screen.getByText('Merchant Workspace')).toBeInTheDocument();
    });
    expect(useAuthStore.getState().accessToken).toBe('jwt-1');
  });

  it('registers a merchant owner and renders verification status details', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            userId: 'u-99',
            email: 'owner@sharma.example',
            role: 'MERCHANT_OWNER',
            merchantId: 'merch-99',
          },
        }),
        { status: 201 },
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />, '/register');

    await user.type(screen.getByLabelText(/Legal Business Name/i), 'Sharma Retail Private Limited');
    await user.type(screen.getByLabelText(/Owner Work Email/i), 'owner@sharma.example');
    await user.type(screen.getByLabelText(/Password/i), 'Password123!');
    await user.click(screen.getByRole('button', { name: /Create Merchant Account/i }));

    await waitFor(() => {
      expect(screen.getByText('Merchant Registered')).toBeInTheDocument();
    });
    expect(screen.getByText(/PENDING_VERIFICATION/i)).toBeInTheDocument();
  });
});

