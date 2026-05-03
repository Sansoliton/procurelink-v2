from celery import Celery
from celery.schedules import crontab
from app.config import settings

celery_app = Celery(
    "procurelink",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.worker"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_routes={
        "app.worker.send_email_task": {"queue": "emails"},
        "app.worker.generate_pdf_task": {"queue": "pdfs"},
    },
    beat_schedule={
        "check-expired-rfqs": {
            "task": "app.worker.check_expired_rfqs_task",
            "schedule": crontab(minute=0),  # every hour
        },
    },
)


@celery_app.task(name="app.worker.send_email_task", bind=True, max_retries=3)
def send_email_task(self, to: str, subject: str, html_body: str):
    """Send an email. Falls back to logging if SMTP not configured."""
    try:
        import smtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.email_from
        msg["To"] = to
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(settings.email_from, [to], msg.as_string())
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(f"Email to {to} failed: {exc}. Subject: {subject}")
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="app.worker.check_expired_rfqs_task")
def check_expired_rfqs_task():
    """Mark overdue RFQs as expired."""
    from datetime import datetime
    from app.database import SessionLocal
    from app.models import RFQ, RFQStatus

    db = SessionLocal()
    try:
        expired = db.query(RFQ).filter(
            RFQ.status == RFQStatus.sent,
            RFQ.deadline < datetime.utcnow(),
        ).all()
        for rfq in expired:
            rfq.status = RFQStatus.expired
        db.commit()
        return f"Expired {len(expired)} RFQs"
    finally:
        db.close()


