import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatDistanceToNow, format } from 'date-fns'
import type { RequirementStatus } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date?: string | null): string {
  if (!date) return '—'
  return format(new Date(date), 'dd MMM yyyy')
}

export function formatDateTime(date?: string | null): string {
  if (!date) return '—'
  return format(new Date(date), 'dd MMM yyyy, HH:mm')
}

export function timeAgo(date: string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

export function formatCurrency(amount?: number | null): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

export const STATUS_BADGE: Record<RequirementStatus, string> = {
  draft:            'badge-gray',
  submitted:        'badge-blue',
  rfq_sent:         'badge-purple',
  quotes_received:  'badge-amber',
  quote_ready:      'badge-amber',
  approved:         'badge-green',
  po_raised:        'badge-green',
  invoiced:         'badge-green',
  completed:        'badge-green',
}

export function statusLabel(s: string): string {
  return s.replace(/_/g, ' ')
}
