import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from '@/components/feedback/ErrorBoundary';
import { useSessionBootstrap } from '@/hooks/useSessionBootstrap';
import { ApiClientError } from '@/lib/api/error';
import { AppRoutes } from '@/app/router';

function AppShell() {
  useSessionBootstrap();
  return <AppRoutes />;
}

export function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 20_000,
            gcTime: 300_000,
            retry: (failureCount, error) => {
              if (
                error instanceof ApiClientError &&
                [400, 401, 403, 404, 409, 423].includes(error.status)
              ) {
                return false;
              }
              return failureCount < 1;
            },
          },
        },
      }),
  );

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <MotionConfig reducedMotion="user">
          <BrowserRouter>
            <AppShell />
          </BrowserRouter>
        </MotionConfig>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

