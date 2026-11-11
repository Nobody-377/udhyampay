import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Plus, QrCode } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/FormFields';
import { Modal } from '@/components/ui/Modal';
import { ListRowsSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { MoneyDisplay } from '@/components/financial/MoneyDisplay';
import { QrTicketCard } from '@/components/financial/QrTicketCard';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { checkoutApi } from '@/lib/api/checkoutApi';
import { merchantApi } from '@/lib/api/merchantApi';
import { purchaseApi } from '@/lib/api/purchaseApi';
import { createIdempotencyKey } from '@/lib/idempotency';
import { parseInrInputToPaise } from '@/lib/money/paise';
import { createPurchaseSchema, type CreatePurchaseFormValues } from '@/lib/validation/schemas';
import { formatDateTime } from '@/lib/utils';
import { PRODUCT_CATEGORIES, type CheckoutSessionCreateResponse, type Purchase } from '@/types/api';

export function MerchantPurchasesPage() {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [qrResult, setQrResult] = useState<CheckoutSessionCreateResponse | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  const queryClient = useQueryClient();

  const purchasesQuery = useQuery({
    queryKey: ['merchant', 'purchases', page, pageSize],
    queryFn: ({ signal }) => purchaseApi.listPurchases(page, pageSize, signal),
  });

  const shopsQuery = useQuery({
    queryKey: ['merchant', 'shops'],
    queryFn: ({ signal }) => merchantApi.listShops(signal),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreatePurchaseFormValues>({
    resolver: zodResolver(createPurchaseSchema),
    defaultValues: {
      shopId: '',
      productCategory: 'SMARTPHONE',
      productDescription: '',
      amountRupees: '',
    },
  });

  const createPurchaseMutation = useMutation({
    mutationFn: (values: CreatePurchaseFormValues) =>
      purchaseApi.createPurchase({
        shopId: values.shopId,
        productCategory: values.productCategory,
        productDescription: values.productDescription || undefined,
        amountPaise: parseInrInputToPaise(values.amountRupees).toString(),
        idempotencyKey: createIdempotencyKey('purch'),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant', 'purchases'] });
      reset();
      setCreateOpen(false);
      setActionError(null);
    },
    onError: (err) => setActionError(err),
  });

  const createQrMutation = useMutation({
    mutationFn: (purchase: Purchase) =>
      checkoutApi.createSession({
        shopId: purchase.shopId,
        purchaseId: purchase.id,
        validityMinutes: 30,
      }),
    onSuccess: (session) => {
      setQrResult(session);
      setActionError(null);
    },
    onError: (err) => setActionError(err),
  });

  const purchases = purchasesQuery.data?.items ?? [];
  const total = purchasesQuery.data?.meta.total ?? purchases.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const shops = shopsQuery.data ?? [];
  const shopNameById = new Map(shops.map((s) => [s.id, s.name]));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F8FAFC]">
              Purchases &amp; QR Sessions
            </h1>
            <p className="text-sm text-[#9CA3AF] mt-1">
              Record idempotent retail purchases and generate 30-minute POS QR checkout sessions.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>
            Record Purchase
          </Button>
        </div>

        {actionError ? <ErrorState error={actionError} /> : null}

        {qrResult ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#C8FF32]">
                Active Generated QR Ticket
              </span>
              <button
                type="button"
                onClick={() => setQrResult(null)}
                className="text-xs text-[#9CA3AF] hover:text-[#F8FAFC]"
              >
                Dismiss
              </button>
            </div>
            <QrTicketCard session={qrResult} shopName={shopNameById.get(qrResult.purchase.shopId)} />
          </div>
        ) : null}

        {purchasesQuery.error ? (
          <ErrorState error={purchasesQuery.error} onRetry={() => purchasesQuery.refetch()} />
        ) : null}

        {purchasesQuery.isLoading ? (
          <ListRowsSkeleton rows={5} />
        ) : purchases.length === 0 ? (
          <EmptyState
            icon={<CreditCard className="h-6 w-6" />}
            title="No purchases recorded"
            description="Create a purchase record first or run the guided Financing Wizard."
            action={
              <Button onClick={() => setCreateOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>
                Record Purchase
              </Button>
            }
          />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="border-b border-[rgba(255,255,255,0.08)] bg-[#181B21]/60 text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">
                  <tr>
                    <th className="px-5 py-3.5">Product &amp; ID</th>
                    <th className="px-5 py-3.5">Shop</th>
                    <th className="px-5 py-3.5">Category</th>
                    <th className="px-5 py-3.5 text-right">Amount</th>
                    <th className="px-5 py-3.5">Created</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(255,255,255,0.06)] text-sm">
                  {purchases.map((p) => (
                    <tr key={p.id} className="hover:bg-[#181B21]/50 transition-colors">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-[#F8FAFC]">
                          {p.productDescription || 'Electronics Purchase'}
                        </div>
                        <div className="font-mono text-xs text-[#6B7280] mt-0.5">{p.id}</div>
                      </td>
                      <td className="px-5 py-4 text-[#9CA3AF]">
                        {shopNameById.get(p.shopId) || p.shopId.slice(0, 8)}
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant="neutral">{p.productCategory}</Badge>
                      </td>
                      <td className="px-5 py-4 text-right font-bold text-[#F8FAFC]">
                        <MoneyDisplay paise={p.amountPaise} />
                      </td>
                      <td className="px-5 py-4 text-xs text-[#9CA3AF]">
                        {formatDateTime(p.createdAt)}
                      </td>
                      <td className="px-5 py-4 text-right space-x-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedPurchase(p)}
                        >
                          Details
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={createQrMutation.isPending}
                          onClick={() => createQrMutation.mutate(p)}
                          leftIcon={<QrCode className="h-3.5 w-3.5" />}
                        >
                          Generate QR
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 ? (
              <div className="flex items-center justify-between px-5 py-3.5 border-t border-[rgba(255,255,255,0.08)] text-xs text-[#9CA3AF]">
                <span>
                  Page {page} of {totalPages} ({total} total)
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        )}

        {/* Create Purchase Modal */}
        <Modal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          title="Record Retail Purchase"
          description="Exact integer-paise purchase stored idempotently."
        >
          <form
            onSubmit={handleSubmit((values) => createPurchaseMutation.mutate(values))}
            className="space-y-4"
            noValidate
          >
            <Select
              id="purchase-shop"
              label="Shop"
              error={errors.shopId?.message}
              {...register('shopId')}
            >
              <option value="">Select shop…</option>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.city})
                </option>
              ))}
            </Select>

            <Select
              id="purchase-category"
              label="Product Category"
              error={errors.productCategory?.message}
              {...register('productCategory')}
            >
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>

            <Input
              id="purchase-desc"
              label="Product Description (Optional)"
              placeholder="Sony Bravia 55 inch 4K TV"
              error={errors.productDescription?.message}
              {...register('productDescription')}
            />

            <Input
              id="purchase-amount"
              label="Amount in INR (₹)"
              placeholder="65000.00"
              hint="Converted safely to exact integer paise before API submission."
              error={errors.amountRupees?.message}
              {...register('amountRupees')}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={createPurchaseMutation.isPending}>
                Create Purchase
              </Button>
            </div>
          </form>
        </Modal>

        {/* Purchase Detail Modal */}
        <Modal
          open={Boolean(selectedPurchase)}
          onClose={() => setSelectedPurchase(null)}
          title="Purchase Record"
          description="Authoritative idempotent purchase details"
        >
          {selectedPurchase ? (
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-[#9CA3AF]">Amount</dt>
                <dd className="font-bold text-[#C8FF32]">
                  <MoneyDisplay paise={selectedPurchase.amountPaise} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#9CA3AF]">Category</dt>
                <dd>{selectedPurchase.productCategory}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#9CA3AF]">Description</dt>
                <dd>{selectedPurchase.productDescription || '—'}</dd>
              </div>
              <div>
                <dt className="text-[#9CA3AF] text-xs">Purchase UUID</dt>
                <dd className="font-mono text-xs text-[#F8FAFC] break-all mt-0.5">
                  {selectedPurchase.id}
                </dd>
              </div>
              <div>
                <dt className="text-[#9CA3AF] text-xs">Idempotency Key</dt>
                <dd className="font-mono text-xs text-[#F8FAFC] break-all mt-0.5">
                  {selectedPurchase.idempotencyKey}
                </dd>
              </div>
            </dl>
          ) : null}
        </Modal>
      </div>
    </DashboardLayout>
  );
}

