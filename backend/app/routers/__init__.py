from datetime import datetime, timedelta
from typing import List, Optional
import random
import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import (
    User, Organisation, Project, ProjectMember, Vendor,
    Requirement, LineItem, RFQ, QuoteLine, Quotation, VendorPO,
    PurchaseOrder, Invoice, Notification, AuditLog,
    Customer, CustomerQuotation, CustomerInvoice, PasswordResetToken,
    RFQStatus, RequirementStatus, QuotationStatus, POStatus, InvoiceStatus
)
from app.schemas import (
    RegisterRequest, LoginRequest, TokenResponse, InviteRequest, AcceptInviteRequest,
    UserOut, OrgOut,
    ProjectCreate, ProjectUpdate, ProjectOut,
    VendorCreate, VendorUpdate, VendorOut,
    RequirementCreate, RequirementOut, LineItemCreate, LineItemOut,
    QuoteSubmitRequest, RFQOut,
    QuotationOut, VendorPOOut, PurchaseOrderOut, PurchaseOrderDetailOut, InvoiceOut,
    NotificationOut, UnreadCountOut, AnalyticsOverviewOut,
    CustomerCreate, CustomerUpdate, CustomerOut,
    CustomerQuotationUpsert, CustomerQuotationOut,
    CustomerInvoiceUpsert, CustomerInvoiceOut,
    PasswordChangeRequest, ForgotPasswordRequest, ResetPasswordRequest,
    FileUploadOut,
)
from app.services.auth_service import (
    register_user, login_user, create_access_token,
    get_current_user, require_org_admin,
    invite_user, accept_invitation,
    hash_password, verify_password,
)

log = logging.getLogger(__name__)


# ── Helpers ────────────────────────────────────────────────────────

def _notify(db: Session, *, org_id: str, user_id: str, project_id: Optional[str],
            type: str, title: str, body: str = "", entity_type: str = "", entity_id: str = ""):
    """Insert a notification row. Swallow errors so primary request is never blocked."""
    try:
        db.add(Notification(
            org_id=org_id, user_id=user_id, project_id=project_id,
            type=type, title=title, body=body,
            entity_type=entity_type, entity_id=entity_id,
        ))
    except Exception as exc:
        log.warning("_notify failed: %s", exc)


def _audit(db: Session, *, org_id: str, user_id: str, action: str,
           entity_type: str = "", entity_id: str = "", detail: dict = {}):
    """Append an audit log entry. Swallow errors."""
    try:
        db.add(AuditLog(
            org_id=org_id, user_id=user_id, action=action,
            entity_type=entity_type, entity_id=entity_id, detail=detail,
        ))
    except Exception as exc:
        log.warning("_audit failed: %s", exc)


from app.services.parser_service import parse_text_to_items  # noqa: E402


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


