import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminApplicationsPage } from '@/features/admin/AdminApplicationsPage';
import { AdminAuditLogsPage } from '@/features/admin/AdminAuditLogsPage';
import { AdminLendersPage } from '@/features/admin/AdminLendersPage';
import { AdminMerchantsPage } from '@/features/admin/AdminMerchantsPage';
import { AdminOverviewPage } from '@/features/admin/AdminOverviewPage';
import { AdminSettingsPage } from '@/features/admin/AdminSettingsPage';
import { CheckoutScanPage } from '@/features/checkout/CheckoutScanPage';
import { FinancingWizardPage } from '@/features/merchant/FinancingWizardPage';
import { MerchantApplicationDetailPage } from '@/features/merchant/MerchantApplicationDetailPage';
import { MerchantApplicationsPage } from '@/features/merchant/MerchantApplicationsPage';
import { MerchantCommissionsPage } from '@/features/merchant/MerchantCommissionsPage';
import { MerchantOverviewPage } from '@/features/merchant/MerchantOverviewPage';
import { MerchantPurchasesPage } from '@/features/merchant/MerchantPurchasesPage';
import { MerchantSettingsPage } from '@/features/merchant/MerchantSettingsPage';
import { MerchantShopsPage } from '@/features/merchant/MerchantShopsPage';
import { AboutPage } from '@/features/public/AboutPage';
import { FaqPage } from '@/features/public/FaqPage';
import { LandingPage } from '@/features/public/LandingPage';
import { LoginPage } from '@/features/public/LoginPage';
import { PartnersPage } from '@/features/public/PartnersPage';
import { RegisterPage } from '@/features/public/RegisterPage';
import { UtilitiesPage } from '@/features/public/UtilitiesPage';
import { ProtectedRoute, PublicOnlyRoute } from '@/routes/guards';
import type { UserRole } from '@/types/api';

const MERCHANT_ROLES: readonly UserRole[] = ['MERCHANT_OWNER', 'MERCHANT_STAFF'];
const ADMIN_ROLES: readonly UserRole[] = ['ADMIN', 'SYSTEM_ADMIN', 'OPS_AGENT'];

export function AppRoutes() {
  return (
    <Routes>
      {/* Public Informational Routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/partners" element={<PartnersPage />} />
      <Route path="/utilities" element={<UtilitiesPage />} />
      <Route path="/faq" element={<FaqPage />} />
      <Route path="/checkout/:token" element={<CheckoutScanPage />} />

      {/* Public Auth Routes */}
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnlyRoute>
            <RegisterPage />
          </PublicOnlyRoute>
        }
      />

      {/* Merchant Workspace */}
      <Route
        path="/merchant"
        element={
          <ProtectedRoute allowedRoles={MERCHANT_ROLES}>
            <MerchantOverviewPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/merchant/shops"
        element={
          <ProtectedRoute allowedRoles={MERCHANT_ROLES}>
            <MerchantShopsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/merchant/financing/new"
        element={
          <ProtectedRoute allowedRoles={MERCHANT_ROLES}>
            <FinancingWizardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/merchant/applications"
        element={
          <ProtectedRoute allowedRoles={MERCHANT_ROLES}>
            <MerchantApplicationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/merchant/applications/:id"
        element={
          <ProtectedRoute allowedRoles={MERCHANT_ROLES}>
            <MerchantApplicationDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/merchant/purchases"
        element={
          <ProtectedRoute allowedRoles={MERCHANT_ROLES}>
            <MerchantPurchasesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/merchant/commissions"
        element={
          <ProtectedRoute allowedRoles={MERCHANT_ROLES}>
            <MerchantCommissionsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/merchant/settings"
        element={
          <ProtectedRoute allowedRoles={MERCHANT_ROLES}>
            <MerchantSettingsPage />
          </ProtectedRoute>
        }
      />

      {/* Admin Operations Workspace */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={ADMIN_ROLES}>
            <AdminOverviewPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/merchants"
        element={
          <ProtectedRoute allowedRoles={ADMIN_ROLES}>
            <AdminMerchantsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/lenders"
        element={
          <ProtectedRoute allowedRoles={ADMIN_ROLES}>
            <AdminLendersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/applications"
        element={
          <ProtectedRoute allowedRoles={ADMIN_ROLES}>
            <AdminApplicationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/audit-logs"
        element={
          <ProtectedRoute allowedRoles={ADMIN_ROLES}>
            <AdminAuditLogsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/settings"
        element={
          <ProtectedRoute allowedRoles={ADMIN_ROLES}>
            <AdminSettingsPage />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

