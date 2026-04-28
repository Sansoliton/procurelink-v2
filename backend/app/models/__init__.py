import uuid
import enum
from datetime import datetime
from sqlalchemy import (
    Column, String, Float, Integer, Boolean, DateTime,
    Text, ForeignKey, Enum, UniqueConstraint, JSON
)
from sqlalchemy.orm import relationship
from app.database import Base


def gen_uuid():
    return str(uuid.uuid4())


# ── Enums ──────────────────────────────────────────────────────────

class OrgType(str, enum.Enum):
    customer = "customer"
    vendor = "vendor"
    internal = "internal"

class OrgPlan(str, enum.Enum):
    free = "free"
    pro = "pro"
    enterprise = "enterprise"

class OrgRole(str, enum.Enum):
    super_admin = "super-admin"
    org_admin = "org-admin"
    member = "member"

class ProjectRole(str, enum.Enum):
    buyer = "buyer"
    viewer = "viewer"

class ProjectStatus(str, enum.Enum):
    active = "active"
    archived = "archived"

class RequirementStatus(str, enum.Enum):
    draft = "draft"
    submitted = "submitted"
    rfq_sent = "rfq_sent"
    quotes_received = "quotes_received"
    quote_ready = "quote_ready"
    approved = "approved"
    po_raised = "po_raised"
    invoiced = "invoiced"
    completed = "completed"

class RFQStatus(str, enum.Enum):
    pending = "pending"
    sent = "sent"
    responded = "responded"
    expired = "expired"

class QuotationStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"

class POStatus(str, enum.Enum):
    raised = "raised"
    confirmed = "confirmed"
    delivered = "delivered"
    closed = "closed"

class InvoiceStatus(str, enum.Enum):
    issued = "issued"
    paid = "paid"
    overdue = "overdue"


# ── Tenant & auth models ───────────────────────────────────────────

class Organisation(Base):
    __tablename__ = "organisations"

    id = Column(String, primary_key=True, default=gen_uuid)
    name = Column(String(200), nullable=False)
    slug = Column(String(100), unique=True, nullable=False)
    type = Column(Enum(OrgType), nullable=False, default=OrgType.customer)
    plan = Column(Enum(OrgPlan), nullable=False, default=OrgPlan.free)
    settings = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)

    users = relationship("User", back_populates="organisation")
    projects = relationship("Project", back_populates="organisation")
    vendors = relationship("Vendor", back_populates="organisation")
    invitations = relationship("Invitation", back_populates="organisation")


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=gen_uuid)
    org_id = Column(String, ForeignKey("organisations.id"), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String(200))
    org_role = Column(Enum(OrgRole), nullable=False, default=OrgRole.member)
    is_active = Column(Boolean, default=True)
    invited_by = Column(String, ForeignKey("users.id"), nullable=True)
    last_login = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    organisation = relationship("Organisation", back_populates="users")
    project_memberships = relationship("ProjectMember", back_populates="user")


