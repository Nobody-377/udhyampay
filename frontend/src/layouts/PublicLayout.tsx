import { useState, type ReactNode } from 'react';
import { Menu, X } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { Button } from '@/components/ui/Button';
import { DemoModeBanner } from '@/components/financial/DemoModeBanner';
import { isDemoEnvironment } from '@/lib/config';
import { cn } from '@/lib/utils';
import { getDefaultHomeForRole, useAuthStore } from '@/stores/authStore';

const NAV_LINKS = [
  { to: '/about', label: 'How It Works' },
  { to: '/partners', label: 'Loan Partners' },
  { to: '/utilities', label: 'Utilities' },
  { to: '/faq', label: 'FAQ' },
] as const;

export function PublicLayout({ children }: { children: ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const user = useAuthStore((s) => s.user);

  return (
    <div className="min-h-screen bg-[#090A0C] text-[#F8FAFC] flex flex-col">
      <header className="sticky top-0 z-40 border-b border-[rgba(255,255,255,0.08)] bg-[#090A0C]/85 backdrop-blur-md">
        {isDemoEnvironment ? (
          <div className="border-b border-[rgba(245,158,11,0.2)] bg-[rgba(245,158,11,0.08)] px-4 py-1.5 text-center text-[11px] font-semibold tracking-wide text-[#FBBF24]">
            DEMO SANDBOX BUILD — Connected lending adapters operate in simulated JSON mode unless live
            provider mode is configured.
          </div>
        ) : null}

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <BrandLogo to="/" />

          <nav aria-label="Public navigation" className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'px-3.5 py-2 rounded-xl text-sm font-medium transition-colors',
                    isActive
                      ? 'text-[#C8FF32] bg-[rgba(200,255,50,0.08)]'
                      : 'text-[#9CA3AF] hover:text-[#F8FAFC] hover:bg-[rgba(255,255,255,0.04)]',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <Link to={getDefaultHomeForRole(user.role)}>
                <Button size="sm">Open Workspace</Button>
              </Link>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="ghost" size="sm">
                    Login
                  </Button>
                </Link>
                <Link to="/register">
                  <Button size="sm">Get Started</Button>
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            className="md:hidden min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-[#9CA3AF] hover:text-[#F8FAFC] hover:bg-[rgba(255,255,255,0.06)]"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileMenuOpen ? (
          <div className="md:hidden border-t border-[rgba(255,255,255,0.08)] bg-[#111317] px-4 py-4 space-y-2">
            {NAV_LINKS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'block px-4 py-3 rounded-xl text-sm font-medium',
                    isActive
                      ? 'bg-[rgba(200,255,50,0.12)] text-[#C8FF32]'
                      : 'text-[#9CA3AF] hover:text-[#F8FAFC]',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
            <div className="pt-3 border-t border-[rgba(255,255,255,0.08)] flex flex-col gap-2">
              {user ? (
                <Link to={getDefaultHomeForRole(user.role)} onClick={() => setMobileMenuOpen(false)}>
                  <Button className="w-full">Open Workspace</Button>
                </Link>
              ) : (
                <>
                  <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="secondary" className="w-full">
                      Login
                    </Button>
                  </Link>
                  <Link to="/register" onClick={() => setMobileMenuOpen(false)}>
                    <Button className="w-full">Merchant Registration</Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        ) : null}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-[rgba(255,255,255,0.08)] bg-[#090A0C]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <BrandLogo to="/" />
            <p className="text-xs text-[#6B7280] max-w-md leading-relaxed">
              Udyam PAY is a financing distribution &amp; orchestration technology platform, not a
              bank or NBFC. Credit underwriting, sanctioning, and disbursements belong exclusively
              to authorized lending partners.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-[#9CA3AF]">
            <Link to="/about" className="hover:text-[#F8FAFC]">
              Architecture
            </Link>
            <Link to="/partners" className="hover:text-[#F8FAFC]">
              Lending Partners
            </Link>
            <Link to="/utilities" className="hover:text-[#F8FAFC]">
              Utilities
            </Link>
            <Link to="/faq" className="hover:text-[#F8FAFC]">
              FAQ
            </Link>
            <DemoModeBanner compact />
          </div>
        </div>
      </footer>
    </div>
  );
}

