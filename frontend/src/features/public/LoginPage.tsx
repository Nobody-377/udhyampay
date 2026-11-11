import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { FlaskConical, Lock } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/FormFields';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PublicLayout } from '@/layouts/PublicLayout';
import { authApi } from '@/lib/api/authApi';
import { isDemoEnvironment } from '@/lib/config';
import { loginSchema, type LoginFormValues } from '@/lib/validation/schemas';
import { getDefaultHomeForRole, useAuthStore } from '@/stores/authStore';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useAuthStore((s) => s.setSession);
  const [submitError, setSubmitError] = useState<unknown>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const loginMutation = useMutation({
    mutationFn: (values: LoginFormValues) => authApi.login(values),
    onSuccess: (data) => {
      setSession(data.user, data.tokens);
      const from = (location.state as { from?: string } | null)?.from;
      const target = from && from !== '/login' ? from : getDefaultHomeForRole(data.user.role);
      navigate(target, { replace: true });
    },
    onError: (err) => {
      setSubmitError(err);
    },
  });

  const onSubmit = (values: LoginFormValues) => {
    setSubmitError(null);
    loginMutation.mutate(values);
  };

  return (
    <PublicLayout>
      <div className="mx-auto max-w-md px-4 py-14 sm:py-20">
        <Card elevated className="p-6 sm:p-8 space-y-6">
          <div className="space-y-2">
            <div className="h-10 w-10 rounded-xl bg-[rgba(200,255,50,0.12)] text-[#C8FF32] flex items-center justify-center">
              <Lock className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-extrabold text-[#F8FAFC]">Sign in to Udyam PAY</h1>
            <p className="text-sm text-[#9CA3AF]">
              Access your Merchant Workspace or Platform Operations Console.
            </p>
          </div>

          {submitError ? <ErrorState error={submitError} title="Login Failed" /> : null}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <Input
              id="login-email"
              label="Work Email"
              type="email"
              autoComplete="email"
              placeholder="owner@business.example"
              error={errors.email?.message}
              {...register('email')}
            />

            <Input
              id="login-password"
              label="Password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              error={errors.password?.message}
              {...register('password')}
            />

            <Button type="submit" className="w-full" size="lg" loading={loginMutation.isPending}>
              Sign In
            </Button>
          </form>

          {isDemoEnvironment ? (
            <div className="rounded-xl border border-[rgba(245,158,11,0.28)] bg-[rgba(245,158,11,0.06)] p-3.5 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#FBBF24]">
                <FlaskConical className="h-3.5 w-3.5" />
                <span>Seeded Local Demo Accounts (`prisma/seed-demo.ts`)</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setValue('email', 'owner@apex.example')}
                  className="text-[11px] font-mono rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#111317] px-2.5 py-1 text-[#F8FAFC] hover:border-[#C8FF32]"
                >
                  Merchant: owner@apex.example
                </button>
                <button
                  type="button"
                  onClick={() => setValue('email', 'admin@udyam.example')}
                  className="text-[11px] font-mono rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#111317] px-2.5 py-1 text-[#F8FAFC] hover:border-[#C8FF32]"
                >
                  Admin: admin@udyam.example
                </button>
              </div>
            </div>
          ) : null}

          <p className="text-center text-xs text-[#9CA3AF]">
            New retail merchant?{' '}
            <Link to="/register" className="font-semibold text-[#C8FF32] hover:underline">
              Create Merchant Account
            </Link>
          </p>
        </Card>
      </div>
    </PublicLayout>
  );
}