@celery_app.task(name="app.worker.generate_pdf_task", bind=True, max_retries=3)
def generate_pdf_task(self, doc_type: str, doc_id: str, org_id: str):
    """Generate a PDF for a CustomerQuotation, CustomerInvoice, or PurchaseOrder and store it in MinIO.
    Writes the resulting public URL back to the DB record's pdf_url column.
    """
    try:
        from app.database import SessionLocal
        from app.models import CustomerQuotation, CustomerInvoice, PurchaseOrder, VendorPO
        from app.config import settings
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.pdfgen import canvas
        import boto3
        import io

        db = SessionLocal()
        try:
            doc = None
            title = ""
            lines_data = []

            if doc_type == "quotation":
                doc = db.query(CustomerQuotation).filter(
                    CustomerQuotation.id == doc_id, CustomerQuotation.org_id == org_id
                ).first()
                if doc:
                    title = f"Quotation  {doc.quotation_no}"
                    dd = doc.doc_data or {}
                    lines_data = dd.get("lines", [])

            elif doc_type == "invoice":
                doc = db.query(CustomerInvoice).filter(
                    CustomerInvoice.id == doc_id, CustomerInvoice.org_id == org_id
                ).first()
                if doc:
                    title = f"Invoice  {doc.invoice_no}"
                    dd = doc.doc_data or {}
                    lines_data = dd.get("lines", [])

            elif doc_type == "po":
                po = db.query(PurchaseOrder).filter(
                    PurchaseOrder.id == doc_id, PurchaseOrder.org_id == org_id
                ).first()
                if not po:
                    return "PO not found"
                vpos = db.query(VendorPO).filter(VendorPO.quotation_id == po.quotation_id).all()
                title = f"Purchase Order  {po.reference}"

                # Build a simple PDF for the PO
                buf = io.BytesIO()
                c = canvas.Canvas(buf, pagesize=A4)
                w, h = A4
                c.setFont("Helvetica-Bold", 16)
                c.drawString(20 * mm, h - 25 * mm, title)
                c.setFont("Helvetica", 10)
                c.drawString(20 * mm, h - 35 * mm, f"Status: {po.status.value if hasattr(po.status, 'value') else po.status}")
                c.drawString(20 * mm, h - 42 * mm, f"Payment Terms: {po.payment_terms}")
                c.drawString(20 * mm, h - 49 * mm, f"Raised: {po.raised_at.strftime('%d %b %Y') if po.raised_at else '—'}")
                y = h - 65 * mm
                for vpo in vpos:
                    c.setFont("Helvetica-Bold", 10)
                    c.drawString(20 * mm, y, f"Vendor: {vpo.vendor_name}  |  Ref: {vpo.reference}  |  Amount: {vpo.amount:,.2f}")
                    y -= 7 * mm
                    c.setFont("Helvetica", 9)
                    for line in (vpo.lines or []):
                        desc = line.get("description", "—")
                        qty = line.get("qty", "")
                        unit_price = line.get("unit_price", "")
                        total = line.get("line_total", "")
                        c.drawString(25 * mm, y, f"  {desc}   qty:{qty}   unit:{unit_price}   total:{total}")
                        y -= 6 * mm
                        if y < 30 * mm:
                            c.showPage()
                            y = h - 25 * mm
                    y -= 4 * mm
                c.save()
                buf.seek(0)

                object_name = f"pdfs/pos/{doc_id}.pdf"
                s3 = boto3.client(
                    "s3",
                    endpoint_url=f"http{'s' if settings.minio_secure else ''}://{settings.minio_endpoint}",
                    aws_access_key_id=settings.minio_access_key,
                    aws_secret_access_key=settings.minio_secret_key,
                )
                try:
                    s3.head_bucket(Bucket=settings.minio_bucket)
                except Exception:
                    s3.create_bucket(Bucket=settings.minio_bucket)
                s3.put_object(
                    Bucket=settings.minio_bucket,
                    Key=object_name,
                    Body=buf.read(),
                    ContentType="application/pdf",
                )
                public_url = f"{settings.minio_public_url.rstrip('/')}/{settings.minio_bucket}/{object_name}"
                # Store pdf_url back on the PO record
                po.pdf_url = public_url
                db.commit()
                return public_url

            if not doc:
                return "Document not found"

            # Build the PDF
            buf = io.BytesIO()
            c = canvas.Canvas(buf, pagesize=A4)
            w, h = A4
            dd = doc.doc_data or {}

            # Header
            c.setFont("Helvetica-Bold", 16)
            c.drawString(20 * mm, h - 25 * mm, title)
            c.setFont("Helvetica", 10)
            c.drawString(20 * mm, h - 35 * mm, f"Customer: {doc.customer_name or '—'}")
            c.drawString(20 * mm, h - 42 * mm, f"Status: {doc.status}")
            c.drawString(20 * mm, h - 49 * mm, f"Date: {dd.get('date', '—')}")

            # Issuer block
            issuer = dd.get("issuerName", "")
            if issuer:
                c.drawString(20 * mm, h - 60 * mm, f"From: {issuer}  |  {dd.get('issuerEmail', '')}")

            # Line items table header
            y = h - 75 * mm
            c.setFont("Helvetica-Bold", 9)
            c.drawString(20 * mm, y, "Description")
            c.drawString(100 * mm, y, "Qty")
            c.drawString(120 * mm, y, "Unit")
            c.drawString(140 * mm, y, "Unit Price")
            c.drawString(165 * mm, y, "Total")
            y -= 2 * mm
            c.line(20 * mm, y, 190 * mm, y)
            y -= 6 * mm

            c.setFont("Helvetica", 9)
            subtotal = 0.0
            for line in lines_data:
                desc = str(line.get("description", ""))[:60]
                qty = line.get("qty", "")
                unit = line.get("unit", "")
                up = line.get("unitPrice", line.get("unit_price", ""))
                lt = line.get("lineTotal", line.get("line_total", ""))
                try:
                    subtotal += float(lt or 0)
                except Exception:
                    pass
                c.drawString(20 * mm, y, desc)
                c.drawString(100 * mm, y, str(qty))
                c.drawString(120 * mm, y, str(unit))
                c.drawString(140 * mm, y, str(up))
                c.drawString(165 * mm, y, str(lt))
                y -= 6 * mm
                if y < 30 * mm:
                    c.showPage()
                    y = h - 25 * mm

            # Totals
            vat_pct = float(dd.get("vatPct", 0))
            vat_amt = round(subtotal * vat_pct / 100, 2)
            grand = round(subtotal + vat_amt, 2)
            y -= 4 * mm
            c.line(20 * mm, y, 190 * mm, y)
            y -= 6 * mm
            c.setFont("Helvetica", 9)
            c.drawString(140 * mm, y, f"Subtotal: {subtotal:,.2f}")
            y -= 6 * mm
            c.drawString(140 * mm, y, f"VAT ({vat_pct}%): {vat_amt:,.2f}")
            y -= 6 * mm
            c.setFont("Helvetica-Bold", 10)
            c.drawString(140 * mm, y, f"Grand Total: {grand:,.2f}")

            # Footer
            if dd.get("notes"):
                y -= 12 * mm
                c.setFont("Helvetica", 8)
                c.drawString(20 * mm, y, f"Notes: {dd['notes'][:120]}")

            c.save()
            buf.seek(0)

            object_name = f"pdfs/{doc_type}s/{doc_id}.pdf"
            s3 = boto3.client(
                "s3",
                endpoint_url=f"http{'s' if settings.minio_secure else ''}://{settings.minio_endpoint}",
                aws_access_key_id=settings.minio_access_key,
                aws_secret_access_key=settings.minio_secret_key,
            )
            try:
                s3.head_bucket(Bucket=settings.minio_bucket)
            except Exception:
                s3.create_bucket(Bucket=settings.minio_bucket)
            s3.put_object(
                Bucket=settings.minio_bucket,
                Key=object_name,
                Body=buf.read(),
                ContentType="application/pdf",
            )
            public_url = f"{settings.minio_public_url.rstrip('/')}/{settings.minio_bucket}/{object_name}"

            # Write URL back to the DB record
            doc.pdf_url = public_url
            db.commit()
            return public_url
        finally:
            db.close()
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(f"PDF generation failed ({doc_type} {doc_id}): {exc}")
        raise self.retry(exc=exc, countdown=30)
