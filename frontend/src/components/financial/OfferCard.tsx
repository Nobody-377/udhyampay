import { motion } from 'framer-motion';
import { CheckCircle2, FlaskConical, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MoneyDisplay } from '@/components/financial/MoneyDisplay';
import { OfferStatusBadge } from '@/components/financial/StatusBadge';
import type { FinancingOffer } from '@/types/api';

export interface OfferCardProps {
  offer: FinancingOffer;
  onAccept?: (offerId: string) => void;
  isAccepting?: boolean;
  canAccept?: boolean;
  selected?: boolean;
}

function isZeroPercentInterest(ratePercent: string | null): boolean {
  if (!ratePercent) return false;
  return /^0+(\.0+)?$/.test(ratePercent.trim());
}

export function OfferCard({
  offer,
  onAccept,
  isAccepting = false,
  canAccept = false,
  selected = false,
}: OfferCardProps) {
  const isZeroEmi = isZeroPercentInterest(offer.interestRatePercent);
  const isAccepted = offer.status === 'ACCEPTED';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        elevated={isAccepted || selected}
        limeHighlight={isAccepted || selected || (offer.status === 'ACTIVE' && isZeroEmi)}
        className="p-5 sm:p-6 flex flex-col justify-between gap-5 h-full"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-semibold text-[#F8FAFC]">
                  {offer.lenderOfferReference}
                </span>
                {offer.isSimulated ? (
                  <Badge variant="demo">
                    <FlaskConical className="h-3 w-3" />
                    DEMO LENDER
                  </Badge>
                ) : null}
                {isZeroEmi ? (
                  <Badge variant="lime">
                    <Sparkles className="h-3 w-3" />
                    0% EMI
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-[#9CA3AF]">
                {offer.isSimulated
                  ? 'Simulated offer for development testing'
                  : 'Authorized partner offer'}
              </p>
            </div>
            <OfferStatusBadge status={offer.status} />
          </div>

          <div className="grid grid-cols-2 gap-4 py-3 border-y border-[rgba(255,255,255,0.08)]">
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                Monthly EMI
              </span>
              <MoneyDisplay
                paise={offer.emiPaise}
                className="mt-1 block text-2xl font-extrabold text-[#C8FF32]"
              />
            </div>
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                Tenure & Loan Amount
              </span>
              <div className="mt-1 text-sm font-bold text-[#F8FAFC] font-tabular">
                {offer.tenureMonths} months • <MoneyDisplay paise={offer.principalPaise} />
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
            <div>
              <dt className="text-[#6B7280]">Interest / Rate</dt>
              <dd className="mt-0.5 font-semibold text-[#F8FAFC] font-tabular">
                {offer.interestRatePercent !== null ? `${offer.interestRatePercent}% p.a.` : '—'} (
                {offer.rateType})
              </dd>
            </div>
            <div>
              <dt className="text-[#6B7280]">Processing Fee</dt>
              <dd className="mt-0.5 font-semibold text-[#F8FAFC]">
                <MoneyDisplay paise={offer.processingFeePaise} />
              </dd>
            </div>
            <div>
              <dt className="text-[#6B7280]">Total Repayment</dt>
              <dd className="mt-0.5 font-semibold text-[#F8FAFC]">
                <MoneyDisplay paise={offer.totalRepayablePaise} />
              </dd>
            </div>
            <div>
              <dt className="text-[#6B7280]">Offer Type</dt>
              <dd className="mt-0.5 font-semibold text-[#9CA3AF]">{offer.offerType}</dd>
            </div>
          </dl>
        </div>

        <div className="pt-2">
          {isAccepted ? (
            <div className="flex items-center justify-center gap-2 rounded-xl bg-[rgba(52,211,153,0.12)] border border-[rgba(52,211,153,0.28)] py-2.5 text-sm font-semibold text-[#34D399]">
              <CheckCircle2 className="h-4 w-4" />
              <span>Selected Offer</span>
            </div>
          ) : canAccept && offer.status === 'ACTIVE' && onAccept ? (
            <Button
              variant="primary"
              className="w-full"
              loading={isAccepting}
              onClick={() => onAccept(offer.id)}
            >
              Accept Offer
            </Button>
          ) : null}
        </div>
      </Card>
    </motion.div>
  );
}

