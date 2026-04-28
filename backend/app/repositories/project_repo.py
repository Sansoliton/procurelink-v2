from typing import List
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models import Project, ProjectMember


def create(org_id: str, name: str, created_by: str, description: str | None, db: Session) -> Project:
    project = Project(org_id=org_id, name=name, description=description, created_by=created_by)
    db.add(project)
    db.flush()
    db.add(ProjectMember(project_id=project.id, user_id=created_by, project_role="buyer"))
    db.commit()
    db.refresh(project)
    return project


def list_by_org(org_id: str, db: Session) -> List[Project]:
    return db.query(Project).filter(Project.org_id == org_id).all()


def get_user_projects(user_id: str, org_id: str, db: Session) -> List[Project]:
    pm_ids = [
        pm.project_id
        for pm in db.query(ProjectMember).filter(ProjectMember.user_id == user_id).all()
    ]
    return db.query(Project).filter(
        Project.org_id == org_id,
        Project.id.in_(pm_ids),
    ).all()


def get_by_id(project_id: str, org_id: str, db: Session) -> Project:
    p = db.query(Project).filter(Project.id == project_id, Project.org_id == org_id).first()
    if not p:
        raise HTTPException(404, "Project not found")
    return p


def add_member(project_id: str, user_id: str, role: str, db: Session) -> ProjectMember:
    existing = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id,
    ).first()
    if existing:
        raise HTTPException(400, "User already a member")
    pm = ProjectMember(project_id=project_id, user_id=user_id, project_role=role)
    db.add(pm)
    db.commit()
    db.refresh(pm)
    return pm


def remove_member(project_id: str, user_id: str, db: Session) -> None:
    pm = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id,
    ).first()
    if not pm:
        raise HTTPException(404, "Member not found")
    db.delete(pm)
    db.commit()
