from typing import List
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models import Requirement, LineItem, RequirementStatus


def create(org_id: str, project_id: str, created_by: str, title: str,
           raw_text: str | None, delivery_date, db: Session) -> Requirement:
    req = Requirement(
        org_id=org_id,
        project_id=project_id,
        created_by=created_by,
        title=title,
        raw_text=raw_text,
        delivery_date=delivery_date,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


def list_by_project(project_id: str, org_id: str, db: Session,
                    page: int = 1, limit: int = 50) -> List[Requirement]:
    return (
        db.query(Requirement)
        .filter(Requirement.project_id == project_id, Requirement.org_id == org_id)
        .order_by(Requirement.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )


def get_by_id(req_id: str, org_id: str, db: Session) -> Requirement:
    req = db.query(Requirement).filter(
        Requirement.id == req_id, Requirement.org_id == org_id
    ).first()
    if not req:
        raise HTTPException(404, "Requirement not found")
    return req


def update_status(req_id: str, new_status: RequirementStatus,
                  org_id: str, db: Session) -> Requirement:
    req = get_by_id(req_id, org_id, db)
    req.status = new_status
    db.commit()
    db.refresh(req)
    return req


def add_line_items(req_id: str, items: list, org_id: str, db: Session) -> List[LineItem]:
    get_by_id(req_id, org_id, db)  # auth check
    created = []
    for item in items:
        li = LineItem(requirement_id=req_id, **item.model_dump())
        db.add(li)
        created.append(li)
    db.commit()
    return created


def update_line_items(req_id: str, items: list, org_id: str, db: Session) -> List[LineItem]:
    get_by_id(req_id, org_id, db)  # auth check
    db.query(LineItem).filter(LineItem.requirement_id == req_id).delete()
    created = []
    for item in items:
        li = LineItem(requirement_id=req_id, **item.model_dump())
        db.add(li)
        created.append(li)
    db.commit()
    return created
