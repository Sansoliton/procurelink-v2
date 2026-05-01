import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Plus, Trash2, Printer, Save, ArrowLeft,
  Settings, X, Check, Upload, Bold, Italic, List, CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui'
import { cinvoicesApi } from '@/api'

// ── Types ─────────────────────────────────────────────────────────
export type InvoiceStatus = 'pending' | 'paid' | 'overdue'

export interface ILine {
  _key: string
  description: string
  qty: string
  unitPrice: string
  amount: string
}

export interface InvoiceDoc {
  id: string
  invoiceNo: string
  quotationNo: string
  poNumber: string
  poDate: string
  dueDate: string
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
  lines: ILine[]
  vatPct: number
  paymentTerms: string
  deliveryTime: string
  invoiceStatus: InvoiceStatus
  createdAt: string
}

// ── Constants ─────────────────────────────────────────────────────
const INV_KEY = 'pl_invoices'
const PROFILE_KEY = 'pl_company_profile'
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

// ── Storage ───────────────────────────────────────────────────────
function loadAll(): InvoiceDoc[] {
  try {
    const raw = localStorage.getItem(INV_KEY)
    if (!raw) return []
    const p = JSON.parse(raw)
    return Array.isArray(p) ? p : Object.values(p)
  } catch { return [] }
}

function saveAll(docs: InvoiceDoc[]) {
  localStorage.setItem(INV_KEY, JSON.stringify(docs))
}

function loadProfile() {
  try { return { ...DEFAULT_PROFILE, ...JSON.parse(localStorage.getItem(PROFILE_KEY) ?? '{}') } }
  catch { return DEFAULT_PROFILE }
}

function newLine(): ILine {
  return { _key: crypto.randomUUID(), description: '', qty: '', unitPrice: '', amount: '' }
}

// ── Pagination ────────────────────────────────────────────────────
function estimateRows(line: ILine): number {
  const c = (line.description || '').length
  if (c <= 70) return 1
  if (c <= 140) return 2
  return Math.ceil(c / 70)
}

function buildPages(lines: ILine[]): ILine[][] {
  const pages: ILine[][] = []
  let current: ILine[] = []
  let used = 0
  for (const line of lines) {
    const rows = estimateRows(line)
    const max = pages.length === 0 ? FIRST_PAGE_ROWS : OTHER_PAGE_ROWS
    if (used + rows > max && current.length > 0) {
      pages.push(current); current = [line]; used = rows
    } else {
      current.push(line); used += rows
    }
  }
  if (current.length > 0 || pages.length === 0) pages.push(current)
  return pages
}

// ── Maths ─────────────────────────────────────────────────────────
function calcLine(l: ILine): number {
  const q = parseFloat(l.qty), p = parseFloat(l.unitPrice)
  return isNaN(q) || isNaN(p) ? (parseFloat(l.amount) || 0) : q * p
}

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

// ── Logo upload ───────────────────────────────────────────────────
function LogoUpload({ value, onChange }: { value: string; onChange: (b64: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = () => onChange(reader.result as string)
    reader.readAsDataURL(file); e.target.value = ''
  }
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="w-24 h-18 border-2 border-dashed border-gray-300 rounded flex items-center justify-center
          cursor-pointer hover:border-blue-400 transition-colors overflow-hidden bg-gray-50
          print:border-0 print:bg-transparent"
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
        <button onClick={e => { e.stopPropagation(); onChange('') }}
          className="text-[9px] text-red-400 hover:text-red-600 print:hidden">Remove</button>
      )}
    </div>
  )
}

// ── Inline field ──────────────────────────────────────────────────
function F({ value, onChange, className = '', align = 'left', placeholder = '' }: {
  value: string; onChange: (v: string) => void
  className?: string; align?: string; placeholder?: string
}) {
  const base = `bg-transparent border border-transparent hover:border-gray-300
    focus:border-blue-400 focus:outline-none focus:bg-blue-50/30 rounded px-1 py-0.5
    w-full transition-colors print:border-transparent print:bg-transparent`
  return <input className={`${base} text-${align} ${className}`} value={value}
    onChange={e => onChange(e.target.value)} placeholder={placeholder} />
}

