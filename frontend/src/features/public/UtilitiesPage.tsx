import { useState } from 'react';
import {
  Car,
  Droplets,
  Flame,
  Lightbulb,
  Smartphone,
  Tv,
  Wifi,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { BackendRequiredNotice } from '@/components/feedback/BackendRequiredNotice';
import { PublicLayout } from '@/layouts/PublicLayout';
import { cn } from '@/lib/utils';
import type { UtilityCategoryCode } from '@/types/future';

const UTILITY_CATEGORIES: ReadonlyArray<{
  code: UtilityCategoryCode;
  label: string;
  subtitle: string;
  icon: JSX.Element;
}> = [
  {
    code: 'ELECTRICITY',
    label: 'Electricity',
    subtitle: 'State board & private discoms',
    icon: <Lightbulb className="h-5 w-5" />,
  },
  {
    code: 'WATER',
    label: 'Water',
    subtitle: 'Municipal & metro water boards',
    icon: <Droplets className="h-5 w-5" />,
  },
  {
    code: 'GAS',
    label: 'Piped Gas',
    subtitle: 'City gas distribution & LPG',
    icon: <Flame className="h-5 w-5" />,
  },
  {
    code: 'MOBILE_RECHARGE',
    label: 'Mobile Recharge',
    subtitle: 'Prepaid plans & postpaid bills',
    icon: <Smartphone className="h-5 w-5" />,
  },
  {
    code: 'DTH',
    label: 'DTH',
    subtitle: 'Direct-to-home TV packs',
    icon: <Tv className="h-5 w-5" />,
  },
  {
    code: 'FASTAG',
    label: 'FASTag',
    subtitle: 'NHAI highway toll recharge',
    icon: <Car className="h-5 w-5" />,
  },
  {
    code: 'BROADBAND',
    label: 'Broadband',
    subtitle: 'Fiber & landline bill fetch',
    icon: <Wifi className="h-5 w-5" />,
  },
];

export function UtilitiesPage() {
  const [selected, setSelected] = useState<UtilityCategoryCode>('ELECTRICITY');

  const selectedMeta = UTILITY_CATEGORIES.find((c) => c.code === selected)!;

  return (
    <PublicLayout>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-14 space-y-8">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs font-semibold uppercase tracking-widest text-[#C8FF32]">
              Utility Services Architecture
            </span>
            <Badge variant="warning">Future-Ready Preview</Badge>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#F8FAFC]">
            Everyday Bills &amp; Recharges
          </h1>
          <p className="text-base text-[#9CA3AF] max-w-2xl">
            Designed to unify BBPS utility billers alongside point-of-sale EMI financing. Utility
            categories below represent the planned UI architecture; payment execution remains gated
            until backend utility modules are implemented.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {UTILITY_CATEGORIES.map((category) => {
            const active = category.code === selected;
            return (
              <button
                key={category.code}
                type="button"
                onClick={() => setSelected(category.code)}
                className={cn(
                  'rounded-2xl border p-4 text-left transition-all min-h-[112px] flex flex-col justify-between',
                  active
                    ? 'border-[#C8FF32] bg-[rgba(200,255,50,0.08)] shadow-limeGlow'
                    : 'border-[rgba(255,255,255,0.08)] bg-[#111317] hover:bg-[#181B21]',
                )}
              >
                <div
                  className={cn(
                    'h-9 w-9 rounded-xl flex items-center justify-center',
                    active ? 'bg-[#C8FF32] text-[#090A0C]' : 'bg-[#181B21] text-[#9CA3AF]',
                  )}
                >
                  {category.icon}
                </div>
                <div>
                  <p className="text-sm font-bold text-[#F8FAFC]">{category.label}</p>
                  <p className="text-[11px] text-[#6B7280] mt-0.5 line-clamp-1">
                    {category.subtitle}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <Card className="p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-bold text-[#F8FAFC]">{selectedMeta.label} Workflow</h2>
              <p className="text-sm text-[#9CA3AF] mt-1">
                Flow: Select Service → Select Biller → Enter Consumer Account → Fetch Bill → Review
                → Pay → Receipt
              </p>
            </div>
            <Badge variant="neutral">{selectedMeta.code}</Badge>
          </div>

          <BackendRequiredNotice
            title={`${selectedMeta.label} bill fetch & payment endpoints are not yet implemented in the backend`}
            description="No fake bill amounts or simulated payment confirmations are shown here. Once utility modules and BBPS/aggregator adapters are approved and added to udyam-pay-backend, this flow activates without changing frontend architecture."
            requiredEndpoints={[
              'GET /api/v1/utilities/categories',
              `GET /api/v1/utilities/providers?category=${selectedMeta.code}`,
              'POST /api/v1/utilities/bills/fetch',
              'POST /api/v1/utilities/payments',
              'GET /api/v1/utilities/transactions',
            ]}
          />
        </Card>
      </div>
    </PublicLayout>
  );
}

