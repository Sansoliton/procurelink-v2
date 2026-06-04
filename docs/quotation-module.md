# Quotation Module — Developer Reference

## Overview

The Quotation Module implements the complete sales-side quotation lifecycle for ProcureLink v2. A quotation begins as a **draft** internal document and progresses through a linear pipeline:

```
draft → shared → acknowledged → po_received → invoiced → complete
```

| Stage | Meaning |
|---|---|
| `draft` | Internal document, not yet sent to customer |
| `shared` | Sent/emailed to customer; awaiting their response |
| `acknowledged` | Customer has confirmed receipt |
| `po_received` | Customer issued a Purchase Order; PO details recorded |
| `invoiced` | Invoice generated from the quotation |
| `complete` | Invoice paid; all deliveries fulfilled |

Each transition is user-initiated via the **WorkflowStrip** component. The document is persisted in both **localStorage** (for offline/print) and the **backend API** (source of truth). Delivery notes can be created from `po_received` onward to track partial or full physical delivery of goods.

---

## File Map

| File | Role |
|---|---|
| `frontend/src/pages/quotations/QuotationEditorPage.tsx` | Main editor page — all state, handlers, sub-components, and JSX |
| `frontend/src/pages/quotations/QuotationsListPage.tsx` | List page — pipeline summary cards, table of all quotations, search |
| `frontend/src/api/index.ts` | Axios API client — `cquotesApi`, `cinvoicesApi`, `deliveryNotesApi`, `customersApi` |
| `frontend/src/types/index.ts` | TypeScript interfaces — `CustomerQuotation`, `CustomerInvoice`, `DeliveryNote` |
| `frontend/src/lib/storage.ts` | `readData` / `writeData` localStorage helpers |
| `backend/app/routers/__init__.py` | FastAPI routers — `cquotes_router`, `cinvoices_router`, `delivery_notes_router` |
| `backend/app/models/__init__.py` | SQLAlchemy ORM models — `CustomerQuotation`, `CustomerInvoice`, `DeliveryNote` |
| `backend/app/schemas/__init__.py` | Pydantic schemas — `CustomerQuotationUpsert/Out`, `CustomerInvoiceUpsert/Out`, `DeliveryNoteCreate/Out` |
| `backend/app/worker.py` | Celery worker — `generate_pdf_task` (PDF generation via MinIO) |
| `backend/app/main.py` | App startup — `_COLUMN_MIGRATIONS` safe ALTER TABLE migrations |

---

## Data Models

### QuotationDoc (frontend in-memory shape)

Stored wholesale inside the `doc_data` JSON column on the backend.

| Field | Type | Purpose |
|---|---|---|
| `id` | `string` (UUID) | Frontend-generated document identity |
| `quotationNo` | `string` | Human-readable number, e.g. `C26/0001` |
| `date` | `string` (ISO date) | Quotation date (user-set) |
| `issuerName` | `string` | Issuing company name |
| `issuerLogoText` | `string` | Fallback logo initials |
| `issuerLogoImage` | `string` | Logo URL or base64 data URI |
| `issuerAddress/POBox/Mobile/Fax/Email/TRN` | `string` | Issuer contact block |
| `customerId` | `string` | Foreign key to `customers` table |
| `customerName` | `string` | Customer display name (denormalized) |
| `customerLogoImage` | `string` | Customer logo URL or base64 |
| `customerBranch/City/Tel/TRN` | `string` | Customer contact block |
| `lines` | `QLine[]` | Line items |
| `vatPct` | `number` | VAT percentage (default: 5) |
| `paymentTerms/paymentMethod/deliveryTime` | `string` | Terms block |
| `notes` | `string` | Rich-text HTML notes |
| `status` | `QuotationStatus` | Current lifecycle stage |
| `quotationType` | `'quotation' \| 'proforma' \| 'service' \| 'dummy'` | Document type |
| `poNumber/poDate/poDueDate` | `string?` | Customer PO details |
| `poAttachment/poAttachmentName` | `string?` | PO document URL or base64 |
| `attachments` | `DocAttachment[]?` | General file attachments |
| `invoiceId` | `string?` | Linked invoice backend UUID |
| `sharedDate/acknowledgedDate/poReceivedDate` | `string?` | Stage timestamps |

