import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PublicLayout } from '@/layouts/PublicLayout';

const STEPS = [
  {
    step: '01',
    title: 'Merchant & Shop Onboarding',
    detail:
      'Business owners register a verified merchant workspace and configure physical storefront branches via `/api/v1/merchants/shops`.',
  },
  {
    step: '02',
    title: 'Customer Consent & Idempotent Purchase',
    detail:
      'Store staff capture customer contact and DPDP processing consent (`FINANCING_APPLICATION_PROCESSING`), then create a purchase locked with an `Idempotency-Key`.',
  },
  {
    step: '03',
    title: 'QR Checkout & Multi-Lender Waterfall',
    detail:
      'Create an optional SHA-256 tokenized QR checkout session and submit the application through sequential priority or parallel discovery lender routing.',
  },
  {
    step: '04',
    title: 'Offer Selection, Webhook Confirmation & Commission',
    detail:
      'Compare active lender offers, accept customer choice, and await lender-signed webhook confirmation to settle disbursement and accrue commission.',
  },
];

export function AboutPage() {
  return (
    <PublicLayout>
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-14 space-y-10">
        <div className="space-y-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-[#C8FF32]">
            How Udyam PAY Works
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#F8FAFC]">
            Deterministic financing orchestration from retail counter to ledger.
          </h1>
          <p className="text-base text-[#9CA3AF] max-w-2xl">
            Every workflow screen maps directly to enforced backend transitions, strict RBAC
            boundaries, and integer-paise financial correctness.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {STEPS.map((item) => (
            <Card key={item.step} className="p-6 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-[#C8FF32]">STEP {item.step}</span>
                <CheckCircle2 className="h-4 w-4 text-[#34D399]" />
              </div>
              <h2 className="text-lg font-bold text-[#F8FAFC]">{item.title}</h2>
              <p className="text-sm text-[#9CA3AF] leading-relaxed">{item.detail}</p>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <Link to="/register">
            <Button rightIcon={<ArrowRight className="h-4 w-4" />}>Create Merchant Account</Button>
          </Link>
          <Link to="/partners">
            <Button variant="secondary">View Lending Partners</Button>
          </Link>
        </div>
      </div>
    </PublicLayout>
  );
}

