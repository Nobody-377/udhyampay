import { useQuery } from '@tanstack/react-query';
import { QrCode, ShoppingBag } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { BackendRequiredNotice } from '@/components/feedback/BackendRequiredNotice';
import { ErrorState } from '@/components/feedback/ErrorState';
import { DemoModeBanner } from '@/components/financial/DemoModeBanner';
import { MoneyDisplay } from '@/components/financial/MoneyDisplay';
import { CheckoutStatusBadge } from '@/components/financial/StatusBadge';
import { checkoutApi } from '@/lib/api/checkoutApi';
import { isDemoEnvironment } from '@/lib/config';
import { CHECKOUT_STATUS_META } from '@/lib/status-meta';
import { formatDateTime } from '@/lib/utils';

export function CheckoutScanPage() {
  const { token } = useParams<{ token: string }>();

  const sessionQuery = useQuery({
    queryKey: ['checkout', 'public', token],
    enabled: Boolean(token),
    queryFn: ({ signal }) => checkoutApi.getPublicSession(token!, signal),
    retry: false,
  });

  const data = sessionQuery.data;

  return (
    <div className="min-h-screen bg-[#090A0C] text-[#F8FAFC] flex flex-col">
      <header className="border-b border-[rgba(255,255,255,0.08)] bg-[#111317] px-4 py-3.5 flex items-center justify-between">
        <BrandLogo to="/" />
        {isDemoEnvironment ? <DemoModeBanner compact /> : null}
      </header>

      <main className="flex-1 mx-auto max-w-md w-full px-4 py-8 space-y-5">
        {sessionQuery.isLoading ? (
          <Card className="p-6 space-y-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-24 w-full" />
          </Card>
        ) : sessionQuery.error ? (
          <ErrorState
            error={sessionQuery.error}
            title="Checkout Session Unavailable"
            onRetry={() => sessionQuery.refetch()}
          />
        ) : data ? (
          <>
            <Card elevated limeHighlight={data.status === 'ACTIVE'} className="p-6 space-y-5">
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#C8FF32]">
                  <QrCode className="h-4 w-4" />
                  <span>POS Checkout Ticket</span>
                </div>
                <CheckoutStatusBadge status={data.status} />
              </div>

              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                  Purchase Total
                </span>
                <MoneyDisplay
                  paise={data.purchase.amountPaise}
                  className="mt-1 block text-4xl font-extrabold text-[#F8FAFC]"
                />
              </div>

              <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181B21] p-4 flex items-start gap-3">
                <ShoppingBag className="h-5 w-5 text-[#C8FF32] shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <p className="font-bold text-[#F8FAFC]">
                    {data.purchase.productDescription || data.purchase.productCategory}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="neutral">{data.purchase.productCategory}</Badge>
                    <span className="font-mono text-[#6B7280]">{data.purchase.currency}</span>
                  </div>
                </div>
              </div>

              <dl className="grid grid-cols-1 gap-2 text-xs pt-2 border-t border-[rgba(255,255,255,0.08)]">
                <div className="flex justify-between gap-2">
                  <dt className="text-[#6B7280]">Session Status</dt>
                  <dd className="text-[#F8FAFC] font-medium">
                    {CHECKOUT_STATUS_META[data.status].description}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[#6B7280]">Expires At</dt>
                  <dd className="font-mono text-[#F8FAFC]">{formatDateTime(data.expiresAt)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[#6B7280]">Session ID</dt>
                  <dd className="font-mono text-[#9CA3AF] truncate">{data.sessionId}</dd>
                </div>
              </dl>
            </Card>

            <BackendRequiredNotice
              title="Self-Service Customer Offer Flow Stops Here"
              description="The backend public endpoint inspects this purchase session cleanly, but completing customer DPDP consent, submitting the loan application, and accepting an offer from the customer's own mobile device requires new public/OTP customer completion routes."
              requiredEndpoints={[
                'POST /api/v1/checkout/sessions/:token/consent-and-submit',
                'GET /api/v1/checkout/sessions/:token/offers',
                'POST /api/v1/checkout/sessions/:token/offers/:offerId/accept',
                'POST /api/v1/auth/customer/otp/send',
              ]}
            />
          </>
        ) : null}

        <div className="text-center pt-2">
          <Link to="/">
            <Button variant="ghost" size="sm">
              Return to Udyam PAY Home
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}