**QLine:**
```typescript
{ _key: string; description: string; qty: string; unitPrice: string; amount: string }
```
`_key` is a stable `crypto.randomUUID()` used both as the React key and as the delivery-tracking key across all delivery notes.

### Backend DB Tables

#### `customer_quotations`
| Column | Notes |
|---|---|
| `id` | UUID PK, auto-generated |
| `org_id` | FK to organisations — multi-tenant isolation |
| `quotation_no` | Human-readable reference, e.g. `C26/0001` |
| `customer_id` | Nullable FK to customers |
| `customer_name` | Denormalized display name |
| `status` | Default `draft` |
| `total_amount` | Grand total including VAT |
| `doc_data` | JSON — full `QuotationDoc` object |
| `pdf_url` | MinIO object URL after async PDF generation |

#### `customer_invoices`
| Column | Notes |
|---|---|
| `invoice_no` | e.g. `INV26/0001` |
| `quotation_no` | Links invoice to quotation for `/related` lookup |
| `status` | `pending` → `paid` |
| `doc_data` | Full invoice document including line items |

#### `delivery_notes`
| Column | Notes |
|---|---|
| `delivery_no` | Auto-generated as `DN{YY}/NNNN` if sent empty |
| `quotation_id` | Backend UUID of the parent quotation |
| `status` | `draft` → `sent` → `delivered` |
| `doc_data` | `{ date, items: DeliveryNoteItem[], notes, driverName }` |

Each `DeliveryNoteItem` records the qty delivered **in that batch**. The frontend sums all batches with `deliveredSoFar(lineKey)`.

---

## Component Architecture

### QuotationEditorPage

**Route:** `/quotations/:id?` (`:id` absent for new quotations)

#### Key State

| State | Type | Purpose |
|---|---|---|
| `doc` | `QuotationDoc` | In-memory document |
| `saved` | `boolean` | Whether current doc matches last persistence |
| `apiId` | `string \| null` | Backend UUID, set after first `cquotesApi.create()` |
| `apiDocLoaded` | `Ref<boolean>` | Guard: blocks API response from overwriting user edits |
| `pendingCreateRef` | `Ref<Promise<string> \| null>` | Guard: prevents duplicate POSTs while first create is in-flight |
| `relatedDocs` | `{ invoices, pos } \| null` | Fetched from `GET /cquotes/{id}/related` |
| `deliveryNotes` | `DeliveryNote[]` | Delivery notes for this quotation |
| `viewer` | `{ url, title, blobUrl? } \| null` | PDF viewer modal state |

#### Sub-components (all in same file)

| Component | Purpose |
|---|---|
| `QuotationPage` | Single A4 page — first page has full header, subsequent pages are compact |
| `WorkflowStrip` | Horizontal step indicator + context-sensitive action buttons |
| `SettingsPanel` | Inline issuer profile editor; persists to localStorage + `orgApi` |
| `PDFViewerModal` | Full-screen modal for PDFs and images |
| `SafeImg` | Error-tolerant image with fallback ReactNode |
| `LogoUpload` | Clickable upload box with base64 preview |
| `F` | Transparent inline `<input>` for document fields |
| `RichText` | `contenteditable` div with Bold/Italic/Bullet toolbar |
| `AutoTextarea` | Auto-height textarea for line descriptions |

---

## Data Flow

### Load Order on Mount

```
useState() initializer  (synchronous)
  ├─ id present + found in localStorage → use localStorage doc
  ├─ id present + NOT in localStorage  → use skeleton (quotationNo: '')
  └─ no id → new doc with nextNo() + default customer

useEffect[]   (after first render)
  └─ orgApi.getSettings() → patch issuerLogoImage (new docs only)

useEffect[]   (after first render)
  └─ customersApi.list() → setCustomers

useEffect[id]  (when id param changes)
  └─ cquotesApi.get(id) → if !apiDocLoaded.current → setApiId + setDoc
     ↓ triggers...

useEffect[apiId]  (when apiId is set)
  ├─ cquotesApi.getRelated(apiId) → setRelatedDocs
  └─ deliveryNotesApi.list({ quotation_id }) → setDeliveryNotes
```

