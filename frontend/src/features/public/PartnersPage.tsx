import { FlaskConical, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { DemoModeBanner } from '@/components/financial/DemoModeBanner';
import { PublicLayout } from '@/layouts/PublicLayout';

const DEMO_PARTNERS = [
  {
    code: 'DEMO_BANK_ALPHA',
    name: '[DEMO] Alpha Digital Bank',
    type: 'BANK',
    ticketRange: '₹5,000 – ₹5,00,000',
    categories: 'Smartphones, Laptops, Televisions, Air Conditioners',
    rateHint: '11.5% p.a. indicative demo rate',
  },
  {
    code: 'DEMO_NBFC_BETA',
    name: '[DEMO] Beta Retail Finance NBFC',
    type: 'NBFC',
    ticketRange: '₹1,000 – ₹3,00,000',
    categories: 'Smartphones, TVs, Refrigerators, Washing Machines, Laptops, Other Electronics',
    rateHint: '14.0% p.a. indicative demo rate',
  },
  {
    code: 'DEMO_GAMMA_CREDIT',
    name: '[DEMO] Gamma Consumer Credit',
    type: 'NBFC',
    ticketRange: '₹500 – ₹1,50,000',
    categories: 'Smartphones, Other Electronics',
    rateHint: '16.5% p.a. indicative demo rate',
  },
];

export function PartnersPage() {
  return (
    <PublicLayout>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-14 space-y-8">
        <div className="space-y-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-[#C8FF32]">
            Lending Marketplace Partners
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#F8FAFC]">
            Configured Provider Adapters
          </h1>
          <p className="text-base text-[#9CA3AF] max-w-2xl">
            In demo/sandbox mode, Udyam PAY operates with deterministic JSON-fixture lenders. Live
            regulated entity (Bank/NBFC) approvals occur only after partner aggregator credentials
            are configured in production mode.
          </p>
        </div>

        <DemoModeBanner />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {DEMO_PARTNERS.map((partner) => (
            <Card key={partner.code} className="p-6 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <Badge variant="demo">
                  <FlaskConical className="h-3 w-3" />
                  SIMULATED
                </Badge>
                <span className="font-mono text-xs text-[#6B7280]">{partner.type}</span>
              </div>

              <div>
                <h2 className="text-lg font-bold text-[#F8FAFC]">{partner.name}</h2>
                <p className="font-mono text-xs text-[#C8FF32] mt-1">{partner.code}</p>
              </div>

              <dl className="space-y-2 text-xs pt-3 border-t border-[rgba(255,255,255,0.08)]">
                <div>
                  <dt className="text-[#6B7280]">Ticket Range</dt>
                  <dd className="text-[#F8FAFC] font-semibold mt-0.5">{partner.ticketRange}</dd>
                </div>
                <div>
                  <dt className="text-[#6B7280]">Default Demo Pricing</dt>
                  <dd className="text-[#F8FAFC] font-semibold mt-0.5">{partner.rateHint}</dd>
                </div>
                <div>
                  <dt className="text-[#6B7280]">Supported Product Categories</dt>
                  <dd className="text-[#9CA3AF] mt-0.5">{partner.categories}</dd>
                </div>
              </dl>
            </Card>
          ))}
        </div>

        <Card className="p-6 flex items-start gap-4">
          <ShieldCheck className="h-5 w-5 text-[#34D399] shrink-0 mt-0.5" />
          <p className="text-xs text-[#9CA3AF] leading-relaxed">
            Production safety guardrail: the backend enforces `PROVIDER_MODE !== 'mock'` whenever
            `NODE_ENV === 'production'` and safely fails closed without generating mock offers if
            live aggregator credentials are absent.
          </p>
        </Card>
      </div>
    </PublicLayout>
  );
}