// ── Rich text (Teams-style) ───────────────────────────────────────
function RichText({ value, onChange, placeholder, className = '' }: {
  value: string; onChange: (html: string) => void; placeholder?: string; className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const last = useRef(value)
  const [focused, setFocused] = useState(false)

  useLayoutEffect(() => {
    if (ref.current) ref.current.innerHTML = value
    last.current = value
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (ref.current && value !== last.current && document.activeElement !== ref.current) {
      ref.current.innerHTML = value; last.current = value
    }
  }, [value])

  function exec(cmd: string) { document.execCommand(cmd, false); onChange(ref.current?.innerHTML ?? '') }
  function handleInput() { const h = ref.current?.innerHTML ?? ''; last.current = h; onChange(h) }
  const btn = 'w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 text-gray-600 transition-colors'

  return (
    <div className={`w-full ${className}`}>
      <div className={`flex items-center gap-0.5 mb-1 px-1 py-0.5 bg-gray-50 border border-gray-200
        rounded-lg print:hidden ${focused ? 'opacity-100' : 'opacity-0 pointer-events-none h-0 mb-0 overflow-hidden'}`}>
        <button onMouseDown={e => { e.preventDefault(); exec('bold') }} className={btn}><Bold className="w-3 h-3" /></button>
        <button onMouseDown={e => { e.preventDefault(); exec('italic') }} className={btn}><Italic className="w-3 h-3" /></button>
        <button onMouseDown={e => { e.preventDefault(); exec('insertUnorderedList') }} className={btn}><List className="w-3 h-3" /></button>
        <div className="w-px h-4 bg-gray-200 mx-0.5" />
        <button onMouseDown={e => { e.preventDefault(); exec('removeFormat') }} className={`${btn} text-[9px] font-bold text-gray-400`}>A</button>
      </div>
      <div ref={ref} contentEditable suppressContentEditableWarning
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onInput={handleInput}
        data-placeholder={placeholder}
        className="min-h-[28px] bg-transparent border border-transparent hover:border-gray-300
          focus:border-blue-400 focus:outline-none focus:bg-blue-50/30 rounded px-1 py-0.5
          w-full transition-colors rich-text leading-snug
          print:border-transparent print:bg-transparent" />
    </div>
  )
}

// ── Auto-growing textarea ─────────────────────────────────────────
function AutoTextarea({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (ref.current) { ref.current.style.height = 'auto'; ref.current.style.height = ref.current.scrollHeight + 'px' }
  }, [value])
  return (
    <textarea ref={ref} rows={1}
      className="bg-transparent border border-transparent hover:border-gray-300
        focus:border-blue-400 focus:outline-none focus:bg-blue-50/30 rounded px-1 py-0.5
        w-full transition-colors resize-none leading-snug overflow-hidden
        print:border-transparent print:bg-transparent"
      value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
  )
}

