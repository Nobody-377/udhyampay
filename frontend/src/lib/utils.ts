import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  if (phone.length <= 4) return phone;
  return `${phone.slice(0, 3)}••••${phone.slice(-4)}`;
}

export function truncateId(id: string | null | undefined, head = 8, tail = 4): string {
  if (!id) return '—';
  if (id.length <= head + tail + 3) return id;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}

