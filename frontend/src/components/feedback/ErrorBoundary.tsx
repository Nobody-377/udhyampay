import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error.message || 'Unexpected rendering error' };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Intentionally avoid logging sensitive state to console in production
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#090A0C] flex items-center justify-center p-6">
          <Card className="p-8 max-w-md w-full space-y-4 text-center">
            <h1 className="text-xl font-bold text-[#F8FAFC]">Something went wrong</h1>
            <p className="text-sm text-[#9CA3AF]">{this.state.errorMessage}</p>
            <Button onClick={() => window.location.assign('/')}>Return Home</Button>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}

