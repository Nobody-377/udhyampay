import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Card } from '@/components/ui/Card';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, description, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
    >
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <Card elevated className="relative z-10 w-full max-w-lg p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 id="modal-title" className="text-lg font-bold text-[#F8FAFC]">
              {title}
            </h2>
            {description ? <p className="mt-1 text-sm text-[#9CA3AF]">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl text-[#9CA3AF] hover:text-[#F8FAFC] hover:bg-[rgba(255,255,255,0.06)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </Card>
    </div>
  );
}

