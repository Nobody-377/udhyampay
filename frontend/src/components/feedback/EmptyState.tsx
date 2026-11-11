import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <Card className="p-8 sm:p-12 text-center flex flex-col items-center justify-center">
      {icon ? (
        <div className="mb-4 h-12 w-12 rounded-2xl bg-[#181B21] border border-[rgba(255,255,255,0.08)] flex items-center justify-center text-[#C8FF32]">
          {icon}
        </div>
      ) : null}
      <h3 className="text-lg font-bold text-[#F8FAFC]">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-[#9CA3AF]">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </Card>
  );
}

