from datetime import datetime, timedelta
from typing import List, Optional
import random

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import (
    User, Organisation, Project, ProjectMember, Vendor,
    Requirement, LineItem, RFQ, QuoteLine, Quotation, VendorPO,
    PurchaseOrder, Invoice, Notification, RFQStatus,
    RequirementStatus, QuotationStatus, POStatus, InvoiceStatus
)
from app.schemas import (
    RegisterRequest, LoginRequest, TokenResponse, InviteRequest, AcceptInviteRequest,
    UserOut, OrgOut,
    ProjectCreate, ProjectUpdate, ProjectOut,
    VendorCreate, VendorUpdate, VendorOut,
    RequirementCreate, RequirementOut, LineItemCreate, LineItemOut,
    QuoteSubmitRequest, RFQOut,
    QuotationOut, VendorPOOut, PurchaseOrderOut, InvoiceOut,
    NotificationOut, UnreadCountOut, AnalyticsOverviewOut,
)
from app.services.auth_service import (
    register_user, login_user, create_access_token,
    get_current_user, require_org_admin,
    invite_user, accept_invitation,
)
from app.services.parser_service import parse_text_to_items


# ── Auth router ────────────────────────────────────────────────────

auth_router = APIRouter(prefix="/auth", tags=["auth"])

@auth_router.post("/register", response_model=TokenResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    user = register_user(payload.org_name, payload.email, payload.password, payload.full_name, db)
    return {"access_token": create_access_token(user.id)}

@auth_router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = login_user(payload.email, payload.password, db)
    return {"access_token": create_access_token(user.id)}

@auth_router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user

@auth_router.post("/invite", response_model=dict)
def invite(
    payload: InviteRequest,
    current_user: User = Depends(require_org_admin),
    db: Session = Depends(get_db),
):
    inv = invite_user(payload.email, payload.org_role, current_user, db)
    return {"token": inv.token, "expires_at": inv.expires_at.isoformat()}

@auth_router.post("/accept-invite", response_model=TokenResponse)
def accept_invite(payload: AcceptInviteRequest, db: Session = Depends(get_db)):
    user = accept_invitation(payload.token, payload.password, payload.full_name, db)
    return {"access_token": create_access_token(user.id)}


# ── Projects router ────────────────────────────────────────────────

projects_router = APIRouter(prefix="/projects", tags=["projects"])

@projects_router.post("/", response_model=ProjectOut)
def create_project(
    payload: ProjectCreate,
    current_user: User = Depends(require_org_admin),
    db: Session = Depends(get_db),
):
    project = Project(
        org_id=current_user.org_id,
        name=payload.name,
        description=payload.description,
        created_by=current_user.id,
    )
    db.add(project)
    db.flush()
    member = ProjectMember(project_id=project.id, user_id=current_user.id, project_role="buyer")
    db.add(member)
    db.commit()
    db.refresh(project)
    return project

@projects_router.get("/", response_model=List[ProjectOut])
def list_projects(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Org-admins see all; members see only their assigned projects
    from app.models import OrgRole
    if current_user.org_role in (OrgRole.org_admin, OrgRole.super_admin):
        return db.query(Project).filter(Project.org_id == current_user.org_id).all()
    pm_project_ids = [
        pm.project_id for pm in
        db.query(ProjectMember).filter(ProjectMember.user_id == current_user.id).all()
    ]
    return db.query(Project).filter(
        Project.org_id == current_user.org_id,
        Project.id.in_(pm_project_ids),
    ).all()

@projects_router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = db.query(Project).filter(Project.id == project_id, Project.org_id == current_user.org_id).first()
    if not p:
        raise HTTPException(404, "Project not found")
    return p

@projects_router.post("/{project_id}/members")
def add_member(
    project_id: str,
    user_id: str,
    project_role: str = "viewer",
    current_user: User = Depends(require_org_admin),
    db: Session = Depends(get_db),
):
    p = db.query(Project).filter(Project.id == project_id, Project.org_id == current_user.org_id).first()
    if not p:
        raise HTTPException(404, "Project not found")
    existing = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id, ProjectMember.user_id == user_id
    ).first()
    if existing:
        raise HTTPException(400, "User already a member")
    db.add(ProjectMember(project_id=project_id, user_id=user_id, project_role=project_role))
    db.commit()
    return {"status": "added"}

@projects_router.put("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: str,
    payload: ProjectUpdate,
    current_user: User = Depends(require_org_admin),
    db: Session = Depends(get_db),
):
    p = db.query(Project).filter(Project.id == project_id, Project.org_id == current_user.org_id).first()
    if not p:
        raise HTTPException(404, "Project not found")
    for k, val in payload.model_dump(exclude_unset=True).items():
        setattr(p, k, val)
    db.commit()
    db.refresh(p)
    return p

@projects_router.delete("/{project_id}/members/{user_id}")
def remove_member(
    project_id: str,
    user_id: str,
    current_user: User = Depends(require_org_admin),
    db: Session = Depends(get_db),
):
    p = db.query(Project).filter(Project.id == project_id, Project.org_id == current_user.org_id).first()
    if not p:
        raise HTTPException(404, "Project not found")
    pm = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id, ProjectMember.user_id == user_id
    ).first()
    if not pm:
        raise HTTPException(404, "Member not found")
    db.delete(pm)
    db.commit()
    return {"status": "removed"}


