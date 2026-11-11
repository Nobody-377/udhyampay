import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/FormFields';
import { Modal } from '@/components/ui/Modal';
import { BackendRequiredNotice } from '@/components/feedback/BackendRequiredNotice';
import { ErrorState } from '@/components/feedback/ErrorState';
import { MerchantStatusBadge } from '@/components/financial/StatusBadge';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { adminApi } from '@/lib/api/adminApi';
import {
  merchantStatusActionSchema,
  type MerchantStatusActionFormValues,
} from '@/lib/validation/schemas';
import { formatDateTime } from '@/lib/utils';
import type { Merchant } from '@/types/api';

export function AdminMerchantsPage() {
  const [searchParams] = useSearchParams();
  const initialMerchantId = searchParams.get('merchantId') ?? '';
  const [confirmValues, setConfirmValues] = useState<MerchantStatusActionFormValues | null>(null);
  const [updatedMerchant, setUpdatedMerchant] = useState<Merchant | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<MerchantStatusActionFormValues>({
    resolver: zodResolver(merchantStatusActionSchema),
    defaultValues: {
      merchantId: initialMerchantId,
      status: 'VERIFIED',
      reason: '',
    },
  });

  const selectedStatus = watch('status');

  const statusMutation = useMutation({
    mutationFn: (values: MerchantStatusActionFormValues) =>
      adminApi.updateMerchantStatus(values.merchantId, {
        status: values.status,
        reason: values.reason || undefined,
      }),
    onSuccess: (merchant) => {
      setUpdatedMerchant(merchant);
      setConfirmValues(null);
      setActionError(null);
    },
    onError: (err) => {
      setConfirmValues(null);
      setActionError(err);
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F8FAFC]">
            Merchant Operations
          </h1>
          <p className="text-sm text-[#9CA3AF] mt-1">
            Verify or suspend merchant accounts via{' '}
            <code className="font-mono text-xs">PATCH /api/v1/admin/merchants/:id/status</code>.
          </p>
        </div>

        <BackendRequiredNotice
          title="Merchant Directory Listing API Required"
          description="Enter a Merchant UUID directly below (or deep-link from Audit Logs). Exposing a searchable merchant table requires adding GET /api/v1/admin/merchants."
          requiredEndpoints={['GET /api/v1/admin/merchants', 'GET /api/v1/admin/merchants/:id']}
        />

        {actionError ? <ErrorState error={actionError} /> : null}

        {updatedMerchant ? (
          <Card elevated limeHighlight className="p-5 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-[#34D399] shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                <p className="text-sm font-bold text-[#F8FAFC]">{updatedMerchant.legalName}</p>
                <p className="font-mono text-[#9CA3AF]">{updatedMerchant.id}</p>
                <p className="text-[#9CA3AF]">Updated {formatDateTime(updatedMerchant.updatedAt)}</p>
              </div>
            </div>
            <MerchantStatusBadge status={updatedMerchant.status} />
          </Card>
        ) : null}

        <Card className="p-6">
          <form
            onSubmit={handleSubmit((values) => setConfirmValues(values))}
            className="space-y-4"
            noValidate
          >
            <h2 className="text-base font-bold text-[#F8FAFC]">Update Merchant Status</h2>
            <Input
              id="admin-merchant-id"
              label="Merchant UUID"
              placeholder="00000000-0000-0000-0000-000000000000"
              error={errors.merchantId?.message}
              {...register('merchantId')}
            />
            <Select
              id="admin-merchant-status"
              label="Target Status"
              error={errors.status?.message}
              {...register('status')}
            >
              <option value="VERIFIED">VERIFIED (Approve merchant)</option>
              <option value="SUSPENDED">SUSPENDED (Restrict merchant)</option>
            </Select>
            {selectedStatus === 'SUSPENDED' ? (
              <Input
                id="admin-merchant-reason"
                label="Suspension Reason"
                placeholder="Compliance review or KYC discrepancy"
                error={errors.reason?.message}
                {...register('reason')}
              />
            ) : null}
            <Button
              type="submit"
              variant={selectedStatus === 'SUSPENDED' ? 'danger' : 'primary'}
            >
              Review Status Change
            </Button>
          </form>
        </Card>

        <Modal
          open={Boolean(confirmValues)}
          onClose={() => setConfirmValues(null)}
          title="Confirm Merchant Status Change"
          description="This action writes directly to the immutable audit log."
        >
          {confirmValues ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#111317] p-4 space-y-1.5 text-xs">
                <div className="flex items-center gap-2 text-[#FBBF24] font-semibold">
                  <ShieldAlert className="h-4 w-4" />
                  <span>Target Status: {confirmValues.status}</span>
                </div>
                <p className="font-mono text-[#9CA3AF] break-all">
                  Merchant: {confirmValues.merchantId}
                </p>
                {confirmValues.reason ? (
                  <p className="text-[#9CA3AF]">Reason: {confirmValues.reason}</p>
                ) : null}
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setConfirmValues(null)}>
                  Cancel
                </Button>
                <Button
                  variant={confirmValues.status === 'SUSPENDED' ? 'danger' : 'primary'}
                  loading={statusMutation.isPending}
                  onClick={() => statusMutation.mutate(confirmValues)}
                >
                  Confirm Update
                </Button>
              </div>
            </div>
          ) : null}
        </Modal>
      </div>
    </DashboardLayout>
  );
}

