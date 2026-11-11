import { useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  BadgeIndianRupee,
  Building2,
  CreditCard,
  FileCheck2,
  LayoutDashboard,
  LogOut,
  Menu,
  PlusCircle,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  X,
} from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { Button } from '@/components/ui/Button';
import { DemoModeBanner } from '@/components/financial/DemoModeBanner';
import { useLogout } from '@/hooks/useSessionBootstrap';
import { isDemoEnvironment } from '@/lib/config';
import { cn } from '@/lib/utils';
import { isAdminRole, useAuthStore } from '@/stores/authStore';

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

const MERCHANT_NAV: readonly NavItem[] = [
  { to: '/merchant', label: 'Overview', icon: <LayoutDashboard className="h-4 w-4" />, end: true },
  {
    to: '/merchant/financing/new',
    label: 'Financing',
    icon: <PlusCircle className="h-4 w-4" />,
  },
  {
    to: '/merchant/applications',
    label: 'Applications',
    icon: <FileCheck2 className="h-4 w-4" />,
  },
  { to: '/merchant/purchases', label: 'Purchases', icon: <CreditCard className="h-4 w-4" /> },
  { to: '/merchant/shops', label: 'Shops', icon: <Store className="h-4 w-4" /> },
  {
    to: '/merchant/commissions',
    label: 'Commissions',
    icon: <BadgeIndianRupee className="h-4 w-4" />,
  },
];

const MERCHANT_BOTTOM_NAV = MERCHANT_NAV.slice(0, 4);

const ADMIN_NAV: readonly NavItem[] = [
  { to: '/admin', label: 'Overview', icon: <LayoutDashboard className="h-4 w-4" />, end: true },
  { to: '/admin/merchants', label: 'Merchants', icon: <Building2 className="h-4 w-4" /> },
  { to: '/admin/lenders', label: 'Lenders', icon: <SlidersHorizontal className="h-4 w-4" /> },
  {
    to: '/admin/applications',
    label: 'Applications',
    icon: <ShieldCheck className="h-4 w-4" />,
  },
  { to: '/admin/audit-logs', label: 'Audit Logs', icon: <Activity className="h-4 w-4" /> },
];

const ADMIN_BOTTOM_NAV = ADMIN_NAV.slice(0, 4);

