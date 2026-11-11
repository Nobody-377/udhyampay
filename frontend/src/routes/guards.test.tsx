import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { ProtectedRoute } from '@/routes/guards';
import { useAuthStore } from '@/stores/authStore';

describe('Role-based route guards', () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession();
  });

  it('redirects unauthenticated users to /login', () => {
    render(
      <MemoryRouter initialEntries={['/merchant']}>
        <Routes>
          <Route
            path="/merchant"
            element={
              <ProtectedRoute allowedRoles={['MERCHANT_OWNER', 'MERCHANT_STAFF']}>
                <div>Merchant Home</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login Screen</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Login Screen')).toBeInTheDocument();
  });

  it('redirects MERCHANT_OWNER away from /admin back to /merchant', () => {
    useAuthStore.getState().setSession(
      { id: 'u1', email: 'owner@apex.example', role: 'MERCHANT_OWNER', merchantId: 'm1' },
      { accessToken: 'tok', refreshToken: 'ref', expiresIn: 900 },
    );

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['ADMIN', 'SYSTEM_ADMIN', 'OPS_AGENT']}>
                <div>Admin Console</div>
              </ProtectedRoute>
            }
          />
          <Route path="/merchant" element={<div>Merchant Home</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Merchant Home')).toBeInTheDocument();
    expect(screen.queryByText('Admin Console')).not.toBeInTheDocument();
  });

  it('allows ADMIN into /admin workspace', () => {
    useAuthStore.getState().setSession(
      { id: 'u2', email: 'admin@udyam.example', role: 'ADMIN', merchantId: null },
      { accessToken: 'tok', refreshToken: 'ref', expiresIn: 900 },
    );

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['ADMIN', 'SYSTEM_ADMIN', 'OPS_AGENT']}>
                <div>Admin Console</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Admin Console')).toBeInTheDocument();
  });
});

