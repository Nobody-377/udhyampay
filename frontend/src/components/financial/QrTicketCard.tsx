import { ExternalLink } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { MoneyDisplay } from '@/components/financial/MoneyDisplay';
import { CheckoutStatusBadge } from '@/components/financial/StatusBadge';
import { formatDateTime } from '@/lib/utils';
import type { CheckoutSessionCreateResponse } from '@/types/api';

export interface QrTicketCardProps {
  session: CheckoutSessionCreateResponse;
  shopName?: string;
}

export function QrTicketCard({ session, shopName }: QrTicketCardProps) {
  return (
    <Card elevated limeHighlight className="p-6">
      <div className="flex flex-col md:flex-row items-center gap-6">
        <div className="rounded-2xl bg-white p-3.5 shrink-0">
          <QRCodeSVG value={session.qrPayload} size={156} level="M" includeMargin={false} />
        </div>

        <div className="flex-1 w-full space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#C8FF32]">
              QR Checkout Session
            </span>
            <CheckoutStatusBadge status={session.status} />
          </div>

          <div>
            <MoneyDisplay
              paise={session.purchase.amountPaise}
              className="text-3xl font-extrabold text-[#F8FAFC]"
            />
            <p className="text-sm text-[#9CA3AF] mt-1">
              {session.purchase.productDescription || session.purchase.productCategory}
              {shopName ? ` • ${shopName}` : ''}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
            <div>
              <span className="text-[#6B7280] block">Expires At</span>
              <span className="font-mono text-[#F8FAFC]">{formatDateTime(session.expiresAt)}</span>
            </div>
            <div>
              <span className="text-[#6B7280] block">Session ID</span>
              <span className="font-mono text-[#F8FAFC] break-all">{session.sessionId}</span>
            </div>
          </div>

          <div className="pt-1 flex flex-wrap items-center gap-3">
            <Link
              to={`/checkout/${session.rawToken}`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#C8FF32] hover:underline"
            >
              <span>Open Customer QR View (/checkout/{session.rawToken.slice(0, 10)}…)</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}