class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=gen_uuid)
    org_id = Column(String, ForeignKey("organisations.id"), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(Enum(ProjectStatus), default=ProjectStatus.active)
    settings = Column(JSON, default=dict)
    created_by = Column(String, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    organisation = relationship("Organisation", back_populates="projects")
    members = relationship("ProjectMember", back_populates="project", cascade="all, delete-orphan")
    requirements = relationship("Requirement", back_populates="project")


class ProjectMember(Base):
    __tablename__ = "project_members"

    id = Column(String, primary_key=True, default=gen_uuid)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    project_role = Column(Enum(ProjectRole), nullable=False, default=ProjectRole.viewer)
    added_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="members")
    user = relationship("User", back_populates="project_memberships")

    __table_args__ = (UniqueConstraint("project_id", "user_id"),)


class Invitation(Base):
    __tablename__ = "invitations"

    id = Column(String, primary_key=True, default=gen_uuid)
    org_id = Column(String, ForeignKey("organisations.id"), nullable=False)
    email = Column(String(255), nullable=False)
    org_role = Column(Enum(OrgRole), nullable=False, default=OrgRole.member)
    token = Column(String, unique=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    accepted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    organisation = relationship("Organisation", back_populates="invitations")


# ── Vendor catalog (per-org) ───────────────────────────────────────

class Vendor(Base):
    __tablename__ = "vendors"

    id = Column(String, primary_key=True, default=gen_uuid)
    org_id = Column(String, ForeignKey("organisations.id"), nullable=False)
    name = Column(String(200), nullable=False)
    email = Column(String(255), nullable=False)
    categories = Column(JSON, default=list)
    catalog_items = Column(JSON, default=list)   # [{description, part_number, unit, unit_price}]
    rating = Column(Float, default=4.0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    organisation = relationship("Organisation", back_populates="vendors")
    rfqs = relationship("RFQ", back_populates="vendor")


# ── Procurement models ────────────────────────────────────────────

class Requirement(Base):
    __tablename__ = "requirements"

    id = Column(String, primary_key=True, default=gen_uuid)
    org_id = Column(String, ForeignKey("organisations.id"), nullable=False)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    created_by = Column(String, ForeignKey("users.id"), nullable=False)
    title = Column(String(300), nullable=False)
    raw_text = Column(Text, nullable=True)
    file_path = Column(String, nullable=True)
    status = Column(Enum(RequirementStatus), default=RequirementStatus.draft)
    delivery_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project", back_populates="requirements")
    line_items = relationship("LineItem", back_populates="requirement", cascade="all, delete-orphan")
    rfqs = relationship("RFQ", back_populates="requirement")
    quotation = relationship("Quotation", back_populates="requirement", uselist=False)


class LineItem(Base):
    __tablename__ = "line_items"

    id = Column(String, primary_key=True, default=gen_uuid)
    requirement_id = Column(String, ForeignKey("requirements.id"), nullable=False)
    description = Column(String(500), nullable=False)
    part_number = Column(String(100), nullable=True)
    quantity = Column(Float, nullable=True)
    unit = Column(String(50), nullable=True)
    specs = Column(Text, nullable=True)
    category = Column(String(100), nullable=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    requirement = relationship("Requirement", back_populates="line_items")


class RFQ(Base):
    __tablename__ = "rfqs"

    id = Column(String, primary_key=True, default=gen_uuid)
    org_id = Column(String, ForeignKey("organisations.id"), nullable=False)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    requirement_id = Column(String, ForeignKey("requirements.id"), nullable=False)
    vendor_id = Column(String, ForeignKey("vendors.id"), nullable=False)
    status = Column(Enum(RFQStatus), default=RFQStatus.pending)
    deadline = Column(DateTime, nullable=True)
    sent_at = Column(DateTime, nullable=True)
    responded_at = Column(DateTime, nullable=True)
    reminder_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    requirement = relationship("Requirement", back_populates="rfqs")
    vendor = relationship("Vendor", back_populates="rfqs")
    quote_lines = relationship("QuoteLine", back_populates="rfq", cascade="all, delete-orphan")


class QuoteLine(Base):
    __tablename__ = "quote_lines"

    id = Column(String, primary_key=True, default=gen_uuid)
    rfq_id = Column(String, ForeignKey("rfqs.id"), nullable=False)
    line_item_id = Column(String, ForeignKey("line_items.id"), nullable=False)
    unit_price = Column(Float, nullable=True)
    lead_days = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    channel = Column(String(20), nullable=True)          # mail | sms | call | whatsapp
    response_notes = Column(Text, nullable=True)         # internal notes on how response was received
    created_at = Column(DateTime, default=datetime.utcnow)

    rfq = relationship("RFQ", back_populates="quote_lines")
    line_item = relationship("LineItem")


class Quotation(Base):
    __tablename__ = "quotations"

    id = Column(String, primary_key=True, default=gen_uuid)
    org_id = Column(String, ForeignKey("organisations.id"), nullable=False)
    requirement_id = Column(String, ForeignKey("requirements.id"), unique=True, nullable=False)
    reference = Column(String(50), unique=True, nullable=False)
    total_cost = Column(Float, nullable=True)
    margin_pct = Column(Float, default=18.0)
    customer_total = Column(Float, nullable=True)
    valid_until = Column(DateTime, nullable=True)
    status = Column(Enum(QuotationStatus), default=QuotationStatus.pending)
    approved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    line_breakdown = Column(JSON, default=list)  # [{line_item_id, description, qty, unit, vendor_id, vendor_name, rfq_id, unit_price, line_total}]

    requirement = relationship("Requirement", back_populates="quotation")
    purchase_order = relationship("PurchaseOrder", back_populates="quotation", uselist=False)
    vendor_pos = relationship("VendorPO", back_populates="quotation")


class VendorPO(Base):
    """Per-vendor purchase order — one per vendor who supplied prices in a quotation."""
    __tablename__ = "vendor_purchase_orders"

    id = Column(String, primary_key=True, default=gen_uuid)
    org_id = Column(String, ForeignKey("organisations.id"), nullable=False)
    quotation_id = Column(String, ForeignKey("quotations.id"), nullable=False)
    vendor_id = Column(String, ForeignKey("vendors.id"), nullable=False)
    vendor_name = Column(String(200), nullable=False)
    reference = Column(String(50), unique=True, nullable=False)
    status = Column(Enum(POStatus), default=POStatus.raised)
    amount = Column(Float, default=0.0)
    lines = Column(JSON, default=list)  # [{line_item_id, description, qty, unit, unit_price, line_total}]
    raised_at = Column(DateTime, default=datetime.utcnow)

    quotation = relationship("Quotation", back_populates="vendor_pos")
    vendor = relationship("Vendor")


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id = Column(String, primary_key=True, default=gen_uuid)
    org_id = Column(String, ForeignKey("organisations.id"), nullable=False)
    quotation_id = Column(String, ForeignKey("quotations.id"), unique=True, nullable=False)
    reference = Column(String(50), unique=True, nullable=False)
    status = Column(Enum(POStatus), default=POStatus.raised)
    payment_terms = Column(String(100), default="Net 30")
    raised_at = Column(DateTime, default=datetime.utcnow)

    quotation = relationship("Quotation", back_populates="purchase_order")
    invoice = relationship("Invoice", back_populates="purchase_order", uselist=False)


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(String, primary_key=True, default=gen_uuid)
    org_id = Column(String, ForeignKey("organisations.id"), nullable=False)
    purchase_order_id = Column(String, ForeignKey("purchase_orders.id"), unique=True, nullable=False)
    reference = Column(String(50), unique=True, nullable=False)
    amount = Column(Float, nullable=False)
    tax = Column(Float, default=0.0)
    status = Column(Enum(InvoiceStatus), default=InvoiceStatus.issued)
    issued_at = Column(DateTime, default=datetime.utcnow)
    due_at = Column(DateTime, nullable=True)
    paid_at = Column(DateTime, nullable=True)

    purchase_order = relationship("PurchaseOrder", back_populates="invoice")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String, primary_key=True, default=gen_uuid)
    org_id = Column(String, ForeignKey("organisations.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    project_id = Column(String, ForeignKey("projects.id"), nullable=True)
    type = Column(String(100), nullable=False)
    title = Column(String(300), nullable=False)
    body = Column(Text, nullable=True)
    entity_type = Column(String(100), nullable=True)
    entity_id = Column(String, nullable=True)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, default=gen_uuid)
    org_id = Column(String, ForeignKey("organisations.id"), nullable=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    action = Column(String(200), nullable=False)
    entity_type = Column(String(100), nullable=True)
    entity_id = Column(String, nullable=True)
    detail = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
