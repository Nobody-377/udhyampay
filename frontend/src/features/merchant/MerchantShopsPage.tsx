import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Plus, Store } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/FormFields';
import { Modal } from '@/components/ui/Modal';
import { KpiGridSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { merchantApi } from '@/lib/api/merchantApi';
import { createShopSchema, type CreateShopFormValues } from '@/lib/validation/schemas';
import { formatDateTime } from '@/lib/utils';

export function MerchantShopsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [mutationError, setMutationError] = useState<unknown>(null);
  const queryClient = useQueryClient();

  const shopsQuery = useQuery({
    queryKey: ['merchant', 'shops'],
    queryFn: ({ signal }) => merchantApi.listShops(signal),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateShopFormValues>({
    resolver: zodResolver(createShopSchema),
    defaultValues: { name: '', city: '', state: '' },
  });

  const createShopMutation = useMutation({
    mutationFn: (values: CreateShopFormValues) => merchantApi.createShop(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant', 'shops'] });
      reset();
      setMutationError(null);
      setModalOpen(false);
    },
    onError: (err) => setMutationError(err),
  });

  const shops = shopsQuery.data ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F8FAFC]">Shop Locations</h1>
            <p className="text-sm text-[#9CA3AF] mt-1">
              Manage physical retail branches connected to{' '}
              <code className="font-mono text-xs">/api/v1/merchants/shops</code>.
            </p>
          </div>
          <Button onClick={() => setModalOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>
            Create Shop
          </Button>
        </div>

        {shopsQuery.error ? (
          <ErrorState error={shopsQuery.error} onRetry={() => shopsQuery.refetch()} />
        ) : null}

        {shopsQuery.isLoading ? (
          <KpiGridSkeleton count={3} />
        ) : shops.length === 0 ? (
          <EmptyState
            icon={<Store className="h-6 w-6" />}
            title="No shops configured yet"
            description="Create at least one retail storefront before initiating customer financing requests."
            action={
              <Button onClick={() => setModalOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>
                Create First Shop
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {shops.map((shop) => (
              <Card key={shop.id} interactive className="p-6 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="h-10 w-10 rounded-xl bg-[rgba(200,255,50,0.12)] text-[#C8FF32] flex items-center justify-center">
                    <Store className="h-5 w-5" />
                  </div>
                  <Badge variant={shop.status === 'ACTIVE' ? 'success' : 'neutral'}>
                    {shop.status}
                  </Badge>
                </div>

                <div>
                  <h2 className="text-lg font-bold text-[#F8FAFC]">{shop.name}</h2>
                  <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-[#9CA3AF]">
                    <MapPin className="h-3.5 w-3.5 text-[#C8FF32]" />
                    <span>
                      {shop.city}, {shop.state}
                    </span>
                  </p>
                </div>

                <div className="pt-3 border-t border-[rgba(255,255,255,0.08)] space-y-1 text-xs">
                  <div className="text-[#6B7280] font-mono break-all">ID: {shop.id}</div>
                  <div className="text-[#9CA3AF]">Added {formatDateTime(shop.createdAt)}</div>
                </div>
              </Card>
            ))}
          </div>
        )}

        <Modal
          open={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setMutationError(null);
          }}
          title="Add Retail Shop"
          description="Register a store location under your verified merchant account."
        >
          <form
            onSubmit={handleSubmit((values) => createShopMutation.mutate(values))}
            className="space-y-4"
            noValidate
          >
            {mutationError ? <ErrorState error={mutationError} /> : null}
            <Input
              id="shop-name"
              label="Shop Name"
              placeholder="Apex Electronics Indiranagar"
              error={errors.name?.message}
              {...register('name')}
            />
            <Input
              id="shop-city"
              label="City"
              placeholder="Bengaluru"
              error={errors.city?.message}
              {...register('city')}
            />
            <Input
              id="shop-state"
              label="State"
              placeholder="Karnataka"
              error={errors.state?.message}
              {...register('state')}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={createShopMutation.isPending}>
                Save Shop
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </DashboardLayout>
  );
}

