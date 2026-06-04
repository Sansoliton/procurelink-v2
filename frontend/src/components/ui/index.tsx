import { ReactNode, ButtonHTMLAttributes, HTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn, STATUS_BADGE, statusLabel } from '@/lib/utils'
import type { RequirementStatus } from '@/types'

// ── Button ──────────────────────────────────────────────────────
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger'
  loading?: boolean
  children: ReactNode
}
export function Button({ variant = 'ghost', loading, children, className, ...props }: BtnProps) {
  const base = variant === 'primary' ? 'btn-primary' : variant === 'danger' ? 'btn-danger' : 'btn-ghost'
  return (
    <button type={props.type ?? 'button'} className={cn(base, className)} disabled={loading || props.disabled} {...props}>
      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {children}
    </button>
  )
}

// ── Card ─────────────────────────────────────────────────────────
type CardProps = HTMLAttributes<HTMLDivElement> & { children: ReactNode }
export function Card({ children, className, ...rest }: CardProps) {
  return <div className={cn('card', className)} {...rest}>{children}</div>
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-sm font-semibold text-gray-800 mb-4">{children}</h3>
}

// ── Spinner ──────────────────────────────────────────────────────
export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-5 h-5'
  return <Loader2 className={cn(s, 'animate-spin text-blue-600')} />
}

// ── StatusBadge ──────────────────────────────────────────────────
export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_BADGE[status as RequirementStatus] ?? 'badge-gray'
  return <span className={cls}>{statusLabel(status)}</span>
}

// ── Generic badge ────────────────────────────────────────────────
export function Badge({
  children, variant = 'gray', className,
}: { children: ReactNode; variant?: 'blue' | 'green' | 'amber' | 'red' | 'gray' | 'purple'; className?: string }) {
  return <span className={cn(`badge-${variant}`, className)}>{children}</span>
}

// ── Step progress bar ────────────────────────────────────────────
const STEPS = ['Submit', 'Review quote', 'Purchase order', 'Invoice']
const STEP_ROUTES = [
  null,
  (id: string) => `/requirement/${id}/quote`,
  (id: string) => `/requirement/${id}/po`,
  (id: string) => `/requirement/${id}/invoice`,
]

export function StepBar({ current, requirementId }: { current: 1 | 2 | 3 | 4; requirementId?: string }) {
  const navigate = useNavigate()

  return (
    <div className="flex items-center gap-1 mb-6 overflow-x-auto">
      {STEPS.map((label, i) => {
        const n = i + 1
        const done = n < current
        const active = n === current
        const routeFn = STEP_ROUTES[i]
        const clickable = done && !!requirementId && !!routeFn

        return (
          <div key={label} className="flex items-center gap-1">
            <div
              onClick={() => clickable && navigate(routeFn!(requirementId!))}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
                active && 'bg-blue-50 text-blue-700',
                done && 'text-green-600',
                clickable && 'cursor-pointer hover:bg-green-50',
                !active && !done && 'text-gray-400',
              )}
            >
              <span className={cn(
                'w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold',
                active && 'bg-blue-600 text-white',
                done && 'bg-green-100 text-green-700',
                !active && !done && 'bg-gray-100 text-gray-400',
              )}>
                {done ? '✓' : n}
              </span>
              {label}
            </div>
            {i < STEPS.length - 1 && <span className="text-gray-200 text-sm">›</span>}
          </div>
        )
      })}
    </div>
  )
}

// ── Empty state ──────────────────────────────────────────────────
export function EmptyState({
  title, description, action,
}: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="card text-center py-12">
      <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
      {description && <p className="text-xs text-gray-400 mb-4">{description}</p>}
      {action}
    </div>
  )
}

// ── Timeline ─────────────────────────────────────────────────────
export function Timeline({ items }: {
  items: { label: string; done: boolean; time?: string | null }[]
}) {
  return (
    <div className="flex flex-col gap-0">
      {items.map(({ label, done, time }, i) => (
        <div key={label} className="flex gap-3 pb-4 last:pb-0">
          <div className="flex flex-col items-center">
            <div className={cn(
              'w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
              done ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400',
            )}>
              {done ? '✓' : '○'}
            </div>
            {i < items.length - 1 && (
              <div className={cn('w-0.5 flex-1 mt-1', done ? 'bg-green-200' : 'bg-gray-100')} />
            )}
          </div>
          <div className="pt-0.5">
            <p className={cn('text-xs font-medium', done ? 'text-gray-800' : 'text-gray-400')}>
              {label}
            </p>
            {time && <p className="text-xs text-gray-400 mt-0.5 font-mono">{time}</p>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Stat tile ────────────────────────────────────────────────────
export function StatTile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className="text-lg font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}
