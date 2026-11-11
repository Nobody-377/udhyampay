import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BadgeIndianRupee,
  Building2,
  CheckCircle2,
  FlaskConical,
  QrCode,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PublicLayout } from '@/layouts/PublicLayout';
import { healthApi } from '@/lib/api/healthApi';

export function LandingPage() {
  const healthQuery = useQuery({
    queryKey: ['system', 'health'],
    queryFn: ({ signal }) => healthApi.getHealth(signal),
    retry: false,
  });

  return (
    <PublicLayout>
      {/* Hero Section */}
      <section className="relative overflow-hidden fintech-grid-bg border-b border-[rgba(255,255,255,0.08)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 lg:py-24 grid lg:grid-cols-12 gap-12 items-center">
          {/* Left Narrative */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="lg:col-span-6 space-y-6"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,255,255,0.12)] bg-[#111317] px-3.5 py-1.5 text-xs font-medium text-[#9CA3AF]">
              <span
                className={
                  healthQuery.data?.status === 'ok'
                    ? 'h-2 w-2 rounded-full bg-[#34D399]'
                    : 'h-2 w-2 rounded-full bg-[#FBBF24]'
                }
              />
              <span>
                {healthQuery.data?.status === 'ok'
                  ? 'API Gateway Online'
                  : 'Connect Udyam PAY Backend'}
              </span>
              <span className="text-[#6B7280]">•</span>
              <span className="text-[#C8FF32] font-semibold">INR Integer-Paise Engine</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-[#F8FAFC] leading-[1.06]">
              Loans. Payments.{' '}
              <span className="text-[#C8FF32]">Utilities.</span>
              <span className="block text-2xl sm:text-3xl lg:text-4xl font-bold text-[#9CA3AF] mt-3">
                One platform for your financial workflow.
              </span>
            </h1>

            <p className="text-base sm:text-lg text-[#9CA3AF] max-w-xl leading-relaxed">
              Multi-lender POS EMI orchestration, verifiable QR checkout sessions, DPDP consent
              auditing, and double-entry commission ledgers built for Indian retail merchants and
              operations teams.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link to="/register">
                <Button size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>
                  Get Started
                </Button>
              </Link>
              <Link to="/login">
                <Button variant="secondary" size="lg">
                  Login
                </Button>
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-[rgba(255,255,255,0.08)]">
              <div>
                <span className="block text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                  Routing Engine
                </span>
                <span className="mt-1 block text-sm font-semibold text-[#F8FAFC]">
                  Sequential &amp; Discovery
                </span>
              </div>
              <div>
                <span className="block text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                  Compliance
                </span>
                <span className="mt-1 block text-sm font-semibold text-[#F8FAFC]">
                  DPDP Purpose Consent
                </span>
              </div>
              <div>
                <span className="block text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                  Accounting
                </span>
                <span className="mt-1 block text-sm font-semibold text-[#F8FAFC]">
                  Immutable Paise Ledger
                </span>
              </div>
            </div>
          </motion.div>

          {/* Right Ecosystem Composition */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.08 }}
            className="lg:col-span-6 space-y-4"
          >
            {/* Simulated Multi-Offer Illustration Card */}
            <Card elevated limeHighlight className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <Badge variant="demo">
                    <FlaskConical className="h-3 w-3" />
                    SAMPLE PREVIEW
                  </Badge>
                  <Badge variant="lime">0% EMI EXAMPLE</Badge>
                </div>
                <span className="font-mono text-xs text-[#6B7280]">REDUCING / FLAT</span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                    ILLUSTRATIVE INSTALLMENT
                  </span>
                  <div className="text-3xl sm:text-4xl font-extrabold text-[#C8FF32] font-tabular mt-1">
                    ₹10,833.33
                    <span className="text-sm font-medium text-[#9CA3AF]"> / mo</span>
                  </div>
                </div>
                <div className="text-left sm:text-right">
                  <span className="text-xs text-[#9CA3AF] block">Principal ₹65,000.00</span>
                  <span className="text-xs font-mono text-[#6B7280]">6 Months • Demo Fixture</span>
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Payment / QR Checkout Card */}
              <Card className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="h-9 w-9 rounded-xl bg-[rgba(200,255,50,0.12)] text-[#C8FF32] flex items-center justify-center">
                    <QrCode className="h-4 w-4" />
                  </div>
                  <Badge variant="success">POS QR</Badge>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                    Checkout Sessions
                  </p>
                  <p className="mt-1 text-base font-bold text-[#F8FAFC]">
                    SHA-256 Tokenized QR
                  </p>
                  <p className="mt-1 text-xs text-[#9CA3AF]">
                    Expiring 5–120m checkout tickets linked directly to idempotent retail purchases.
                  </p>
                </div>
              </Card>

              {/* Utility Platform Card */}
              <Card className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="h-9 w-9 rounded-xl bg-[rgba(251,191,36,0.14)] text-[#FBBF24] flex items-center justify-center">
                    <Zap className="h-4 w-4" />
                  </div>
                  <Badge variant="warning">Roadmap API</Badge>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                    Utility Services
                  </p>
                  <p className="mt-1 text-base font-bold text-[#F8FAFC]">
                    Bills, Recharges &amp; FASTag
                  </p>
                  <p className="mt-1 text-xs text-[#9CA3AF]">
                    Architectural preview ready; bill-fetch &amp; payment APIs await backend wiring.
                  </p>
                </div>
              </Card>
            </div>

            {/* Commission & State Engine Bar */}
            <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-[#181B21] border border-[rgba(255,255,255,0.08)] flex items-center justify-center text-[#34D399]">
                  <BadgeIndianRupee className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#F8FAFC]">
                    15-State Application Machine + Append-Only Ledger
                  </p>
                  <p className="text-[11px] text-[#9CA3AF]">
                    Commission accrues exclusively on webhook-confirmed loan disbursements.
                  </p>
                </div>
              </div>
              <Link
                to="/about"
                className="text-xs font-semibold text-[#C8FF32] hover:underline whitespace-nowrap"
              >
                Inspect Flow →
              </Link>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Capability Architecture Cards */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 space-y-10">
        <div className="max-w-2xl space-y-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-[#C8FF32]">
            Platform Architecture
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#F8FAFC]">
            Built around real credit orchestration &amp; financial invariants.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card interactive className="p-6 space-y-3">
            <Building2 className="h-6 w-6 text-[#C8FF32]" />
            <h3 className="text-lg font-bold text-[#F8FAFC]">Merchant POS Financing</h3>
            <p className="text-sm text-[#9CA3AF] leading-relaxed">
              Multi-shop merchant accounts onboard customers with explicit DPDP consent, record
              electronics purchases idempotently, and trigger waterfall lender eligibility.
            </p>
          </Card>

          <Card interactive className="p-6 space-y-3">
            <ShieldCheck className="h-6 w-6 text-[#C8FF32]" />
            <h3 className="text-lg font-bold text-[#F8FAFC]">RBAC &amp; Auditability</h3>
            <p className="text-sm text-[#9CA3AF] leading-relaxed">
              Strict merchant tenant isolation alongside operations admin oversight for merchant
              verification, lender configuration, manual reviews, and immutable audit logs.
            </p>
          </Card>

          <Card interactive className="p-6 space-y-3">
            <CheckCircle2 className="h-6 w-6 text-[#C8FF32]" />
            <h3 className="text-lg font-bold text-[#F8FAFC]">Exact Paise Accounting</h3>
            <p className="text-sm text-[#9CA3AF] leading-relaxed">
              Zero floating-point financial calculations. Every purchase, principal, EMI, and
              double-entry commission row uses exact integer paise serialization.
            </p>
          </Card>
        </div>
      </section>
    </PublicLayout>
  );
}

