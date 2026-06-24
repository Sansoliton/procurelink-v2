"""
Run: python -m app.scripts.seed_demo
Creates a demo org, users, vendors, and one sample requirement.
"""
from app.database import SessionLocal
from app.models import Organisation, User, Project, ProjectMember, Vendor, OrgRole, OrgType
from app.services.auth_service import hash_password

def seed():
    db = SessionLocal()
    try:
        # Always ensure a default admin account exists (idempotent)
        if not db.query(User).filter(User.email == "admin@procurelink.com").first():
            default_org = db.query(Organisation).filter(Organisation.slug == "procurelink-demo").first()
            if not default_org:
                default_org = Organisation(name="ProcureLink Demo", slug="procurelink-demo", type=OrgType.customer)
                db.add(default_org)
                db.flush()
            db.add(User(
                org_id=default_org.id,
                email="admin@procurelink.com",
                hashed_password=hash_password("admin123"),
                full_name="Admin User",
                org_role=OrgRole.org_admin,
            ))
            db.commit()
            print("✓ Default admin created: admin@procurelink.com / admin123")

        if db.query(Organisation).filter(Organisation.slug == "acme-corp-demo").first():
            print("Demo data already seeded — skipping.")
            return

        # Org
        org = Organisation(name="Acme Corp", slug="acme-corp-demo", type=OrgType.customer)
        db.add(org)
        db.flush()

        # Admin user
        admin = User(
            org_id=org.id, email="admin@acme.com",
            hashed_password=hash_password("password123"),
            full_name="Alice Admin", org_role=OrgRole.org_admin,
        )
        buyer = User(
            org_id=org.id, email="buyer@acme.com",
            hashed_password=hash_password("password123"),
            full_name="Bob Buyer", org_role=OrgRole.member,
        )
        db.add_all([admin, buyer])
        db.flush()

        # Project
        project = Project(
            org_id=org.id, name="Hydraulic System Overhaul Q2",
            description="Annual maintenance procurement",
            created_by=admin.id,
        )
        db.add(project)
        db.flush()

        db.add_all([
            ProjectMember(project_id=project.id, user_id=admin.id, project_role="buyer"),
            ProjectMember(project_id=project.id, user_id=buyer.id, project_role="buyer"),
        ])

        # Vendors
        vendors = [
            Vendor(org_id=org.id, name="Acme Industrial", email="rfq@acme-industrial.example.com",
                   categories=["flanges", "fasteners", "fittings"], rating=4.5),
            Vendor(org_id=org.id, name="FastFix Supply", email="rfq@fastfix.example.com",
                   categories=["flanges", "pipe", "valves"], rating=4.2),
            Vendor(org_id=org.id, name="ProParts Co.", email="rfq@proparts.example.com",
                   categories=["pipe", "structural", "fasteners"], rating=4.7),
        ]
        db.add_all(vendors)
        db.commit()

        print("✓ Demo data seeded")
        print("  Login: admin@acme.com / password123")
        print("  Login: buyer@acme.com / password123")

    finally:
        db.close()

if __name__ == "__main__":
    seed()