# ── Vendors router ─────────────────────────────────────────────────

vendors_router = APIRouter(prefix="/vendors", tags=["vendors"])

@vendors_router.get("/", response_model=List[VendorOut])
def list_vendors(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Vendor).filter(Vendor.org_id == current_user.org_id, Vendor.is_active == True).all()

@vendors_router.post("/", response_model=VendorOut)
def create_vendor(
    payload: VendorCreate,
    current_user: User = Depends(require_org_admin),
    db: Session = Depends(get_db),
):
    vendor = Vendor(org_id=current_user.org_id, **payload.model_dump())
    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    return vendor

@vendors_router.put("/{vendor_id}", response_model=VendorOut)
def update_vendor(
    vendor_id: str,
    payload: VendorUpdate,
    current_user: User = Depends(require_org_admin),
    db: Session = Depends(get_db),
):
    v = db.query(Vendor).filter(Vendor.id == vendor_id, Vendor.org_id == current_user.org_id).first()
    if not v:
        raise HTTPException(404, "Vendor not found")
    for k, val in payload.model_dump(exclude_unset=True).items():
        setattr(v, k, val)
    db.commit()
    db.refresh(v)
    return v


# ── Requirements router ────────────────────────────────────────────

requirements_router = APIRouter(prefix="/projects/{project_id}/requirements", tags=["requirements"])

def _get_project_or_404(project_id: str, org_id: str, db: Session) -> Project:
    p = db.query(Project).filter(Project.id == project_id, Project.org_id == org_id).first()
    if not p:
        raise HTTPException(404, "Project not found")
    return p

