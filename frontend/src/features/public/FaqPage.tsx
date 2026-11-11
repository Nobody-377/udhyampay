import { Card } from '@/components/ui/Card';
import { PublicLayout } from '@/layouts/PublicLayout';

const FAQS = [
  {
    q: 'Are offers shown in the demo environment real bank or NBFC loan approvals?',
    a: 'No. When running in mock/demo mode, partner lenders return isSimulated: true and are prominently stamped with DEMO / SIMULATED badges. Real offers occur only with live authorized lender integrations in production.',
  },
  {
    q: 'Who can log into Udyam PAY right now?',
    a: 'MERCHANT_OWNER and MERCHANT_STAFF roles access the Merchant Workspace (/merchant). ADMIN, SYSTEM_ADMIN, and OPS_AGENT roles access the Operations Console (/admin). End-customer OTP login and utility payments are documented as upcoming backend integrations.',
  },
  {
    q: 'How does Udyam PAY prevent duplicate purchase charges or double-accrued commissions?',
    a: 'Retail purchases enforce unique Idempotency-Key constraints per merchant, applications use optimistic locking, and the PostgreSQL ledger enforces single-accrual commission triggers per confirmed disbursement transaction.',
  },
  {
    q: 'Why does the frontend never store PAN, Aadhaar, or bank credentials in localStorage?',
    a: 'Consistent with DPDP Act data minimization in udyam-pay-backend, sensitive KYC fields are never persisted in client browser storage. Access tokens live strictly in JavaScript memory.',
  },
];

export function FaqPage() {
  return (
    <PublicLayout>
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-14 space-y-8">
        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-[#C8FF32]">FAQ</span>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#F8FAFC]">
            Platform Questions &amp; Security Commitments
          </h1>
        </div>
        <div className="space-y-4">
          {FAQS.map((item) => (
            <Card key={item.q} className="p-6 space-y-2">
              <h2 className="text-base font-bold text-[#F8FAFC]">{item.q}</h2>
              <p className="text-sm text-[#9CA3AF] leading-relaxed">{item.a}</p>
            </Card>
          ))}
        </div>
      </div>
    </PublicLayout>
  );
}

