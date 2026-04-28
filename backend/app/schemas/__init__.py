from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr


# ── Auth ───────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    org_name: str
    email: EmailStr
    password: str
    full_name: Optional[str] = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class InviteRequest(BaseModel):
    email: EmailStr
    org_role: str = "member"

class AcceptInviteRequest(BaseModel):
    token: str
    password: str
    full_name: Optional[str] = None


# ── User / Org ─────────────────────────────────────────────────────

class UserOut(BaseModel):
    id: str
    email: str
    full_name: Optional[str]
    org_id: str
    org_role: str
    is_active: bool
    created_at: datetime
    class Config: from_attributes = True

class OrgOut(BaseModel):
    id: str
    name: str
    slug: str
    type: str
    plan: str
    created_at: datetime
    class Config: from_attributes = True


# ── Projects ───────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None

class ProjectMemberOut(BaseModel):
    id: str
    user_id: str
    project_role: str
    user: Optional[UserOut] = None
    class Config: from_attributes = True

class ProjectOut(BaseModel):
    id: str
    org_id: str
    name: str
    description: Optional[str]
    status: str
    created_by: str
    created_at: datetime
    members: List[ProjectMemberOut] = []
    class Config: from_attributes = True


# ── Vendors ────────────────────────────────────────────────────────

class VendorCreate(BaseModel):
    name: str
    email: EmailStr
    categories: List[str] = []
    rating: Optional[float] = 4.0

class VendorUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    categories: Optional[List[str]] = None
    rating: Optional[float] = None
    is_active: Optional[bool] = None

class VendorOut(BaseModel):
    id: str
    org_id: str
    name: str
    email: str
    categories: List[str]
    rating: float
    is_active: bool
    class Config: from_attributes = True


# ── Requirements ───────────────────────────────────────────────────

class LineItemCreate(BaseModel):
    description: str
    part_number: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    specs: Optional[str] = None
    category: Optional[str] = None
    sort_order: int = 0

class LineItemOut(BaseModel):
    id: str
    description: str
    part_number: Optional[str]
    quantity: Optional[float]
    unit: Optional[str]
    specs: Optional[str]
    category: Optional[str]
    sort_order: int
    class Config: from_attributes = True

class RequirementCreate(BaseModel):
    title: str
    raw_text: Optional[str] = None
    delivery_date: Optional[datetime] = None

class RequirementOut(BaseModel):
    id: str
    org_id: str
    project_id: str
    created_by: str
    title: str
    raw_text: Optional[str]
    file_path: Optional[str]
    status: str
    delivery_date: Optional[datetime]
    created_at: datetime
    line_items: List[LineItemOut] = []
    quotation: Optional['QuotationOut'] = None
    class Config: from_attributes = True


# ── RFQs ───────────────────────────────────────────────────────────

class RFQOut(BaseModel):
    id: str
    vendor: VendorOut
    status: str
    deadline: Optional[datetime]
    sent_at: Optional[datetime]
    responded_at: Optional[datetime]
    reminder_count: int
    quote_lines: List['QuoteLineOut'] = []
    class Config: from_attributes = True

class QuoteLineSubmit(BaseModel):
    line_item_id: str
    unit_price: float
    lead_days: int
    notes: Optional[str] = None
    channel: Optional[str] = None           # mail | sms | call | whatsapp
    response_notes: Optional[str] = None    # how/when response was received

class QuoteSubmitRequest(BaseModel):
    lines: List[QuoteLineSubmit]
    channel: Optional[str] = None           # default channel for all lines if not set per-line
    response_notes: Optional[str] = None

class QuoteLineOut(BaseModel):
    id: str
    line_item_id: str
    unit_price: Optional[float]
    lead_days: Optional[int]
    notes: Optional[str]
    channel: Optional[str]
    response_notes: Optional[str]
    class Config: from_attributes = True


# ── Quotations ─────────────────────────────────────────────────────

class VendorPOOut(BaseModel):
    id: str
    vendor_id: str
    vendor_name: str
    reference: str
    status: str
    amount: float
    lines: List[dict] = []
    raised_at: datetime
    class Config: from_attributes = True

class QuotationOut(BaseModel):
    id: str
    reference: str
    total_cost: Optional[float]
    margin_pct: float
    customer_total: Optional[float]
    valid_until: Optional[datetime]
    status: str
    created_at: datetime
    line_breakdown: List[dict] = []   # [{line_item_id, description, qty, unit, vendor_id, vendor_name, unit_price, line_total}]
    vendor_pos: List[VendorPOOut] = []
    class Config: from_attributes = True


# ── PO & Invoice ───────────────────────────────────────────────────

class PurchaseOrderOut(BaseModel):
    id: str
    reference: str
    status: str
    payment_terms: str
    raised_at: datetime
    class Config: from_attributes = True

class InvoiceOut(BaseModel):
    id: str
    reference: str
    amount: float
    tax: float
    status: str
    issued_at: datetime
    due_at: Optional[datetime]
    paid_at: Optional[datetime]
    class Config: from_attributes = True


# ── Notifications ──────────────────────────────────────────────────

class NotificationOut(BaseModel):
    id: str
    type: str
    title: str
    body: Optional[str]
    entity_type: Optional[str]
    entity_id: Optional[str]
    is_read: bool
    created_at: datetime
    class Config: from_attributes = True

class UnreadCountOut(BaseModel):
    unread: int


# ── Analytics ──────────────────────────────────────────────────────

class AnalyticsOverviewOut(BaseModel):
    total_requirements: int
    active_projects: int
    total_po_value: float
    open_rfqs: int
    overdue_invoices: int
    avg_cycle_days: float