// ── Settings panel ────────────────────────────────────────────────
function SettingsPanel({ doc, onChange, onSave, onClose }: {
  doc: InvoiceDoc; onChange: (d: InvoiceDoc) => void; onSave: () => void; onClose: () => void
}) {
  const fields: [string, keyof InvoiceDoc][] = [
    ['Company name', 'issuerName'], ['Address', 'issuerAddress'],
    ['Mobile', 'issuerMobile'], ['Fax', 'issuerFax'],
    ['Email', 'issuerEmail'], ['TRN', 'issuerTRN'],
  ]
  return (
    <div className="no-print bg-white border border-gray-200 rounded-xl p-5 mb-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">Company Profile</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex items-start gap-5 mb-4">
        <div className="flex flex-col items-center gap-1">
          <p className="text-xs font-medium text-gray-500 mb-1">Company Logo</p>
          <LogoUpload value={doc.issuerLogoImage} onChange={v => onChange({ ...doc, issuerLogoImage: v })} />
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm flex-1">
          {fields.map(([label, field]) => (
            <div key={field}>
              <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
              <input className="input-base text-sm" value={String(doc[field] ?? '')}
                onChange={e => onChange({ ...doc, [field]: e.target.value })} />
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

// ── Invoice Page (A4 sheet) ───────────────────────────────────────
interface PageProps {
  doc: InvoiceDoc; lines: ILine[]; pageNum: number; totalPages: number
  subtotal: number; vatAmt: number; grandTotal: number
  isLastPage: boolean; isFirstPage: boolean
  onChange: (doc: InvoiceDoc) => void
  onLineChange: (key: string, field: keyof ILine, val: string) => void
  onAddLine: () => void; onRemoveLine: (key: string) => void
}

function InvoicePage({
  doc, lines, pageNum, totalPages, subtotal, vatAmt, grandTotal,
  isLastPage, isFirstPage, onChange, onLineChange, onAddLine, onRemoveLine,
}: PageProps) {
  const set = (f: keyof InvoiceDoc) => (v: string) => onChange({ ...doc, [f]: v })

  return (
    <div className={`bg-white w-[794px] min-h-[1123px] max-w-[794px] p-[40px] mx-auto flex flex-col
      shadow-[0_2px_20px_rgba(0,0,0,0.12)] ${pageNum > 1 ? 'mt-8 print:mt-0 print:break-before-page' : ''}`}>

      {/* ── First page header ── */}
      {isFirstPage && (
        <div className="flex items-start justify-between mb-4 pb-3 border-b-2 border-gray-800">
          <div className="flex flex-col items-start gap-1">
            <LogoUpload value={doc.customerLogoImage} onChange={set('customerLogoImage')} />
            <p className="text-[9px] text-gray-400 italic print:hidden">Customer logo</p>
          </div>
          <div className="text-center flex-1 mx-6 mt-2">
            <h1 className="text-3xl font-bold tracking-wide text-gray-900">Invoice</h1>
            <p className="text-xs text-gray-400 mt-0.5">Japanese High-Quality Products</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <LogoUpload
              value={doc.issuerLogoImage}
              onChange={v => {
                onChange({ ...doc, issuerLogoImage: v })
                try {
                  const p = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? '{}')
                  localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...p, logoImage: v }))
                } catch { /* ok */ }
              }}
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

      {/* ── Continuation header ── */}
      {!isFirstPage && (
        <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-300">
          <p className="text-sm font-bold text-gray-700">{doc.issuerName}</p>
          <p className="text-sm text-gray-500">{doc.invoiceNo} · Page {pageNum} of {totalPages}</p>
        </div>
      )}

      {/* ── Bill To + Invoice Meta ── */}
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
              <F value={doc.customerTel} onChange={set('customerTel')} placeholder="+971 0 0000000" />
            </div>
            <div className="flex gap-1 items-center">
              <span className="text-gray-500 flex-shrink-0">TRN:</span>
              <F value={doc.customerTRN} onChange={set('customerTRN')}
                className="font-mono" placeholder="TRN number" />
            </div>
          </div>

          <div className="text-xs leading-relaxed text-right min-w-[220px] space-y-0.5">
            <div className="flex justify-end gap-3">
              <span className="font-bold text-gray-700">Invoice No:</span>
              <span className="font-bold text-gray-900">{doc.invoiceNo}</span>
            </div>
            {doc.quotationNo && (
              <div className="flex justify-end gap-3">
                <span className="font-bold text-gray-700">Against Quotation:</span>
                <span className="text-gray-700">{doc.quotationNo}</span>
              </div>
            )}
            {doc.poNumber && (
              <div className="flex justify-end gap-3">
                <span className="font-bold text-gray-700">PO No:</span>
                <span className="font-mono text-gray-700">{doc.poNumber}</span>
              </div>
            )}
            {doc.poDate && (
              <div className="flex justify-end gap-3">
                <span className="font-bold text-gray-700">PO Date:</span>
                <span className="text-gray-700">{doc.poDate}</span>
              </div>
            )}
            <div className="flex justify-end gap-3">
              <span className="font-bold text-gray-700">Invoice Date:</span>
              <input type="date" value={doc.date} onChange={e => onChange({ ...doc, date: e.target.value })}
                className="bg-transparent border border-transparent hover:border-gray-300
                  focus:border-blue-400 focus:outline-none rounded px-1 text-xs print:border-transparent" />
            </div>
            <div className="flex justify-end gap-3">
              <span className="font-bold text-gray-700">Due Date:</span>
              <input type="date" value={doc.dueDate} onChange={e => onChange({ ...doc, dueDate: e.target.value })}
                className="bg-transparent border border-transparent hover:border-gray-300
                  focus:border-blue-400 focus:outline-none rounded px-1 text-xs print:border-transparent" />
            </div>
          </div>
        </div>
      )}

      {/* ── Line items ── */}
      <div className="flex-1">
        <table className="w-full text-xs border-collapse mb-2">
          <thead>
            <tr className="bg-gray-100 border border-gray-400">
              <th className="border border-gray-400 py-2 px-2 text-center w-8 font-bold">No.</th>
              <th className="border border-gray-400 py-2 px-2 text-left font-bold">Description</th>
              <th className="border border-gray-400 py-2 px-2 text-center w-14 font-bold">Qty.</th>
              <th className="border border-gray-400 py-2 px-2 text-center w-24 font-bold">Unit Price (AED)</th>
              <th className="border border-gray-400 py-2 px-2 text-center w-24 font-bold">Amount (AED)</th>
              <th className="border border-gray-400 py-2 px-1 w-6 print:hidden" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => {
              const hasCalc = !!(line.qty && line.unitPrice)
              const computedAmt = hasCalc ? calcLine(line).toFixed(2) : ''
              return (
                <tr key={line._key} className="border border-gray-300">
                  <td className="border border-gray-300 py-1 px-2 text-center text-gray-500 align-top">{idx + 1}</td>
                  <td className="border border-gray-300 py-1 px-1 align-top">
                    <AutoTextarea value={line.description}
                      onChange={v => onLineChange(line._key, 'description', v)} placeholder="Description…" />
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
                    <button onClick={() => onRemoveLine(line._key)} className="text-gray-300 hover:text-red-500">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              )
            })}
            {isLastPage && lines.length < 6 &&
              Array.from({ length: 6 - lines.length }).map((_, i) => (
                <tr key={`e${i}`} className="border border-gray-300">
                  {[...Array(5)].map((__, j) => <td key={j} className="border border-gray-300 py-3 px-2" />)}
                  <td className="border border-gray-300 print:hidden" />
                </tr>
              ))}
          </tbody>
          {isLastPage && (
            <tfoot>
              <tr className="border border-gray-400 font-bold bg-gray-50">
                <td colSpan={3} className="border border-gray-400 py-2 px-2" />
                <td className="border border-gray-400 py-2 px-2 text-center font-bold text-gray-700">AED</td>
                <td className="border border-gray-400 py-2 px-2 text-right font-bold">{subtotal.toFixed(2)}</td>
                <td className="border border-gray-400 print:hidden" />
              </tr>
            </tfoot>
          )}
        </table>
        {isLastPage && (
          <button onClick={onAddLine}
            className="print:hidden flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800
              border border-dashed border-blue-300 hover:border-blue-500 rounded px-3 py-1.5 mb-2">
            <Plus className="w-3 h-3" /> Add line
          </button>
        )}
      </div>

      {/* ── Last page footer ── */}
      {isLastPage && (
        <div className="mt-auto pt-3 border-t border-gray-300 text-xs space-y-1.5">
          <div className="flex gap-2">
            <span className="font-bold text-gray-700 w-36 flex-shrink-0">Amount in words</span>
            <span className="text-gray-500">:</span>
            <span className="italic text-gray-800">{toWords(grandTotal)}</span>
          </div>
          <div className="flex gap-2 items-center">
            <span className="font-bold text-gray-700 w-36 flex-shrink-0">VAT</span>
            <span className="text-gray-500">:</span>
            <span>VAT @</span>
            <input type="number" min={0} max={100} step={0.5} value={doc.vatPct}
              onChange={e => onChange({ ...doc, vatPct: parseFloat(e.target.value) || 0 })}
              className="w-12 text-center border border-transparent hover:border-gray-300
                focus:border-blue-400 focus:outline-none rounded px-1 print:border-transparent" />
            <span>% extra at actuals.</span>
            {doc.vatPct > 0 && (
              <span className="text-gray-500">
                (VAT: AED {vatAmt.toFixed(2)} · Total: AED {grandTotal.toFixed(2)})
              </span>
            )}
          </div>
          <div className="flex gap-2 items-start">
            <span className="font-bold text-gray-700 w-36 flex-shrink-0">Payment Terms</span>
            <span className="text-gray-500 mt-0.5">:</span>
            <RichText value={doc.paymentTerms} onChange={set('paymentTerms')}
              placeholder="e.g. 30 days from invoice date…" />
          </div>
          <div className="flex gap-2 items-center">
            <span className="font-bold text-gray-700 w-36 flex-shrink-0">Delivery Time</span>
            <span className="text-gray-500">:</span>
            <F value={doc.deliveryTime} onChange={set('deliveryTime')} placeholder="e.g. Immediate" />
          </div>
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

      {/* ── Page footer (every page) ── */}
      <div className="mt-auto pt-2">
        <div className="border-t border-gray-400" />
        <div className="text-center text-[9px] text-gray-600 leading-relaxed mt-1.5 space-y-0.5">
          <p>{[doc.issuerAddress, doc.issuerMobile ? `Mobile: ${doc.issuerMobile}` : '', doc.issuerFax ? `Fax: ${doc.issuerFax}` : ''].filter(Boolean).join('   ')}</p>
          <p>
            {doc.issuerEmail && <span>Email: <a href={`mailto:${doc.issuerEmail}`} className="text-blue-600 underline" onClick={e => e.preventDefault()}>{doc.issuerEmail}</a></span>}
            {doc.issuerEmail && doc.issuerTRN && <span className="mx-3" />}
            {doc.issuerTRN && <span>TRN: <strong>{doc.issuerTRN}</strong></span>}
          </p>
        </div>
        {totalPages > 1 && (
          <div className="text-center text-[9px] text-gray-400 mt-1">Page {pageNum} of {totalPages}</div>
        )}
      </div>
    </div>
  )
}

// ── Main Editor ───────────────────────────────────────────────────
export default function InvoiceEditorPage() {
  const { id } = useParams<{ id?: string }>()
  const nav = useNavigate()
  const profile = loadProfile()

  const [doc, setDoc] = useState<InvoiceDoc>(() => {
    if (id) {
      const found = loadAll().find(inv => inv.id === id)
      if (found) return {
        ...found,
        invoiceStatus: found.invoiceStatus ?? 'pending',
        issuerLogoImage: found.issuerLogoImage ?? '',
        customerLogoImage: found.customerLogoImage ?? '',
        quotationNo: found.quotationNo ?? '',
        poNumber: found.poNumber ?? '',
        poDate: found.poDate ?? '',
        dueDate: found.dueDate ?? '',
      }
    }
    return {
      id: crypto.randomUUID(),
      invoiceNo: '',
      quotationNo: '',
      poNumber: '',
      poDate: '',
      dueDate: '',
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
      paymentTerms: '30 Days from invoice date',
      deliveryTime: 'As per quotation',
      invoiceStatus: 'pending',
      createdAt: new Date().toISOString(),
    }
  })

  const [showSettings, setShowSettings] = useState(false)
  const [saved, setSaved] = useState(!!id)
  const [apiId, setApiId] = useState<number | null>(null)

  // Load from API on mount if editing
  useEffect(() => {
    if (!id) return
    cinvoicesApi.list().then((list: any[]) => {
      const found = list.find(inv => String(inv.id) === id || (inv.doc_data as any)?.id === id)
      if (found) {
        setApiId(found.id)
        const d = found.doc_data as InvoiceDoc
        setDoc({
          ...d,
          invoiceStatus: d.invoiceStatus ?? 'pending',
          issuerLogoImage: d.issuerLogoImage ?? '',
          customerLogoImage: d.customerLogoImage ?? '',
          quotationNo: d.quotationNo ?? '',
          poNumber: d.poNumber ?? '',
          poDate: d.poDate ?? '',
          dueDate: d.dueDate ?? '',
        })
      }
    }).catch(() => { /* fall through to localStorage */ })
  }, [id])

  const updateDoc = useCallback((d: InvoiceDoc) => { setDoc(d); setSaved(false) }, [])

  const updateLine = useCallback((key: string, field: keyof ILine, val: string) => {
    setDoc(prev => ({ ...prev, lines: prev.lines.map(l => l._key === key ? { ...l, [field]: val } : l) }))
    setSaved(false)
  }, [])

  const addLine = useCallback(() => {
    setDoc(prev => ({ ...prev, lines: [...prev.lines, newLine()] })); setSaved(false)
  }, [])

  const removeLine = useCallback((key: string) => {
    setDoc(prev => ({ ...prev, lines: prev.lines.length > 1 ? prev.lines.filter(l => l._key !== key) : prev.lines }))
    setSaved(false)
  }, [])

  const subtotal   = doc.lines.reduce((s, l) => s + calcLine(l), 0)
  const vatAmt     = subtotal * (doc.vatPct / 100)
  const grandTotal = subtotal + vatAmt
  const pages      = buildPages(doc.lines)

  function handleSave() {
    const all = loadAll().filter(i => i.id !== doc.id)
    saveAll([...all, doc]); setSaved(true)
    // Backend API save
    const subtotalVal = doc.lines.reduce((s, l) => s + calcLine(l), 0)
    const vatVal = subtotalVal * (doc.vatPct / 100)
    const payload = {
      invoice_no: doc.invoiceNo,
      quotation_no: doc.quotationNo || undefined,
      customer_name: doc.customerName || undefined,
      status: doc.invoiceStatus,
      total_amount: subtotalVal + vatVal,
      doc_data: doc as unknown as Record<string, unknown>,
    }
    if (apiId) {
      cinvoicesApi.update(String(apiId), payload).catch(() => { /* silent */ })
    } else {
      cinvoicesApi.create(payload).then((res: any) => {
        if (res?.id) setApiId(res.id)
      }).catch(() => { /* silent */ })
    }
  }

  function handlePrint() { handleSave(); window.print() }

  function saveProfile() {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({
      name: doc.issuerName, logoText: doc.issuerLogoText, logoImage: doc.issuerLogoImage,
      address: doc.issuerAddress, poBox: doc.issuerPOBox,
      mobile: doc.issuerMobile, fax: doc.issuerFax, email: doc.issuerEmail, trn: doc.issuerTRN,
    }))
    setShowSettings(false)
  }

  const statusColors: Record<InvoiceStatus, string> = {
    pending:  'bg-amber-100 text-amber-700',
    paid:     'bg-green-100 text-green-700',
    overdue:  'bg-red-100 text-red-700',
  }

  return (
    <div>
      {/* ── Toolbar ── */}
      <div className="no-print flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => nav('/invoices')}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors">
            <ArrowLeft className="w-4 h-4" /> All invoices
          </button>
          <span className="text-gray-200">|</span>
          <span className="text-sm font-semibold text-gray-700">{doc.invoiceNo || 'New Invoice'}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[doc.invoiceStatus]}`}>
            {doc.invoiceStatus}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Mark as paid */}
          {doc.invoiceStatus !== 'paid' && (
            <Button variant="ghost" onClick={() => updateDoc({ ...doc, invoiceStatus: 'paid' })}>
              <CheckCircle2 className="w-4 h-4 text-green-600" /> Mark as Paid
            </Button>
          )}
          {doc.invoiceStatus === 'paid' && (
            <Button variant="ghost" onClick={() => updateDoc({ ...doc, invoiceStatus: 'pending' })}>
              Revert to Pending
            </Button>
          )}
          {/* Mark overdue */}
          {doc.invoiceStatus === 'pending' && (
            <Button variant="ghost" onClick={() => updateDoc({ ...doc, invoiceStatus: 'overdue' })}>
              Mark Overdue
            </Button>
          )}
          <button onClick={() => setShowSettings(v => !v)}
            className="p-1.5 text-gray-400 hover:text-gray-700 border border-gray-200 rounded-lg transition-colors">
            <Settings className="w-4 h-4" />
          </button>
          <Button variant={saved ? 'ghost' : 'primary'} onClick={handleSave}>
            {saved ? <><Check className="w-4 h-4 text-green-600" /> Saved</> : <><Save className="w-4 h-4" /> Save</>}
          </Button>
          <Button variant="primary" onClick={handlePrint}>
            <Printer className="w-4 h-4" /> Print / PDF
          </Button>
        </div>
      </div>

      {showSettings && (
        <SettingsPanel doc={doc} onChange={updateDoc} onSave={saveProfile} onClose={() => setShowSettings(false)} />
      )}

      {/* ── Paper pages ── */}
      <div className="overflow-x-auto pb-8">
        <div className="flex flex-col gap-0 print:gap-0 w-[794px] mx-auto">
          {pages.map((pageLines, pi) => (
            <InvoicePage
              key={pi} doc={doc} lines={pageLines}
              pageNum={pi + 1} totalPages={pages.length}
              subtotal={subtotal} vatAmt={vatAmt} grandTotal={grandTotal}
              isLastPage={pi === pages.length - 1} isFirstPage={pi === 0}
              onChange={updateDoc} onLineChange={updateLine}
              onAddLine={addLine} onRemoveLine={removeLine}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