The `apiDocLoaded` ref is set to `true` when:
- The API response is applied (`cquotesApi.get` success)
- The user edits any field (`updateDoc` callback)

Once `true`, subsequent API responses are ignored, preventing stale-response overwrites.

### Save Flow

`handleSave(overrideDoc?)` is the single save entry point:

```
1. Write to localStorage (synchronous, offline-safe)
2. setSaved(true)  ← optimistic
3. Build payload: { quotation_no, customer_id, customer_name, status, total_amount, doc_data }
4. if apiId        → cquotesApi.update(apiId, payload)   .catch(() => setSaved(false))
   elif pending    → chain update onto in-flight create promise
   else            → cquotesApi.create(payload)
                      .then(res => setApiId(res.id); pendingCreateRef.current = null)
                      .catch(() => setSaved(false))
```

`pendingCreateRef` prevents the race condition where two saves fire before the first `POST /cquotes/` resolves: the second save waits for the create promise and chains a `PUT` instead of firing a second `POST`.

### Workflow Advance Flow

```typescript
function handleAdvance(updates: Partial<QuotationDoc>) {
  const next = { ...doc, ...updates }
  setDoc(next)
  setSaved(false)
  handleSave(next)   // explicit arg avoids stale closure
}
```

`WorkflowStrip` calls `onUpdate(updates)` → `handleAdvance`. Each workflow button provides the exact fields to merge:

| Action | Fields set |
|---|---|
| Share | `status: 'shared'`, `sharedDate` |
| Acknowledge | `status: 'acknowledged'`, `acknowledgedDate` |
| Record PO | `status: 'po_received'`, `poNumber`, `poDate`, `poDueDate`, `poAttachment`, `poReceivedDate` |
| Revert to Pending | `status: 'acknowledged'`, all PO fields reset to `''` |
| Mark Complete | `status: 'complete'` |

### Invoice Generation Flow

`handleGenerateInvoice()` is called from `WorkflowStrip` at `po_received` status:

```
1. Compute invoice number locally (INV{YY}/NNNN from pl_invoices localStorage)
2. await cinvoicesApi.create({ invoice_no, quotation_no, customer_*, total_amount: grandTotal, doc_data: { lines, ... } })
   → on success: setDoc({ status: 'invoiced', invoiceId: res.id }), handleSave, nav('/invoices/{res.id}')
   → on failure: fallback to generateInvoice() (local-only, offline path)
3. Refresh relatedDocs from GET /cquotes/{apiId}/related
```

### File Upload Flow

All uploads follow **backend-first, base64-fallback**:

```
if apiId:  POST /cquotes/{apiId}/upload  → use returned URL
else:      FileReader → base64 data URI
```

| Handler | What it uploads | Where stored |
|---|---|---|
| `handlePOUpload` | PO document | `doc.poAttachment` |
| `handleFilesUpload` | General attachments | `doc.attachments[]` |
| `handleUploadInvoice` | Existing invoice PDF | `cinvoicesApi.create().pdf_url` |

### Customer Selection Flow

The customer picker has three modes (`pickerMode`):

| Mode | Trigger | Action |
|---|---|---|
| `list` | Default | Shows filtered customer list; click to select |
| `edit` | Pencil icon on a row | Opens inline edit form for that customer |
| `new` | "Add new customer" button | Opens blank new-customer form |

`handleSaveCustomerForm()` → `customersApi.create/update` → optionally `customersApi.uploadLogo` → `selectCustomer(result)`.

`selectCustomer(c)` copies all customer fields into `doc` and calls `updateDoc()`.

**Default customer:** `pl_default_customer` localStorage key. Pre-fills new documents at mount.

### Delivery Note Flow

```
openDNForm()
  → build dnFormItems from doc.lines, calling deliveredSoFar(lineKey) for each

handleSaveDN()
  → filter items where thisQty > 0
  → deliveryNotesApi.create({ delivery_no: '', quotation_id: apiId, doc_data: { date, items, notes, driverName } })
  → backend auto-generates delivery_no as DN{YY}/NNNN
  → setDeliveryNotes(prev => [dn, ...prev])

Status transitions:
  draft → "Mark Sent"      → deliveryNotesApi.update(id, { status: 'sent' })
  sent  → "Mark Delivered" → deliveryNotesApi.update(id, { status: 'delivered' })

allDelivered = deliverableLines.length > 0 && every line: deliveredSoFar >= orderedQty
  (deliverableLines = lines where parseFloat(qty) > 0)

"Mark Delivered & Close Invoice":
  → cinvoicesApi.get(inv.id)           // fetch full invoice (not the incomplete /related shape)
  → cinvoicesApi.update(id, { ...fullInv, status: 'paid' })
  → handleAdvance({ status: 'complete' })
  → refresh relatedDocs
```

