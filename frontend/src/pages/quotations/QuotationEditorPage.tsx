import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Plus, Trash2, Printer, Save, ArrowLeft, ChevronDown,
  Settings, X, Check, Upload, Bold, Italic, List,
  Send, Eye, FileCheck, CheckCircle2, Paperclip, FileText,
  Truck, PackageCheck, Pencil, UserPlus, Phone, Mail, MapPin, Building2,
} from 'lucide-react'
import type { CustomerInvoice, DeliveryNote, DeliveryNoteItem } from '@/types'
import { Button } from '@/components/ui'
import PDFViewerModal from '@/components/PDFViewerModal'
import { formatDate } from '@/lib/utils'
import { readData, writeData } from '@/lib/storage'
import { cquotesApi, customersApi, logosApi, orgApi, cinvoicesApi, deliveryNotesApi } from '@/api'

// ── Types ─────────────────────────────────────────────────────────
export type QuotationStatus = 'draft' | 'shared' | 'acknowledged' | 'po_received' | 'invoiced' | 'complete'
export type QuotationType = 'quotation' | 'proforma' | 'service' | 'dummy'
export type QuotationTag = 'active' | 'dummy_po' | 'rejected'

const QUOTATION_TYPE_LABELS: Record<QuotationType, string> = {
  quotation: 'Quotation',
  proforma: 'Proforma Invoice',
  service: 'Service Quotation',
  dummy: 'Dummy',
}

export interface QLine {
  _key: string
  description: string
  qty: string
  unitPrice: string
  amount: string
}

export interface DocAttachment {
  id: string
  name: string
  type: string
  url: string
  uploadedAt: string
}

export interface QuotationDoc {
  id: string
  quotationNo: string
  date: string
  issuerName: string
  issuerLogoText: string
  issuerLogoImage: string
  issuerAddress: string
  issuerPOBox: string
  issuerMobile: string
  issuerFax: string
  issuerEmail: string
  issuerTRN: string
  customerId: string
  customerName: string
  customerLogoImage: string
  customerContactName: string
  customerEmail: string
  customerBranch: string
  customerCity: string
  customerTel: string
  customerTRN: string
  lines: QLine[]
  vatPct: number
  paymentTerms: string
  paymentMethod: string
  deliveryTime: string
  notes: string
  status: QuotationStatus
  createdAt: string
  quotationType?: QuotationType
  quotationTag?: QuotationTag
  validityDays?: number
  poNumber?: string
  poDate?: string
  poDueDate?: string
  poAgreedAmount?: number
  poAttachment?: string
  poAttachmentName?: string
  attachments?: DocAttachment[]
  invoiceId?: string
  sharedDate?: string
  sharedContactName?: string
  sharedContactEmail?: string
  sharedContactPhone?: string
  acknowledgedDate?: string
  poReceivedDate?: string
}

interface StoredCustomer {
  id: string
  company: string
  contactName: string
  email: string
  phone: string
  city: string
  industry: string
  website: string
  notes: string
  status: string
  logoImage?: string
  trn?: string
}

// ── Constants ─────────────────────────────────────────────────────
const Q_KEY = 'pl_quotations'
const C_KEY = 'pl_customers'
const INV_KEY = 'pl_invoices'
const PROFILE_KEY = 'pl_company_profile'
const DEFAULT_CUSTOMER_KEY = 'pl_default_customer'

// Approximate available rows for line items per page (single-row lines)
const FIRST_PAGE_ROWS = 15
const OTHER_PAGE_ROWS = 24

const DEFAULT_PROFILE = {
  name: 'Your Company Name',
  logoText: 'LOGO',
  logoImage: '',
  address: 'P.O. Box: 00000, City, U.A.E.',
  poBox: '',
  mobile: '+971 50 0000000',
  fax: '+971 0 0000000',
  email: 'info@yourcompany.com',
  trn: '000000000000000',
  defaultValidityDays: 30,
  alertDaysBeforeExpiry: 7,
  alertStaleDays: 14,
}

// ── Storage helpers ────────────────────────────────────────────────
function loadAll(): QuotationDoc[] {
  try {
    const raw = readData(Q_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : Object.values(parsed)
  } catch { return [] }
}

function saveAll(docs: QuotationDoc[]) {
  writeData(Q_KEY, JSON.stringify(docs))
}

function nextNo(): string {
  const yy = new Date().getFullYear().toString().slice(-2)
  const all = loadAll()
  const nums = all
    .map(q => q.quotationNo)
    .filter(n => n.startsWith(`C${yy}/`))
    .map(n => parseInt(n.split('/')[1] ?? '0'))
    .filter(n => !isNaN(n))
  const max = nums.length ? Math.max(...nums) : 0
  return `C${yy}/${String(max + 1).padStart(4, '0')}`
}

function loadProfile() {
  try { return { ...DEFAULT_PROFILE, ...JSON.parse(readData(PROFILE_KEY) ?? '{}') } }
  catch { return DEFAULT_PROFILE }
}

function loadDefaultCustomer(): StoredCustomer | null {
  try { return JSON.parse(readData(DEFAULT_CUSTOMER_KEY) ?? 'null') }
  catch { return null }
}

function newLine(): QLine {
  return { _key: crypto.randomUUID(), description: '', qty: '', unitPrice: '', amount: '' }
}

function estimateRows(line: QLine): number {
  const chars = (line.description || '').length
  if (chars <= 70) return 1
  if (chars <= 140) return 2
  return Math.ceil(chars / 70)
}

function buildPages(lines: QLine[]): QLine[][] {
  const pages: QLine[][] = []
  let current: QLine[] = []
  let used = 0

  for (const line of lines) {
    const rows = estimateRows(line)
    const max = pages.length === 0 ? FIRST_PAGE_ROWS : OTHER_PAGE_ROWS
    if (used + rows > max && current.length > 0) {
      pages.push(current)
      current = [line]
      used = rows
    } else {
      current.push(line)
      used += rows
    }
  }

  if (current.length > 0 || pages.length === 0) pages.push(current)
  return pages
}

// ── Number to words ───────────────────────────────────────────────
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight',
  'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function numWords(n: number): string {
  if (n <= 0) return 'Zero'
  let r = ''
  if (n >= 1_000_000) { r += numWords(Math.floor(n / 1_000_000)) + ' Million '; n %= 1_000_000 }
  if (n >= 1_000)     { r += numWords(Math.floor(n / 1_000)) + ' Thousand '; n %= 1_000 }
  if (n >= 100)       { r += ONES[Math.floor(n / 100)] + ' Hundred '; n %= 100 }
  if (n >= 20)        { r += TENS[Math.floor(n / 10)] + ' '; n %= 10 }
  if (n > 0)          { r += ONES[n] + ' ' }
  return r.trim()
}

function toWords(amount: number): string {
  if (!amount || isNaN(amount)) return '—'
  const int = Math.floor(amount)
  const fils = Math.round((amount - int) * 100)
  let w = `AED ${numWords(int)}`
  if (fils > 0) w += ` and ${numWords(fils)} Fils`
  return w + ' Only'
}

function calcLine(l: QLine): number {
  const q = parseFloat(l.qty)
  const p = parseFloat(l.unitPrice)
  return isNaN(q) || isNaN(p) ? (parseFloat(l.amount) || 0) : q * p
}

// ── Safe image with fallback ──────────────────────────────────────
function SafeImg({ src, alt, className, fallback }: {
  src: string
  alt: string
  className?: string
  fallback: React.ReactNode
}) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return <>{fallback}</>
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  )
}

// ── Logo upload ───────────────────────────────────────────────────
function LogoUpload({ value, onChange, size = 'md', uploadFn }: {
  value: string
  onChange: (urlOrB64: string) => void
  size?: 'sm' | 'md'
  uploadFn?: (file: File) => Promise<string>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const dim = size === 'sm' ? 'w-16 h-12' : 'w-24 h-18'

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    // Show base64 preview immediately
    const b64 = await new Promise<string>((res) => {
      const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(file)
    })
    onChange(b64)
    // Try to upload to storage; replace with URL if successful
    if (uploadFn) {
      try {
        const url = await uploadFn(file)
        onChange(url)
      } catch { /* keep base64 */ }
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`${dim} border-2 border-dashed border-gray-300 rounded flex items-center justify-center cursor-pointer
          hover:border-blue-400 transition-colors overflow-hidden bg-gray-50 print:border-0 print:bg-transparent`}
        onClick={() => inputRef.current?.click()}
        title="Click to upload logo"
      >
        {value
          ? <img src={value} alt="logo" className="max-w-full max-h-full object-contain p-1" />
          : <Upload className="w-4 h-4 text-gray-400" />
        }
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      {value && (
        <button
          onClick={(e) => { e.stopPropagation(); onChange('') }}
          className="text-[9px] text-red-400 hover:text-red-600 print:hidden"
        >
          Remove
        </button>
      )}
    </div>
  )
}

// ── Inline plain editable field ───────────────────────────────────
function F({
  value, onChange, className = '', align = 'left', placeholder = '',
}: {
  value: string; onChange: (v: string) => void
  className?: string; align?: string; placeholder?: string
}) {
  const base = `bg-transparent border border-transparent hover:border-gray-300
    focus:border-blue-400 focus:outline-none focus:bg-blue-50/30 rounded px-1 py-0.5
    w-full transition-colors print:border-transparent print:bg-transparent`
  return (
    <input
      className={`${base} text-${align} ${className}`}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
    />
  )
}