export function DashboardLayout({ children }: { children: ReactNode }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();

  const adminMode = isAdminRole(user?.role);
  const navItems = adminMode ? ADMIN_NAV : MERCHANT_NAV;
  const bottomItems = adminMode ? ADMIN_BOTTOM_NAV : MERCHANT_BOTTOM_NAV;
  const settingsPath = adminMode ? '/admin/settings' : '/merchant/settings';
  const homePath = adminMode ? '/admin' : '/merchant';

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#090A0C] text-[#F8FAFC] flex">
      {/* Desktop Sidebar */}
      <aside
        aria-label="Workspace sidebar"
        className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 lg:sticky lg:top-0 lg:h-screen border-r border-[rgba(255,255,255,0.08)] bg-[#111317]"
      >
        <div className="h-16 px-5 flex items-center border-b border-[rgba(255,255,255,0.08)]">
          <BrandLogo to={homePath} />
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">
            {adminMode ? 'Operations Console' : 'Merchant Workspace'}
          </p>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors min-h-[44px]',
                  isActive
                    ? 'text-[#C8FF32] bg-[rgba(200,255,50,0.1)]'
                    : 'text-[#9CA3AF] hover:text-[#F8FAFC] hover:bg-[rgba(255,255,255,0.04)]',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive ? (
                    <motion.span
                      layoutId="sidebar-active-indicator"
                      className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-[#C8FF32]"
                      transition={{ type: 'spring', stiffness: 360, damping: 32 }}
                    />
                  ) : null}
                  {item.icon}
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-[rgba(255,255,255,0.08)] space-y-1">
          <NavLink
            to={settingsPath}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors min-h-[44px]',
                isActive
                  ? 'text-[#C8FF32] bg-[rgba(200,255,50,0.1)]'
                  : 'text-[#9CA3AF] hover:text-[#F8FAFC] hover:bg-[rgba(255,255,255,0.04)]',
              )
            }
          >
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </NavLink>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-[#9CA3AF] hover:text-[#F87171] hover:bg-[rgba(248,113,113,0.08)] transition-colors min-h-[44px]"
          >
            <LogOut className="h-4 w-4" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 border-b border-[rgba(255,255,255,0.08)] bg-[#090A0C]/90 backdrop-blur-md">
          <div className="px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 lg:hidden">
              <BrandLogo to={homePath} compact />
              <span className="text-sm font-bold text-[#F8FAFC]">
                Udyam <span className="text-[#C8FF32]">PAY</span>
              </span>
            </div>

            <div className="hidden lg:flex items-center gap-3">
              {isDemoEnvironment ? <DemoModeBanner compact /> : null}
              <span className="text-xs text-[#6B7280] font-mono">
                {location.pathname}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {isDemoEnvironment ? <DemoModeBanner compact className="lg:hidden" /> : null}
              <div className="hidden sm:flex items-center gap-2.5 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#111317] px-3 py-1.5">
                <div className="text-right">
                  <p className="text-xs font-semibold text-[#F8FAFC] leading-none">
                    {user?.email}
                  </p>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-[#C8FF32] mt-1 leading-none">
                    {user?.role}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-label="Open menu drawer"
                className="lg:hidden min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-[#9CA3AF] hover:text-[#F8FAFC] hover:bg-[#181B21]"
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-10 max-w-7xl w-full mx-auto">
          {isDemoEnvironment ? <DemoModeBanner className="mb-6" /> : null}
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav
        aria-label="Mobile workspace navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-[rgba(255,255,255,0.08)] bg-[#111317]/95 backdrop-blur-md px-2 py-1.5 flex items-center justify-around"
      >
        {bottomItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-1.5 min-w-[60px] min-h-[44px] text-[10px] font-semibold transition-colors',
                isActive ? 'text-[#C8FF32]' : 'text-[#9CA3AF]',
              )
            }
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-1.5 min-w-[60px] min-h-[44px] text-[10px] font-semibold text-[#9CA3AF]"
        >
          <Menu className="h-4 w-4" />
          <span>More</span>
        </button>
      </nav>

      {/* Mobile More Drawer */}
      {moreOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Workspace menu"
          className="lg:hidden fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm"
        >
          <div className="fixed inset-0" onClick={() => setMoreOpen(false)} aria-hidden="true" />
          <div className="relative z-10 w-72 max-w-[85vw] bg-[#111317] border-l border-[rgba(255,255,255,0.08)] p-5 flex flex-col justify-between h-full">
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <BrandLogo to={homePath} />
                <button
                  type="button"
                  onClick={() => setMoreOpen(false)}
                  aria-label="Close drawer"
                  className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-[#9CA3AF] hover:text-[#F8FAFC]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181B21] p-3">
                <p className="text-xs font-semibold text-[#F8FAFC] truncate">{user?.email}</p>
                <p className="text-[11px] font-mono text-[#C8FF32] mt-0.5">{user?.role}</p>
              </div>
              <div className="space-y-1">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium min-h-[44px]',
                        isActive
                          ? 'text-[#C8FF32] bg-[rgba(200,255,50,0.1)]'
                          : 'text-[#9CA3AF] hover:text-[#F8FAFC]',
                      )
                    }
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </NavLink>
                ))}
                <NavLink
                  to={settingsPath}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium min-h-[44px]',
                      isActive
                        ? 'text-[#C8FF32] bg-[rgba(200,255,50,0.1)]'
                        : 'text-[#9CA3AF] hover:text-[#F8FAFC]',
                    )
                  }
                >
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                </NavLink>
              </div>
            </div>

            <Button
              variant="danger"
              className="w-full"
              onClick={handleLogout}
              leftIcon={<LogOut className="h-4 w-4" />}
            >
              Logout
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