@requirements_router.post("/", response_model=RequirementOut)
def create_requirement(
    project_id: str,
    payload: RequirementCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_project_or_404(project_id, current_user.org_id, db)
    req = Requirement(
        org_id=current_user.org_id,
        project_id=project_id,
        created_by=current_user.id,
        title=payload.title,
        raw_text=payload.raw_text,
        delivery_date=payload.delivery_date,
    )
    db.add(req)
    db.flush()

    if payload.raw_text:
        items = parse_text_to_items(payload.raw_text)
        for item in items:
            db.add(LineItem(requirement_id=req.id, **item.model_dump()))

    db.commit()
    db.refresh(req)
    return req

@requirements_router.get("/", response_model=List[RequirementOut])
def list_requirements(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_project_or_404(project_id, current_user.org_id, db)
    return db.query(Requirement).filter(
        Requirement.project_id == project_id,
        Requirement.org_id == current_user.org_id,
    ).order_by(Requirement.created_at.desc()).all()

@requirements_router.get("/{req_id}", response_model=RequirementOut)
def get_requirement(
    project_id: str,
    req_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    req = db.query(Requirement).filter(
        Requirement.id == req_id, Requirement.org_id == current_user.org_id
    ).first()
    if not req:
        raise HTTPException(404, "Not found")
    return req

@requirements_router.put("/{req_id}/items", response_model=RequirementOut)
def update_line_items(
    project_id: str,
    req_id: str,
    items: List[LineItemCreate],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    req = db.query(Requirement).filter(
        Requirement.id == req_id, Requirement.org_id == current_user.org_id
    ).first()
    if not req:
        raise HTTPException(404, "Not found")
    db.query(LineItem).filter(LineItem.requirement_id == req_id).delete()
    for item in items:
        db.add(LineItem(requirement_id=req_id, **item.model_dump()))
    db.commit()
    db.refresh(req)
    return req

@requirements_router.post("/{req_id}/submit", response_model=RequirementOut)
def submit_requirement(
    project_id: str,
    req_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    req = db.query(Requirement).filter(
        Requirement.id == req_id, Requirement.org_id == current_user.org_id
    ).first()
    if not req:
        raise HTTPException(404, "Not found")
    req.status = RequirementStatus.submitted
    db.commit()
    db.refresh(req)
    return req


# ── RFQ router ─────────────────────────────────────────────────────

rfqs_router = APIRouter(prefix="/rfqs", tags=["rfqs"])

@rfqs_router.post("/send/{req_id}", response_model=List[RFQOut])
def send_rfqs(
    req_id: str,
    vendor_ids: List[str],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    req = db.query(Requirement).filter(
        Requirement.id == req_id, Requirement.org_id == current_user.org_id
    ).first()
    if not req:
        raise HTTPException(404, "Requirement not found")

    deadline = datetime.utcnow() + timedelta(days=7)
    rfqs = []
    for vid in vendor_ids:
        vendor = db.query(Vendor).filter(Vendor.id == vid, Vendor.org_id == current_user.org_id).first()
        if not vendor:
            continue
        rfq = RFQ(
            org_id=current_user.org_id,
            project_id=req.project_id,
            requirement_id=req_id,
            vendor_id=vid,
            status=RFQStatus.sent,
            deadline=deadline,
            sent_at=datetime.utcnow(),
        )
        db.add(rfq)
        rfqs.append(rfq)

    req.status = RequirementStatus.rfq_sent
    db.commit()
    for r in rfqs:
        db.refresh(r)
    return rfqs

@rfqs_router.get("/requirement/{req_id}", response_model=List[RFQOut])
def list_rfqs(
    req_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from sqlalchemy.orm import joinedload
    return (
        db.query(RFQ)
        .options(joinedload(RFQ.quote_lines), joinedload(RFQ.vendor))
        .filter(RFQ.requirement_id == req_id, RFQ.org_id == current_user.org_id)
        .all()
    )

@rfqs_router.post("/{rfq_id}/respond")
def respond_to_rfq(rfq_id: str, payload: QuoteSubmitRequest, db: Session = Depends(get_db)):
    """Public endpoint — vendor submits quote (no auth required)."""
    rfq = db.get(RFQ, rfq_id)
    if not rfq:
        raise HTTPException(404, "RFQ not found")
    # clear any existing lines for idempotency
    db.query(QuoteLine).filter(QuoteLine.rfq_id == rfq_id).delete()
    for line in payload.lines:
        ch = line.channel or payload.channel
        rn = line.response_notes or payload.response_notes
        db.add(QuoteLine(
            rfq_id=rfq_id,
            line_item_id=line.line_item_id,
            unit_price=line.unit_price,
            lead_days=line.lead_days,
            notes=line.notes,
            channel=ch,
            response_notes=rn,
        ))
    rfq.status = RFQStatus.responded
    rfq.responded_at = datetime.utcnow()
    db.commit()
    # Check if all RFQs responded → move requirement forward
    all_rfqs = db.query(RFQ).filter(RFQ.requirement_id == rfq.requirement_id).all()
    if all(r.status == RFQStatus.responded for r in all_rfqs):
        req = db.get(Requirement, rfq.requirement_id)
        if req:
            req.status = RequirementStatus.quotes_received
            db.commit()
    return {"status": "quote submitted"}


@rfqs_router.post("/{rfq_id}/respond-internal", response_model=dict)
def respond_to_rfq_internal(
    rfq_id: str,
    payload: QuoteSubmitRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Internal endpoint — buyer enters quotes received via mail/sms/call/whatsapp."""
    rfq = db.query(RFQ).filter(
        RFQ.id == rfq_id, RFQ.org_id == current_user.org_id
    ).first()
    if not rfq:
        raise HTTPException(404, "RFQ not found")
    db.query(QuoteLine).filter(QuoteLine.rfq_id == rfq_id).delete()
    for line in payload.lines:
        ch = line.channel or payload.channel
        rn = line.response_notes or payload.response_notes
        db.add(QuoteLine(
            rfq_id=rfq_id,
            line_item_id=line.line_item_id,
            unit_price=line.unit_price,
            lead_days=line.lead_days,
            notes=line.notes,
            channel=ch,
            response_notes=rn,
        ))
    rfq.status = RFQStatus.responded
    rfq.responded_at = datetime.utcnow()
    db.commit()
    all_rfqs = db.query(RFQ).filter(RFQ.requirement_id == rfq.requirement_id).all()
    if all(r.status == RFQStatus.responded for r in all_rfqs):
        req = db.get(Requirement, rfq.requirement_id)
        if req:
            req.status = RequirementStatus.quotes_received
            db.commit()
    return {"status": "quote submitted"}


# ── Quotations router ──────────────────────────────────────────────

quotes_router = APIRouter(prefix="/quotes", tags=["quotes"])

def _gen_ref(prefix: str) -> str:
    return f"{prefix}-{datetime.now().year}-{random.randint(1000, 9999)}"

@quotes_router.post("/build/{req_id}", response_model=QuotationOut)
def build_quotation(
    req_id: str,
    margin_pct: float = 18.0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    req = db.query(Requirement).filter(
        Requirement.id == req_id, Requirement.org_id == current_user.org_id
    ).first()
    if not req:
        raise HTTPException(404, "Not found")

    # Include ALL RFQs — responded AND manually entered (any status with quote_lines)
    from sqlalchemy.orm import joinedload as _jl
    rfqs = (
        db.query(RFQ)
        .options(_jl(RFQ.quote_lines), _jl(RFQ.vendor))
        .filter(RFQ.requirement_id == req_id, RFQ.org_id == current_user.org_id)
        .all()
    )
    rfqs_with_quotes = [
        r for r in rfqs if any(ql.unit_price is not None for ql in r.quote_lines)
    ]
    if not rfqs_with_quotes:
        raise HTTPException(400, "No vendor quotes available yet")

    items = db.query(LineItem).filter(LineItem.requirement_id == req_id).all()
    total_cost = 0.0
    line_breakdown = []
    for item in items:
        best_price = None
        best_unit_price = None
        best_vendor = None
        best_rfq_id = None
        for rfq in rfqs_with_quotes:
            for ql in rfq.quote_lines:
                if ql.line_item_id == item.id and ql.unit_price is not None:
                    price = ql.unit_price * (item.quantity or 1)
                    if best_price is None or price < best_price:
                        best_price = price
                        best_unit_price = ql.unit_price
                        best_vendor = rfq.vendor
                        best_rfq_id = rfq.id
        if best_price is not None:
            total_cost += best_price
            line_breakdown.append({
                "line_item_id": item.id,
                "description": item.description,
                "qty": item.quantity or 1,
                "unit": item.unit,
                "vendor_id": best_vendor.id,
                "vendor_name": best_vendor.name,
                "rfq_id": best_rfq_id,
                "unit_price": best_unit_price,
                "line_total": round(best_price, 2),
            })
        else:
            line_breakdown.append({
                "line_item_id": item.id,
                "description": item.description,
                "qty": item.quantity or 1,
                "unit": item.unit,
                "vendor_id": None,
                "vendor_name": "—",
                "rfq_id": None,
                "unit_price": None,
                "line_total": None,
            })

    customer_total = round(total_cost * (1 + margin_pct / 100), 2)

    # Upsert: update existing quotation if one already exists for this requirement
    quotation = db.query(Quotation).filter(
        Quotation.requirement_id == req_id, Quotation.org_id == current_user.org_id
    ).first()
    if quotation:
        quotation.total_cost = round(total_cost, 2)
        quotation.margin_pct = margin_pct
        quotation.customer_total = customer_total
        quotation.valid_until = datetime.utcnow() + timedelta(days=20)
        quotation.status = "pending"
        quotation.line_breakdown = line_breakdown
    else:
        quotation = Quotation(
            org_id=current_user.org_id,
            requirement_id=req_id,
            reference=_gen_ref("QT"),
            total_cost=round(total_cost, 2),
            margin_pct=margin_pct,
            customer_total=customer_total,
            valid_until=datetime.utcnow() + timedelta(days=20),
            line_breakdown=line_breakdown,
        )
        db.add(quotation)

    req.status = RequirementStatus.quote_ready
    db.commit()
    db.refresh(quotation)
    return quotation

@quotes_router.post("/{quote_id}/approve", response_model=QuotationOut)
def approve_quotation(
    quote_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Quotation).filter(
        Quotation.id == quote_id, Quotation.org_id == current_user.org_id
    ).first()
    if not q:
        raise HTTPException(404, "Not found")
    q.status = QuotationStatus.approved
    q.approved_at = datetime.utcnow()
    req = db.get(Requirement, q.requirement_id)
    if req:
        req.status = RequirementStatus.approved
    db.commit()
    db.refresh(q)
    return q

@quotes_router.post("/{quote_id}/po", response_model=PurchaseOrderOut)
def raise_po(
    quote_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Quotation).filter(
        Quotation.id == quote_id, Quotation.org_id == current_user.org_id
    ).first()
    if not q:
        raise HTTPException(404, "Not found")
    if q.status != QuotationStatus.approved:
        raise HTTPException(400, "Quotation must be approved first")

    # Master PO (upsert)
    po = db.query(PurchaseOrder).filter(PurchaseOrder.quotation_id == quote_id).first()
    if not po:
        po = PurchaseOrder(
            org_id=current_user.org_id,
            quotation_id=quote_id,
            reference=_gen_ref("PO"),
        )
        db.add(po)

    # Per-vendor POs from line_breakdown
    breakdown = q.line_breakdown or []
    vendor_groups: dict = {}
    for line in breakdown:
        vid = line.get("vendor_id")
        if not vid:
            continue
        if vid not in vendor_groups:
            vendor_groups[vid] = {
                "vendor_id": vid,
                "vendor_name": line.get("vendor_name", "—"),
                "lines": [],
                "amount": 0.0,
            }
        vendor_groups[vid]["lines"].append(line)
        vendor_groups[vid]["amount"] += line.get("line_total") or 0.0

    # Delete any existing VendorPOs for idempotency, then recreate
    db.query(VendorPO).filter(VendorPO.quotation_id == quote_id).delete()
    for vdata in vendor_groups.values():
        vpo = VendorPO(
            org_id=current_user.org_id,
            quotation_id=quote_id,
            vendor_id=vdata["vendor_id"],
            vendor_name=vdata["vendor_name"],
            reference=_gen_ref("VPO"),
            amount=round(vdata["amount"], 2),
            lines=vdata["lines"],
        )
        db.add(vpo)

    req = db.get(Requirement, q.requirement_id)
    if req:
        req.status = RequirementStatus.po_raised
    db.commit()
    db.refresh(po)
    return po

@quotes_router.get("/{quote_id}/vendor-pos", response_model=List[VendorPOOut])
def list_vendor_pos(
    quote_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Quotation).filter(
        Quotation.id == quote_id, Quotation.org_id == current_user.org_id
    ).first()
    if not q:
        raise HTTPException(404, "Not found")
    return db.query(VendorPO).filter(VendorPO.quotation_id == quote_id).all()

@quotes_router.post("/po/{po_id}/invoice", response_model=InvoiceOut)
def raise_invoice(
    po_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    po = db.query(PurchaseOrder).filter(
        PurchaseOrder.id == po_id, PurchaseOrder.org_id == current_user.org_id
    ).first()
    if not po:
        raise HTTPException(404, "Not found")
    q = db.get(Quotation, po.quotation_id)
    invoice = Invoice(
        org_id=current_user.org_id,
        purchase_order_id=po_id,
        reference=_gen_ref("INV"),
        amount=q.customer_total,
        due_at=datetime.utcnow() + timedelta(days=30),
    )
    db.add(invoice)
    req = db.get(Requirement, q.requirement_id)
    if req:
        req.status = RequirementStatus.invoiced
    db.commit()
    db.refresh(invoice)
    return invoice

@quotes_router.post("/invoice/{inv_id}/pay", response_model=InvoiceOut)
def mark_paid(
    inv_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    inv = db.query(Invoice).filter(
        Invoice.id == inv_id, Invoice.org_id == current_user.org_id
    ).first()
    if not inv:
        raise HTTPException(404, "Not found")
    inv.status = InvoiceStatus.paid
    inv.paid_at = datetime.utcnow()
    db.commit()
    db.refresh(inv)
    return inv

@quotes_router.get("/invoice/{inv_id}/export")
def export_invoice(
    inv_id: str,
    fmt: str = Query("json", pattern="^(json|csv|xml)$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    inv = db.query(Invoice).filter(
        Invoice.id == inv_id, Invoice.org_id == current_user.org_id
    ).first()
    if not inv:
        raise HTTPException(404, "Not found")
    po = inv.purchase_order
    q = po.quotation
    req = q.requirement
    data = {
        "invoice": inv.reference,
        "po_ref": po.reference,
        "issued": inv.issued_at.isoformat(),
        "due": inv.due_at.isoformat() if inv.due_at else None,
        "amount": inv.amount,
        "tax": inv.tax,
        "total": inv.amount + inv.tax,
        "project": req.title,
        "org_id": inv.org_id,
    }
    if fmt == "csv":
        rows = ["field,value"] + [f"{k},{v}" for k, v in data.items()]
        return {"format": "csv", "content": "\n".join(rows)}
    elif fmt == "xml":
        xml = "<Invoice>\n" + "\n".join(f"  <{k}>{v}</{k}>" for k, v in data.items()) + "\n</Invoice>"
        return {"format": "xml", "content": xml}
    return {"format": "json", "content": data}


# ── Notifications router ───────────────────────────────────────────

notifications_router = APIRouter(prefix="/notifications", tags=["notifications"])

@notifications_router.get("/", response_model=List[NotificationOut])
def list_notifications(
    unread_only: bool = False,
    page: int = 1,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.org_id == current_user.org_id,
    )
    if unread_only:
        q = q.filter(Notification.is_read == False)
    return q.order_by(Notification.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

@notifications_router.get("/count", response_model=UnreadCountOut)
def unread_count(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    count = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False,
    ).count()
    return {"unread": count}

@notifications_router.put("/{notif_id}/read")
def mark_read(
    notif_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    n = db.query(Notification).filter(
        Notification.id == notif_id, Notification.user_id == current_user.id
    ).first()
    if n:
        n.is_read = True
        db.commit()
    return {"status": "ok"}

@notifications_router.put("/read-all")
def mark_all_read(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(Notification).filter(
        Notification.user_id == current_user.id, Notification.is_read == False
    ).update({"is_read": True})
    db.commit()
    return {"status": "ok"}


# ── Analytics router ───────────────────────────────────────────────

analytics_router = APIRouter(prefix="/analytics", tags=["analytics"])

@analytics_router.get("/overview", response_model=AnalyticsOverviewOut)
def analytics_overview(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    org_id = current_user.org_id
    total_reqs = db.query(Requirement).filter(Requirement.org_id == org_id).count()
    active_projects = db.query(Project).filter(Project.org_id == org_id, Project.status == "active").count()
    po_value = db.query(func.sum(Invoice.amount)).join(
        PurchaseOrder, Invoice.purchase_order_id == PurchaseOrder.id
    ).filter(PurchaseOrder.org_id == org_id).scalar() or 0.0
    open_rfqs = db.query(RFQ).filter(RFQ.org_id == org_id, RFQ.status == RFQStatus.sent).count()
    overdue = db.query(Invoice).filter(
        Invoice.org_id == org_id,
        Invoice.status == InvoiceStatus.issued,
        Invoice.due_at < datetime.utcnow(),
    ).count()
    return {
        "total_requirements": total_reqs,
        "active_projects": active_projects,
        "total_po_value": round(po_value, 2),
        "open_rfqs": open_rfqs,
        "overdue_invoices": overdue,
        "avg_cycle_days": 0.0,
    }


# ── Health router ──────────────────────────────────────────────────

health_router = APIRouter(prefix="/health", tags=["system"])

@health_router.get("")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(__import__("sqlalchemy").text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    return {
        "status": "ok" if db_ok else "degraded",
        "db": "ok" if db_ok else "fail",
        "version": "2.0.0",
    }