// ── Rich text editor (Teams-style, contenteditable) ───────────────
function RichText({ value, onChange, placeholder, className = '' }: {
  value: string; onChange: (html: string) => void
  placeholder?: string; className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const lastExternal = useRef(value)
  const [focused, setFocused] = useState(false)

  // Set content on mount
  useLayoutEffect(() => {
    if (ref.current) ref.current.innerHTML = value
    lastExternal.current = value
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync when value changes from outside (e.g., customer select, doc load)
  useEffect(() => {
    if (
      ref.current &&
      value !== lastExternal.current &&
      document.activeElement !== ref.current
    ) {
      ref.current.innerHTML = value
      lastExternal.current = value
    }
  }, [value])

  function exec(cmd: string) {
    document.execCommand(cmd, false)
    onChange(ref.current?.innerHTML ?? '')
  }

  function handleInput() {
    const html = ref.current?.innerHTML ?? ''
    lastExternal.current = html
    onChange(html)
  }

  const btnCls = 'w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 text-gray-600 transition-colors'

  return (
    <div className={`w-full ${className}`}>
      {/* Toolbar — visible when focused */}
      <div
        className={`flex items-center gap-0.5 mb-1 px-1 py-0.5 bg-gray-50 border border-gray-200
          rounded-lg transition-all print:hidden ${focused ? 'opacity-100' : 'opacity-0 pointer-events-none h-0 mb-0 overflow-hidden'}`}
      >
        <button onMouseDown={e => { e.preventDefault(); exec('bold') }} className={btnCls} title="Bold">
          <Bold className="w-3 h-3" />
        </button>
        <button onMouseDown={e => { e.preventDefault(); exec('italic') }} className={btnCls} title="Italic">
          <Italic className="w-3 h-3" />
        </button>
        <button onMouseDown={e => { e.preventDefault(); exec('insertUnorderedList') }} className={btnCls} title="Bullet list">
          <List className="w-3 h-3" />
        </button>
        <div className="w-px h-4 bg-gray-200 mx-0.5" />
        <button onMouseDown={e => { e.preventDefault(); exec('removeFormat') }} className={`${btnCls} text-[9px] font-bold text-gray-400`} title="Clear formatting">
          A
        </button>
      </div>

      {/* Editable content */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onInput={handleInput}
        data-placeholder={placeholder}
        className={`min-h-[28px] bg-transparent border border-transparent hover:border-gray-300
          focus:border-blue-400 focus:outline-none focus:bg-blue-50/30 rounded px-1 py-0.5
          w-full transition-colors rich-text leading-snug
          print:border-transparent print:bg-transparent print:focus:bg-transparent`}
      />
    </div>
  )
}

// ── Auto-growing textarea for line descriptions ───────────────────
function AutoTextarea({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = ref.current.scrollHeight + 'px'
    }
  }, [value])

  return (
    <textarea
      ref={ref}
      rows={1}
      className="bg-transparent border border-transparent hover:border-gray-300
        focus:border-blue-400 focus:outline-none focus:bg-blue-50/30 rounded px-1 py-0.5
        w-full transition-colors resize-none leading-snug overflow-hidden
        print:border-transparent print:bg-transparent"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
    />
  )
}

// ── WorkflowStrip ─────────────────────────────────────────────────
const WORKFLOW_STEPS: { key: QuotationStatus; label: string }[] = [
  { key: 'draft',       label: 'Draft' },
  { key: 'shared',      label: 'Shared' },
  { key: 'po_received', label: 'PO Received' },
  { key: 'invoiced',    label: 'Invoiced' },
  { key: 'complete',    label: 'Complete' },
]

interface WorkflowStripProps {
  doc: QuotationDoc
  onUpdate: (updates: Partial<QuotationDoc>) => void
  onUploadInvoice: () => void
  nav: (path: string) => void
  onOpenViewer: (url: string, title: string) => void
}

function WorkflowStrip({ doc, onUpdate, onUploadInvoice, nav, onOpenViewer }: WorkflowStripProps) {
  const [showShareForm, setShowShareForm] = useState(false)
  const [sharedContactNameInput, setSharedContactNameInput] = useState('')
  const [sharedContactEmailInput, setSharedContactEmailInput] = useState('')
  const [sharedContactPhoneInput, setSharedContactPhoneInput] = useState('')
  const [shareFormError, setShareFormError] = useState('')
  const [showPOForm, setShowPOForm] = useState(false)
  const [poInput, setPoInput] = useState('')
  const [poDateInput, setPoDateInput] = useState('')
  const [poDueDateInput, setPoDueDateInput] = useState('')
  const [poAgreedAmountInput, setPoAgreedAmountInput] = useState('')
  const [poFile, setPoFile] = useState('')
  const poFileRef = useRef<HTMLInputElement>(null)

  const effectiveStatus: QuotationStatus = doc.status === 'acknowledged' ? 'shared' : doc.status
  const currentIdx = WORKFLOW_STEPS.findIndex(s => s.key === effectiveStatus)

  function handlePOFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setPoFile(reader.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function handleSavePO() {
    const agreed = parseFloat(poAgreedAmountInput.replace(/,/g, ''))
    onUpdate({
      status: 'po_received',
      poNumber: poInput,
      poDate: poDateInput,
      poDueDate: poDueDateInput || undefined,
      poAgreedAmount: !isNaN(agreed) && agreed > 0 ? agreed : undefined,
      poAttachment: poFile || undefined,
      poReceivedDate: new Date().toISOString().slice(0, 10),
    })
    setShowPOForm(false)
    setPoInput('')
    setPoDateInput('')
    setPoDueDateInput('')
    setPoAgreedAmountInput('')
    setPoFile('')
  }

  function openShareForm() {
    setShowShareForm(true)
    setShareFormError('')
    setSharedContactNameInput(doc.sharedContactName ?? '')
    setSharedContactEmailInput(doc.sharedContactEmail ?? '')
    setSharedContactPhoneInput(doc.sharedContactPhone ?? '')
  }

  function handleShareSave() {
    if (!sharedContactNameInput.trim()) {
      setShareFormError('Enter contact name')
      return
    }
    if (!sharedContactEmailInput.trim() && !sharedContactPhoneInput.trim()) {
      setShareFormError('Enter email or phone')
      return
    }
    onUpdate({
      status: 'shared',
      sharedDate: new Date().toISOString().slice(0, 10),
      sharedContactName: sharedContactNameInput.trim(),
      sharedContactEmail: sharedContactEmailInput.trim(),
      sharedContactPhone: sharedContactPhoneInput.trim(),
    })
    setShowShareForm(false)
    setShareFormError('')
  }

  function handleStepClick(step: QuotationStatus) {
    if (step === 'shared') {
      setShowPOForm(false)
      onUpdate({ status: 'shared' })
      openShareForm()
      return
    }
    if (step === 'po_received') {
      onUpdate({ status: 'po_received' })
      setShowPOForm(true)
      setPoInput(doc.poNumber ?? '')
      setPoDateInput(doc.poDate ?? '')
      setPoDueDateInput(doc.poDueDate ?? '')
      setPoAgreedAmountInput(doc.poAgreedAmount != null ? String(doc.poAgreedAmount) : '')
      setPoFile(doc.poAttachment ?? '')
      return
    }
    setShowShareForm(false)
    setShowPOForm(false)
    onUpdate({ status: step })
  }

  return (
    <div className="no-print bg-white border border-gray-200 rounded-xl p-4 mb-5 shadow-sm">
      {/* Step indicators */}
      <div className="flex items-center">
        {WORKFLOW_STEPS.map((step, idx) => {
          const isDone = idx < currentIdx
          const isActive = idx === currentIdx
          const isFuture = idx > currentIdx
          const isLast = idx === WORKFLOW_STEPS.length - 1

          return (
            <div key={step.key} className="flex items-center flex-1 min-w-0">
              {/* Step circle + label */}
              <div className="flex flex-col items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => handleStepClick(step.key)}
                  title={`Set status to ${step.label}`}
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                    isDone
                      ? 'bg-green-500 border-green-500 text-white'
                      : isActive
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-gray-300 text-gray-400'
                  }`}
                >
                  {isDone
                    ? <Check className="w-3.5 h-3.5" />
                    : <span>{idx + 1}</span>
                  }
                </button>
                <span
                  className={`text-[10px] font-medium whitespace-nowrap ${
                    isDone ? 'text-green-600' : isActive ? 'text-blue-700' : isFuture ? 'text-gray-400' : ''
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div
                  className={`h-0.5 flex-1 mx-1 mb-4 transition-colors ${
                    isDone ? 'bg-green-400' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Next action row */}
      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-3 flex-wrap">
        <span className="text-xs font-medium text-gray-500">Next action:</span>

        {(doc.status === 'draft' || effectiveStatus === 'shared') && (
          <>
            {showShareForm ? (
              <div className="flex items-end gap-2 flex-wrap">
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] text-gray-500 font-medium">Contact Name</label>
                  <input
                    className="input-base text-sm w-44"
                    placeholder="e.g. John"
                    value={sharedContactNameInput}
                    onChange={e => setSharedContactNameInput(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] text-gray-500 font-medium">Email</label>
                  <input
                    className="input-base text-sm w-52"
                    placeholder="john@company.com"
                    value={sharedContactEmailInput}
                    onChange={e => setSharedContactEmailInput(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] text-gray-500 font-medium">Phone</label>
                  <input
                    className="input-base text-sm w-40"
                    placeholder="+971..."
                    value={sharedContactPhoneInput}
                    onChange={e => setSharedContactPhoneInput(e.target.value)}
                  />
                </div>
                <div className="flex items-end gap-2 pb-0.5">
                  <Button variant="primary" onClick={handleShareSave}>
                    Save Shared Contact
                  </Button>
                  <Button variant="ghost" onClick={() => { setShowShareForm(false); setShareFormError('') }}>
                    Cancel
                  </Button>
                </div>
                {shareFormError && (
                  <p className="text-xs text-red-600 w-full">{shareFormError}</p>
                )}
              </div>
            ) : doc.status === 'draft' ? (
              <Button
                variant="primary"
                onClick={openShareForm}
              >
                <Send className="w-3.5 h-3.5" />
                Share with Customer
              </Button>
            ) : null}
          </>
        )}

        {effectiveStatus === 'shared' && !showShareForm && !showPOForm && (
          <Button
            variant="primary"
            onClick={() => { setShowShareForm(false); setShowPOForm(true) }}
          >
            <FileCheck className="w-3.5 h-3.5" />
            Record PO Received
          </Button>
        )}

        {effectiveStatus === 'shared' && showPOForm && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] text-gray-500 font-medium">PO Number</label>
              <input
                className="input-base text-sm w-36"
                placeholder="PO-12345"
                value={poInput}
                onChange={e => setPoInput(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] text-gray-500 font-medium">PO Date</label>
              <input
                type="date"
                className="input-base text-sm w-36"
                value={poDateInput}
                onChange={e => setPoDateInput(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] text-gray-500 font-medium">Due Date</label>
              <input
                type="date"
                className="input-base text-sm w-36"
                value={poDueDateInput}
                onChange={e => setPoDueDateInput(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] text-gray-500 font-medium">Agreed PO Value</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input-base text-sm w-36"
                placeholder={`Quoted: ${(doc.lines.reduce((s, l) => s + (parseFloat(l.qty)||0)*(parseFloat(l.unitPrice)||0), 0) * (1 + doc.vatPct/100)).toFixed(2)}`}
                value={poAgreedAmountInput}
                onChange={e => setPoAgreedAmountInput(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] text-gray-500 font-medium">PO Document</label>
              <input ref={poFileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handlePOFile} />
              <button
                onClick={() => poFileRef.current?.click()}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors
                  ${poFile
                    ? 'border-green-400 bg-green-50 text-green-700'
                    : 'border-gray-300 hover:border-blue-400 text-gray-500 hover:text-blue-600'
                  }`}
              >
                <Paperclip className="w-3.5 h-3.5" />
                {poFile ? 'File attached' : 'Attach file'}
              </button>
              {poFile && (
                <button onClick={() => setPoFile('')} className="text-[10px] text-red-400 hover:text-red-600 mt-0.5">
                  Remove
                </button>
              )}
            </div>
            <div className="flex items-end gap-2 pb-0.5 mt-4">
              <Button variant="primary" onClick={handleSavePO} disabled={!poInput}>
                Save
              </Button>
              <Button variant="ghost" onClick={() => { setShowPOForm(false); setPoInput(''); setPoDateInput(''); setPoDueDateInput(''); setPoAgreedAmountInput(''); setPoFile('') }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {doc.status === 'po_received' && (
          <>
            {doc.poAttachment ? (
              <button
                onClick={() => onOpenViewer(doc.poAttachment!, doc.poAttachmentName ?? `PO: ${doc.poNumber}`)}
                title="Open PO attachment"
                className="inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 hover:bg-amber-100
                  border border-amber-200 rounded px-2 py-1 font-medium underline underline-offset-2
                  hover:no-underline transition-colors"
              >
                <Paperclip className="w-3 h-3" />
                PO: {doc.poNumber}
                {doc.poDate ? ` · ${formatDate(doc.poDate)}` : ''}
                {doc.poDueDate ? ` · Due ${formatDate(doc.poDueDate)}` : ''}
              </button>
            ) : (
              <span className="text-xs text-gray-600 bg-gray-100 rounded px-2 py-1 font-medium">
                PO: {doc.poNumber}
                {doc.poDate ? ` · ${formatDate(doc.poDate)}` : ''}
                {doc.poDueDate ? ` · Due ${formatDate(doc.poDueDate)}` : ''}
              </span>
            )}
            <Button variant="primary" onClick={onUploadInvoice}>
              <Upload className="w-3.5 h-3.5" />
              Upload Invoice
            </Button>
          </>
        )}

        {doc.status === 'invoiced' && (
          <>
            {doc.invoiceId && (
              <button
                onClick={() => nav(`/invoices/${doc.invoiceId}`)}
                className="text-sm text-blue-600 hover:text-blue-800 underline font-medium"
              >
                View Invoice →
              </button>
            )}
            <Button
              variant="primary"
              onClick={() => onUpdate({ status: 'complete' })}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Mark Complete
            </Button>
          </>
        )}

        {doc.status === 'complete' && (
          <span className="text-sm font-semibold text-green-600 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            This quotation is complete
          </span>
        )}
      </div>
    </div>
  )
}

// ── QuotationPage ─────────────────────────────────────────────────
interface PageProps {
  doc: QuotationDoc
  lines: QLine[]
  pageNum: number
  totalPages: number
  subtotal: number
  vatAmt: number
  grandTotal: number
  isLastPage: boolean
  isFirstPage: boolean
  onChange: (doc: QuotationDoc) => void
  onLineChange: (key: string, field: keyof QLine, val: string) => void
  onAddLine: () => void
  onRemoveLine: (key: string) => void
  customerId: string
}

function QuotationPage({
  doc, lines, pageNum, totalPages, subtotal, vatAmt, grandTotal,
  isLastPage, isFirstPage, onChange, onLineChange, onAddLine, onRemoveLine,
  customerId,
}: PageProps) {
  const set = (f: keyof QuotationDoc) => (v: string) => onChange({ ...doc, [f]: v })
  const defaultProfile = loadProfile()
  const issuerAddress = (defaultProfile.address || doc.issuerAddress || '').trim()
  const issuerMobile = (defaultProfile.mobile || doc.issuerMobile || '').trim()
  const issuerFax = (defaultProfile.fax || doc.issuerFax || '').trim()
  const issuerEmail = (defaultProfile.email || doc.issuerEmail || '').trim()
  const issuerTIN = (defaultProfile.trn || doc.issuerTRN || '').trim()

  return (
    <div
      className={`quotation-paper bg-white w-[210mm] h-[297mm] max-w-[210mm] p-[10mm] mx-auto flex flex-col overflow-hidden
        shadow-[0_2px_20px_rgba(0,0,0,0.12)]
        ${pageNum > 1 ? 'mt-12 print:mt-0' : ''}`}
    >
      {/* ── First-page header ─────────────────────────────────── */}
      {isFirstPage && (
        <div className="flex items-start justify-between mb-4 pb-3 border-b-2 border-gray-800">
          {/* Left: customer logo (read from customer template) */}
          <div className="flex flex-col items-start gap-1">
            <div className="w-24 h-16 rounded-lg border border-gray-100 bg-gray-50 flex items-center justify-center overflow-hidden print:border-0 print:bg-transparent">
              <SafeImg
                src={doc.customerLogoImage}
                alt={doc.customerName || 'Customer'}
                className="max-w-full max-h-full object-contain p-1"
                fallback={<Building2 className="w-7 h-7 text-gray-200" />}
              />
            </div>
            <p className="text-[9px] text-gray-400 italic print:hidden">Customer logo</p>
          </div>

          {/* Center: Quotation type title — editable on screen, static on print */}
          <div className="text-center flex-1 mx-6 mt-2">
            <select
              value={doc.quotationType ?? 'quotation'}
              onChange={e => onChange({ ...doc, quotationType: e.target.value as QuotationType })}
              className="text-3xl font-bold tracking-wide text-gray-900 bg-transparent border-0 outline-none
                cursor-pointer hover:bg-blue-50/60 rounded-lg px-2 py-0.5 text-center appearance-none
                print:pointer-events-none print:bg-transparent"
              style={{ WebkitAppearance: 'none' }}
            >
              {(Object.entries(QUOTATION_TYPE_LABELS) as [QuotationType, string][]).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </div>

          {/* Right: company logo + subtitle + name */}
          <div className="flex flex-col items-end gap-1">
            <LogoUpload
              value={doc.issuerLogoImage}
              onChange={(v) => {
                onChange({ ...doc, issuerLogoImage: v })
                try {
                  const p = JSON.parse(readData(PROFILE_KEY) ?? '{}')
                  writeData(PROFILE_KEY, JSON.stringify({ ...p, logoImage: v }))
                } catch { /* ok */ }
                // Persist to org settings
                orgApi.patchSettings({ logo_url: v }).catch(() => {})
              }}
              size="md"
              uploadFn={logosApi.upload}
            />
            <div className="text-right">
              <F value={doc.issuerName} onChange={set('issuerName')}
                className="text-right text-base font-extrabold text-gray-800" placeholder="COMPANY NAME" />
              <div className="text-[10px] text-gray-600 leading-snug">
                <p className="whitespace-nowrap">Contact: <span className="font-medium text-gray-700">{issuerMobile || '—'}</span></p>
                <p className="whitespace-nowrap">Email: <span className="font-medium text-gray-700">{issuerEmail || '—'}</span></p>
                <p className="whitespace-nowrap">TIN/TRN: <span className="font-mono font-medium text-gray-700">{issuerTIN || '—'}</span></p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Continuation header ────────────────────────────────── */}
      {!isFirstPage && (
        <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-300">
          <p className="text-sm font-bold text-gray-700">{doc.issuerName}</p>
          <p className="text-sm text-gray-500">
            {doc.quotationNo} · Page {pageNum} of {totalPages}
          </p>
        </div>
      )}

      {/* ── Bill To + Meta (first page only) ─────────────────── */}
      {isFirstPage && (
        <div className="flex justify-between mb-4 gap-4">
          <div className="flex-1 text-xs leading-relaxed">
            <p className="font-bold text-gray-800 mb-0.5">
              M/s.{' '}
              <F value={doc.customerName} onChange={set('customerName')}
                className="font-bold inline-block" placeholder="Customer Name" />
            </p>
            {(doc.customerContactName || true) && (
              <div className="flex gap-1 items-center">
                <span className="text-gray-500 flex-shrink-0">Attn:</span>
                <F value={doc.customerContactName} onChange={set('customerContactName')}
                  className="text-gray-700" placeholder="Contact person name" />
              </div>
            )}
            <F value={doc.customerBranch} onChange={set('customerBranch')}
              className="text-gray-600" placeholder="Branch / Division" />
            <F value={doc.customerCity} onChange={set('customerCity')}
              className="text-gray-600" placeholder="City, Country" />
            <div className="flex gap-1 items-center">
              <span className="text-gray-500 flex-shrink-0">Tel:</span>
              <F value={doc.customerTel} onChange={set('customerTel')}
                className="text-gray-700" placeholder="+971 0 0000000" />
            </div>
            <div className="flex gap-1 items-center">
              <span className="text-gray-500 flex-shrink-0">Email:</span>
              <F value={doc.customerEmail} onChange={set('customerEmail')}
                className="text-gray-700" placeholder="customer@email.com" />
            </div>
            <div className="flex gap-1 items-center">
              <span className="text-gray-500 flex-shrink-0">TRN:</span>
              <F value={doc.customerTRN} onChange={set('customerTRN')}
                className="font-mono text-gray-700" placeholder="TRN number" />
            </div>
          </div>

          <div className="text-xs leading-relaxed text-right min-w-[200px]">
            <div className="flex justify-end gap-3 mb-1">
              <span className="font-bold text-gray-700">Quotation No:</span>
              <span className="font-bold text-gray-900">{doc.quotationNo}</span>
            </div>
            <div className="flex justify-end gap-3">
              <span className="font-bold text-gray-700">Date:</span>
              <input
                type="date"
                value={doc.date}
                onChange={e => onChange({ ...doc, date: e.target.value })}
                className="bg-transparent border border-transparent hover:border-gray-300
                  focus:border-blue-400 focus:outline-none rounded px-1 text-xs print:border-transparent"
              />
            </div>
            {doc.validityDays && doc.date && (() => {
              const expiry = new Date(doc.date)
              expiry.setDate(expiry.getDate() + doc.validityDays)
              return (
                <div className="flex justify-end gap-3 mt-0.5">
                  <span className="text-gray-500">Valid until:</span>
                  <span className="text-gray-700">
                    {expiry.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    <span className="text-gray-400 ml-1">({doc.validityDays} days)</span>
                  </span>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* ── Line items ──────────────────────────────────────────── */}
      <div className="flex-1">
        {/* Empty state — show before any lines are added */}
        {lines.length === 0 && isLastPage && (
          <div
            className="flex items-center justify-center py-10 border border-dashed border-blue-200 rounded-lg
              cursor-pointer hover:bg-blue-50/40 transition-colors group print:hidden"
            onClick={onAddLine}
          >
            <span className="flex items-center gap-2 text-sm text-blue-400 group-hover:text-blue-600">
              <Plus className="w-4 h-4" />
              Add line item
            </span>
          </div>
        )}

        {/* Table — only rendered when there are lines */}
        {lines.length > 0 && (
          <table className="w-full text-xs border-collapse mb-2">
            <thead>
              <tr className="bg-gray-100 border border-gray-400">
                <th className="border border-gray-400 py-2 px-2 text-center w-8 font-bold">No.</th>
                <th className="border border-gray-400 py-2 px-2 text-left font-bold">Description</th>
                <th className="border border-gray-400 py-2 px-2 text-center w-14 font-bold">Qty.</th>
                <th className="border border-gray-400 py-2 px-2 text-center w-24 font-bold">Unit Price AED</th>
                <th className="border border-gray-400 py-2 px-2 text-center w-24 font-bold">Amount AED</th>
                <th className="border border-gray-400 py-2 px-1 w-6 print:hidden" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => {
                const hasCalc = !!(line.qty && line.unitPrice)
                const computedAmt = hasCalc ? calcLine(line).toFixed(2) : ''
                return (
                  <tr key={line._key} className="border border-gray-300">
                    <td className="border border-gray-300 py-1 px-2 text-center text-gray-500 align-top">
                      {idx + 1}
                    </td>
                    <td className="border border-gray-300 py-1 px-1 align-top">
                      <AutoTextarea
                        value={line.description}
                        onChange={v => onLineChange(line._key, 'description', v)}
                        placeholder="Description…"
                      />
                    </td>
                    <td className="border border-gray-300 py-1 px-1 align-top">
                      <F value={line.qty} onChange={v => onLineChange(line._key, 'qty', v)}
                        align="center" placeholder="—" />
                    </td>
                    <td className="border border-gray-300 py-1 px-1 align-top">
                      <F value={line.unitPrice} onChange={v => onLineChange(line._key, 'unitPrice', v)}
                        align="right" placeholder="0.00" />
                    </td>
                    <td className="border border-gray-300 py-1 px-2 text-right align-top font-medium">
                      {hasCalc
                        ? <span className="block w-full">{computedAmt}</span>
                        : <F value={line.amount} onChange={v => onLineChange(line._key, 'amount', v)}
                            align="right" placeholder="0.00" />
                      }
                    </td>
                    <td className="border border-gray-300 py-1 px-1 text-center print:hidden">
                      <button onClick={() => onRemoveLine(line._key)}
                        className="text-gray-300 hover:text-red-500 transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>

            {isLastPage && (
              <tfoot>
                <tr className="border border-gray-400 bg-gray-50">
                  <td colSpan={3} className="border border-gray-400 py-1.5 px-2" />
                  <td className="border border-gray-400 py-1.5 px-2 text-center text-gray-600">Sub Total</td>
                  <td className="border border-gray-400 py-1.5 px-2 text-right text-gray-800">{subtotal.toFixed(2)}</td>
                  <td className="border border-gray-400 print:hidden" />
                </tr>
                {doc.vatPct > 0 && (
                  <tr className="border border-gray-400 bg-gray-50">
                    <td colSpan={3} className="border border-gray-400 py-1.5 px-2" />
                    <td className="border border-gray-400 py-1.5 px-2 text-center text-gray-600">VAT ({doc.vatPct}%)</td>
                    <td className="border border-gray-400 py-1.5 px-2 text-right text-gray-800">{vatAmt.toFixed(2)}</td>
                    <td className="border border-gray-400 print:hidden" />
                  </tr>
                )}
                <tr className="border border-gray-400 font-bold bg-gray-100">
                  <td colSpan={3} className="border border-gray-400 py-2 px-2" />
                  <td className="border border-gray-400 py-2 px-2 text-center font-bold text-gray-800">Grand Total AED</td>
                  <td className="border border-gray-400 py-2 px-2 text-right font-bold text-gray-900">{grandTotal.toFixed(2)}</td>
                  <td className="border border-gray-400 print:hidden" />
                </tr>
                {/* Add line — below the totals, last page only */}
                <tr className="print:hidden">
                  <td
                    colSpan={6}
                    className="border border-dashed border-blue-200 py-1.5 px-2 cursor-pointer
                      hover:bg-blue-50/40 transition-colors group"
                    onClick={onAddLine}
                  >
                    <span className="flex items-center gap-1 text-xs text-blue-400 group-hover:text-blue-600">
                      <Plus className="w-3 h-3" />
                      Add line
                    </span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>

      {/* ── Footer (last page only) ───────────────────────────── */}
      {isLastPage && (
        <div className="mt-auto pt-3 border-t border-gray-300 text-xs space-y-1.5">
          <div className="flex gap-2">
            <span className="font-bold text-gray-700 w-36 flex-shrink-0">Amount in words</span>
            <span className="text-gray-500">:</span>
            <span className="text-gray-800 italic">{toWords(grandTotal)}</span>
          </div>

          <div className="flex gap-2 items-center">
            <span className="font-bold text-gray-700 w-36 flex-shrink-0">VAT Rate</span>
            <span className="text-gray-500">:</span>
            <div className="flex items-center gap-2">
              <input
                type="number" min={0} max={100} step={0.5}
                value={doc.vatPct}
                onChange={e => onChange({ ...doc, vatPct: parseFloat(e.target.value) || 0 })}
                className="w-12 text-center border border-transparent hover:border-gray-300
                  focus:border-blue-400 focus:outline-none rounded px-1 print:border-transparent"
              />
              <span>% (applied above)</span>
            </div>
          </div>

          {/* Rich payment terms */}
          <div className="flex gap-2 items-start">
            <span className="font-bold text-gray-700 w-36 flex-shrink-0">Payment Terms</span>
            <span className="text-gray-500 mt-0.5">:</span>
            <RichText
              value={doc.paymentTerms}
              onChange={set('paymentTerms')}
              placeholder="e.g. 30 Days payment terms with purchase order…"
            />
          </div>

          <div className="flex gap-2 items-center">
            <span className="font-bold text-gray-700 w-36 flex-shrink-0">Delivery Time</span>
            <span className="text-gray-500">:</span>
            <F value={doc.deliveryTime} onChange={set('deliveryTime')} placeholder="e.g. Immediate / 2 weeks" />
          </div>

          {(doc.notes || !isLastPage) && (
            <div className="flex gap-2 items-start">
              <span className="font-bold text-gray-700 w-36 flex-shrink-0">Notes</span>
              <span className="text-gray-500 mt-0.5">:</span>
              <RichText
                value={doc.notes}
                onChange={set('notes')}
                placeholder="Additional notes…"
              />
            </div>
          )}

          {/* Signature row */}
          <div className="pt-4 flex justify-between">
            <div>
              <p className="font-bold text-gray-800">For {doc.issuerName}</p>
              <div className="mt-6 border-t border-gray-400 w-36 pt-1">
                <p className="text-gray-500 text-[10px]">Authorized Signatory</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Page footer — every page ──────────────────────────── */}
      <div className="mt-auto pt-2">
        <div className="border-t border-gray-400" />
        <div className="text-center leading-relaxed mt-1.5 space-y-0.5">
          {/* Line 1: address · mobile · fax */}
          <p className="text-[9px] text-gray-600">
            {[
              issuerAddress,
              issuerMobile ? `Mobile: ${issuerMobile}` : '',
              issuerFax ? `Fax: ${issuerFax}` : '',
            ].filter(Boolean).join('   ')}
          </p>
          {/* Line 2: email · TIN/TRN */}
          <p className="text-[9px] text-gray-600">
            {issuerEmail && (
              <span>
                Email:{' '}
                <a href={`mailto:${issuerEmail}`}
                  className="text-blue-600 underline"
                  onClick={e => e.preventDefault()}
                >
                  {issuerEmail}
                </a>
              </span>
            )}
            {issuerEmail && issuerTIN && <span className="mx-3" />}
            {issuerTIN && (
              <span>TIN/TRN: <strong>{issuerTIN}</strong></span>
            )}
          </p>
        </div>
        {totalPages > 1 && (
          <div className="text-center text-[9px] text-gray-400 mt-1">
            Page {pageNum} of {totalPages}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Settings panel ────────────────────────────────────────────────
function SettingsPanel({ doc, onChange, onSave, onClose }: {
  doc: QuotationDoc
  onChange: (d: QuotationDoc) => void
  onSave: () => void
  onClose: () => void
}) {
  const existingProfile = loadProfile()
  const [alertDaysBefore, setAlertDaysBefore] = useState<number>(existingProfile.alertDaysBeforeExpiry ?? 7)
  const [alertStaleDays,  setAlertStaleDays]  = useState<number>(existingProfile.alertStaleDays ?? 14)

  const fields: [string, keyof QuotationDoc][] = [
    ['Company name', 'issuerName'],
    ['Address', 'issuerAddress'],
    ['Mobile', 'issuerMobile'],
    ['Fax', 'issuerFax'],
    ['Email', 'issuerEmail'],
    ['TRN', 'issuerTRN'],
  ]

  function handleSave() {
    // Merge alert settings into the profile before calling parent's onSave
    const current = JSON.parse(readData(PROFILE_KEY) ?? '{}')
    writeData(PROFILE_KEY, JSON.stringify({
      ...current,
      alertDaysBeforeExpiry: alertDaysBefore,
      alertStaleDays,
    }))
    onSave()
  }

  return (
    <div className="no-print bg-white border border-gray-200 rounded-xl p-5 mb-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-800">Company Profile</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-start gap-5 mb-4">
        <div className="flex flex-col items-center gap-1">
          <p className="text-xs font-medium text-gray-500 mb-1">Company Logo</p>
          <LogoUpload
            value={doc.issuerLogoImage}
            onChange={v => onChange({ ...doc, issuerLogoImage: v })}
            size="md"
          />
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm flex-1">
          {fields.map(([label, field]) => (
            <div key={field}>
              <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
              <input
                className="input-base text-sm"
                value={String(doc[field] ?? '')}
                onChange={e => onChange({ ...doc, [field]: e.target.value })}
              />
            </div>
          ))}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Default validity (days)</label>
            <input
              type="number" min="1" max="365" className="input-base text-sm"
              value={doc.validityDays ?? 30}
              onChange={e => onChange({ ...doc, validityDays: parseInt(e.target.value) || 30 })}
            />
            <p className="text-[10px] text-gray-400 mt-0.5">Applied to all new quotations</p>
          </div>
        </div>
      </div>

      {/* ── Alert thresholds ── */}
      <div className="border-t border-gray-100 pt-4 mb-4">
        <p className="text-xs font-semibold text-gray-600 mb-3 flex items-center gap-1.5">
          <span className="text-amber-500">⚠</span> Overdue Alert Settings
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Warn before expiry (days)</label>
            <input
              type="number" min="1" max="90" className="input-base text-sm"
              value={alertDaysBefore}
              onChange={e => setAlertDaysBefore(parseInt(e.target.value) || 7)}
            />
            <p className="text-[10px] text-gray-400 mt-0.5">Alert when &lt; {alertDaysBefore}d until expiry</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Stale stage alert (days)</label>
            <input
              type="number" min="1" max="180" className="input-base text-sm"
              value={alertStaleDays}
              onChange={e => setAlertStaleDays(parseInt(e.target.value) || 14)}
            />
            <p className="text-[10px] text-gray-400 mt-0.5">Alert if no progress for {alertStaleDays}d</p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button variant="primary" onClick={handleSave}>Save as default</Button>
      </div>
    </div>
  )
}

// ── Invoice generation ────────────────────────────────────────────
function generateInvoice(doc: QuotationDoc): string {
  const yy = new Date().getFullYear().toString().slice(-2)
  let existing: { id: string; invoiceNo: string }[] = []
  try {
    const raw = readData(INV_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      existing = Array.isArray(parsed) ? parsed : Object.values(parsed)
    }
  } catch { /* ok */ }

  const nums = existing
    .map(inv => inv.invoiceNo ?? '')
    .filter((n: string) => n.startsWith(`INV${yy}/`))
    .map((n: string) => parseInt(n.split('/')[1] ?? '0'))
    .filter((n: number) => !isNaN(n))
  const max = nums.length ? Math.max(...nums) : 0
  const invoiceNo = `INV${yy}/${String(max + 1).padStart(4, '0')}`

  const newInvoice = {
    id: crypto.randomUUID(),
    invoiceNo,
    issuerName: doc.issuerName,
    issuerLogoText: doc.issuerLogoText,
    issuerLogoImage: doc.issuerLogoImage,
    issuerAddress: doc.issuerAddress,
    issuerPOBox: doc.issuerPOBox,
    issuerMobile: doc.issuerMobile,
    issuerFax: doc.issuerFax,
    issuerEmail: doc.issuerEmail,
    issuerTRN: doc.issuerTRN,
    customerId: doc.customerId,
    customerName: doc.customerName,
    customerLogoImage: doc.customerLogoImage,
    customerBranch: doc.customerBranch,
    customerCity: doc.customerCity,
    customerTel: doc.customerTel,
    customerTRN: doc.customerTRN,
    lines: doc.lines,
    vatPct: doc.vatPct,
    paymentTerms: doc.paymentTerms,
    deliveryTime: doc.deliveryTime,
    poNumber: doc.poNumber ?? '',
    poDate: doc.poDate ?? '',
    quotationNo: doc.quotationNo,
    dueDate: '',
    invoiceStatus: 'pending',
    date: new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
  }

  writeData(INV_KEY, JSON.stringify([...existing, newInvoice]))
  return newInvoice.id
}

// ── Normalize status from old format ─────────────────────────────
function normalizeStatus(status: string): QuotationStatus {
  if (status === 'final') return 'shared'
  const valid: QuotationStatus[] = ['draft', 'shared', 'acknowledged', 'po_received', 'invoiced', 'complete']
  return valid.includes(status as QuotationStatus) ? (status as QuotationStatus) : 'draft'
}

// ── Status badge color ────────────────────────────────────────────
function statusBadgeClass(status: QuotationStatus): string {
  switch (status) {
    case 'draft':        return 'bg-amber-100 text-amber-700'
    case 'shared':       return 'bg-blue-100 text-blue-700'
    case 'acknowledged': return 'bg-purple-100 text-purple-700'
    case 'po_received':  return 'bg-orange-100 text-orange-700'
    case 'invoiced':     return 'bg-teal-100 text-teal-700'
    case 'complete':     return 'bg-green-100 text-green-700'
  }
}

// ── open a data: URL or http URL in the viewer ────────────────────
function toViewerUrl(url: string): string {
  if (!url.startsWith('data:')) return url
  try {
    const [header, b64] = url.split(',')
    const mime = header.match(/:(.*?);/)?.[1] ?? 'application/octet-stream'
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return URL.createObjectURL(new Blob([bytes], { type: mime }))
  } catch { return url }
}

// ── Main Editor ───────────────────────────────────────────────────
export default function QuotationEditorPage() {
  const { id } = useParams<{ id?: string }>()
  const nav = useNavigate()
  const profile = loadProfile()

  const [doc, setDoc] = useState<QuotationDoc>(() => {
    if (id) {
      const found = loadAll().find(q => q.id === id)
      if (found) {
        return {
          ...found,
          issuerLogoImage: found.issuerLogoImage ?? '',
          customerLogoImage: found.customerLogoImage ?? '',
          status: normalizeStatus(found.status),
          poNumber: found.poNumber ?? '',
          poDate: found.poDate ?? '',
          attachments: found.attachments ?? [],
          invoiceId: found.invoiceId ?? '',
          sharedDate: found.sharedDate ?? '',
          sharedContactName: found.sharedContactName ?? '',
          sharedContactEmail: found.sharedContactEmail ?? '',
          sharedContactPhone: found.sharedContactPhone ?? '',
          acknowledgedDate: found.acknowledgedDate ?? '',
          poReceivedDate: found.poReceivedDate ?? '',
        }
      }
      // id present but not in localStorage — use a stable skeleton; the API useEffect will fill it
      return {
        id,
        quotationNo: '',
        date: new Date().toISOString().slice(0, 10),
        issuerName: profile.name, issuerLogoText: profile.logoText,
        issuerLogoImage: profile.logoImage ?? '', issuerAddress: profile.address,
        issuerPOBox: profile.poBox, issuerMobile: profile.mobile,
        issuerFax: profile.fax, issuerEmail: profile.email, issuerTRN: profile.trn,
        customerId: '', customerName: '', customerLogoImage: '',
        customerContactName: '', customerEmail: '',
        customerBranch: '', customerCity: '', customerTel: '', customerTRN: '',
        lines: [], vatPct: 5, paymentTerms: '30 Days payment terms with purchase order',
        paymentMethod: '', deliveryTime: 'Immediate', notes: '',
        quotationType: 'quotation' as QuotationType, status: 'draft' as QuotationStatus,
        createdAt: new Date().toISOString(),
        poNumber: '', poDate: '', attachments: [],
        invoiceId: '', sharedDate: '', sharedContactName: '', sharedContactEmail: '', sharedContactPhone: '', acknowledgedDate: '', poReceivedDate: '',
      }
    }
    const dc = loadDefaultCustomer()
    return {
      id: crypto.randomUUID(),
      quotationNo: nextNo(),
      date: new Date().toISOString().slice(0, 10),
      issuerName: profile.name,
      issuerLogoText: profile.logoText,
      issuerLogoImage: profile.logoImage ?? '',
      issuerAddress: profile.address,
      issuerPOBox: profile.poBox,
      issuerMobile: profile.mobile,
      issuerFax: profile.fax,
      issuerEmail: profile.email,
      issuerTRN: profile.trn,
      customerId:          dc?.id ?? '',
      customerName:        dc?.company ?? '',
      customerLogoImage:   dc?.logoImage ?? '',
      customerContactName: dc?.contactName ?? '',
      customerEmail:       dc?.email ?? '',
      customerBranch:      dc?.industry ?? '',
      customerCity:        dc?.city ?? '',
      customerTel:         dc?.phone ?? '',
      customerTRN:         dc?.trn ?? '',
      lines: [],
      vatPct: 5,
      paymentTerms: '30 Days payment terms with purchase order',
      paymentMethod: '',
      deliveryTime: 'Immediate',
      notes: '',
      quotationType: 'quotation',
      status: 'draft',
      createdAt: new Date().toISOString(),
      validityDays: profile.defaultValidityDays ?? 30,
      poNumber: '',
      poDate: '',
      attachments: [],
      invoiceId: '',
      sharedDate: '',
      sharedContactName: '',
      sharedContactEmail: '',
      sharedContactPhone: '',
      acknowledgedDate: '',
      poReceivedDate: '',
    }
  })

  const [customers, setCustomers] = useState<StoredCustomer[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const filteredCustomers = customerSearch.trim()
    ? customers.filter(c =>
        c.company.toLowerCase().includes(customerSearch.toLowerCase()) ||
        c.city.toLowerCase().includes(customerSearch.toLowerCase()) ||
        c.contactName.toLowerCase().includes(customerSearch.toLowerCase())
      )
    : customers
  const [showCustomerPicker, setShowCustomerPicker] = useState(false)
  const [pickerMode, setPickerMode] = useState<'list' | 'edit' | 'new'>('list')
  const [editingCustomer, setEditingCustomer] = useState<StoredCustomer | null>(null)
  const [custForm, setCustForm] = useState({ company: '', contactName: '', email: '', phone: '', city: '', industry: '', trn: '', logo: '' })
  const [custLogoFile, setCustLogoFile] = useState<File | null>(null)
  const [custFormIsDefault, setCustFormIsDefault] = useState(false)
  const [custSaving, setCustSaving] = useState(false)
  const [custSaveError, setCustSaveError] = useState('')
  const custLogoInputRef = useRef<HTMLInputElement>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [saved, setSaved] = useState(!!id)
  const [saveError, setSaveError] = useState('')
  const [apiId, setApiId] = useState<string | null>(null)
  const [relatedDocs, setRelatedDocs] = useState<{ invoices: CustomerInvoice[]; pos: unknown[] } | null>(null)
  const [relatedOpen, setRelatedOpen] = useState(true)
  const [relatedTab, setRelatedTab] = useState<'invoices' | 'po' | 'attachments' | 'customer' | 'delivery'>('invoices')
  // Delivery notes
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>([])
  const [dnLoading, setDnLoading] = useState(false)
  const [showDNForm, setShowDNForm] = useState(false)
  const [dnFormItems, setDnFormItems] = useState<(DeliveryNoteItem & { thisQty: string })[]>([])
  const [dnFormDate, setDnFormDate] = useState(new Date().toISOString().slice(0, 10))
  const [dnFormNotes, setDnFormNotes] = useState('')
  const [dnFormDriver, setDnFormDriver] = useState('')
  const [dnSaving, setDnSaving] = useState(false)
  const [dnSaveError, setDnSaveError] = useState('')
  const [uploadModal, setUploadModal] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadInvoiceNo, setUploadInvoiceNo] = useState('')
  const [uploading, setUploading] = useState(false)
  const [poUploading, setPoUploading] = useState(false)
  const [filesUploading, setFilesUploading] = useState(false)
  // Sidebar PO form state (used in PO tab for entering PO details)
  const [showSidebarPoForm, setShowSidebarPoForm] = useState(false)
  const [sidebarPoInput, setSidebarPoInput] = useState('')
  const [sidebarPoDate, setSidebarPoDate] = useState('')
  const [sidebarPoDueDate, setSidebarPoDueDate] = useState('')
  const [sidebarPoAgreed, setSidebarPoAgreed] = useState('')
  const [sidebarPoFile, setSidebarPoFile] = useState<string>('')
  const [sidebarPoUploading, setSidebarPoUploading] = useState(false)
  const sidebarPoFileRef = useRef<HTMLInputElement>(null)
  const [viewer, setViewer] = useState<{ url: string; title: string; blobUrl?: string } | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const apiDocLoaded = useRef(false)   // guard: don't overwrite user edits with stale API response
  const pendingCreateRef = useRef<Promise<string> | null>(null)  // guard: prevent duplicate POSTs on first save

  function openViewer(rawUrl: string, title: string) {
    if (!rawUrl) return
    if (viewer?.blobUrl) URL.revokeObjectURL(viewer.blobUrl)  // revoke previous to prevent memory leak
    const blobUrl = rawUrl.startsWith('data:') ? toViewerUrl(rawUrl) : undefined
    setViewer({ url: blobUrl ?? rawUrl, title, blobUrl })
  }

  function closeViewer() {
    if (viewer?.blobUrl) URL.revokeObjectURL(viewer.blobUrl)
    setViewer(null)
  }

  // Load org logo URL from server settings (for new quotations)
  useEffect(() => {
    if (id) return // editing an existing doc — logo comes from doc_data
    orgApi.getSettings().then((s: any) => {
      if (s?.logo_url) {
        setDoc(prev => ({ ...prev, issuerLogoImage: s.logo_url }))
      }
    }).catch(() => { /* no server, keep localStorage logo */ })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load customers from API (fallback to localStorage)
  useEffect(() => {
    customersApi.list().then(list => {
      setCustomers(list.map((c: any) => ({
        id: String(c.id),
        company: c.company,
        contactName: c.contact_name ?? '',
        email: c.email ?? '',
        phone: c.phone ?? '',
        city: c.city ?? '',
        industry: c.industry ?? '',
        website: c.website ?? '',
        notes: c.notes ?? '',
        status: c.status,
        logoImage: c.logo_url || c.logo_image || '',
        trn: c.trn ?? '',
      })))
    }).catch(() => {
      try { setCustomers(JSON.parse(readData(C_KEY) ?? '[]')) } catch { /* ok */ }
    })
  }, [])

  // Fetch documents linked to this quotation
  useEffect(() => {
    if (!apiId) return
    cquotesApi.getRelated(apiId).then(setRelatedDocs).catch(() => {})
    // Load delivery notes
    setDnLoading(true)
    deliveryNotesApi.list({ quotation_id: apiId })
      .then(setDeliveryNotes)
      .catch(() => {})
      .finally(() => setDnLoading(false))
  }, [apiId])

  // Load quotation from API if editing
  useEffect(() => {
    if (!id) return
    cquotesApi.get(id).then((found: any) => {
      // Skip if the user already started editing before this response arrived
      if (apiDocLoaded.current) return
      apiDocLoaded.current = true
      setApiId(found.id)
      const d = found.doc_data as QuotationDoc
      setDoc({
        ...d,
        issuerLogoImage: d.issuerLogoImage ?? '',
        customerLogoImage: d.customerLogoImage ?? '',
        status: normalizeStatus(d.status),
        poNumber: d.poNumber ?? '',
        poDate: d.poDate ?? '',
        attachments: d.attachments ?? [],
        invoiceId: d.invoiceId ?? '',
        sharedDate: d.sharedDate ?? '',
        sharedContactName: d.sharedContactName ?? '',
        sharedContactEmail: d.sharedContactEmail ?? '',
        sharedContactPhone: d.sharedContactPhone ?? '',
        acknowledgedDate: d.acknowledgedDate ?? '',
        poReceivedDate: d.poReceivedDate ?? '',
      })
    }).catch(() => { /* fall through to localStorage */ })
  }, [id])

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowCustomerPicker(false)
        setPickerMode('list')
      }
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [])

  const updateDoc = useCallback((d: QuotationDoc) => { setDoc(d); setSaved(false); apiDocLoaded.current = true }, [])

  const updateLine = useCallback((key: string, field: keyof QLine, val: string) => {
    setDoc(prev => ({
      ...prev,
      lines: prev.lines.map(l => l._key === key ? { ...l, [field]: val } : l),
    }))
    setSaved(false)
    if (saveError) setSaveError('')
  }, [])

  const addLine = useCallback(() => {
    setDoc(prev => ({ ...prev, lines: [...prev.lines, newLine()] }))
    setSaved(false)
    if (saveError) setSaveError('')
  }, [])

  const removeLine = useCallback((key: string) => {
    setDoc(prev => ({ ...prev, lines: prev.lines.filter(l => l._key !== key) }))
    setSaved(false)
    if (saveError) setSaveError('')
  }, [])

  // Totals
  const subtotal   = doc.lines.reduce((s, l) => s + calcLine(l), 0)
  const vatAmt     = subtotal * (doc.vatPct / 100)
  const grandTotal = subtotal + vatAmt

  // Content-aware pagination
  const pages = buildPages(doc.lines)

  function handleSave(overrideDoc?: QuotationDoc) {
    const target = overrideDoc ?? doc

    // Validation: a new quotation must include at least one meaningful line item.
    const hasLineItem = target.lines.some(l =>
      (l.description ?? '').trim().length > 0 ||
      (parseFloat(l.qty) || 0) > 0 ||
      (parseFloat(l.unitPrice) || 0) > 0
    )
    if (!apiId && !pendingCreateRef.current && !hasLineItem) {
      setSaveError('Add at least one line item before creating the quotation.')
      setSaved(false)
      return
    }
    if (saveError) setSaveError('')

    // localStorage save (keep for offline/print compat)
    const all = loadAll().filter(q => q.id !== target.id)
    saveAll([...all, target])
    setSaved(true)
    // Backend API save (fire and forget)
    const subtotalVal = target.lines.reduce((s, l) => s + calcLine(l), 0)
    const vatVal = subtotalVal * (target.vatPct / 100)
    const payload = {
      quotation_no: target.quotationNo,
      customer_id: target.customerId || undefined,
      customer_name: target.customerName || undefined,
      status: target.status,
      total_amount: subtotalVal + vatVal,
      doc_data: target as unknown as Record<string, unknown>,
    }
    if (apiId) {
      cquotesApi.update(apiId, payload).catch(() => setSaved(false))
    } else if (pendingCreateRef.current) {
      // A create is already in-flight — chain an update onto it to avoid duplicate POSTs
      pendingCreateRef.current.then(newId => {
        if (newId) cquotesApi.update(newId, payload).catch(() => {})
      })
    } else {
      const p = cquotesApi.create(payload)
        .then((res: any) => {
          const newId: string = res?.id ?? ''
          if (newId) setApiId(newId)
          pendingCreateRef.current = null
          return newId
        })
        .catch(() => { pendingCreateRef.current = null; setSaved(false); return '' })
      pendingCreateRef.current = p
    }
  }

  function handlePrint() {
    handleSave()
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        window.focus()
        window.print()
      }, 50)
    })
  }

  function handleAdvance(updates: Partial<QuotationDoc>) {
    const next = { ...doc, ...updates }
    setDoc(next)
    setSaved(false)
    handleSave(next)
  }

  async function handleSidebarPOFileChange(file: File) {
    setSidebarPoUploading(true)
    try {
      let url: string
      if (apiId) {
        try {
          const res = await cquotesApi.uploadFile(apiId, file)
          url = res.url
        } catch {
          url = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(file)
          })
        }
      } else {
        url = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
      }
      setSidebarPoFile(url)
    } catch { /* silent */ }
    finally { setSidebarPoUploading(false) }
  }

  function handleSidebarSavePO() {
    const agreed = parseFloat(sidebarPoAgreed.replace(/,/g, ''))
    handleAdvance({
      status: 'po_received',
      poNumber: sidebarPoInput,
      poDate: sidebarPoDate,
      poDueDate: sidebarPoDueDate || undefined,
      poAgreedAmount: !isNaN(agreed) && agreed > 0 ? agreed : undefined,
      poAttachment: sidebarPoFile || undefined,
      poReceivedDate: new Date().toISOString().slice(0, 10),
    })
    setShowSidebarPoForm(false)
    setSidebarPoInput('')
    setSidebarPoDate('')
    setSidebarPoDueDate('')
    setSidebarPoAgreed('')
    setSidebarPoFile('')
  }

  async function handleGenerateInvoice() {
    // Compute invoice number locally for the API call
    const yy = new Date().getFullYear().toString().slice(-2)
    let existingInv: { invoiceNo?: string }[] = []
    try {
      const raw = readData(INV_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        existingInv = Array.isArray(parsed) ? parsed : Object.values(parsed)
      }
    } catch { /* ok */ }
    const nums = existingInv
      .map(inv => inv.invoiceNo ?? '')
      .filter((n: string) => n.startsWith(`INV${yy}/`))
      .map((n: string) => parseInt(n.split('/')[1] ?? '0'))
      .filter((n: number) => !isNaN(n))
    const invoiceNo = `INV${yy}/${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4, '0')}`

    try {
      const res = await cinvoicesApi.create({
        invoice_no: invoiceNo,
        quotation_no: doc.quotationNo,
        customer_id: doc.customerId || undefined,
        customer_name: doc.customerName || undefined,
        status: 'pending',
        total_amount: grandTotal,
        doc_data: {
          lines: doc.lines, vatPct: doc.vatPct,
          issuerName: doc.issuerName, issuerLogoText: doc.issuerLogoText,
          issuerLogoImage: doc.issuerLogoImage, issuerAddress: doc.issuerAddress,
          issuerPOBox: doc.issuerPOBox, issuerMobile: doc.issuerMobile,
          issuerFax: doc.issuerFax, issuerEmail: doc.issuerEmail, issuerTRN: doc.issuerTRN,
          customerName: doc.customerName, customerLogoImage: doc.customerLogoImage,
          customerBranch: doc.customerBranch, customerCity: doc.customerCity,
          customerTel: doc.customerTel, customerTRN: doc.customerTRN,
          poNumber: doc.poNumber ?? '', poDate: doc.poDate ?? '',
          quotationNo: doc.quotationNo,
          date: new Date().toISOString().slice(0, 10),
        },
      })
      const next = { ...doc, status: 'invoiced' as QuotationStatus, invoiceId: res.id }
      setDoc(next)
      setSaved(false)
      handleSave(next)
      if (apiId) cquotesApi.getRelated(apiId).then(setRelatedDocs).catch(() => {})
      nav(`/invoices/${res.id}`)
    } catch {
      // Fallback: local-only path when backend is unavailable
      const newId = generateInvoice(doc)
      const next = { ...doc, status: 'invoiced' as QuotationStatus, invoiceId: newId }
      setDoc(next)
      setSaved(false)
      handleSave(next)
      nav(`/invoices/${newId}`)
    }
  }

  function selectCustomer(c: StoredCustomer) {
    // Prefer a data: URL (self-contained) over a remote URL to avoid broken-img when MinIO is offline.
    // If the customer has a data: URL, use it. If remote URL, use it (may be broken if MinIO down).
    // The upload in the picker form sets logoImage to whatever the backend returned (data: or URL).
    updateDoc({
      ...doc,
      customerId:          c.id,
      customerName:        c.company,
      customerLogoImage:   c.logoImage ?? '',
      customerContactName: c.contactName ?? '',
      customerEmail:       c.email ?? '',
      customerBranch:      c.industry ?? '',
      customerCity:        c.city ?? '',
      customerTel:         c.phone ?? '',
      customerTRN:         c.trn ?? '',
    })
    setShowCustomerPicker(false)
    setPickerMode('list')
  }

  function openEditCustomer(c: StoredCustomer) {
    setEditingCustomer(c)
    setCustLogoFile(null)
    setCustSaveError('')
    const dc = loadDefaultCustomer()
    setCustFormIsDefault(dc?.id === c.id)
    setCustForm({
      company:     c.company,
      contactName: c.contactName,
      email:       c.email,
      phone:       c.phone,
      city:        c.city,
      industry:    c.industry,
      trn:         c.trn ?? '',
      logo:        c.logoImage ?? '',
    })
    setPickerMode('edit')
  }

  function openNewCustomer() {
    setEditingCustomer(null)
    setCustLogoFile(null)
    setCustSaveError('')
    setCustFormIsDefault(false)
    setCustForm({ company: customerSearch, contactName: '', email: '', phone: '', city: '', industry: '', trn: '', logo: '' })
    setPickerMode('new')
  }

  function handleCustLogoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setCustLogoFile(file)
    const reader = new FileReader()
    reader.onload = () => setCustForm(f => ({ ...f, logo: reader.result as string }))
    reader.readAsDataURL(file)
  }

  async function handleSaveCustomerForm() {
    if (!custForm.company.trim()) return
    setCustSaving(true)
    try {
      const payload = {
        company:      custForm.company.trim(),
        contact_name: custForm.contactName.trim() || undefined,
        email:        custForm.email.trim() || undefined,
        phone:        custForm.phone.trim() || undefined,
        city:         custForm.city.trim() || undefined,
        industry:     custForm.industry.trim() || undefined,
        trn:          custForm.trn.trim() || undefined,
        status:       'active' as const,
      }
      let result: StoredCustomer
      if (pickerMode === 'edit' && editingCustomer) {
        const updated = await customersApi.update(editingCustomer.id, payload)
        result = {
          id: updated.id, company: updated.company,
          contactName: updated.contact_name ?? '', email: updated.email ?? '',
          phone: updated.phone ?? '', city: updated.city ?? '',
          industry: updated.industry ?? '', website: '', notes: '',
          status: updated.status, logoImage: updated.logo_url || updated.logo_image || custForm.logo,
          trn: (updated as any).trn ?? custForm.trn,
        }
        // Upload logo if a new file was selected
        if (custLogoFile) {
          try {
            const url = await customersApi.uploadLogo(result.id, custLogoFile)
            result = { ...result, logoImage: url }
          } catch { result = { ...result, logoImage: custForm.logo } }
        }
        setCustomers(prev => prev.map(c => c.id === result.id ? result : c))
      } else {
        const created = await customersApi.create(payload)
        result = {
          id: created.id, company: created.company,
          contactName: created.contact_name ?? '', email: created.email ?? '',
          phone: created.phone ?? '', city: created.city ?? '',
          industry: created.industry ?? '', website: '', notes: '',
          status: created.status, logoImage: created.logo_url || created.logo_image || '',
          trn: (created as any).trn ?? custForm.trn,
        }
        // Upload logo for newly created customer
        if (custLogoFile) {
          try {
            const url = await customersApi.uploadLogo(result.id, custLogoFile)
            result = { ...result, logoImage: url }
          } catch { result = { ...result, logoImage: custForm.logo } }
        } else if (custForm.logo) {
          result = { ...result, logoImage: custForm.logo }
        }
        setCustomers(prev => [result, ...prev])
      }
      // Save as default customer if toggled
      if (custFormIsDefault) {
        writeData(DEFAULT_CUSTOMER_KEY, JSON.stringify(result))
      } else {
        const dc = loadDefaultCustomer()
        if (dc?.id === result.id) writeData(DEFAULT_CUSTOMER_KEY, 'null')
      }
      selectCustomer(result)
      setCustomerSearch('')
      setCustLogoFile(null)
    } catch (err: any) {
      setCustSaveError(err?.response?.data?.detail ?? 'Save failed. Please try again.')
    }
    finally { setCustSaving(false) }
  }

  function saveProfile() {
    writeData(PROFILE_KEY, JSON.stringify({
      name:                doc.issuerName,
      logoText:            doc.issuerLogoText,
      logoImage:           doc.issuerLogoImage,
      address:             doc.issuerAddress,
      poBox:               doc.issuerPOBox,
      mobile:              doc.issuerMobile,
      fax:                 doc.issuerFax,
      email:               doc.issuerEmail,
      trn:                 doc.issuerTRN,
      defaultValidityDays: doc.validityDays ?? 30,
    }))
    // Persist logo URL to org settings so it loads on next new quotation
    if (doc.issuerLogoImage) {
      orgApi.patchSettings({ logo_url: doc.issuerLogoImage }).catch(() => {})
    }
    setShowSettings(false)
  }

  async function handleUploadInvoice() {
    if (!uploadFile || !uploadInvoiceNo.trim()) return
    setUploading(true)
    setUploadError('')
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(uploadFile)
      })
      await cinvoicesApi.create({
        invoice_no: uploadInvoiceNo.trim(),
        quotation_no: doc.quotationNo,
        customer_id: doc.customerId || undefined,
        customer_name: doc.customerName || undefined,
        status: 'pending',
        total_amount: 0,
        doc_data: { uploaded: true, filename: uploadFile.name },
        pdf_url: dataUrl,
      })
      // Also add to the Files tab so it's accessible from attachments
      const attachment: DocAttachment = {
        id: crypto.randomUUID(),
        name: `Invoice ${uploadInvoiceNo.trim()} — ${uploadFile.name}`,
        type: uploadFile.type,
        url: dataUrl,
        uploadedAt: new Date().toISOString(),
      }
      const nextDoc = { ...doc, attachments: [...(doc.attachments ?? []), attachment] }
      setDoc(nextDoc)
      handleSave(nextDoc)

      if (apiId) {
        const related = await cquotesApi.getRelated(apiId)
        setRelatedDocs(related)
      }
      setUploadModal(false)
      setUploadFile(null)
      setUploadInvoiceNo('')
      setRelatedTab('invoices')
    } catch (err: any) {
      setUploadError(err?.response?.data?.detail ?? 'Failed to save invoice. Please try again.')
    } finally { setUploading(false) }
  }

  async function handlePOUpload(file: File) {
    setPoUploading(true)
    try {
      let url: string
      if (apiId) {
        try {
          const res = await cquotesApi.uploadFile(apiId, file)
          url = res.url
        } catch {
          url = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(file)
          })
        }
      } else {
        url = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
      }
      const next = { ...doc, poAttachment: url, poAttachmentName: file.name }
      setDoc(next)
      setSaved(false)
      handleSave(next)
    } catch { /* silent */ }
    finally { setPoUploading(false) }
  }

  function removePOAttachment() {
    const next = { ...doc, poAttachment: undefined }
    setDoc(next)
    setSaved(false)
    handleSave(next)
  }

  async function handleFilesUpload(files: FileList) {
    setFilesUploading(true)
    try {
      const added: DocAttachment[] = []
      for (const file of Array.from(files)) {
        let url: string
        if (apiId) {
          try {
            const res = await cquotesApi.uploadFile(apiId, file)
            url = res.url
          } catch {
            url = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onload = () => resolve(reader.result as string)
              reader.onerror = reject
              reader.readAsDataURL(file)
            })
          }
        } else {
          url = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(file)
          })
        }
        added.push({ id: crypto.randomUUID(), name: file.name, type: file.type, url, uploadedAt: new Date().toISOString() })
      }
      const next = { ...doc, attachments: [...(doc.attachments ?? []), ...added] }
      setDoc(next)
      setSaved(false)
      handleSave(next)
    } catch { /* silent */ }
    finally { setFilesUploading(false) }
  }

  function removeAttachment(attachId: string) {
    const next = { ...doc, attachments: (doc.attachments ?? []).filter(a => a.id !== attachId) }
    setDoc(next)
    setSaved(false)
    handleSave(next)
  }

  // ── Delivery note helpers ─────────────────────────────────────────

  // Sum already-delivered qty for a given line key across all existing delivery notes
  function deliveredSoFar(lineKey: string): number {
    return deliveryNotes.reduce((sum, dn) => {
      const item = (dn.doc_data.items ?? []).find(i => i.lineKey === lineKey)
      return sum + (item?.deliveredQty ?? 0)
    }, 0)
  }

  function openDNForm() {
    setDnSaveError('')
    setDnFormItems(doc.lines.map(l => ({
      lineKey: l._key,
      description: l.description,
      orderedQty: parseFloat(l.qty) || 0,
      deliveredQty: deliveredSoFar(l._key),
      unit: '',
      thisQty: '',
    })))
    setDnFormDate(new Date().toISOString().slice(0, 10))
    setDnFormNotes('')
    setDnFormDriver('')
    setShowDNForm(true)
  }

  async function handleSaveDN() {
    if (!apiId) return
    const items: DeliveryNoteItem[] = dnFormItems
      .map(i => ({ ...i, deliveredQty: parseFloat(i.thisQty) || 0 }))
      .filter(i => i.deliveredQty > 0)
    if (items.length === 0) return          // guard BEFORE setDnSaving
    setDnSaving(true)
    try {
      const dn = await deliveryNotesApi.create({
        delivery_no: '',
        quotation_id: apiId,
        quotation_no: doc.quotationNo,
        customer_id: doc.customerId || undefined,
        customer_name: doc.customerName || undefined,
        status: 'draft',
        doc_data: { date: dnFormDate, items, notes: dnFormNotes, driverName: dnFormDriver },
      })
      setDeliveryNotes(prev => [dn, ...prev])
      setShowDNForm(false)
    } catch (err: any) {
      setDnSaveError(err?.response?.data?.detail ?? 'Failed to save delivery note. Please try again.')
    } finally { setDnSaving(false) }
  }

  async function handleUpdateDNStatus(dnId: string, status: 'sent' | 'delivered') {
    const dn = deliveryNotes.find(d => d.id === dnId)
    if (!dn) return
    try {
      const updated = await deliveryNotesApi.update(dnId, { ...dn, status })
      setDeliveryNotes(prev => prev.map(d => d.id === dnId ? updated : d))
    } catch { /* silent */ }
  }

  async function handleDeleteDN(dnId: string) {
    try {
      await deliveryNotesApi.delete(dnId)
      setDeliveryNotes(prev => prev.filter(d => d.id !== dnId))
    } catch { /* silent */ }
  }

  // Is everything fully delivered? Requires at least one line with qty > 0.
  const deliverableLines = doc.lines.filter(l => (parseFloat(l.qty) || 0) > 0)
  const allDelivered = deliverableLines.length > 0 && deliverableLines.every(l => deliveredSoFar(l._key) >= (parseFloat(l.qty) || 0))

  return (
    <>
    <div className="flex items-start">
      <div className="flex-1 min-w-0">
      {/* ── Toolbar ── */}
      <div className="no-print flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={() => nav('/quotations')}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            All quotations
          </button>
          <span className="text-gray-200">|</span>
          <span className="text-sm font-semibold text-gray-700">{doc.quotationNo}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadgeClass(doc.status)}`}>
            {doc.status.replace(/_/g, ' ')}
          </span>
          {doc.quotationTag === 'dummy_po' && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">Dummy PO</span>
          )}
          {doc.quotationTag === 'rejected' && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">Rejected</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* ── Quotation tag picker (Active / Dummy PO / Rejected) ── */}
          <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs font-medium">
            {([
              { value: 'active',   label: 'Active',    activeClass: 'bg-green-500 text-white border-green-500' },
              { value: 'dummy_po', label: 'Dummy PO',  activeClass: 'bg-amber-500 text-white border-amber-500' },
              { value: 'rejected', label: 'Rejected',  activeClass: 'bg-red-500 text-white border-red-500' },
            ] as { value: QuotationTag; label: string; activeClass: string }[]).map(opt => (
              <button
                key={opt.value}
                onClick={() => { const next = { ...doc, quotationTag: opt.value }; setDoc(next); handleSave(next) }}
                className={`px-2.5 py-1 transition-colors ${
                  (doc.quotationTag ?? 'active') === opt.value
                    ? opt.activeClass
                    : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Customer picker */}
          <div className="relative" ref={pickerRef}>
            <button
              onClick={() => setShowCustomerPicker(v => !v)}
              className="flex items-center gap-1.5 text-sm border border-gray-200 hover:border-blue-300 rounded-lg px-3 py-1.5 transition-colors"
            >
              {doc.customerName || 'Select customer'}
              <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${showCustomerPicker ? 'rotate-180' : ''}`} />
            </button>
            {showCustomerPicker && (
              <div className="absolute top-full left-0 mt-1 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">

                {/* ── List mode ── */}
                {pickerMode === 'list' && (
                  <>
                    <div className="p-2 border-b border-gray-100">
                      <input
                        autoFocus
                        type="text"
                        placeholder="Search customers…"
                        className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 outline-none focus:border-blue-400"
                        value={customerSearch}
                        onChange={e => setCustomerSearch(e.target.value)}
                        onClick={e => e.stopPropagation()}
                      />
                    </div>

                    <div className="max-h-60 overflow-y-auto">
                      {filteredCustomers.length === 0 && (
                        <p className="px-3 py-3 text-xs text-gray-400 text-center">
                          {customers.length === 0 ? 'No customers yet.' : 'No matches.'}
                        </p>
                      )}
                      {filteredCustomers.map(c => {
                        const isDefault = loadDefaultCustomer()?.id === c.id
                        return (
                          <div
                            key={c.id}
                            className="group flex items-center gap-2 px-3 py-2 hover:bg-blue-50 transition-colors cursor-pointer"
                            onClick={() => { selectCustomer(c); setCustomerSearch('') }}
                          >
                            <div className="w-7 h-7 rounded bg-blue-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                              <SafeImg
                                src={c.logoImage ?? ''}
                                alt={c.company}
                                className="w-full h-full object-contain"
                                fallback={<span className="text-blue-600 text-xs font-bold">{c.company[0]}</span>}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-medium text-gray-800 truncate">{c.company}</p>
                                {isDefault && (
                                  <span className="flex-shrink-0 text-[9px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-semibold">
                                    Default
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400 truncate">
                                {[c.city, c.email].filter(Boolean).join(' · ')}
                              </p>
                            </div>
                            <button
                              onClick={e => { e.stopPropagation(); openEditCustomer(c) }}
                              title="Edit details"
                              className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-100 rounded-md transition-all flex-shrink-0"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        )
                      })}
                    </div>

                    <div className="p-2 border-t border-gray-100">
                      <button
                        onClick={() => openNewCustomer()}
                        className="w-full flex items-center gap-2 text-xs text-blue-600 hover:bg-blue-50 rounded-lg px-2 py-2 transition-colors font-medium"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Add new customer
                      </button>
                    </div>
                  </>
                )}

                {/* ── Edit / New mode ── */}
                {(pickerMode === 'edit' || pickerMode === 'new') && (
                  <>
                    {/* Header */}
                    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 bg-gray-50">
                      <button
                        onClick={() => setPickerMode('list')}
                        className="text-gray-400 hover:text-gray-700 p-0.5 rounded"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-sm font-semibold text-gray-700">
                        {pickerMode === 'new' ? 'New Customer' : 'Edit Customer'}
                      </span>
                    </div>

                    {/* Form */}
                    <div className="p-3 space-y-2.5 max-h-[440px] overflow-y-auto">

                      {/* Logo upload */}
                      <div className="flex flex-col items-center gap-1.5 py-1">
                        <div
                          className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50
                            flex items-center justify-center cursor-pointer hover:border-blue-300 hover:bg-blue-50
                            transition-colors overflow-hidden relative group"
                          onClick={() => custLogoInputRef.current?.click()}
                          title="Click to upload logo"
                        >
                          <SafeImg
                              src={custForm.logo}
                              alt="Customer logo"
                              className="w-full h-full object-contain p-1.5"
                              fallback={
                                <div className="flex flex-col items-center gap-1 text-gray-300">
                                  <Upload className="w-5 h-5" />
                                  <span className="text-[9px] font-medium">Logo</span>
                                </div>
                              }
                            />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors rounded-xl" />
                        </div>
                        <input
                          ref={custLogoInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleCustLogoFileChange}
                        />
                        {custForm.logo && (
                          <button
                            onClick={() => { setCustForm(f => ({ ...f, logo: '' })); setCustLogoFile(null) }}
                            className="text-[10px] text-red-400 hover:text-red-600"
                          >
                            Remove logo
                          </button>
                        )}
                        {!custForm.logo && (
                          <p className="text-[10px] text-gray-400">Click to upload logo</p>
                        )}
                      </div>

                      {/* Company name */}
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                          Company Name <span className="text-red-400">*</span>
                        </label>
                        <div className="mt-0.5 relative">
                          <Building2 className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                          <input
                            autoFocus
                            type="text"
                            value={custForm.company}
                            onChange={e => setCustForm(f => ({ ...f, company: e.target.value }))}
                            placeholder="Acme Corp"
                            className="w-full text-sm border border-gray-200 rounded-lg pl-7 pr-2 py-1.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                          />
                        </div>
                      </div>

                      {/* Contact name */}
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Contact Person</label>
                        <input
                          type="text"
                          value={custForm.contactName}
                          onChange={e => setCustForm(f => ({ ...f, contactName: e.target.value }))}
                          placeholder="John Smith"
                          className="mt-0.5 w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                        />
                      </div>

                      {/* Email + Phone side by side */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Email</label>
                          <div className="mt-0.5 relative">
                            <Mail className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                            <input
                              type="email"
                              value={custForm.email}
                              onChange={e => setCustForm(f => ({ ...f, email: e.target.value }))}
                              placeholder="info@co.com"
                              className="w-full text-xs border border-gray-200 rounded-lg pl-6 pr-1.5 py-1.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Phone</label>
                          <div className="mt-0.5 relative">
                            <Phone className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                            <input
                              type="tel"
                              value={custForm.phone}
                              onChange={e => setCustForm(f => ({ ...f, phone: e.target.value }))}
                              placeholder="+971 50 …"
                              className="w-full text-xs border border-gray-200 rounded-lg pl-6 pr-1.5 py-1.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                            />
                          </div>
                        </div>
                      </div>

                      {/* City + Industry */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">City</label>
                          <div className="mt-0.5 relative">
                            <MapPin className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                            <input
                              type="text"
                              value={custForm.city}
                              onChange={e => setCustForm(f => ({ ...f, city: e.target.value }))}
                              placeholder="Dubai"
                              className="w-full text-xs border border-gray-200 rounded-lg pl-6 pr-1.5 py-1.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Industry</label>
                          <input
                            type="text"
                            value={custForm.industry}
                            onChange={e => setCustForm(f => ({ ...f, industry: e.target.value }))}
                            placeholder="Construction"
                            className="mt-0.5 w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                          />
                        </div>
                      </div>

                      {/* TRN */}
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">TRN (Tax Reg. No.)</label>
                        <input
                          type="text"
                          value={custForm.trn}
                          onChange={e => setCustForm(f => ({ ...f, trn: e.target.value }))}
                          placeholder="100123456700003"
                          className="mt-0.5 w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 font-mono"
                        />
                      </div>

                      {/* Set as default customer toggle */}
                      <button
                        type="button"
                        onClick={() => setCustFormIsDefault(v => !v)}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex flex-col items-start">
                          <span className="text-xs font-medium text-gray-700">Set as default customer</span>
                          <span className="text-[10px] text-gray-400">Pre-fills on every new quotation</span>
                        </div>
                        <div className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${custFormIsDefault ? 'bg-blue-500' : 'bg-gray-200'}`}>
                          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${custFormIsDefault ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </div>
                      </button>

                      {/* Error */}
                      {custSaveError && (
                        <p className="text-[10px] text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">
                          {custSaveError}
                        </p>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={handleSaveCustomerForm}
                          disabled={custSaving || !custForm.company.trim()}
                          className="flex-1 text-sm bg-blue-600 text-white rounded-lg py-2 font-medium disabled:opacity-50 hover:bg-blue-700 transition-colors"
                        >
                          {custSaving ? 'Saving…' : pickerMode === 'new' ? 'Create & Select' : 'Save & Select'}
                        </button>
                        <button
                          onClick={() => setPickerMode('list')}
                          className="px-3 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => setShowSettings(v => !v)}
            className="p-1.5 text-gray-400 hover:text-gray-700 border border-gray-200 hover:border-gray-300 rounded-lg transition-colors"
            title="Company settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          {saveError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">
              {saveError}
            </p>
          )}

          <Button variant={saved ? 'ghost' : 'primary'} onClick={() => handleSave()}>
            {saved
              ? <><Check className="w-4 h-4 text-green-600" /> Saved</>
              : <><Save className="w-4 h-4" /> Save</>}
          </Button>

          <Button variant="primary" onClick={handlePrint}>
            <Printer className="w-4 h-4" />
            Print / PDF
          </Button>
        </div>
      </div>

      {/* ── Workflow strip ── */}
      <WorkflowStrip
        doc={doc}
        onUpdate={handleAdvance}
        onUploadInvoice={() => {
          setRelatedOpen(true)
          setRelatedTab('invoices')
          setUploadModal(true)
          setUploadError('')
        }}
        nav={nav}
        onOpenViewer={openViewer}
      />

      {/* ── Settings panel ── */}
      {showSettings && (
        <SettingsPanel
          doc={doc}
          onChange={updateDoc}
          onSave={saveProfile}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* ── A4 paper pages ── */}
      <div className="overflow-x-auto pb-8">
        <div className="flex flex-col gap-0 print:gap-0 w-[210mm] mx-auto">
          {pages.map((pageLines, pi) => (
            <div key={pi}>
              {pi > 0 && (
                <div className="no-print flex items-center gap-3 my-4 select-none">
                  <div className="flex-1 border-t border-dashed border-gray-300" />
                  <span className="text-[10px] text-gray-400 font-medium tracking-widest uppercase px-2">
                    Page {pi + 1}
                  </span>
                  <div className="flex-1 border-t border-dashed border-gray-300" />
                </div>
              )}
              <QuotationPage
                doc={doc}
                lines={pageLines}
                pageNum={pi + 1}
                totalPages={pages.length}
                subtotal={subtotal}
                vatAmt={vatAmt}
                grandTotal={grandTotal}
                isLastPage={pi === pages.length - 1}
                isFirstPage={pi === 0}
                onChange={updateDoc}
                onLineChange={updateLine}
                onAddLine={addLine}
                onRemoveLine={removeLine}
                customerId={doc.customerId}
              />
            </div>
          ))}
        </div>
      </div>
      </div>{/* end main content */}

      {/* ── Right sidebar ── */}
      <div
        className={`print:hidden sticky top-0 self-start flex-shrink-0 border-l border-gray-200 bg-white transition-all duration-300 overflow-hidden ${
          relatedOpen ? 'w-80' : 'w-10'
        }`}
        style={{ height: '100vh', overflowY: 'auto' }}
      >
        {/* Header / toggle */}
        <button
          onClick={() => setRelatedOpen(v => !v)}
          className="w-full flex items-center justify-between px-2 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100 gap-2"
          title={relatedOpen ? 'Collapse' : 'Related Documents'}
        >
          {relatedOpen ? (
            <>
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 whitespace-nowrap">
                <Paperclip className="w-4 h-4 text-gray-400 flex-shrink-0" />
                Related Docs
                {relatedDocs && relatedDocs.invoices.length > 0 && (
                  <span className="bg-blue-100 text-blue-700 text-xs font-bold px-1.5 py-0.5 rounded-full">
                    {relatedDocs.invoices.length}
                  </span>
                )}
              </div>
              <ChevronDown className="w-4 h-4 text-gray-400 -rotate-90 flex-shrink-0" />
            </>
          ) : (
            <div className="w-full flex flex-col items-center gap-1">
              <Paperclip className="w-4 h-4 text-gray-400" />
              {relatedDocs && relatedDocs.invoices.length > 0 && (
                <span className="bg-blue-100 text-blue-700 text-xs font-bold w-4 h-4 flex items-center justify-center rounded-full">
                  {relatedDocs.invoices.length}
                </span>
              )}
            </div>
          )}
        </button>

        {relatedOpen && (
          <>
            {/* Tabs */}
            <div className="flex border-b border-gray-100 flex-wrap">
              {([
                { key: 'invoices',  label: `Invoices${relatedDocs?.invoices.length ? ` (${relatedDocs.invoices.length})` : ''}` },
                { key: 'po',        label: 'PO' },
                { key: 'delivery',  label: `Delivery${deliveryNotes.length ? ` (${deliveryNotes.length})` : ''}` },
                { key: 'attachments', label: 'Files' },
                { key: 'customer',  label: 'Customer' },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  className={`flex-1 py-2 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                    relatedTab === tab.key
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                  onClick={() => setRelatedTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="p-3 space-y-2">
              {/* ── Invoices tab ── */}
              {relatedTab === 'invoices' && (
                <>
                  <button
                    onClick={() => { if (uploadModal) { setUploadModal(false); setUploadFile(null); setUploadInvoiceNo('') } else setUploadModal(true) }}
                    className="w-full flex items-center justify-center gap-1.5 text-xs border border-dashed border-blue-300 text-blue-600 rounded-lg py-2 hover:bg-blue-50 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload Invoice
                  </button>

                  {uploadModal && (
                    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2">
                      <p className="text-xs font-semibold text-gray-600">Attach Invoice</p>
                      <input
                        type="text"
                        placeholder="Invoice No. (e.g. INV26/0001)"
                        value={uploadInvoiceNo}
                        onChange={e => setUploadInvoiceNo(e.target.value)}
                        className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 outline-none focus:border-blue-400"
                      />
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-500 border border-gray-200 rounded-md px-2 py-1.5 bg-white hover:bg-gray-50 transition-colors">
                        <Paperclip className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">{uploadFile ? uploadFile.name : 'Choose PDF / Image'}</span>
                        <input type="file" accept=".pdf,image/*" className="hidden" onChange={e => setUploadFile(e.target.files?.[0] ?? null)} />
                      </label>
                      {uploadError && (
                        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">{uploadError}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={handleUploadInvoice}
                          disabled={uploading || !uploadFile || !uploadInvoiceNo.trim()}
                          className="flex-1 text-xs bg-blue-600 text-white rounded-md py-1.5 disabled:opacity-50 hover:bg-blue-700 transition-colors"
                        >
                          {uploading ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          onClick={() => { setUploadModal(false); setUploadFile(null); setUploadInvoiceNo('') }}
                          className="flex-1 text-xs border border-gray-200 rounded-md py-1.5 hover:bg-gray-100 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {!apiId ? (
                    <p className="text-xs text-gray-400 text-center py-4">Save the quotation to view linked invoices.</p>
                  ) : !relatedDocs ? (
                    <p className="text-xs text-gray-400 text-center py-4">Loading…</p>
                  ) : relatedDocs.invoices.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">No invoices yet.</p>
                  ) : (
                    relatedDocs.invoices.map((inv: CustomerInvoice) => (
                      <div key={inv.id} className="border border-gray-100 rounded-lg p-2.5 bg-white hover:border-blue-200 transition-colors">
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span className="text-xs font-semibold text-gray-800 truncate">{inv.invoice_no}</span>
                          </div>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${
                            inv.status === 'paid' ? 'bg-green-100 text-green-700'
                            : inv.status === 'overdue' ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                          }`}>{inv.status}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{inv.customer_name ?? doc.customerName}</p>
                        <div className="flex items-center justify-between mt-2 gap-1">
                          <span className="text-xs font-semibold text-gray-700">
                            AED {Number(inv.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                          <div className="flex items-center gap-2">
                            {inv.pdf_url && (
                              <button
                                onClick={() => openViewer(inv.pdf_url!, `Invoice ${inv.invoice_no}`)}
                                className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                                title="View PDF"
                              >
                                View PDF
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}

              {/* ── PO tab ── */}
              {relatedTab === 'po' && (
                <div className="space-y-2">
                  {/* PO Status toggle */}
                  <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                    <span className="text-xs text-gray-500 font-medium flex-shrink-0">PO Status:</span>
                    <div className="flex rounded-md overflow-hidden border border-gray-200 flex-shrink-0">
                      <button
                        onClick={() => {
                          if (doc.status === 'po_received' || doc.status === 'invoiced' || doc.status === 'complete') {
                            handleAdvance({ status: 'acknowledged', poNumber: '', poDate: '', poDueDate: '', poAttachment: '', poAttachmentName: '', poReceivedDate: '' })
                          }
                        }}
                        className={`px-3 py-1 text-xs font-medium transition-colors ${
                          doc.status !== 'po_received' && doc.status !== 'invoiced' && doc.status !== 'complete'
                            ? 'bg-amber-500 text-white'
                            : 'bg-white text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        Pending
                      </button>
                      <button
                        onClick={() => {
                          if (doc.status !== 'po_received' && doc.status !== 'invoiced' && doc.status !== 'complete') {
                            // advance to po_received — reuse WorkflowStrip logic via handleAdvance
                            handleAdvance({ status: 'po_received', poReceivedDate: new Date().toISOString().slice(0, 10) })
                          }
                        }}
                        className={`px-3 py-1 text-xs font-medium transition-colors ${
                          doc.status === 'po_received' || doc.status === 'invoiced' || doc.status === 'complete'
                            ? 'bg-green-500 text-white'
                            : 'bg-white text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        Received
                      </button>
                    </div>
                  </div>

                  {/* ── Shared / Acknowledged: show quotation PDF + PO entry form ── */}
                  {(doc.status === 'shared' || doc.status === 'acknowledged') && (
                    <>
                      {/* Quotation PDF preview */}
                      <div className="border border-blue-100 rounded-lg p-2.5 bg-blue-50 space-y-1.5">
                        <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide">Quotation PDF</p>
                        <button
                          onClick={async () => {
                            if (!apiId) { openViewer('', '') ; return }
                            try {
                              const { pdf_url } = await cquotesApi.getPdf(apiId)
                              if (pdf_url) openViewer(pdf_url, `Quotation ${doc.quotationNo}`)
                            } catch { /* not ready */ }
                          }}
                          disabled={!apiId}
                          className="w-full flex items-center justify-center gap-1.5 text-xs border border-dashed border-blue-300 text-blue-600 rounded-lg py-2 hover:bg-blue-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          View Quotation PDF
                        </button>
                      </div>

                      {/* Add PO details form */}
                      {!showSidebarPoForm ? (
                        <button
                          onClick={() => {
                            setShowSidebarPoForm(true)
                            setSidebarPoInput(doc.poNumber ?? '')
                            setSidebarPoDate(doc.poDate ?? '')
                            setSidebarPoDueDate(doc.poDueDate ?? '')
                            setSidebarPoAgreed(doc.poAgreedAmount != null ? String(doc.poAgreedAmount) : '')
                            setSidebarPoFile(doc.poAttachment ?? '')
                          }}
                          className="w-full flex items-center justify-center gap-1.5 text-xs border border-dashed border-orange-300 text-orange-600 rounded-lg py-2 hover:bg-orange-50 transition-colors"
                        >
                          <FileCheck className="w-3.5 h-3.5" />
                          Add PO Details
                        </button>
                      ) : (
                        <div className="border border-orange-200 rounded-lg p-3 bg-orange-50/40 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-gray-700">PO Details</p>
                            <button onClick={() => setShowSidebarPoForm(false)} className="text-gray-400 hover:text-gray-600">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 font-medium">PO Number *</label>
                            <input
                              type="text"
                              placeholder="e.g. PO-12345"
                              value={sidebarPoInput}
                              onChange={e => setSidebarPoInput(e.target.value)}
                              className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 outline-none focus:border-orange-400 bg-white mt-0.5"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-gray-500 font-medium">PO Date</label>
                              <input
                                type="date"
                                value={sidebarPoDate}
                                onChange={e => setSidebarPoDate(e.target.value)}
                                className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 outline-none focus:border-orange-400 bg-white mt-0.5"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-500 font-medium">Due Date</label>
                              <input
                                type="date"
                                value={sidebarPoDueDate}
                                onChange={e => setSidebarPoDueDate(e.target.value)}
                                className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 outline-none focus:border-orange-400 bg-white mt-0.5"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 font-medium">Agreed PO Value (AED)</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder={`Quoted: ${grandTotal.toFixed(2)}`}
                              value={sidebarPoAgreed}
                              onChange={e => setSidebarPoAgreed(e.target.value)}
                              className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 outline-none focus:border-orange-400 bg-white mt-0.5"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 font-medium">PO Document</label>
                            <input
                              ref={sidebarPoFileRef}
                              type="file"
                              accept=".pdf,image/*"
                              className="hidden"
                              disabled={sidebarPoUploading}
                              onChange={e => { if (e.target.files?.[0]) handleSidebarPOFileChange(e.target.files[0]) }}
                            />
                            <button
                              onClick={() => sidebarPoFileRef.current?.click()}
                              disabled={sidebarPoUploading}
                              className={`w-full flex items-center justify-center gap-1.5 text-xs border rounded-lg py-1.5 mt-0.5 transition-colors ${
                                sidebarPoFile
                                  ? 'border-green-400 bg-green-50 text-green-700'
                                  : 'border-dashed border-gray-300 text-gray-500 hover:border-orange-400 hover:text-orange-600'
                              } disabled:opacity-50`}
                            >
                              <Paperclip className="w-3.5 h-3.5" />
                              {sidebarPoUploading ? 'Uploading…' : sidebarPoFile ? 'File attached ✓' : 'Attach PO file'}
                            </button>
                            {sidebarPoFile && (
                              <button
                                onClick={() => setSidebarPoFile('')}
                                className="text-[10px] text-red-400 hover:text-red-600 mt-0.5"
                              >
                                Remove file
                              </button>
                            )}
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={handleSidebarSavePO}
                              disabled={!sidebarPoInput.trim()}
                              className="flex-1 text-xs bg-orange-600 text-white rounded-md py-1.5 disabled:opacity-50 hover:bg-orange-700 transition-colors font-medium"
                            >
                              Save PO
                            </button>
                            <button
                              onClick={() => setShowSidebarPoForm(false)}
                              className="flex-1 text-xs border border-gray-200 rounded-md py-1.5 hover:bg-gray-100 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {doc.poNumber ? (
                    <div className="border border-orange-100 rounded-lg p-3 bg-orange-50 space-y-2">
                      <div className="flex items-center gap-2">
                        <FileCheck className="w-4 h-4 text-orange-500 flex-shrink-0" />
                        <span className="text-xs font-semibold text-gray-700">Purchase Order</span>
                        <span className="ml-auto text-xs bg-orange-200 text-orange-800 px-1.5 py-0.5 rounded-full font-medium">Received</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        <div>
                          <p className="text-gray-400 font-medium">PO Number</p>
                          <p className="text-gray-800 font-semibold">{doc.poNumber}</p>
                        </div>
                        {doc.poDate && (
                          <div>
                            <p className="text-gray-400 font-medium">PO Date</p>
                            <p className="text-gray-800">{formatDate(doc.poDate)}</p>
                          </div>
                        )}
                        {doc.poDueDate && (
                          <div>
                            <p className="text-gray-400 font-medium">Due Date</p>
                            <p className="text-gray-800">{formatDate(doc.poDueDate)}</p>
                          </div>
                        )}
                        {doc.poReceivedDate && (
                          <div>
                            <p className="text-gray-400 font-medium">Received</p>
                            <p className="text-gray-800">{formatDate(doc.poReceivedDate)}</p>
                          </div>
                        )}
                        {doc.customerName && (
                          <div className="col-span-2">
                            <p className="text-gray-400 font-medium">Customer</p>
                            <p className="text-gray-800">{doc.customerName}</p>
                          </div>
                        )}
                        <div className="col-span-2">
                          <p className="text-gray-400 font-medium">Quotation Ref</p>
                          <p className="text-gray-800 font-mono">{doc.quotationNo}</p>
                        </div>
                      </div>

                      {/* Quoted vs Agreed value comparison */}
                      {(() => {
                        const quoted = grandTotal
                        const agreed = doc.poAgreedAmount
                        if (!agreed) return null
                        const variance = agreed - quoted
                        const variancePct = quoted > 0 ? (variance / quoted) * 100 : 0
                        return (
                          <div className="border-t border-orange-200 pt-2 space-y-1">
                            <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">Value Comparison</p>
                            <div className="grid grid-cols-2 gap-x-3 text-xs">
                              <div>
                                <p className="text-gray-400 font-medium">Quoted</p>
                                <p className="text-gray-800 font-semibold">AED {quoted.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                              </div>
                              <div>
                                <p className="text-gray-400 font-medium">Agreed (PO)</p>
                                <p className="text-gray-800 font-semibold">AED {agreed.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                              </div>
                            </div>
                            <div className={`flex items-center gap-1.5 text-xs font-medium rounded-md px-2 py-1 ${
                              variance < 0 ? 'bg-red-50 text-red-700' : variance > 0 ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-600'
                            }`}>
                              <span>{variance >= 0 ? '▲' : '▼'}</span>
                              <span>
                                {variance >= 0 ? '+' : ''}AED {Math.abs(variance).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                {' '}({variancePct >= 0 ? '+' : ''}{variancePct.toFixed(1)}%)
                              </span>
                              <span className="text-[10px] font-normal ml-auto">
                                {variance < 0 ? 'Below quote' : variance > 0 ? 'Above quote' : 'Exact match'}
                              </span>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  ) : (doc.status !== 'shared' && doc.status !== 'acknowledged') && (
                    <p className="text-xs text-gray-400 text-center py-2">
                      No PO received yet.<br />
                      Advance to &ldquo;PO Received&rdquo; status to attach a PO number.
                    </p>
                  )}

                  {/* PO Document */}
                  {doc.poAttachment ? (
                    <div
                      className="border border-gray-200 rounded-lg p-2.5 bg-white hover:border-blue-300 cursor-pointer transition-colors group"
                      onClick={() => openViewer(doc.poAttachment!, doc.poAttachmentName ?? 'PO Document')}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <FileText className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-800 truncate group-hover:text-blue-700">
                              {doc.poAttachmentName ?? 'PO Document'}
                            </p>
                            <p className="text-[10px] text-gray-400">Click to preview</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <a
                            href={doc.poAttachment}
                            download={doc.poAttachmentName ?? 'PO_Document'}
                            onClick={e => e.stopPropagation()}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            ↓
                          </a>
                          <button
                            onClick={e => { e.stopPropagation(); removePOAttachment() }}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                            title="Remove"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : doc.poNumber ? (
                    <label className={`w-full flex items-center justify-center gap-1.5 text-xs border border-dashed border-orange-300 text-orange-600 rounded-lg py-2 hover:bg-orange-50 transition-colors cursor-pointer ${poUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                      <Upload className="w-3.5 h-3.5" />
                      {poUploading ? 'Uploading…' : 'Upload PO Document'}
                      <input type="file" accept=".pdf,image/*" className="hidden" disabled={poUploading} onChange={e => { if (e.target.files?.[0]) handlePOUpload(e.target.files[0]) }} />
                    </label>
                  ) : null}

                  {/* ── Invoiced: invoice upload section ── */}
                  {doc.status === 'invoiced' && (
                    <div className="border border-teal-100 rounded-lg p-3 bg-teal-50/50 space-y-2">
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" />
                        <p className="text-xs font-semibold text-teal-700">Invoice</p>
                      </div>
                      {doc.invoiceId ? (
                        <button
                          onClick={() => nav(`/invoices/${doc.invoiceId}`)}
                          className="w-full flex items-center justify-center gap-1.5 text-xs text-teal-700 border border-teal-300 rounded-lg py-2 hover:bg-teal-100 transition-colors font-medium"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View Invoice
                        </button>
                      ) : null}
                      <button
                        onClick={() => {
                          setUploadModal(true)
                          setUploadError('')
                        }}
                        className="w-full flex items-center justify-center gap-1.5 text-xs border border-dashed border-teal-300 text-teal-600 rounded-lg py-2 hover:bg-teal-100 transition-colors"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Upload Invoice
                      </button>
                      {uploadModal && (
                        <div className="border border-gray-200 rounded-lg p-3 bg-white space-y-2">
                          <p className="text-xs font-semibold text-gray-600">Attach Invoice</p>
                          <input
                            type="text"
                            placeholder="Invoice No. (e.g. INV26/0001)"
                            value={uploadInvoiceNo}
                            onChange={e => setUploadInvoiceNo(e.target.value)}
                            className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 outline-none focus:border-blue-400"
                          />
                          <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-500 border border-gray-200 rounded-md px-2 py-1.5 bg-white hover:bg-gray-50 transition-colors">
                            <Paperclip className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate">{uploadFile ? uploadFile.name : 'Choose PDF / Image'}</span>
                            <input type="file" accept=".pdf,image/*" className="hidden" onChange={e => setUploadFile(e.target.files?.[0] ?? null)} />
                          </label>
                          {uploadError && (
                            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">{uploadError}</p>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={handleUploadInvoice}
                              disabled={uploading || !uploadFile || !uploadInvoiceNo.trim()}
                              className="flex-1 text-xs bg-teal-600 text-white rounded-md py-1.5 disabled:opacity-50 hover:bg-teal-700 transition-colors"
                            >
                              {uploading ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              onClick={() => { setUploadModal(false); setUploadFile(null); setUploadInvoiceNo('') }}
                              className="flex-1 text-xs border border-gray-200 rounded-md py-1.5 hover:bg-gray-100 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Delivery tab ── */}
              {relatedTab === 'delivery' && (
                <div className="space-y-3">
                  {!apiId ? (
                    <p className="text-xs text-gray-400 text-center py-4">Save the quotation first to track deliveries.</p>
                  ) : (
                    <>
                      {/* Delivery progress per item */}
                      <div className="border border-gray-100 rounded-lg p-3 space-y-2 bg-gray-50">
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Delivery Progress</p>
                        {doc.lines.filter(l => l.description).map(l => {
                          const ordered = parseFloat(l.qty) || 0
                          const delivered = deliveredSoFar(l._key)
                          const pct = ordered > 0 ? Math.min(100, (delivered / ordered) * 100) : 0
                          const done = ordered > 0 && delivered >= ordered
                          return (
                            <div key={l._key} className="space-y-0.5">
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="text-gray-700 truncate flex-1">{l.description || '—'}</span>
                                <span className={`flex-shrink-0 font-medium ${done ? 'text-green-600' : 'text-gray-500'}`}>
                                  {delivered}/{ordered}
                                  {done && ' ✓'}
                                </span>
                              </div>
                              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${done ? 'bg-green-500' : 'bg-blue-500'}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          )
                        })}
                        {allDelivered && deliveryNotes.length > 0 && (
                          <div className="flex items-center gap-1.5 pt-1 text-green-700 text-xs font-medium">
                            <PackageCheck className="w-3.5 h-3.5" />
                            All items fully delivered
                          </div>
                        )}
                      </div>

                      {/* Close invoice when fully delivered */}
                      {allDelivered && deliveryNotes.length > 0 && doc.status !== 'complete' && relatedDocs?.invoices[0] && (
                        <button
                          onClick={async () => {
                            const inv = relatedDocs.invoices[0]
                            try {
                              // Fetch full invoice so doc_data is not wiped by spreading the incomplete /related shape
                              const fullInv = await cinvoicesApi.get(inv.id)
                              await cinvoicesApi.update(inv.id, { ...fullInv, status: 'paid' } as any)
                              handleAdvance({ status: 'complete' })
                              if (apiId) cquotesApi.getRelated(apiId).then(setRelatedDocs).catch(() => {})
                            } catch { /* silent */ }
                          }}
                          className="w-full flex items-center justify-center gap-1.5 text-xs bg-green-600 text-white rounded-lg py-2 hover:bg-green-700 transition-colors font-medium"
                        >
                          <PackageCheck className="w-3.5 h-3.5" />
                          Mark Delivered & Close Invoice
                        </button>
                      )}

                      {/* Create delivery note button / form */}
                      {!showDNForm ? (
                        <button
                          onClick={openDNForm}
                          className="w-full flex items-center justify-center gap-1.5 text-xs border border-dashed border-blue-300 text-blue-600 rounded-lg py-2 hover:bg-blue-50 transition-colors"
                        >
                          <Truck className="w-3.5 h-3.5" />
                          Create Delivery Note
                        </button>
                      ) : (
                        <div className="border border-blue-200 rounded-lg p-3 bg-blue-50/40 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-gray-700">New Delivery Note</p>
                            <button onClick={() => setShowDNForm(false)} className="text-gray-400 hover:text-gray-600">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="flex gap-2">
                            <div className="flex-1">
                              <label className="text-[10px] text-gray-500 font-medium">Date</label>
                              <input
                                type="date"
                                value={dnFormDate}
                                onChange={e => setDnFormDate(e.target.value)}
                                className="w-full text-xs border border-gray-200 rounded-md px-2 py-1 outline-none focus:border-blue-400 bg-white"
                              />
                            </div>
                            <div className="flex-1">
                              <label className="text-[10px] text-gray-500 font-medium">Driver (optional)</label>
                              <input
                                type="text"
                                placeholder="Driver name"
                                value={dnFormDriver}
                                onChange={e => setDnFormDriver(e.target.value)}
                                className="w-full text-xs border border-gray-200 rounded-md px-2 py-1 outline-none focus:border-blue-400 bg-white"
                              />
                            </div>
                          </div>

                          {/* Per-item qty */}
                          <div className="space-y-1.5">
                            <p className="text-[10px] text-gray-500 font-medium">Items to deliver this batch</p>
                            {dnFormItems.map((item, idx) => {
                              const remaining = Math.max(0, item.orderedQty - item.deliveredQty)
                              return (
                                <div key={item.lineKey} className="bg-white border border-gray-100 rounded-md p-2 space-y-0.5">
                                  <p className="text-xs text-gray-700 truncate">{item.description || `Item ${idx + 1}`}</p>
                                  <div className="flex items-center gap-2 text-[10px] text-gray-500">
                                    <span>Ordered: {item.orderedQty}</span>
                                    <span>·</span>
                                    <span>Delivered: {item.deliveredQty}</span>
                                    <span>·</span>
                                    <span className={remaining === 0 ? 'text-green-600 font-medium' : ''}>
                                      Remaining: {remaining}
                                    </span>
                                  </div>
                                  {remaining > 0 ? (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[10px] text-gray-500">This delivery:</span>
                                      <input
                                        type="number"
                                        min={0}
                                        max={remaining}
                                        value={item.thisQty}
                                        onChange={e => setDnFormItems(prev =>
                                          prev.map((x, i) => i === idx ? { ...x, thisQty: e.target.value } : x)
                                        )}
                                        placeholder="0"
                                        className="w-16 text-xs border border-gray-200 rounded px-1.5 py-0.5 outline-none focus:border-blue-400 text-center"
                                      />
                                    </div>
                                  ) : (
                                    <p className="text-[10px] text-green-600 font-medium">✓ Fully delivered</p>
                                  )}
                                </div>
                              )
                            })}
                          </div>

                          <input
                            type="text"
                            placeholder="Notes (optional)"
                            value={dnFormNotes}
                            onChange={e => setDnFormNotes(e.target.value)}
                            className="w-full text-xs border border-gray-200 rounded-md px-2 py-1 outline-none focus:border-blue-400 bg-white"
                          />

                          {dnSaveError && (
                            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">{dnSaveError}</p>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={handleSaveDN}
                              disabled={dnSaving || dnFormItems.every(i => !i.thisQty || parseFloat(i.thisQty) === 0)}
                              className="flex-1 text-xs bg-blue-600 text-white rounded-md py-1.5 disabled:opacity-50 hover:bg-blue-700 transition-colors font-medium"
                            >
                              {dnSaving ? 'Saving…' : 'Save Delivery Note'}
                            </button>
                            <button
                              onClick={() => setShowDNForm(false)}
                              className="flex-1 text-xs border border-gray-200 rounded-md py-1.5 hover:bg-gray-100 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Delivery note list */}
                      {dnLoading && <p className="text-xs text-gray-400 text-center py-2">Loading…</p>}
                      {deliveryNotes.map(dn => {
                        const items = dn.doc_data.items ?? []
                        const totalDelivered = items.reduce((s, i) => s + i.deliveredQty, 0)
                        return (
                          <div key={dn.id} className="border border-gray-100 rounded-lg p-2.5 bg-white">
                            <div className="flex items-center justify-between gap-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Truck className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                                <span className="text-xs font-semibold text-gray-800 truncate">{dn.delivery_no}</span>
                              </div>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${
                                dn.status === 'delivered' ? 'bg-green-100 text-green-700'
                                : dn.status === 'sent'    ? 'bg-blue-100 text-blue-700'
                                : 'bg-amber-100 text-amber-700'
                              }`}>{dn.status}</span>
                            </div>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {dn.doc_data.date ? formatDate(dn.doc_data.date) : ''} · {totalDelivered} unit{totalDelivered !== 1 ? 's' : ''}
                            </p>
                            {items.length > 0 && (
                              <div className="mt-1 space-y-0.5">
                                {items.slice(0, 3).map((item, i) => (
                                  <p key={i} className="text-[10px] text-gray-500 truncate">
                                    {item.description}: {item.deliveredQty}
                                  </p>
                                ))}
                                {items.length > 3 && <p className="text-[10px] text-gray-400">+{items.length - 3} more</p>}
                              </div>
                            )}
                            {dn.doc_data.notes && <p className="text-[10px] text-gray-400 italic mt-0.5 truncate">{dn.doc_data.notes}</p>}
                            <div className="flex items-center gap-2 mt-1.5">
                              {dn.status === 'draft' && (
                                <button
                                  onClick={() => handleUpdateDNStatus(dn.id, 'sent')}
                                  className="text-[10px] text-blue-600 hover:underline"
                                >
                                  Mark Sent
                                </button>
                              )}
                              {dn.status === 'sent' && (
                                <button
                                  onClick={() => handleUpdateDNStatus(dn.id, 'delivered')}
                                  className="text-[10px] text-green-600 hover:underline"
                                >
                                  Mark Delivered
                                </button>
                              )}
                              <button
                                onClick={async () => {
                                  try {
                                    const blobUrl = await deliveryNotesApi.getPdf(dn.id)
                                    openViewer(blobUrl, `Delivery Note — ${dn.delivery_no}`)
                                  } catch { /* silent */ }
                                }}
                                className="text-[10px] text-blue-500 hover:underline"
                              >
                                View PDF
                              </button>
                              <button
                                onClick={() => handleDeleteDN(dn.id)}
                                className="text-[10px] text-red-400 hover:text-red-600 ml-auto"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        )
                      })}
                      {!dnLoading && deliveryNotes.length === 0 && !showDNForm && (
                        <p className="text-xs text-gray-400 text-center py-2">No delivery notes yet.</p>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── Files / Attachments tab ── */}
              {relatedTab === 'attachments' && (
                <div className="space-y-2">
                  <label className={`w-full flex items-center justify-center gap-1.5 text-xs border border-dashed border-gray-300 text-gray-600 rounded-lg py-2 hover:bg-gray-50 transition-colors cursor-pointer ${filesUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                    <Upload className="w-3.5 h-3.5" />
                    {filesUploading ? 'Uploading…' : 'Upload Files'}
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,image/*"
                      multiple
                      className="hidden"
                      disabled={filesUploading}
                      onChange={e => { if (e.target.files?.length) handleFilesUpload(e.target.files) }}
                    />
                  </label>

                  {(doc.attachments ?? []).length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">No files attached yet.</p>
                  ) : (
                    (doc.attachments ?? []).map(att => (
                      <div
                        key={att.id}
                        className="border border-gray-100 rounded-lg p-2.5 bg-white hover:border-blue-200 cursor-pointer transition-colors group"
                        onClick={() => openViewer(att.url, att.name)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs text-gray-700 truncate group-hover:text-blue-700">{att.name}</p>
                              <p className="text-[10px] text-gray-400">Click to preview</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <a href={att.url} download={att.name} onClick={e => e.stopPropagation()} className="text-xs text-blue-600 hover:underline">↓</a>
                            <button
                              onClick={e => { e.stopPropagation(); removeAttachment(att.id) }}
                              className="text-gray-400 hover:text-red-500 transition-colors"
                              title="Remove"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5">{new Date(att.uploadedAt).toLocaleDateString()}</p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ── Customer tab ── */}
              {relatedTab === 'customer' && (
                <div className="space-y-3">
                  {doc.customerId || doc.customerName ? (
                    <>
                      {/* Logo + name */}
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg border border-gray-100 bg-blue-50 flex items-center justify-center flex-shrink-0 overflow-hidden">
                          <SafeImg
                            src={doc.customerLogoImage}
                            alt={doc.customerName}
                            className="w-full h-full object-contain p-1"
                            fallback={<span className="text-blue-600 font-bold text-lg">{(doc.customerName || '?')[0]}</span>}
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{doc.customerName || '—'}</p>
                          {doc.customerBranch && (
                            <p className="text-xs text-gray-500 truncate">{doc.customerBranch}</p>
                          )}
                        </div>
                      </div>

                      {/* Details grid */}
                      <div className="border border-gray-100 rounded-lg divide-y divide-gray-50 text-xs">
                        {doc.customerCity && (
                          <div className="px-3 py-2 flex gap-2">
                            <span className="text-gray-400 w-20 flex-shrink-0">City</span>
                            <span className="text-gray-700 font-medium">{doc.customerCity}</span>
                          </div>
                        )}
                        {doc.customerTel && (
                          <div className="px-3 py-2 flex gap-2">
                            <span className="text-gray-400 w-20 flex-shrink-0">Tel</span>
                            <a href={`tel:${doc.customerTel}`} className="text-blue-600 hover:underline">{doc.customerTel}</a>
                          </div>
                        )}
                        {doc.customerTRN && (
                          <div className="px-3 py-2 flex gap-2">
                            <span className="text-gray-400 w-20 flex-shrink-0">TRN</span>
                            <span className="text-gray-700 font-mono">{doc.customerTRN}</span>
                          </div>
                        )}
                        <div className="px-3 py-2 flex gap-2">
                          <span className="text-gray-400 w-20 flex-shrink-0">Quotation</span>
                          <span className="text-gray-700 font-mono">{doc.quotationNo}</span>
                        </div>
                        <div className="px-3 py-2 flex gap-2">
                          <span className="text-gray-400 w-20 flex-shrink-0">Date</span>
                          <span className="text-gray-700">{formatDate(doc.date)}</span>
                        </div>
                        <div className="px-3 py-2 flex gap-2">
                          <span className="text-gray-400 w-20 flex-shrink-0">Status</span>
                          <span className={`px-1.5 py-0.5 rounded-full font-medium text-[10px] ${statusBadgeClass(doc.status)}`}>
                            {doc.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div className="px-3 py-2 flex gap-2">
                          <span className="text-gray-400 w-20 flex-shrink-0">Amount</span>
                          <span className="text-gray-800 font-semibold">
                            AED {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>

                      {/* Quotation PDF */}
                      <div>
                        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-1.5">Quotation PDF</p>
                        <button
                          onClick={async () => {
                            if (!apiId) return
                            try {
                              const { pdf_url } = await cquotesApi.getPdf(apiId)
                              if (pdf_url) openViewer(pdf_url, `Quotation ${doc.quotationNo}`)
                            } catch { /* 202 = not ready */ }
                          }}
                          disabled={!apiId}
                          className="w-full flex items-center justify-center gap-1.5 text-xs border border-dashed border-gray-300 text-gray-600 rounded-lg py-2 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          View PDF
                        </button>
                      </div>

                      {doc.customerId && (
                        <button
                          onClick={() => nav(`/customers/${doc.customerId}`)}
                          className="w-full text-xs text-blue-600 hover:underline text-center"
                        >
                          Open customer record →
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-6">
                      <p className="text-xs text-gray-400 mb-2">No customer linked.</p>
                      <button
                        onClick={() => setShowCustomerPicker(true)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Select customer →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>

    {/* ── PDF Viewer Modal ── */}
    {viewer && (
      <PDFViewerModal
        title={viewer.title}
        url={viewer.url}
        onClose={closeViewer}
      />
    )}
    </>
  )
}
