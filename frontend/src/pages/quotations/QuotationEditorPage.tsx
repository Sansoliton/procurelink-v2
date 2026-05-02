import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Plus, Trash2, Printer, Save, ArrowLeft, ChevronDown,
  Settings, X, Check, Upload, Bold, Italic, List,
  Send, Eye, FileCheck, CheckCircle2, Paperclip,
} from 'lucide-react'
import { Button } from '@/components/ui'
import { formatDate } from '@/lib/utils'
import { readData, writeData } from '@/lib/storage'
import { cquotesApi, customersApi, logosApi, orgApi } from '@/api'

// ── Types ─────────────────────────────────────────────────────────
export type QuotationStatus = 'draft' | 'shared' | 'acknowledged' | 'po_received' | 'invoiced' | 'complete'

export interface QLine {
  _key: string
  description: string
  qty: string
  unitPrice: string
  amount: string
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
  poNumber?: string
  poDate?: string
  poDueDate?: string
  poAttachment?: string
  invoiceId?: string
  sharedDate?: string
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
}

// ── Constants ─────────────────────────────────────────────────────
const Q_KEY = 'pl_quotations'
const C_KEY = 'pl_customers'
const INV_KEY = 'pl_invoices'
const PROFILE_KEY = 'pl_company_profile'

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
  { key: 'acknowledged',label: 'Acknowledged' },
  { key: 'po_received', label: 'PO Received' },
  { key: 'invoiced',    label: 'Invoiced' },
  { key: 'complete',    label: 'Complete' },
]

interface WorkflowStripProps {
  doc: QuotationDoc
  onUpdate: (updates: Partial<QuotationDoc>) => void
  onGenerateInvoice: () => void
  nav: (path: string) => void
}

