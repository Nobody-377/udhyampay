import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Building2, CheckCircle2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/FormFields';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PublicLayout } from '@/layouts/PublicLayout';
import { authApi, type RegisterResponse } from '@/lib/api/authApi';
import { registerMerchantSchema, type RegisterMerchantFormValues } from '@/lib/validation/schemas';

export function RegisterPage() {
  const [createdAccount, setCreatedAccount] = useState<RegisterResponse | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterMerchantFormValues>({
    resolver: zodResolver(registerMerchantSchema),
    defaultValues: { email: '', password: '', legalName: '', tradeName: '' },
  });

  const registerMutation = useMutation({
    mutationFn: (values: RegisterMerchantFormValues) =>
      authApi.register({
        email: values.email,
        password: values.password,
        legalName: values.legalName,
        tradeName: values.tradeName || undefined,
      }),
    onSuccess: (data) => {
      setCreatedAccount(data);
    },
    onError: (err) => {
      setSubmitError(err);
    },
  });

  const onSubmit = (values: RegisterMerchantFormValues) => {
    setSubmitError(null);
    registerMutation.mutate(values);
  };

  return (
    <PublicLayout>
      <div className="mx-auto max-w-md px-4 py-14 sm:py-20">
        <Card elevated className="p-6 sm:p-8 space-y-6">
          {createdAccount ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto h-12 w-12 rounded-2xl bg-[rgba(52,211,153,0.14)] text-[#34D399] flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h1 className="text-2xl font-extrabold text-[#F8FAFC]">Merchant Registered</h1>
              <p className="text-sm text-[#9CA3AF]">
                Account created as <span className="font-mono text-[#C8FF32]">{createdAccount.role}</span>{' '}
                in <span className="text-[#FBBF24] font-semibold">PENDING_VERIFICATION</span> status.
              </p>
              <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#111317] p-3 text-left text-xs font-mono space-y-1 text-[#9CA3AF]">
                <div>Email: {createdAccount.email}</div>
                <div>Merchant ID: {createdAccount.merchantId}</div>
              </div>
              <Link to="/login" className="block pt-2">
                <Button className="w-full" size="lg">
                  Continue to Login
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <div className="h-10 w-10 rounded-xl bg-[rgba(200,255,50,0.12)] text-[#C8FF32] flex items-center justify-center">
                  <Building2 className="h-5 w-5" />
                </div>
                <h1 className="text-2xl font-extrabold text-[#F8FAFC]">
                  Merchant Business Onboarding
                </h1>
                <p className="text-sm text-[#9CA3AF]">
                  Registers a new retail merchant owner workspace via{' '}
                  <code className="font-mono text-xs">/api/v1/auth/register</code>.
                </p>
              </div>

              {submitError ? <ErrorState error={submitError} title="Registration Failed" /> : null}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                <Input
                  id="reg-legal-name"
                  label="Legal Business Name"
                  placeholder="Sharma Retail Private Limited"
                  error={errors.legalName?.message}
                  {...register('legalName')}
                />
                <Input
                  id="reg-trade-name"
                  label="Trade / Store Brand Name (Optional)"
                  placeholder="Sharma Electronics"
                  error={errors.tradeName?.message}
                  {...register('tradeName')}
                />
                <Input
                  id="reg-email"
                  label="Owner Work Email"
                  type="email"
                  autoComplete="email"
                  placeholder="owner@sharmaretail.example"
                  error={errors.email?.message}
                  {...register('email')}
                />
                <Input
                  id="reg-password"
                  label="Password (Min 8 chars)"
                  type="password"
                  autoComplete="new-password"
                  placeholder="StrongPass123!"
                  error={errors.password?.message}
                  {...register('password')}
                />
                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  loading={registerMutation.isPending}
                >
                  Create Merchant Account
                </Button>
              </form>

              <p className="text-center text-xs text-[#9CA3AF]">
                Already registered?{' '}
                <Link to="/login" className="font-semibold text-[#C8FF32] hover:underline">
                  Sign in here
                </Link>
              </p>
            </>
          )}
        </Card>
      </div>
    </PublicLayout>
  );
}

