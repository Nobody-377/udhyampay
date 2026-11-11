import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-[#C8FF32] text-[#090A0C] hover:bg-[#D7FF66] font-semibold shadow-limeGlow border border-[#C8FF32]',
  secondary:
    'bg-[#181B21] text-[#F8FAFC] hover:bg-[#22262F] border border-[rgba(255,255,255,0.12)] font-medium',
  ghost:
    'bg-transparent text-[#9CA3AF] hover:text-[#F8FAFC] hover:bg-[rgba(255,255,255,0.06)] border border-transparent font-medium',
  danger:
    'bg-[rgba(248,113,113,0.12)] text-[#F87171] hover:bg-[rgba(248,113,113,0.2)] border border-[rgba(248,113,113,0.28)] font-medium',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'min-h-[38px] px-3.5 text-xs rounded-xl gap-1.5',
  md: 'min-h-[44px] px-4.5 text-sm rounded-xl gap-2',
  lg: 'min-h-[50px] px-6 text-base rounded-2xl gap-2.5',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    disabled,
    className,
    children,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center transition-all duration-150 select-none',
        'active:scale-[0.985] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : (
        leftIcon
      )}
      <span>{children}</span>
      {!loading ? rightIcon : null}
    </button>
  );
});

