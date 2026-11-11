import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface FieldWrapperProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
}

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'>, FieldWrapperProps {}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { id, label, error, hint, className, ...props },
  ref,
) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(
          'w-full min-h-[44px] rounded-xl border bg-[#181B21] px-3.5 py-2.5 text-sm text-[#F8FAFC] placeholder:text-[#6B7280] transition-colors',
          error
            ? 'border-[#F87171]/60 focus:border-[#F87171]'
            : 'border-[rgba(255,255,255,0.1)] hover:border-[rgba(255,255,255,0.2)] focus:border-[#C8FF32]',
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-[#F87171]">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-[#6B7280]">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'>, FieldWrapperProps {}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { id, label, error, hint, className, children, ...props },
  ref,
) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </label>
      <select
        ref={ref}
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(
          'w-full min-h-[44px] rounded-xl border bg-[#181B21] px-3.5 py-2.5 text-sm text-[#F8FAFC] transition-colors',
          error
            ? 'border-[#F87171]/60 focus:border-[#F87171]'
            : 'border-[rgba(255,255,255,0.1)] hover:border-[rgba(255,255,255,0.2)] focus:border-[#C8FF32]',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-[#F87171]">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-[#6B7280]">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