---

## API Reference

### `cquotesApi` — `/cquotes`

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/cquotes/` | List all quotations |
| POST | `/cquotes/` | Create quotation; enqueues PDF |
| GET | `/cquotes/{id}` | Fetch single quotation |
| PUT | `/cquotes/{id}` | Update quotation; re-enqueues PDF |
| DELETE | `/cquotes/{id}` | Delete quotation |
| GET | `/cquotes/{id}/pdf` | Get PDF URL; 202 if not ready |
| GET | `/cquotes/{id}/related` | Returns `{ invoices: CustomerInvoiceOut[], pos: [] }` |
| POST | `/cquotes/{id}/upload` | Upload file attachment (MinIO or base64 fallback) |

### `cinvoicesApi` — `/cinvoices`

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/cinvoices/` | List all invoices |
| POST | `/cinvoices/` | Create invoice; enqueues PDF |
| GET | `/cinvoices/{id}` | Fetch single invoice |
| PUT | `/cinvoices/{id}` | Update invoice |
| DELETE | `/cinvoices/{id}` | Delete invoice |
| GET | `/cinvoices/{id}/pdf` | Get PDF URL; 202 if not ready |

### `deliveryNotesApi` — `/delivery-notes`

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/delivery-notes/` | Supports `?quotation_id=` filter |
| POST | `/delivery-notes/` | Auto-generates `delivery_no` if sent as `''` |
| PUT | `/delivery-notes/{id}` | Used for status transitions |
| DELETE | `/delivery-notes/{id}` | Hard delete |

---

## localStorage Keys

| Key | Content |
|---|---|
| `pl_quotations` | `QuotationDoc[]` — all quotations |
| `pl_invoices` | Local invoice array (fallback for offline path) |
| `pl_customers` | `StoredCustomer[]` fallback when API unavailable |
| `pl_company_profile` | Issuer profile (name, logo, address, TRN) |
| `pl_default_customer` | `StoredCustomer` pre-filled on new quotations |

---

## Known Remaining Limitations

| Area | Issue |
|---|---|
| `QuotationsListPage` | No server-side pagination; `GET /cquotes/` returns all rows |
| `QuotationsListPage` | "Date" column shows `created_at` (DB timestamp), not `doc_data.date` (user-set) |
| WorkflowStrip PO file | Uses `FileReader` base64, not `handlePOUpload`; produces inconsistent storage format |
| Related docs `useEffect` | No `AbortController`; unmount after async fetch logs a state update warning |
| Quotation type `<select>` | Native `<select>` may not print correctly in all browsers; add a `print:hidden` sibling `<span>` |
| `saved` indicator | Set optimistically before API call; backend failures revert it but no persistent error banner |

---

## Startup Column Migrations

`backend/app/main.py` runs safe `ALTER TABLE … ADD COLUMN` migrations on every start using `sqlalchemy.inspect`. This avoids requiring `alembic upgrade head` for incremental column additions on existing databases.

```python
_COLUMN_MIGRATIONS = [
    ("customers",            "trn",          "VARCHAR(50)"),
    ("customers",            "logo_image",   "TEXT"),
    ("customers",            "logo_url",     "VARCHAR(500)"),
    ("customers",            "updated_at",   "TIMESTAMP"),
    ("customer_quotations",  "pdf_url",      "VARCHAR"),
    ("customer_quotations",  "customer_id",  "VARCHAR"),
    ("customer_invoices",    "pdf_url",      "VARCHAR"),
    ("customer_invoices",    "customer_id",  "VARCHAR"),
    ("customer_invoices",    "quotation_no", "VARCHAR(50)"),
]
```

Each entry is attempted at startup; errors are logged as warnings and skipped (idempotent).