@auth_router.post("/change-password")
def change_password(
    payload: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(400, "Current password is incorrect")
    current_user.hashed_password = hash_password(payload.new_password)
    _audit(db, org_id=current_user.org_id, user_id=current_user.id,
           action="password_changed", entity_type="user", entity_id=current_user.id)
    db.commit()
    return {"status": "password updated"}


@auth_router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if user:
        token = str(uuid.uuid4())
        db.add(PasswordResetToken(
            user_id=user.id,
            token=token,
            expires_at=datetime.utcnow() + timedelta(hours=2),
        ))
        db.commit()
        # In production wire to send_email_task; for dev just return the token
        from app.worker import send_email_task
        try:
            send_email_task.delay(
                user.email,
                "ProcureLink — Reset your password",
                f"<p>Your password reset token: <b>{token}</b></p><p>Expires in 2 hours.</p>",
            )
        except Exception:
            pass
    # Always return 200 to avoid email enumeration
    return {"status": "If that email exists, a reset link has been sent"}


@auth_router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    prt = db.query(PasswordResetToken).filter(
        PasswordResetToken.token == payload.token,
        PasswordResetToken.used_at.is_(None),
        PasswordResetToken.expires_at > datetime.utcnow(),
    ).first()
    if not prt:
        raise HTTPException(400, "Invalid or expired reset token")
    user = db.get(User, prt.user_id)
    if not user:
        raise HTTPException(400, "User not found")
    user.hashed_password = hash_password(payload.new_password)
    prt.used_at = datetime.utcnow()
    db.commit()
    return {"status": "password reset successful"}


@auth_router.post("/refresh", response_model=TokenResponse)
def refresh_token(current_user: User = Depends(get_current_user)):
    """Issue a fresh token for the authenticated user (sliding session)."""
    return {"access_token": create_access_token(current_user.id)}


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


@requirements_router.post("/{req_id}/upload", response_model=FileUploadOut)
async def upload_requirement_file(
    project_id: str,
    req_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload an attachment to a requirement (stored in MinIO)."""
    req = db.query(Requirement).filter(
        Requirement.id == req_id, Requirement.org_id == current_user.org_id
    ).first()
    if not req:
        raise HTTPException(404, "Requirement not found")

    from app.config import settings
    import boto3
    from botocore.exceptions import BotoCoreError, ClientError

    object_name = f"requirements/{req_id}/{file.filename}"
    try:
        s3 = boto3.client(
            "s3",
            endpoint_url=f"http{'s' if settings.minio_secure else ''}://{settings.minio_endpoint}",
            aws_access_key_id=settings.minio_access_key,
            aws_secret_access_key=settings.minio_secret_key,
        )
        # Ensure bucket exists
        try:
            s3.head_bucket(Bucket=settings.minio_bucket)
        except ClientError:
            s3.create_bucket(Bucket=settings.minio_bucket)

        content = await file.read()
        s3.put_object(
            Bucket=settings.minio_bucket,
            Key=object_name,
            Body=content,
            ContentType=file.content_type or "application/octet-stream",
        )
        url = f"http{'s' if settings.minio_secure else ''}://{settings.minio_endpoint}/{settings.minio_bucket}/{object_name}"
    except (BotoCoreError, ClientError, Exception) as exc:
        log.warning("MinIO upload failed: %s", exc)
        # Fallback: store locally under /tmp for dev
        import os
        os.makedirs(f"/tmp/uploads/requirements/{req_id}", exist_ok=True)
        local_path = f"/tmp/uploads/requirements/{req_id}/{file.filename}"
        content = await file.read() if not content else content
        with open(local_path, "wb") as f_out:
            f_out.write(content)
        url = f"/uploads/requirements/{req_id}/{file.filename}"
        object_name = local_path

    req.file_path = object_name
    db.commit()
    return {"file_path": object_name, "url": url}


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
        rfqs.append((rfq, vendor))

    req.status = RequirementStatus.rfq_sent
    db.flush()

    for rfq, vendor in rfqs:
        db.refresh(rfq)
        _notify(db, org_id=current_user.org_id, user_id=current_user.id,
                project_id=req.project_id, type="rfq_sent",
                title=f"RFQ sent to {vendor.name}",
                body=f"RFQ for '{req.title}' sent to {vendor.name}. Deadline: {deadline.strftime('%Y-%m-%d')}",
                entity_type="rfq", entity_id=rfq.id)
        _audit(db, org_id=current_user.org_id, user_id=current_user.id,
               action="rfq_sent", entity_type="rfq", entity_id=rfq.id,
               detail={"vendor": vendor.name, "requirement": req.title})
        # Fire email to vendor
        from app.worker import send_email_task
        try:
            send_email_task.delay(
                vendor.email,
                f"Request for Quotation — {req.title}",
                f"""<p>Dear {vendor.name},</p>
                <p>You have received a new Request for Quotation for: <b>{req.title}</b>.</p>
                <p>Please respond by <b>{deadline.strftime('%d %b %Y')}</b>.</p>
                <p>Reference RFQ ID: {rfq.id}</p>""",
            )
        except Exception as exc:
            log.warning("RFQ email failed for vendor %s: %s", vendor.email, exc)

    db.commit()
    return [rfq for rfq, _ in rfqs]

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
            # Notify all org admins
            org_admins = db.query(User).filter(
                User.org_id == rfq.org_id,
                User.org_role.in_(["org-admin", "super-admin"]),
                User.is_active == True,
            ).all()
            for admin in org_admins:
                _notify(db, org_id=rfq.org_id, user_id=admin.id,
                        project_id=rfq.project_id, type="quotes_received",
                        title="All vendor quotes received",
                        body=f"All RFQs for '{req.title}' have been responded to. Ready to build quotation.",
                        entity_type="requirement", entity_id=req.id)
            db.commit()
    return {"status": "quote submitted"}
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
    _notify(db, org_id=current_user.org_id, user_id=current_user.id,
            project_id=req.project_id if req else None, type="quotation_approved",
            title=f"Quotation {q.reference} approved",
            body=f"Customer total: {q.customer_total}. Ready to raise PO.",
            entity_type="quotation", entity_id=q.id)
    _audit(db, org_id=current_user.org_id, user_id=current_user.id,
           action="quotation_approved", entity_type="quotation", entity_id=q.id,
           detail={"reference": q.reference, "customer_total": q.customer_total})
    db.commit()
    db.refresh(q)
    return q

@quotes_router.get("/pos", response_model=List[PurchaseOrderDetailOut])
def list_pos(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all purchase orders for the current org."""
    pos = (
        db.query(PurchaseOrder)
        .filter(PurchaseOrder.org_id == current_user.org_id)
        .order_by(PurchaseOrder.raised_at.desc())
        .all()
    )
    result = []
    for po in pos:
        q = db.get(Quotation, po.quotation_id)
        vendor_pos = db.query(VendorPO).filter(VendorPO.quotation_id == po.quotation_id).all()
        result.append(PurchaseOrderDetailOut(
            id=po.id,
            reference=po.reference,
            status=po.status.value if hasattr(po.status, 'value') else str(po.status),
            payment_terms=po.payment_terms,
            raised_at=po.raised_at,
            quotation_id=po.quotation_id,
            quotation_ref=q.reference if q else "—",
            total_amount=round(sum(vpo.amount for vpo in vendor_pos), 2),
            vendor_count=len(vendor_pos),
            pdf_url=po.pdf_url,
        ))
    return result

@quotes_router.get("/{quote_id}/po", response_model=PurchaseOrderDetailOut)
def get_po_for_quote(
    quote_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the master PO for a specific quotation."""
    po = db.query(PurchaseOrder).filter(
        PurchaseOrder.quotation_id == quote_id,
        PurchaseOrder.org_id == current_user.org_id,
    ).first()
    if not po:
        raise HTTPException(404, "No PO for this quotation")
    q = db.get(Quotation, po.quotation_id)
    vendor_pos = db.query(VendorPO).filter(VendorPO.quotation_id == quote_id).all()
    return PurchaseOrderDetailOut(
        id=po.id,
        reference=po.reference,
        status=po.status.value if hasattr(po.status, 'value') else str(po.status),
        payment_terms=po.payment_terms,
        raised_at=po.raised_at,
        quotation_id=po.quotation_id,
        quotation_ref=q.reference if q else "—",
        total_amount=round(sum(vpo.amount for vpo in vendor_pos), 2),
        vendor_count=len(vendor_pos),
        pdf_url=po.pdf_url,
    )

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
    _notify(db, org_id=current_user.org_id, user_id=current_user.id,
            project_id=req.project_id if req else None, type="po_raised",
            title=f"PO {po.reference} raised",
            body=f"{len(vendor_groups)} vendor PO(s) created.",
            entity_type="purchase_order", entity_id=po.id)
    _audit(db, org_id=current_user.org_id, user_id=current_user.id,
           action="po_raised", entity_type="purchase_order", entity_id=po.id,
           detail={"reference": po.reference, "vendor_count": len(vendor_groups)})
    db.commit()
    db.refresh(po)
    # Enqueue PO PDF generation
    try:
        from app.worker import generate_pdf_task
        generate_pdf_task.delay("po", po.id, current_user.org_id)
    except Exception:
        pass
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
    _notify(db, org_id=current_user.org_id, user_id=current_user.id,
            project_id=req.project_id if req else None, type="invoice_raised",
            title=f"Invoice {invoice.reference} issued",
            body=f"Amount: {invoice.amount}. Due in 30 days.",
            entity_type="invoice", entity_id=invoice.id)
    _audit(db, org_id=current_user.org_id, user_id=current_user.id,
           action="invoice_raised", entity_type="invoice", entity_id=invoice.id,
           detail={"reference": invoice.reference, "amount": invoice.amount})
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
    _audit(db, org_id=current_user.org_id, user_id=current_user.id,
           action="invoice_paid", entity_type="invoice", entity_id=inv.id,
           detail={"reference": inv.reference, "amount": inv.amount})
    _notify(db, org_id=current_user.org_id, user_id=current_user.id,
            project_id=None, type="invoice_paid",
            title=f"Invoice {inv.reference} marked paid",
            body=f"Amount: {inv.amount} collected.",
            entity_type="invoice", entity_id=inv.id)
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

    # Compute avg cycle days: creation → po_raised for completed requirements
    completed_reqs = db.query(Requirement).filter(
        Requirement.org_id == org_id,
        Requirement.status.in_(["po_raised", "invoiced", "completed"]),
    ).all()
    cycle_days = 0.0
    if completed_reqs:
        total_days = 0.0
        counted = 0
        for r in completed_reqs:
            po = (
                db.query(PurchaseOrder)
                .join(Quotation, PurchaseOrder.quotation_id == Quotation.id)
                .filter(Quotation.requirement_id == r.id)
                .first()
            )
            if po and r.created_at:
                delta = (po.raised_at - r.created_at).total_seconds() / 86400
                if delta >= 0:
                    total_days += delta
                    counted += 1
        if counted:
            cycle_days = round(total_days / counted, 1)

    return {
        "total_requirements": total_reqs,
        "active_projects": active_projects,
        "total_po_value": round(po_value, 2),
        "open_rfqs": open_rfqs,
        "overdue_invoices": overdue,
        "avg_cycle_days": cycle_days,
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


# ── Customers router ───────────────────────────────────────────────

customers_router = APIRouter(prefix="/customers", tags=["customers"])

@customers_router.get("/", response_model=List[CustomerOut])
def list_customers(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Customer).filter(Customer.org_id == current_user.org_id).order_by(Customer.company).all()

@customers_router.post("/", response_model=CustomerOut)
def create_customer(
    payload: CustomerCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    customer = Customer(org_id=current_user.org_id, **payload.model_dump())
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer

@customers_router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(
    customer_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = db.query(Customer).filter(Customer.id == customer_id, Customer.org_id == current_user.org_id).first()
    if not c:
        raise HTTPException(404, "Customer not found")
    return c

@customers_router.put("/{customer_id}", response_model=CustomerOut)
def update_customer(
    customer_id: str,
    payload: CustomerUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = db.query(Customer).filter(Customer.id == customer_id, Customer.org_id == current_user.org_id).first()
    if not c:
        raise HTTPException(404, "Customer not found")
    for k, val in payload.model_dump(exclude_unset=True).items():
        setattr(c, k, val)
    db.commit()
    db.refresh(c)
    return c

@customers_router.delete("/{customer_id}")
def delete_customer(
    customer_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = db.query(Customer).filter(Customer.id == customer_id, Customer.org_id == current_user.org_id).first()
    if not c:
        raise HTTPException(404, "Customer not found")
    db.delete(c)
    db.commit()
    return {"status": "deleted"}


@customers_router.post("/{customer_id}/logo")
async def upload_customer_logo(
    customer_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a logo for a customer, store in MinIO, persist the URL."""
    import mimetypes
    from app.config import settings as cfg

    c = db.query(Customer).filter(
        Customer.id == customer_id, Customer.org_id == current_user.org_id
    ).first()
    if not c:
        raise HTTPException(404, "Customer not found")

    content = await file.read()
    fname = file.filename or "logo.png"
    ext = fname.rsplit(".", 1)[-1].lower()
    safe_ext = ext if ext in {"png", "jpg", "jpeg", "gif", "webp", "svg"} else "png"
    object_key = f"logos/customers/{customer_id}.{safe_ext}"
    content_type = file.content_type or mimetypes.guess_type(fname)[0] or "image/png"

    try:
        import boto3
        s3 = boto3.client(
            "s3",
            endpoint_url=f"http{'s' if cfg.minio_secure else ''}://{cfg.minio_endpoint}",
            aws_access_key_id=cfg.minio_access_key,
            aws_secret_access_key=cfg.minio_secret_key,
        )
        try:
            s3.head_bucket(Bucket=cfg.minio_bucket)
        except Exception:
            s3.create_bucket(Bucket=cfg.minio_bucket)
        s3.put_object(
            Bucket=cfg.minio_bucket,
            Key=object_key,
            Body=content,
            ContentType=content_type,
        )
        url = f"{cfg.minio_public_url.rstrip('/')}/{cfg.minio_bucket}/{object_key}"
        c.logo_url = url
        db.commit()
        return {"url": url}
    except Exception as exc:
        log.warning("MinIO customer logo upload failed: %s", exc)
        raise HTTPException(status_code=503, detail="Storage unavailable")


# ── Customer Quotations router (sales-side) ────────────────────────

cquotes_router = APIRouter(prefix="/cquotes", tags=["customer-quotations"])

@cquotes_router.get("/", response_model=List[CustomerQuotationOut])
def list_cquotes(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(CustomerQuotation)
        .filter(CustomerQuotation.org_id == current_user.org_id)
        .order_by(CustomerQuotation.created_at.desc())
        .all()
    )

@cquotes_router.post("/", response_model=CustomerQuotationOut)
def create_cquote(
    payload: CustomerQuotationUpsert,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cq = CustomerQuotation(org_id=current_user.org_id, **payload.model_dump())
    db.add(cq)
    db.commit()
    db.refresh(cq)
    # Enqueue PDF generation (fire and forget)
    try:
        from app.worker import generate_pdf_task
        generate_pdf_task.delay("quotation", cq.id, cq.org_id)
    except Exception:
        pass
    return cq

@cquotes_router.get("/{cq_id}/pdf")
def get_cquote_pdf(
    cq_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns the MinIO download URL for the quotation PDF. Triggers generation if not yet available."""
    cq = db.query(CustomerQuotation).filter(
        CustomerQuotation.id == cq_id, CustomerQuotation.org_id == current_user.org_id
    ).first()
    if not cq:
        raise HTTPException(404, "Not found")
    if not cq.pdf_url:
        try:
            from app.worker import generate_pdf_task
            generate_pdf_task.delay("quotation", cq.id, cq.org_id)
        except Exception:
            pass
        raise HTTPException(202, "PDF generation enqueued — please retry in a moment")
    return {"pdf_url": cq.pdf_url}

@cquotes_router.get("/{cq_id}", response_model=CustomerQuotationOut)
def get_cquote(
    cq_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cq = db.query(CustomerQuotation).filter(
        CustomerQuotation.id == cq_id, CustomerQuotation.org_id == current_user.org_id
    ).first()
    if not cq:
        raise HTTPException(404, "Not found")
    return cq

@cquotes_router.put("/{cq_id}", response_model=CustomerQuotationOut)
def update_cquote(
    cq_id: str,
    payload: CustomerQuotationUpsert,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cq = db.query(CustomerQuotation).filter(
        CustomerQuotation.id == cq_id, CustomerQuotation.org_id == current_user.org_id
    ).first()
    if not cq:
        raise HTTPException(404, "Not found")
    for k, val in payload.model_dump(exclude_unset=True).items():
        setattr(cq, k, val)
    cq.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(cq)
    # Re-generate PDF with updated content
    try:
        from app.worker import generate_pdf_task
        generate_pdf_task.delay("quotation", cq.id, cq.org_id)
    except Exception:
        pass
    return cq

@cquotes_router.delete("/{cq_id}")
def delete_cquote(
    cq_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cq = db.query(CustomerQuotation).filter(
        CustomerQuotation.id == cq_id, CustomerQuotation.org_id == current_user.org_id
    ).first()
    if not cq:
        raise HTTPException(404, "Not found")
    db.delete(cq)
    db.commit()
    return {"status": "deleted"}


# ── Customer Invoices router (sales-side) ──────────────────────────

cinvoices_router = APIRouter(prefix="/cinvoices", tags=["customer-invoices"])

@cinvoices_router.get("/", response_model=List[CustomerInvoiceOut])
def list_cinvoices(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(CustomerInvoice)
        .filter(CustomerInvoice.org_id == current_user.org_id)
        .order_by(CustomerInvoice.created_at.desc())
        .all()
    )

@cinvoices_router.post("/", response_model=CustomerInvoiceOut)
def create_cinvoice(
    payload: CustomerInvoiceUpsert,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ci = CustomerInvoice(org_id=current_user.org_id, **payload.model_dump())
    db.add(ci)
    db.commit()
    db.refresh(ci)
    try:
        from app.worker import generate_pdf_task
        generate_pdf_task.delay("invoice", ci.id, ci.org_id)
    except Exception:
        pass
    return ci

@cinvoices_router.get("/{ci_id}/pdf")
def get_cinvoice_pdf(
    ci_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns the MinIO download URL for the invoice PDF."""
    ci = db.query(CustomerInvoice).filter(
        CustomerInvoice.id == ci_id, CustomerInvoice.org_id == current_user.org_id
    ).first()
    if not ci:
        raise HTTPException(404, "Not found")
    if not ci.pdf_url:
        try:
            from app.worker import generate_pdf_task
            generate_pdf_task.delay("invoice", ci.id, ci.org_id)
        except Exception:
            pass
        raise HTTPException(202, "PDF generation enqueued — please retry in a moment")
    return {"pdf_url": ci.pdf_url}

@cinvoices_router.get("/{ci_id}", response_model=CustomerInvoiceOut)
def get_cinvoice(
    ci_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ci = db.query(CustomerInvoice).filter(
        CustomerInvoice.id == ci_id, CustomerInvoice.org_id == current_user.org_id
    ).first()
    if not ci:
        raise HTTPException(404, "Not found")
    return ci

@cinvoices_router.put("/{ci_id}", response_model=CustomerInvoiceOut)
def update_cinvoice(
    ci_id: str,
    payload: CustomerInvoiceUpsert,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ci = db.query(CustomerInvoice).filter(
        CustomerInvoice.id == ci_id, CustomerInvoice.org_id == current_user.org_id
    ).first()
    if not ci:
        raise HTTPException(404, "Not found")
    for k, val in payload.model_dump(exclude_unset=True).items():
        setattr(ci, k, val)
    ci.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(ci)
    try:
        from app.worker import generate_pdf_task
        generate_pdf_task.delay("invoice", ci.id, ci.org_id)
    except Exception:
        pass
    return ci

@cinvoices_router.delete("/{ci_id}")
def delete_cinvoice(
    ci_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ci = db.query(CustomerInvoice).filter(
        CustomerInvoice.id == ci_id, CustomerInvoice.org_id == current_user.org_id
    ).first()
    if not ci:
        raise HTTPException(404, "Not found")
    db.delete(ci)
    db.commit()
    return {"status": "deleted"}


# ── Logo upload router ─────────────────────────────────────────────
logos_router = APIRouter(prefix="/logos", tags=["logos"])

_ALLOWED_LOGO_EXTS = {"png", "jpg", "jpeg", "gif", "webp", "svg"}

@logos_router.post("/upload")
async def upload_logo(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Upload a logo image to MinIO and return the public URL.
    Returns 503 if storage is unavailable so the frontend can fall back to base64."""
    import mimetypes
    from app.config import settings as cfg

    content = await file.read()
    fname = file.filename or "logo.png"
    ext = fname.rsplit(".", 1)[-1].lower()
    safe_ext = ext if ext in _ALLOWED_LOGO_EXTS else "png"
    object_key = f"logos/{current_user.org_id}/{uuid.uuid4()}.{safe_ext}"
    content_type = (
        file.content_type
        or mimetypes.guess_type(fname)[0]
        or "image/png"
    )

    try:
        import boto3
        s3 = boto3.client(
            "s3",
            endpoint_url=f"http{'s' if cfg.minio_secure else ''}://{cfg.minio_endpoint}",
            aws_access_key_id=cfg.minio_access_key,
            aws_secret_access_key=cfg.minio_secret_key,
        )
        try:
            s3.head_bucket(Bucket=cfg.minio_bucket)
        except Exception:
            s3.create_bucket(Bucket=cfg.minio_bucket)
        s3.put_object(
            Bucket=cfg.minio_bucket,
            Key=object_key,
            Body=content,
            ContentType=content_type,
        )
        url = f"{cfg.minio_public_url.rstrip('/')}/{cfg.minio_bucket}/{object_key}"
        return {"url": url}
    except Exception as exc:
        log.warning("MinIO logo upload failed: %s", exc)
        raise HTTPException(status_code=503, detail="Storage unavailable")


# ── Org settings router ────────────────────────────────────────────
org_router = APIRouter(prefix="/org", tags=["org"])

@org_router.get("/settings")
def get_org_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the org-level settings JSON (includes logo_url, profile, etc.)."""
    org = db.query(Organisation).filter(Organisation.id == current_user.org_id).first()
    return org.settings or {}

@org_router.patch("/settings")
def patch_org_settings(
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Merge-update the org settings JSON."""
    org = db.query(Organisation).filter(Organisation.id == current_user.org_id).first()
    merged = dict(org.settings or {})
    merged.update(payload)
    org.settings = merged
    db.commit()
    db.refresh(org)
    return org.settings