function WorkflowStrip({ doc, onUpdate, onGenerateInvoice, nav }: WorkflowStripProps) {
  const [showPOForm, setShowPOForm] = useState(false)
  const [poInput, setPoInput] = useState('')
  const [poDateInput, setPoDateInput] = useState('')
  const [poDueDateInput, setPoDueDateInput] = useState('')
  const [poFile, setPoFile] = useState('')
  const poFileRef = useRef<HTMLInputElement>(null)

  const currentIdx = WORKFLOW_STEPS.findIndex(s => s.key === doc.status)

  function handlePOFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setPoFile(reader.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function handleSavePO() {
    onUpdate({
      status: 'po_received',
      poNumber: poInput,
      poDate: poDateInput,
      poDueDate: poDueDateInput || undefined,
      poAttachment: poFile || undefined,
      poReceivedDate: new Date().toISOString().slice(0, 10),
    })
    setShowPOForm(false)
    setPoInput('')
    setPoDateInput('')
    setPoDueDateInput('')
    setPoFile('')
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
                <div
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
                </div>
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

        {doc.status === 'draft' && (
          <Button
            variant="primary"
            onClick={() => onUpdate({ status: 'shared', sharedDate: new Date().toISOString().slice(0, 10) })}
          >
            <Send className="w-3.5 h-3.5" />
            Share with Customer
          </Button>
        )}

        {doc.status === 'shared' && (
          <Button
            variant="primary"
            onClick={() => onUpdate({ status: 'acknowledged', acknowledgedDate: new Date().toISOString().slice(0, 10) })}
          >
            <Eye className="w-3.5 h-3.5" />
            Mark Acknowledged
          </Button>
        )}

        {doc.status === 'acknowledged' && !showPOForm && (
          <Button
            variant="primary"
            onClick={() => setShowPOForm(true)}
          >
            <FileCheck className="w-3.5 h-3.5" />
            Record PO Received
          </Button>
        )}

        {doc.status === 'acknowledged' && showPOForm && (
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
              <Button variant="ghost" onClick={() => { setShowPOForm(false); setPoInput(''); setPoDateInput(''); setPoDueDateInput(''); setPoFile('') }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {doc.status === 'po_received' && (
          <>
            {doc.poAttachment ? (
              <button
                onClick={() => {
                  try {
                    const dataUrl = doc.poAttachment!
                    if (dataUrl.startsWith('data:')) {
                      const [header, b64] = dataUrl.split(',')
                      const mime = header.match(/:(.*?);/)?.[1] ?? 'application/pdf'
                      const binary = atob(b64)
                      const bytes = new Uint8Array(binary.length)
                      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
                      const blob = new Blob([bytes], { type: mime })
                      window.open(URL.createObjectURL(blob), '_blank')
                    } else {
                      window.open(dataUrl, '_blank')
                    }
                  } catch { alert('Unable to open PO attachment.') }
                }}
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
            <Button variant="primary" onClick={onGenerateInvoice}>
              <FileCheck className="w-3.5 h-3.5" />
              Generate Invoice
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
  onCustomerLogoChange: (val: string) => void
  customerId: string
}

function QuotationPage({
  doc, lines, pageNum, totalPages, subtotal, vatAmt, grandTotal,
  isLastPage, isFirstPage, onChange, onLineChange, onAddLine, onRemoveLine,
  onCustomerLogoChange, customerId,
}: PageProps) {
  const set = (f: keyof QuotationDoc) => (v: string) => onChange({ ...doc, [f]: v })

  return (
    <div
      className={`quotation-paper bg-white w-[794px] min-h-[1123px] max-w-[794px] p-[40px] mx-auto flex flex-col
        shadow-[0_2px_20px_rgba(0,0,0,0.12)]
        ${pageNum > 1 ? 'mt-8 print:mt-0 print:break-before-page' : ''}`}
    >
      {/* ── First-page header ─────────────────────────────────── */}
      {isFirstPage && (
        <div className="flex items-start justify-between mb-4 pb-3 border-b-2 border-gray-800">
          {/* Left: customer logo + company small name */}
          <div className="flex flex-col items-start gap-1">
            <LogoUpload
              value={doc.customerLogoImage}
              onChange={(v) => {
                onChange({ ...doc, customerLogoImage: v })
                onCustomerLogoChange(v)
              }}
              size="md"
              uploadFn={customerId ? (f) => customersApi.uploadLogo(customerId, f) : undefined}
            />
            <p className="text-[9px] text-gray-400 italic print:hidden">Customer logo</p>
          </div>

          {/* Center: Quotation title */}
          <div className="text-center flex-1 mx-6 mt-2">
            <h1 className="text-3xl font-bold tracking-wide text-gray-900">Quotation</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Japanese High-Quality Products
            </p>
          </div>

          {/* Right: company logo + name */}
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
              <F value={doc.issuerTRN} onChange={set('issuerTRN')}
                className="text-right text-[9px] text-gray-500" placeholder="TRN: 000000000" />
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
          </div>
        </div>
      )}

      {/* ── Line items table ───────────────────────────────────── */}
      <div className="flex-1">
        <table className="w-full text-xs border-collapse mb-2">
          <thead>
            <tr className="bg-gray-100 border border-gray-400">
              <th className="border border-gray-400 py-2 px-2 text-center w-8 font-bold">No.</th>
              <th className="border border-gray-400 py-2 px-2 text-left font-bold">Spare Description</th>
              <th className="border border-gray-400 py-2 px-2 text-center w-14 font-bold">Qty.</th>
              <th className="border border-gray-400 py-2 px-2 text-center w-24 font-bold">Price in AED</th>
              <th className="border border-gray-400 py-2 px-2 text-center w-24 font-bold">Amount in AED</th>
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

            {/* Filler rows on last page */}
            {isLastPage && lines.length < 6 &&
              Array.from({ length: 6 - lines.length }).map((_, i) => (
                <tr key={`empty-${i}`} className="border border-gray-300">
                  <td className="border border-gray-300 py-3 px-2" />
                  <td className="border border-gray-300 py-3 px-2" />
                  <td className="border border-gray-300 py-3 px-2" />
                  <td className="border border-gray-300 py-3 px-2" />
                  <td className="border border-gray-300 py-3 px-2" />
                  <td className="border border-gray-300 print:hidden" />
                </tr>
              ))
            }
          </tbody>

          {isLastPage && (
            <tfoot>
              <tr className="border border-gray-400 bg-gray-50">
                <td colSpan={3} className="border border-gray-400 py-1.5 px-2" />
                <td className="border border-gray-400 py-1.5 px-2 text-center text-gray-600">Sub Total</td>
                <td className="border border-gray-400 py-1.5 px-2 text-right text-gray-800">
                  {subtotal.toFixed(2)}
                </td>
                <td className="border border-gray-400 print:hidden" />
              </tr>
              {doc.vatPct > 0 && (
                <tr className="border border-gray-400 bg-gray-50">
                  <td colSpan={3} className="border border-gray-400 py-1.5 px-2" />
                  <td className="border border-gray-400 py-1.5 px-2 text-center text-gray-600">
                    VAT ({doc.vatPct}%)
                  </td>
                  <td className="border border-gray-400 py-1.5 px-2 text-right text-gray-800">
                    {vatAmt.toFixed(2)}
                  </td>
                  <td className="border border-gray-400 print:hidden" />
                </tr>
              )}
              <tr className="border border-gray-400 font-bold bg-gray-100">
                <td colSpan={3} className="border border-gray-400 py-2 px-2" />
                <td className="border border-gray-400 py-2 px-2 text-center font-bold text-gray-800">Grand Total AED</td>
                <td className="border border-gray-400 py-2 px-2 text-right font-bold text-gray-900">
                  {grandTotal.toFixed(2)}
                </td>
                <td className="border border-gray-400 print:hidden" />
              </tr>
            </tfoot>
          )}

          {/* Add line row — inside the table, last page only */}
          {isLastPage && (
            <tbody className="print:hidden">
              <tr>
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
            </tbody>
          )}
        </table>
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
              doc.issuerAddress,
              doc.issuerMobile ? `Mobile: ${doc.issuerMobile}` : '',
              doc.issuerFax    ? `Fax: ${doc.issuerFax}`       : '',
            ].filter(Boolean).join('   ')}
          </p>
          {/* Line 2: email · TRN */}
          <p className="text-[9px] text-gray-600">
            {doc.issuerEmail && (
              <span>
                Email:{' '}
                <a href={`mailto:${doc.issuerEmail}`}
                  className="text-blue-600 underline"
                  onClick={e => e.preventDefault()}
                >
                  {doc.issuerEmail}
                </a>
              </span>
            )}
            {doc.issuerEmail && doc.issuerTRN && <span className="mx-3" />}
            {doc.issuerTRN && (
              <span>TRN: <strong>{doc.issuerTRN}</strong></span>
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
  const fields: [string, keyof QuotationDoc][] = [
    ['Company name', 'issuerName'],
    ['Address', 'issuerAddress'],
    ['Mobile', 'issuerMobile'],
    ['Fax', 'issuerFax'],
    ['Email', 'issuerEmail'],
    ['TRN', 'issuerTRN'],
  ]

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
        </div>
      </div>

      <div className="flex justify-end">
        <Button variant="primary" onClick={onSave}>Save as default</Button>
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
          invoiceId: found.invoiceId ?? '',
          sharedDate: found.sharedDate ?? '',
          acknowledgedDate: found.acknowledgedDate ?? '',
          poReceivedDate: found.poReceivedDate ?? '',
        }
      }
    }
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
      customerId: '',
      customerName: '',
      customerLogoImage: '',
      customerBranch: '',
      customerCity: '',
      customerTel: '',
      customerTRN: '',
      lines: [newLine()],
      vatPct: 5,
      paymentTerms: '30 Days payment terms with purchase order',
      paymentMethod: '',
      deliveryTime: 'Immediate',
      notes: '',
      status: 'draft',
      createdAt: new Date().toISOString(),
      poNumber: '',
      poDate: '',
      invoiceId: '',
      sharedDate: '',
      acknowledgedDate: '',
      poReceivedDate: '',
    }
  })

  const [customers, setCustomers] = useState<StoredCustomer[]>([])
  const [showCustomerPicker, setShowCustomerPicker] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [saved, setSaved] = useState(!!id)
  const [apiId, setApiId] = useState<number | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

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
      })))
    }).catch(() => {
      try { setCustomers(JSON.parse(readData(C_KEY) ?? '[]')) } catch { /* ok */ }
    })
  }, [])

  // Load quotation from API if editing
  useEffect(() => {
    if (!id) return
    cquotesApi.list().then((list: any[]) => {
      const found = list.find(q => String(q.id) === id || (q.doc_data as any)?.id === id)
      if (found) {
        setApiId(found.id)
        const d = found.doc_data as QuotationDoc
        setDoc({
          ...d,
          issuerLogoImage: d.issuerLogoImage ?? '',
          customerLogoImage: d.customerLogoImage ?? '',
          status: normalizeStatus(d.status),
          poNumber: d.poNumber ?? '',
          poDate: d.poDate ?? '',
          invoiceId: d.invoiceId ?? '',
          sharedDate: d.sharedDate ?? '',
          acknowledgedDate: d.acknowledgedDate ?? '',
          poReceivedDate: d.poReceivedDate ?? '',
        })
      }
    }).catch(() => { /* fall through to localStorage */ })
  }, [id])

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node))
        setShowCustomerPicker(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [])

  const updateDoc = useCallback((d: QuotationDoc) => { setDoc(d); setSaved(false) }, [])

  const updateLine = useCallback((key: string, field: keyof QLine, val: string) => {
    setDoc(prev => ({
      ...prev,
      lines: prev.lines.map(l => l._key === key ? { ...l, [field]: val } : l),
    }))
    setSaved(false)
  }, [])

  const addLine = useCallback(() => {
    setDoc(prev => ({ ...prev, lines: [...prev.lines, newLine()] }))
    setSaved(false)
  }, [])

  const removeLine = useCallback((key: string) => {
    setDoc(prev => ({
      ...prev,
      lines: prev.lines.length > 1 ? prev.lines.filter(l => l._key !== key) : prev.lines,
    }))
    setSaved(false)
  }, [])

  // Totals
  const subtotal   = doc.lines.reduce((s, l) => s + calcLine(l), 0)
  const vatAmt     = subtotal * (doc.vatPct / 100)
  const grandTotal = subtotal + vatAmt

  // Content-aware pagination
  const pages = buildPages(doc.lines)

  function handleSave(overrideDoc?: QuotationDoc) {
    const target = overrideDoc ?? doc
    // localStorage save (keep for offline/print compat)
    const all = loadAll().filter(q => q.id !== target.id)
    saveAll([...all, target])
    setSaved(true)
    // Backend API save (fire and forget)
    const subtotalVal = target.lines.reduce((s, l) => s + calcLine(l), 0)
    const vatVal = subtotalVal * (target.vatPct / 100)
    const payload = {
      quotation_no: target.quotationNo,
      customer_name: target.customerName || undefined,
      status: target.status,
      total_amount: subtotalVal + vatVal,
      doc_data: target as unknown as Record<string, unknown>,
    }
    if (apiId) {
      cquotesApi.update(String(apiId), payload).catch(() => { /* silent */ })
    } else {
      cquotesApi.create(payload).then((res: any) => {
        if (res?.id) setApiId(res.id)
      }).catch(() => { /* silent */ })
    }
  }

  function handlePrint() {
    handleSave()
    window.print()
  }

  function handleAdvance(updates: Partial<QuotationDoc>) {
    const next = { ...doc, ...updates }
    setDoc(next)
    setSaved(false)
    handleSave(next)
  }

  function handleGenerateInvoice() {
    const newId = generateInvoice(doc)
    const next = { ...doc, status: 'invoiced' as QuotationStatus, invoiceId: newId }
    setDoc(next)
    setSaved(false)
    handleSave(next)
    nav(`/invoices/${newId}`)
  }

  function selectCustomer(c: StoredCustomer) {
    updateDoc({
      ...doc,
      customerId:        c.id,
      customerName:      c.company,
      customerLogoImage: c.logoImage ?? '',
      customerBranch:    c.industry ?? '',
      customerCity:      c.city ?? '',
      customerTel:       c.phone ?? '',
      customerTRN:       '',
    })
    setShowCustomerPicker(false)
  }

  function saveProfile() {
    writeData(PROFILE_KEY, JSON.stringify({
      name:      doc.issuerName,
      logoText:  doc.issuerLogoText,
      logoImage: doc.issuerLogoImage,
      address:   doc.issuerAddress,
      poBox:     doc.issuerPOBox,
      mobile:    doc.issuerMobile,
      fax:       doc.issuerFax,
      email:     doc.issuerEmail,
      trn:       doc.issuerTRN,
    }))
    // Persist logo URL to org settings so it loads on next new quotation
    if (doc.issuerLogoImage) {
      orgApi.patchSettings({ logo_url: doc.issuerLogoImage }).catch(() => {})
    }
    setShowSettings(false)
  }

  return (
    <div>
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
        </div>

        <div className="flex items-center gap-2">
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
              <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                <div className="p-1 max-h-56 overflow-y-auto">
                  {customers.length === 0 && (
                    <p className="px-3 py-2 text-xs text-gray-400">No customers yet.</p>
                  )}
                  {customers.map(c => (
                    <button
                      key={c.id}
                      onClick={() => selectCustomer(c)}
                      className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-blue-50 text-gray-700 flex items-center gap-2"
                    >
                      {c.logoImage && (
                        <img src={c.logoImage} alt="" className="w-6 h-6 object-contain rounded" />
                      )}
                      <div>
                        <p className="font-medium">{c.company}</p>
                        {c.city && <p className="text-xs text-gray-400">{c.city}</p>}
                      </div>
                    </button>
                  ))}
                </div>
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
        onGenerateInvoice={handleGenerateInvoice}
        nav={nav}
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
        <div className="flex flex-col gap-0 print:gap-0 w-[794px] mx-auto">
          {pages.map((pageLines, pi) => (
            <QuotationPage
              key={pi}
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
              onCustomerLogoChange={(val) => {
                if (doc.customerId) {
                  // logo_url already persisted by uploadFn; also update logo_image as fallback
                  const isUrl = val.startsWith('http')
                  customersApi.update(doc.customerId, isUrl ? { logo_url: val } : { logo_image: val }).catch(() => {})
                }
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
