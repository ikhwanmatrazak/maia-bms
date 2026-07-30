"""
Human Resource Management Router
Covers: Departments, Employees, Leave, Attendance, Payroll, Claims, Performance
"""
import json
import os
import re
import uuid
from calendar import monthrange as _monthrange
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, status
from pydantic import BaseModel
from sqlalchemy import select, func, and_, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.rbac import require_admin, require_admin_or_manager, apply_tenant_filter, get_effective_tenant_id
from app.models.user import User
from app.models.hr import (
    Department, Employee, EmployeeDocument,
    LeaveType, LeaveBalance, LeaveApplication, LeaveApplicationStatus,
    AttendanceRecord, AttendanceStatus,
    PublicHoliday,
    SalaryStructure,
    PayrollRun, PayslipLine, PayrollStatus,
    ClaimApplication, ClaimStatus,
    PerformanceReview,
    EmploymentType, EmploymentStatus, PerformanceRating,
)
from app.config import get_settings

router = APIRouter(prefix="/hr", tags=["hr"])
app_settings = get_settings()


# ─── helpers ────────────────────────────────────────────────────────────────

def _prorate_months(join: date, target_year: int) -> int:
    """Count months in target_year where the employee was active.
    A month counts if its first day has passed (or is today) and the
    employee joined on or before that month's last day."""
    today = date.today()
    year_start = date(target_year, 1, 1)
    year_end = date(target_year, 12, 31)
    effective_start = max(join, year_start)
    if effective_start > min(today, year_end):
        return 0
    count = 0
    for month in range(1, 13):
        first_day = date(target_year, month, 1)
        last_day = date(target_year, month, _monthrange(target_year, month)[1])
        if effective_start <= last_day and first_day <= today and first_day <= year_end:
            count += 1
    return min(count, 12)

# Alias used by sync_all_leave_balances
_completed_months = _prorate_months


async def _save_file(upload: UploadFile, subfolder: str = "hr") -> str:
    upload_dir = app_settings.upload_dir
    os.makedirs(f"{upload_dir}/{subfolder}", exist_ok=True)
    ext = os.path.splitext(upload.filename)[1] if upload.filename else ""
    filename = f"{uuid.uuid4().hex}{ext}"
    path = f"{upload_dir}/{subfolder}/{filename}"
    content = await upload.read()
    with open(path, "wb") as f:
        f.write(content)
    return f"/uploads/{subfolder}/{filename}"


def _calculate_malaysian_statutory(gross: Decimal, age: int = 30, children: int = 0, spouse_working: bool = False):
    """Calculate EPF, SOCSO, EIS, PCB for Malaysia."""
    gross_f = float(gross)

    # ── EPF ──────────────────────────────────────────────────────────────
    # Insurable up to RM5,000/month for contribution rate purposes (no cap for 11%)
    if age < 60:
        epf_emp_rate = 0.11
        epf_er_rate = 0.13 if gross_f <= 5000 else 0.12
    else:
        epf_emp_rate = 0.05
        epf_er_rate = 0.06
    epf_employee = round(gross_f * epf_emp_rate, 2)
    epf_employer = round(gross_f * epf_er_rate, 2)

    # ── SOCSO (capped at RM5,000 insurable wage) ──────────────────────────
    socso_wage = min(gross_f, 5000)
    # Simplified SOCSO table (First Category: employee 0.5%, employer 1.75%)
    socso_employee = round(socso_wage * 0.005, 2)
    socso_employer = round(socso_wage * 0.0175, 2)

    # ── EIS (capped at RM4,000) ────────────────────────────────────────────
    eis_wage = min(gross_f, 4000)
    eis_employee = round(eis_wage * 0.002, 2)
    eis_employer = round(eis_wage * 0.002, 2)

    # ── PCB (simplified monthly income tax) ───────────────────────────────
    # Annual gross minus statutory reliefs → tax
    annual_gross = gross_f * 12
    # Basic reliefs: individual RM9,000; spouse RM4,000 (if spouse not working); child RM2,000 each
    relief = 9000
    if not spouse_working:
        relief += 4000
    relief += children * 2000
    chargeable = max(0, annual_gross - relief)
    # Progressive tax brackets (2024 scale)
    tax_brackets = [
        (5000, 0.00),
        (15000, 0.01),
        (15000, 0.03),
        (15000, 0.08),
        (30000, 0.13),
        (30000, 0.21),
        (30000, 0.24),
        (float("inf"), 0.25),
    ]
    annual_tax = 0.0
    remaining = chargeable
    for band, rate in tax_brackets:
        if remaining <= 0:
            break
        taxable = min(remaining, band)
        annual_tax += taxable * rate
        remaining -= taxable
    pcb = round(annual_tax / 12, 2)

    return {
        "epf_employee": epf_employee,
        "epf_employer": epf_employer,
        "socso_employee": socso_employee,
        "socso_employer": socso_employer,
        "eis_employee": eis_employee,
        "eis_employer": eis_employer,
        "pcb": pcb,
    }


# ─── Pydantic Schemas ────────────────────────────────────────────────────────

class DepartmentCreate(BaseModel):
    name: str
    description: Optional[str] = None

class DepartmentResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    is_active: bool
    employee_count: int = 0
    model_config = {"from_attributes": True}


class EmployeeCreate(BaseModel):
    employee_no: str
    full_name: str
    department_id: Optional[int] = None
    designation: Optional[str] = None
    employment_type: EmploymentType = EmploymentType.full_time
    employment_status: EmploymentStatus = EmploymentStatus.probation
    join_date: Optional[date] = None
    confirmation_date: Optional[date] = None
    contract_end_date: Optional[date] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    ic_no: Optional[str] = None
    passport_no: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    nationality: Optional[str] = "Malaysian"
    religion: Optional[str] = None
    marital_status: Optional[str] = None
    address: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_relation: Optional[str] = None
    basic_salary: Optional[float] = None
    bank_name: Optional[str] = None
    bank_account_no: Optional[str] = None
    epf_no: Optional[str] = None
    socso_no: Optional[str] = None
    income_tax_no: Optional[str] = None
    children_count: Optional[int] = 0
    spouse_working: Optional[bool] = False
    user_id: Optional[int] = None
    designation_id: Optional[int] = None
    employment_terms: Optional[dict] = None
    work_location: Optional[str] = None
    reporting_to: Optional[str] = None
    offer_benefits: Optional[list] = None
    has_epf: bool = True
    has_socso_eis: bool = True
    has_income_tax: bool = True
    probation_months: Optional[int] = 3

class EmployeeUpdate(EmployeeCreate):
    pass

class EmployeeResponse(BaseModel):
    id: int
    employee_no: str
    full_name: str
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    designation: Optional[str] = None
    employment_type: str
    employment_status: str
    join_date: Optional[date] = None
    confirmation_date: Optional[date] = None
    contract_end_date: Optional[date] = None
    resignation_date: Optional[date] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    ic_no: Optional[str] = None
    passport_no: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    nationality: Optional[str] = None
    religion: Optional[str] = None
    marital_status: Optional[str] = None
    address: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_relation: Optional[str] = None
    basic_salary: Optional[float] = None
    bank_name: Optional[str] = None
    bank_account_no: Optional[str] = None
    epf_no: Optional[str] = None
    socso_no: Optional[str] = None
    income_tax_no: Optional[str] = None
    children_count: Optional[int] = None
    spouse_working: Optional[bool] = None
    photo_url: Optional[str] = None
    user_id: Optional[int] = None
    designation_id: Optional[int] = None
    employment_terms: Optional[dict] = None
    work_location: Optional[str] = None
    reporting_to: Optional[str] = None
    offer_benefits: Optional[list] = None
    has_epf: bool = True
    has_socso_eis: bool = True
    has_income_tax: bool = True
    probation_months: Optional[int] = 3
    created_at: Optional[datetime] = None
    model_config = {"from_attributes": True}


class LeaveTypeCreate(BaseModel):
    name: str
    days_per_year: int = 0
    is_paid: bool = True
    requires_document: bool = False
    is_pro_rated: bool = False
    applicable_gender: Optional[str] = None

class LeaveTypeResponse(BaseModel):
    id: int
    name: str
    days_per_year: int
    is_paid: bool
    requires_document: bool
    is_pro_rated: bool = False
    is_active: bool
    applicable_gender: Optional[str] = None
    model_config = {"from_attributes": True}


class LeaveBalanceResponse(BaseModel):
    id: int
    employee_id: int
    leave_type_id: int
    leave_type_name: Optional[str] = None
    year: int
    entitled: float
    taken: float
    balance: float = 0
    model_config = {"from_attributes": True}


class LeaveApplicationCreate(BaseModel):
    employee_id: int
    leave_type_id: int
    start_date: date
    end_date: date
    days: float
    reason: Optional[str] = None

class LeaveApplicationResponse(BaseModel):
    id: int
    employee_id: int
    employee_name: Optional[str] = None
    leave_type_id: Optional[int] = None
    leave_type_name: Optional[str] = None
    start_date: date
    end_date: date
    days: float
    reason: Optional[str] = None
    document_url: Optional[str] = None
    status: str
    approved_by: Optional[int] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    created_at: Optional[datetime] = None
    model_config = {"from_attributes": True}


class AttendanceCreate(BaseModel):
    employee_id: int
    date: date
    check_in: Optional[datetime] = None
    check_out: Optional[datetime] = None
    work_hours: Optional[float] = None
    overtime_hours: Optional[float] = 0
    status: AttendanceStatus = AttendanceStatus.present
    notes: Optional[str] = None

class AttendanceResponse(BaseModel):
    id: int
    employee_id: int
    employee_name: Optional[str] = None
    date: date
    check_in: Optional[datetime] = None
    check_out: Optional[datetime] = None
    work_hours: Optional[float] = None
    overtime_hours: Optional[float] = None
    status: str
    notes: Optional[str] = None
    model_config = {"from_attributes": True}


class PublicHolidayCreate(BaseModel):
    name: str
    date: date
    year: int

class PublicHolidayResponse(BaseModel):
    id: int
    name: str
    date: date
    year: int
    model_config = {"from_attributes": True}


class SalaryStructureCreate(BaseModel):
    employee_id: int
    basic_salary: float
    transport_allowance: Optional[float] = 0
    housing_allowance: Optional[float] = 0
    phone_allowance: Optional[float] = 0
    other_allowance: Optional[float] = 0
    other_allowance_name: Optional[str] = None
    effective_from: date

class SalaryStructureResponse(BaseModel):
    id: int
    employee_id: int
    basic_salary: float
    transport_allowance: Optional[float] = None
    housing_allowance: Optional[float] = None
    phone_allowance: Optional[float] = None
    other_allowance: Optional[float] = None
    other_allowance_name: Optional[str] = None
    effective_from: date
    model_config = {"from_attributes": True}


class PayrollRunCreate(BaseModel):
    month: int
    year: int
    notes: Optional[str] = None

class PayslipLineResponse(BaseModel):
    id: int
    employee_id: int
    employee_name: Optional[str] = None
    employee_no: Optional[str] = None
    basic_salary: float
    transport_allowance: Optional[float] = None
    housing_allowance: Optional[float] = None
    phone_allowance: Optional[float] = None
    other_allowance: Optional[float] = None
    overtime_pay: Optional[float] = None
    claims_reimbursement: Optional[float] = None
    gross_pay: float
    epf_employee: Optional[float] = None
    epf_employer: Optional[float] = None
    socso_employee: Optional[float] = None
    socso_employer: Optional[float] = None
    eis_employee: Optional[float] = None
    eis_employer: Optional[float] = None
    pcb: Optional[float] = None
    other_deduction: Optional[float] = None
    net_pay: float
    working_days: Optional[int] = None
    present_days: Optional[int] = None
    absent_days: Optional[int] = None
    leave_days: Optional[int] = None
    model_config = {"from_attributes": True}

class PayrollRunResponse(BaseModel):
    id: int
    month: int
    year: int
    status: str
    total_gross: Optional[float] = None
    total_net: Optional[float] = None
    total_employee_count: Optional[int] = None
    notes: Optional[str] = None
    finalized_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    payslip_lines: List[PayslipLineResponse] = []
    model_config = {"from_attributes": True}


class ClaimCreate(BaseModel):
    employee_id: int
    claim_type: str
    description: str
    amount: float
    claim_date: date

class ClaimResponse(BaseModel):
    id: int
    employee_id: int
    employee_name: Optional[str] = None
    claim_type: str
    description: str
    amount: float
    claim_date: date
    receipt_url: Optional[str] = None
    status: str
    approved_by: Optional[int] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    created_at: Optional[datetime] = None
    model_config = {"from_attributes": True}


class PerformanceReviewCreate(BaseModel):
    employee_id: int
    review_period: str
    review_date: date
    rating: Optional[PerformanceRating] = None
    kpi_score: Optional[float] = None
    self_review: Optional[str] = None
    manager_review: Optional[str] = None
    goals_next_period: Optional[str] = None

class PerformanceReviewResponse(BaseModel):
    id: int
    employee_id: int
    employee_name: Optional[str] = None
    review_period: str
    review_date: date
    rating: Optional[str] = None
    kpi_score: Optional[float] = None
    self_review: Optional[str] = None
    manager_review: Optional[str] = None
    goals_next_period: Optional[str] = None
    reviewed_by: Optional[int] = None
    created_at: Optional[datetime] = None
    model_config = {"from_attributes": True}


# ─── Departments ─────────────────────────────────────────────────────────────

@router.get("/departments", response_model=List[DepartmentResponse])
async def list_departments(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Department).where(Department.is_active == True)
    query = apply_tenant_filter(query, Department, current_user)
    result = await db.execute(query.order_by(Department.name))
    depts = result.scalars().all()

    # Count employees per dept
    emp_counts: dict = {}
    for d in depts:
        cnt = await db.execute(
            select(func.count(Employee.id)).where(Employee.department_id == d.id)
        )
        emp_counts[d.id] = cnt.scalar() or 0

    out = []
    for d in depts:
        r = DepartmentResponse(
            id=d.id, name=d.name, description=d.description,
            is_active=d.is_active, employee_count=emp_counts.get(d.id, 0)
        )
        out.append(r)
    return out


@router.post("/departments", response_model=DepartmentResponse, status_code=201)
async def create_department(
    body: DepartmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin_or_manager(current_user)
    dept = Department(**body.model_dump(), tenant_id=current_user.tenant_id)
    db.add(dept)
    await db.commit()
    await db.refresh(dept)
    return DepartmentResponse(id=dept.id, name=dept.name, description=dept.description, is_active=dept.is_active)


@router.put("/departments/{dept_id}", response_model=DepartmentResponse)
async def update_department(
    dept_id: int,
    body: DepartmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin_or_manager(current_user)
    result = await db.execute(select(Department).where(Department.id == dept_id))
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    dept.name = body.name
    dept.description = body.description
    await db.commit()
    await db.refresh(dept)
    return DepartmentResponse(id=dept.id, name=dept.name, description=dept.description, is_active=dept.is_active)


@router.delete("/departments/{dept_id}", status_code=204)
async def delete_department(
    dept_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    result = await db.execute(select(Department).where(Department.id == dept_id))
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    dept.is_active = False
    await db.commit()


# ─── Employees ───────────────────────────────────────────────────────────────

def _emp_to_response(emp: Employee) -> EmployeeResponse:
    return EmployeeResponse(
        id=emp.id,
        employee_no=emp.employee_no,
        full_name=emp.full_name,
        department_id=emp.department_id,
        department_name=emp.department_rel.name if emp.department_rel else None,
        designation=emp.designation,
        employment_type=emp.employment_type.value if emp.employment_type else None,
        employment_status=emp.employment_status.value if emp.employment_status else None,
        join_date=emp.join_date,
        confirmation_date=emp.confirmation_date,
        contract_end_date=emp.contract_end_date,
        resignation_date=emp.resignation_date,
        email=emp.email,
        phone=emp.phone,
        ic_no=emp.ic_no,
        passport_no=emp.passport_no,
        date_of_birth=emp.date_of_birth,
        gender=emp.gender,
        nationality=emp.nationality,
        religion=emp.religion,
        marital_status=emp.marital_status,
        address=emp.address,
        emergency_contact_name=emp.emergency_contact_name,
        emergency_contact_phone=emp.emergency_contact_phone,
        emergency_contact_relation=emp.emergency_contact_relation,
        basic_salary=float(emp.basic_salary) if emp.basic_salary else None,
        bank_name=emp.bank_name,
        bank_account_no=emp.bank_account_no,
        epf_no=emp.epf_no,
        socso_no=emp.socso_no,
        income_tax_no=emp.income_tax_no,
        children_count=emp.children_count,
        spouse_working=emp.spouse_working,
        photo_url=emp.photo_url,
        user_id=emp.user_id,
        designation_id=emp.designation_id if hasattr(emp, 'designation_id') else None,
        employment_terms=json.loads(emp.employment_terms) if getattr(emp, 'employment_terms', None) else None,
        work_location=getattr(emp, 'work_location', None),
        reporting_to=getattr(emp, 'reporting_to', None),
        offer_benefits=json.loads(emp.offer_benefits) if getattr(emp, 'offer_benefits', None) else None,
        has_epf=bool(getattr(emp, 'has_epf', True)),
        has_socso_eis=bool(getattr(emp, 'has_socso_eis', True)),
        has_income_tax=bool(getattr(emp, 'has_income_tax', True)),
        probation_months=getattr(emp, 'probation_months', 3),
        created_at=emp.created_at,
    )


@router.get("/employees", response_model=List[EmployeeResponse])
async def list_employees(
    search: Optional[str] = Query(None),
    department_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Employee).options(selectinload(Employee.department_rel))
    query = apply_tenant_filter(query, Employee, current_user)
    if search:
        query = query.where(
            Employee.full_name.ilike(f"%{search}%") |
            Employee.employee_no.ilike(f"%{search}%") |
            Employee.email.ilike(f"%{search}%")
        )
    if department_id:
        query = query.where(Employee.department_id == department_id)
    if status:
        query = query.where(Employee.employment_status == status)
    query = query.order_by(Employee.full_name).offset(skip).limit(limit)
    result = await db.execute(query)
    return [_emp_to_response(e) for e in result.scalars().all()]


@router.get("/employees/next-no")
async def get_next_employee_no(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin_or_manager(current_user)
    query = select(Employee.employee_no).where(
        Employee.employee_no.like("M-%")
    )
    if current_user.tenant_id is not None:
        query = query.where(Employee.tenant_id == current_user.tenant_id)
    result = await db.execute(query)
    nos = result.scalars().all()
    max_n = 0
    for no in nos:
        try:
            n = int(no.split("-")[1])
            if n > max_n:
                max_n = n
        except Exception:
            pass
    return {"next_no": f"M-{str(max_n + 1).zfill(3)}"}


@router.post("/employees", response_model=EmployeeResponse, status_code=201)
async def create_employee(
    body: EmployeeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin_or_manager(current_user)
    # Check unique employee_no within tenant
    dup_query = select(Employee).where(Employee.employee_no == body.employee_no)
    if current_user.tenant_id is not None:
        dup_query = dup_query.where(Employee.tenant_id == current_user.tenant_id)
    dup = await db.execute(dup_query)
    if dup.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Employee number '{body.employee_no}' already exists")
    data = body.model_dump()
    emp = Employee(**data, tenant_id=current_user.tenant_id, created_by=current_user.id)
    db.add(emp)
    await db.commit()
    await db.refresh(emp)
    # reload with dept
    result = await db.execute(
        select(Employee).options(selectinload(Employee.department_rel)).where(Employee.id == emp.id)
    )
    return _emp_to_response(result.scalar_one())


@router.get("/employees/me", response_model=EmployeeResponse)
async def get_my_employee_profile(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Employee).options(selectinload(Employee.department_rel))
        .where(Employee.user_id == current_user.id)
    )
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="No employee profile linked to your account")
    return _emp_to_response(emp)


@router.get("/employees/{emp_id}", response_model=EmployeeResponse)
async def get_employee(
    emp_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Employee).options(selectinload(Employee.department_rel)).where(Employee.id == emp_id)
    )
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    return _emp_to_response(emp)


@router.put("/employees/{emp_id}", response_model=EmployeeResponse)
async def update_employee(
    emp_id: int,
    body: EmployeeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin_or_manager(current_user)
    if body.epf_no:
        clean = re.sub(r"[\s\-]", "", body.epf_no)
        if not re.fullmatch(r"\d{7,14}", clean):
            raise HTTPException(status_code=422, detail="EPF No. must be 7–14 digits")
    if body.socso_no:
        clean = re.sub(r"[\s\-]", "", body.socso_no)
        if not re.fullmatch(r"\d{10,12}", clean):
            raise HTTPException(status_code=422, detail="SOCSO No. must be 10–12 digits (IC No. accepted)")
    if body.income_tax_no:
        clean = re.sub(r"[\s\-]", "", body.income_tax_no)
        if not re.fullmatch(r"[A-Za-z]{1,2}\d{7,12}", clean):
            raise HTTPException(status_code=422, detail="Income Tax No. must be 1–2 letters followed by 7–12 digits (e.g. SG12345678)")
    result = await db.execute(
        select(Employee).options(selectinload(Employee.department_rel)).where(Employee.id == emp_id)
    )
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    data = body.model_dump(exclude_none=False)
    employment_terms_val = data.pop("employment_terms", None)
    offer_benefits_val = data.pop("offer_benefits", None)
    for k, v in data.items():
        if hasattr(emp, k):
            setattr(emp, k, v)
    if employment_terms_val is not None:
        emp.employment_terms = json.dumps(employment_terms_val)
    elif "employment_terms" in data:
        emp.employment_terms = None
    if offer_benefits_val is not None:
        emp.offer_benefits = json.dumps(offer_benefits_val)
    elif offer_benefits_val is None and "offer_benefits" in body.model_dump(exclude_unset=True):
        emp.offer_benefits = None
    await db.commit()
    await db.refresh(emp)
    result2 = await db.execute(
        select(Employee).options(selectinload(Employee.department_rel)).where(Employee.id == emp_id)
    )
    return _emp_to_response(result2.scalar_one())


@router.delete("/employees/{emp_id}", status_code=204)
async def delete_employee(
    emp_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    result = await db.execute(select(Employee).where(Employee.id == emp_id))
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    await db.delete(emp)
    await db.commit()


@router.post("/employees/{emp_id}/photo")
async def upload_employee_photo(
    emp_id: int,
    photo: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin_or_manager(current_user)
    result = await db.execute(select(Employee).where(Employee.id == emp_id))
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    url = await _save_file(photo, "hr/photos")
    emp.photo_url = url
    await db.commit()
    return {"photo_url": url}


@router.get("/employees/{emp_id}/documents")
async def list_employee_documents(
    emp_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(EmployeeDocument).where(EmployeeDocument.employee_id == emp_id)
        .order_by(EmployeeDocument.created_at.desc())
    )
    docs = result.scalars().all()
    return [{"id": d.id, "name": d.name, "file_url": d.file_url, "created_at": d.created_at} for d in docs]


@router.post("/employees/{emp_id}/documents", status_code=201)
async def upload_employee_document(
    emp_id: int,
    name: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin_or_manager(current_user)
    url = await _save_file(file, "hr/docs")
    doc = EmployeeDocument(employee_id=emp_id, name=name, file_url=url)
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return {"id": doc.id, "name": doc.name, "file_url": doc.file_url}


@router.delete("/employees/{emp_id}/documents/{doc_id}", status_code=204)
async def delete_employee_document(
    emp_id: int,
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin_or_manager(current_user)
    result = await db.execute(
        select(EmployeeDocument).where(
            EmployeeDocument.id == doc_id,
            EmployeeDocument.employee_id == emp_id
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    await db.delete(doc)
    await db.commit()


# ─── Designations ────────────────────────────────────────────────────────────

class DesignationCreate(BaseModel):
    name: str
    job_responsibilities: Optional[str] = None

class DesignationUpdate(BaseModel):
    name: Optional[str] = None
    job_responsibilities: Optional[str] = None

@router.get("/designations")
async def list_designations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tid = get_effective_tenant_id(current_user)
    rows = (await db.execute(
        text("SELECT * FROM hr_designations WHERE tenant_id=:tid OR tenant_id IS NULL ORDER BY name"),
        {"tid": tid}
    )).mappings().all()
    return [dict(r) for r in rows]

@router.post("/designations", status_code=201)
async def create_designation(
    body: DesignationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin_or_manager(current_user)
    tid = get_effective_tenant_id(current_user)
    result = await db.execute(
        text("INSERT INTO hr_designations (tenant_id, name, job_responsibilities) VALUES (:tid, :name, :jr)"),
        {"tid": tid, "name": body.name, "jr": body.job_responsibilities},
    )
    await db.commit()
    new_id = result.lastrowid
    row = (await db.execute(text("SELECT * FROM hr_designations WHERE id=:id"), {"id": new_id})).mappings().first()
    return dict(row)

@router.put("/designations/{des_id}")
async def update_designation(
    des_id: int,
    body: DesignationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin_or_manager(current_user)
    sets, params = [], {"id": des_id}
    if body.name is not None:
        sets.append("name=:name"); params["name"] = body.name
    if body.job_responsibilities is not None:
        sets.append("job_responsibilities=:jr"); params["jr"] = body.job_responsibilities
    if sets:
        await db.execute(text(f"UPDATE hr_designations SET {', '.join(sets)} WHERE id=:id"), params)
        await db.commit()
    row = (await db.execute(text("SELECT * FROM hr_designations WHERE id=:id"), {"id": des_id})).mappings().first()
    if not row:
        raise HTTPException(404, "Designation not found")
    return dict(row)

@router.delete("/designations/{des_id}", status_code=204)
async def delete_designation(
    des_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin_or_manager(current_user)
    await db.execute(text("UPDATE hr_employees SET designation_id=NULL WHERE designation_id=:id"), {"id": des_id})
    await db.execute(text("DELETE FROM hr_designations WHERE id=:id"), {"id": des_id})
    await db.commit()


# ─── Offer Letter ────────────────────────────────────────────────────────────

class AllowanceItem(BaseModel):
    name: str
    amount: float

class BenefitItem(BaseModel):
    name: str
    value: str = "As per company policy"

class OfferLetterRequest(BaseModel):
    position: str
    department: str
    reporting_to: Optional[str] = None
    work_location: Optional[str] = None
    employment_type: str = "Full-Time"
    start_date: str
    contract_end_date: Optional[str] = None
    probation_months: Optional[int] = 3
    basic_salary: float
    allowances: Optional[List[AllowanceItem]] = []
    benefits: Optional[List[BenefitItem]] = []
    conditions: Optional[List[str]] = []
    expiry_date: str
    signatory_name: Optional[str] = None
    signatory_title: Optional[str] = None
    notes: Optional[str] = None

@router.post("/employees/{emp_id}/offer-letter")
async def generate_offer_letter(
    emp_id: int,
    body: OfferLetterRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from fastapi.responses import Response
    from sqlalchemy import text
    from jinja2 import Environment, FileSystemLoader
    from weasyprint import HTML
    from pathlib import Path
    import base64

    require_admin_or_manager(current_user)

    # Get employee
    result = await db.execute(select(Employee).where(Employee.id == emp_id))
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Get company settings
    tid = get_effective_tenant_id(current_user)
    cs = await db.execute(
        text("SELECT * FROM company_settings WHERE (tenant_id=:tid OR (tenant_id IS NULL AND :tid IS NULL)) LIMIT 1"),
        {"tid": tid}
    )
    company = cs.mappings().first()

    # Load logo
    logo_data = None
    if company and company.get("logo_url"):
        logo_data = company["logo_url"]

    primary_color = (company.get("primary_color") if company else None) or "#1a1a2e"

    # Build context
    total_package = body.basic_salary + sum(a.amount for a in (body.allowances or []))
    ref_no = f"OL/{emp.employee_no}/{date.today().strftime('%Y%m')}"
    offer_date = date.today().strftime("%d %B %Y")

    context = {
        "company": company,
        "logo_data": logo_data,
        "primary_color": primary_color,
        "employee": emp,
        "ref_no": ref_no,
        "offer_date": offer_date,
        "position": body.position,
        "department": body.department,
        "reporting_to": body.reporting_to,
        "work_location": body.work_location,
        "employment_type": body.employment_type,
        "start_date": body.start_date,
        "contract_end_date": body.contract_end_date,
        "probation_months": body.probation_months,
        "basic_salary": body.basic_salary,
        "allowances": body.allowances or [],
        "benefits": body.benefits or [],
        "conditions": body.conditions or [],
        "total_package": total_package,
        "expiry_date": body.expiry_date,
        "signatory_name": body.signatory_name,
        "signatory_title": body.signatory_title,
        "notes": body.notes,
    }

    templates_dir = Path(__file__).parent.parent / "templates" / "pdf"
    jinja_env = Environment(loader=FileSystemLoader(str(templates_dir)))
    template = jinja_env.get_template("offer_letter.html")
    html_content = template.render(**context)

    import asyncio
    loop = asyncio.get_event_loop()
    pdf_bytes = await loop.run_in_executor(None, lambda: HTML(string=html_content).write_pdf())

    filename = f"Offer_Letter_{emp.full_name.replace(' ', '_')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── Employment Terms Defaults ────────────────────────────────────────────────

_DEFAULT_TERMS = {
    "notice_period_days": 60,
    "outpatient_employee_limit": 1500, "outpatient_dependent_limit": 1000, "outpatient_per_receipt": 300,
    "hospitalization_employee_limit": 3000, "hospitalization_dependent_limit": 2000, "hospitalization_per_receipt": 1000,
    "dental_limit": 200, "newborn_allowance": 1000, "newborn_max": 3,
}

@router.get("/employment-terms-defaults")
async def get_employment_terms_defaults(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = await db.execute(
        text("SELECT employment_terms_defaults FROM company_settings WHERE (tenant_id=:tid OR (tenant_id IS NULL AND :tid IS NULL)) LIMIT 1"),
        {"tid": current_user.tenant_id},
    )
    r = row.fetchone()
    if r and r[0]:
        return {**_DEFAULT_TERMS, **json.loads(r[0])}
    return _DEFAULT_TERMS


@router.put("/employment-terms-defaults")
async def update_employment_terms_defaults(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin_or_manager(current_user)
    await db.execute(
        text("UPDATE company_settings SET employment_terms_defaults=:val WHERE (tenant_id=:tid OR (tenant_id IS NULL AND :tid IS NULL))"),
        {"val": json.dumps(body), "tid": current_user.tenant_id},
    )
    await db.commit()
    return {**_DEFAULT_TERMS, **body}


# ─── Employment Terms ─────────────────────────────────────────────────────────

class EmploymentTermsRequest(BaseModel):
    notice_period_days: int = 60
    outpatient_employee_limit: float = 1500
    outpatient_dependent_limit: float = 1000
    outpatient_per_receipt: float = 300
    hospitalization_employee_limit: float = 3000
    hospitalization_dependent_limit: float = 2000
    hospitalization_per_receipt: float = 1000
    dental_limit: float = 200
    newborn_allowance: float = 1000
    newborn_max: int = 3
    travel_tier1_km: int = 100
    travel_tier1_rate: float = 0.70
    travel_tier2_rate: float = 0.50

@router.post("/employees/{emp_id}/employment-terms")
async def generate_employment_terms(
    emp_id: int,
    body: EmploymentTermsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from fastapi.responses import Response
    from sqlalchemy import text
    from jinja2 import Environment, FileSystemLoader
    from weasyprint import HTML
    from pathlib import Path

    require_admin_or_manager(current_user)

    result = await db.execute(select(Employee).where(Employee.id == emp_id))
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Fetch designation + job responsibilities
    job_responsibilities: list[str] = []
    if emp.designation_id:
        des_row = (await db.execute(
            text("SELECT * FROM hr_designations WHERE id=:id"), {"id": emp.designation_id}
        )).mappings().first()
        if des_row and des_row.get("job_responsibilities"):
            job_responsibilities = [
                line.strip() for line in des_row["job_responsibilities"].splitlines() if line.strip()
            ]

    tid = get_effective_tenant_id(current_user)
    cs = await db.execute(
        text("SELECT * FROM company_settings WHERE (tenant_id=:tid OR (tenant_id IS NULL AND :tid IS NULL)) LIMIT 1"),
        {"tid": tid}
    )
    company = cs.mappings().first()
    logo_data = company.get("logo_url") if company else None
    primary_color = (company.get("primary_color") if company else None) or "#1a1a2e"

    context = {
        "company": company,
        "logo_data": logo_data,
        "primary_color": primary_color,
        "employee": emp,
        "job_responsibilities": job_responsibilities,
        "notice_period_days": body.notice_period_days,
        "outpatient_employee_limit": body.outpatient_employee_limit,
        "outpatient_dependent_limit": body.outpatient_dependent_limit,
        "outpatient_per_receipt": body.outpatient_per_receipt,
        "hospitalization_employee_limit": body.hospitalization_employee_limit,
        "hospitalization_dependent_limit": body.hospitalization_dependent_limit,
        "hospitalization_per_receipt": body.hospitalization_per_receipt,
        "dental_limit": body.dental_limit,
        "newborn_allowance": body.newborn_allowance,
        "newborn_max": body.newborn_max,
        "has_epf": bool(getattr(emp, 'has_epf', True)),
        "has_socso_eis": bool(getattr(emp, 'has_socso_eis', True)),
        "has_income_tax": bool(getattr(emp, 'has_income_tax', True)),
        "travel_tier1_km": body.travel_tier1_km,
        "travel_tier1_rate": body.travel_tier1_rate,
        "travel_tier2_rate": body.travel_tier2_rate,
    }

    templates_dir = Path(__file__).parent.parent / "templates" / "pdf"
    jinja_env = Environment(loader=FileSystemLoader(str(templates_dir)))
    template = jinja_env.get_template("employment_terms.html")
    html_content = template.render(**context)

    import asyncio
    loop = asyncio.get_event_loop()
    pdf_bytes = await loop.run_in_executor(None, lambda: HTML(string=html_content).write_pdf())

    filename = f"Employment_Terms_{emp.full_name.replace(' ', '_')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── Leave Types ─────────────────────────────────────────────────────────────

@router.get("/leave-types", response_model=List[LeaveTypeResponse])
async def list_leave_types(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(LeaveType).where(LeaveType.is_active == True)
    query = apply_tenant_filter(query, LeaveType, current_user)
    result = await db.execute(query.order_by(LeaveType.name))
    return result.scalars().all()


@router.post("/leave-types", response_model=LeaveTypeResponse, status_code=201)
async def create_leave_type(
    body: LeaveTypeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    lt = LeaveType(**body.model_dump(), tenant_id=current_user.tenant_id)
    db.add(lt)
    await db.commit()
    await db.refresh(lt)
    return lt


@router.put("/leave-types/{lt_id}", response_model=LeaveTypeResponse)
async def update_leave_type(
    lt_id: int,
    body: LeaveTypeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    result = await db.execute(select(LeaveType).where(LeaveType.id == lt_id))
    lt = result.scalar_one_or_none()
    if not lt:
        raise HTTPException(status_code=404, detail="Leave type not found")
    for k, v in body.model_dump().items():
        setattr(lt, k, v)
    await db.commit()
    await db.refresh(lt)
    return lt


# ─── Leave Balances ───────────────────────────────────────────────────────────

@router.get("/leave-balances", response_model=List[LeaveBalanceResponse])
async def list_leave_balances(
    employee_id: Optional[int] = Query(None),
    leave_type_id: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(LeaveBalance).options(selectinload(LeaveBalance.leave_type_rel))
    query = apply_tenant_filter(query, LeaveBalance, current_user)
    if employee_id:
        query = query.where(LeaveBalance.employee_id == employee_id)
    if leave_type_id:
        query = query.where(LeaveBalance.leave_type_id == leave_type_id)
    if year:
        query = query.where(LeaveBalance.year == year)
    result = await db.execute(query)
    balances = result.scalars().all()

    # Resolve employee gender for filtering gender-restricted leave types
    emp_gender: Optional[str] = None
    if employee_id:
        emp_res = await db.execute(select(Employee).where(Employee.id == employee_id))
        emp_obj = emp_res.scalar_one_or_none()
        if emp_obj:
            emp_gender = (emp_obj.gender or "").lower().strip() or None

    out = []
    for b in balances:
        lt = b.leave_type_rel
        if lt and lt.applicable_gender:
            # Hide gender-restricted leave unless employee gender explicitly matches
            if not emp_gender or lt.applicable_gender.lower() != emp_gender:
                continue
        out.append(LeaveBalanceResponse(
            id=b.id,
            employee_id=b.employee_id,
            leave_type_id=b.leave_type_id,
            leave_type_name=lt.name if lt else None,
            year=b.year,
            entitled=float(b.entitled),
            taken=float(b.taken),
            balance=float(b.entitled) - float(b.taken),
        ))
    return out


@router.post("/leave-balances", status_code=201)
async def set_leave_balance(
    employee_id: int,
    leave_type_id: int,
    year: int,
    entitled: float,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin_or_manager(current_user)
    query = select(LeaveBalance).where(
        LeaveBalance.employee_id == employee_id,
        LeaveBalance.leave_type_id == leave_type_id,
        LeaveBalance.year == year,
    )
    result = await db.execute(query)
    bal = result.scalar_one_or_none()
    if bal:
        bal.entitled = entitled
    else:
        bal = LeaveBalance(
            tenant_id=current_user.tenant_id,
            employee_id=employee_id,
            leave_type_id=leave_type_id,
            year=year,
            entitled=entitled,
            taken=0,
        )
        db.add(bal)
    await db.commit()
    await db.refresh(bal)
    return {"id": bal.id, "entitled": float(bal.entitled), "taken": float(bal.taken)}


@router.post("/leave-balances/sync-all", status_code=200)
async def sync_all_leave_balances(
    year: int = Query(default=None),
    overwrite: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk-assign all active leave types to all active employees for the given year.
    Pro-rated types use join date. Non-pro-rated use days_per_year.
    Set overwrite=true to update existing balances."""
    from datetime import date as date_cls

    require_admin_or_manager(current_user)
    target_year = year or date_cls.today().year
    year_start = date_cls(target_year, 1, 1)
    year_end = date_cls(target_year, 12, 31)

    # Load all active employees for this tenant
    emp_result = await db.execute(
        select(Employee).where(
            Employee.tenant_id == current_user.tenant_id,
            Employee.employment_status.notin_(["resigned", "terminated"]),
        )
    )
    employees = emp_result.scalars().all()

    # Load all active leave types for this tenant
    lt_result = await db.execute(
        select(LeaveType).where(
            LeaveType.tenant_id == current_user.tenant_id,
            LeaveType.is_active == True,
        )
    )
    leave_types = lt_result.scalars().all()

    created = updated = skipped = 0

    for emp in employees:
        join = emp.join_date or year_start
        months_worked = _completed_months(join, target_year)

        emp_gender = (emp.gender or "").lower().strip() or None
        for lt in leave_types:
            # Skip gender-restricted leave types unless employee gender explicitly matches
            if lt.applicable_gender and (not emp_gender or lt.applicable_gender.lower() != emp_gender):
                skipped += 1
                continue

            entitled = round((lt.days_per_year / 12) * months_worked, 2) if lt.is_pro_rated else float(lt.days_per_year)

            q = select(LeaveBalance).where(
                LeaveBalance.employee_id == emp.id,
                LeaveBalance.leave_type_id == lt.id,
                LeaveBalance.year == target_year,
            )
            res = await db.execute(q)
            bal = res.scalar_one_or_none()

            if bal:
                if overwrite:
                    bal.entitled = entitled
                    updated += 1
                else:
                    skipped += 1
            else:
                db.add(LeaveBalance(
                    tenant_id=current_user.tenant_id,
                    employee_id=emp.id,
                    leave_type_id=lt.id,
                    year=target_year,
                    entitled=entitled,
                    taken=0,
                ))
                created += 1

    await db.commit()
    return {
        "year": target_year,
        "employees": len(employees),
        "leave_types": len(leave_types),
        "created": created,
        "updated": updated,
        "skipped": skipped,
    }


@router.get("/leave-balances/prorate/{employee_id}")
async def get_prorate_preview(
    employee_id: int,
    year: int = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Calculate pro-rated leave entitlement for an employee based on join date."""
    from datetime import date as date_cls
    import math

    target_year = year or date_cls.today().year

    emp_result = await db.execute(select(Employee).where(Employee.id == employee_id))
    emp = emp_result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    year_start = date_cls(target_year, 1, 1)
    join = emp.join_date or year_start
    months_worked = _prorate_months(join, target_year)

    # Get all pro-rated leave types for this tenant
    lt_result = await db.execute(
        select(LeaveType).where(
            LeaveType.is_pro_rated == True,
            LeaveType.is_active == True,
            LeaveType.tenant_id == current_user.tenant_id,
        )
    )
    leave_types = lt_result.scalars().all()

    results = []
    for lt in leave_types:
        daily_rate = lt.days_per_year / 12
        entitled = round(daily_rate * months_worked, 2)
        results.append({
            "leave_type_id": lt.id,
            "leave_type_name": lt.name,
            "days_per_year": lt.days_per_year,
            "months_worked": months_worked,
            "monthly_rate": round(daily_rate, 4),
            "entitled": entitled,
        })

    return {
        "employee_id": employee_id,
        "employee_name": emp.full_name,
        "join_date": str(emp.join_date) if emp.join_date else None,
        "year": target_year,
        "months_worked": months_worked,
        "breakdown": results,
    }


@router.post("/leave-balances/prorate/{employee_id}", status_code=201)
async def apply_prorate(
    employee_id: int,
    year: int = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Auto-set leave balances for pro-rated leave types based on join date."""
    from datetime import date as date_cls

    require_admin_or_manager(current_user)
    target_year = year or date_cls.today().year

    emp_result = await db.execute(select(Employee).where(Employee.id == employee_id))
    emp = emp_result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    year_start = date_cls(target_year, 1, 1)
    join = emp.join_date or year_start
    months_worked = _prorate_months(join, target_year)

    lt_result = await db.execute(
        select(LeaveType).where(LeaveType.is_pro_rated == True, LeaveType.is_active == True,
                                LeaveType.tenant_id == current_user.tenant_id)
    )
    leave_types = lt_result.scalars().all()

    updated = []
    for lt in leave_types:
        entitled = round((lt.days_per_year / 12) * months_worked, 2)
        q = select(LeaveBalance).where(
            LeaveBalance.employee_id == employee_id,
            LeaveBalance.leave_type_id == lt.id,
            LeaveBalance.year == target_year,
        )
        res = await db.execute(q)
        bal = res.scalar_one_or_none()
        if bal:
            bal.entitled = entitled
        else:
            bal = LeaveBalance(
                tenant_id=current_user.tenant_id,
                employee_id=employee_id,
                leave_type_id=lt.id,
                year=target_year,
                entitled=entitled,
                taken=0,
            )
            db.add(bal)
        updated.append({"leave_type": lt.name, "entitled": entitled})

    await db.commit()
    return {"updated": updated, "months_worked": months_worked}


# ─── Leave Applications ───────────────────────────────────────────────────────

@router.get("/leave", response_model=List[LeaveApplicationResponse])
async def list_leave(
    employee_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    month: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(LeaveApplication).options(
        selectinload(LeaveApplication.employee),
        selectinload(LeaveApplication.leave_type_rel),
    )
    query = apply_tenant_filter(query, LeaveApplication, current_user)
    if employee_id:
        query = query.where(LeaveApplication.employee_id == employee_id)
    if status:
        query = query.where(LeaveApplication.status == status)
    if month:
        y, m = int(month.split("-")[0]), int(month.split("-")[1])
        from datetime import date as _date
        start = _date(y, m, 1)
        end = _date(y + 1, 1, 1) if m == 12 else _date(y, m + 1, 1)
        query = query.where(LeaveApplication.start_date >= start, LeaveApplication.start_date < end)
    query = query.order_by(LeaveApplication.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    apps = result.scalars().all()
    out = []
    for a in apps:
        out.append(LeaveApplicationResponse(
            id=a.id,
            employee_id=a.employee_id,
            employee_name=a.employee.full_name if a.employee else None,
            leave_type_id=a.leave_type_id,
            leave_type_name=a.leave_type_rel.name if a.leave_type_rel else None,
            start_date=a.start_date,
            end_date=a.end_date,
            days=float(a.days),
            reason=a.reason,
            document_url=a.document_url,
            status=a.status.value if a.status else "pending",
            approved_by=a.approved_by,
            approved_at=a.approved_at,
            rejection_reason=a.rejection_reason,
            created_at=a.created_at,
        ))
    return out


@router.post("/leave", response_model=LeaveApplicationResponse, status_code=201)
async def apply_leave(
    body: LeaveApplicationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    app = LeaveApplication(
        **body.model_dump(),
        tenant_id=current_user.tenant_id,
        applied_by=current_user.id,
    )
    db.add(app)
    await db.commit()
    await db.refresh(app)
    return LeaveApplicationResponse(
        id=app.id, employee_id=app.employee_id, leave_type_id=app.leave_type_id,
        start_date=app.start_date, end_date=app.end_date, days=float(app.days),
        reason=app.reason, status=app.status.value, created_at=app.created_at,
    )


@router.post("/leave/{leave_id}/approve", response_model=LeaveApplicationResponse)
async def approve_leave(
    leave_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin_or_manager(current_user)
    result = await db.execute(
        select(LeaveApplication).options(
            selectinload(LeaveApplication.employee),
            selectinload(LeaveApplication.leave_type_rel),
        ).where(LeaveApplication.id == leave_id)
    )
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Leave application not found")
    app.status = LeaveApplicationStatus.approved
    app.approved_by = current_user.id
    app.approved_at = datetime.utcnow()

    # Deduct from balance
    year = app.start_date.year
    bal_result = await db.execute(
        select(LeaveBalance).where(
            LeaveBalance.employee_id == app.employee_id,
            LeaveBalance.leave_type_id == app.leave_type_id,
            LeaveBalance.year == year,
        )
    )
    bal = bal_result.scalar_one_or_none()
    if bal:
        bal.taken = float(bal.taken) + float(app.days)

    await db.commit()
    await db.refresh(app)
    return LeaveApplicationResponse(
        id=app.id, employee_id=app.employee_id,
        employee_name=app.employee.full_name if app.employee else None,
        leave_type_id=app.leave_type_id,
        leave_type_name=app.leave_type_rel.name if app.leave_type_rel else None,
        start_date=app.start_date, end_date=app.end_date, days=float(app.days),
        reason=app.reason, status=app.status.value,
        approved_by=app.approved_by, approved_at=app.approved_at, created_at=app.created_at,
    )


@router.post("/leave/{leave_id}/reject")
async def reject_leave(
    leave_id: int,
    reason: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin_or_manager(current_user)
    result = await db.execute(select(LeaveApplication).where(LeaveApplication.id == leave_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Leave application not found")
    app.status = LeaveApplicationStatus.rejected
    app.approved_by = current_user.id
    app.approved_at = datetime.utcnow()
    app.rejection_reason = reason
    await db.commit()
    return {"status": "rejected"}


@router.post("/leave/{leave_id}/document")
async def upload_leave_document(
    leave_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(LeaveApplication).where(LeaveApplication.id == leave_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Leave application not found")
    url = await _save_file(file, "hr/leave_docs")
    app.document_url = url
    await db.commit()
    return {"document_url": url}


# ─── Attendance ───────────────────────────────────────────────────────────────

@router.get("/attendance", response_model=List[AttendanceResponse])
async def list_attendance(
    employee_id: Optional[int] = Query(None),
    month: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(AttendanceRecord).options(selectinload(AttendanceRecord.employee))
    query = apply_tenant_filter(query, AttendanceRecord, current_user)
    if employee_id:
        query = query.where(AttendanceRecord.employee_id == employee_id)
    if month:
        y, m = int(month.split("-")[0]), int(month.split("-")[1])
        from datetime import date as _date
        start = _date(y, m, 1)
        end = _date(y + 1, 1, 1) if m == 12 else _date(y, m + 1, 1)
        query = query.where(AttendanceRecord.date >= start, AttendanceRecord.date < end)
    if date_from:
        query = query.where(AttendanceRecord.date >= date_from)
    if date_to:
        query = query.where(AttendanceRecord.date <= date_to)
    query = query.order_by(AttendanceRecord.date.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    records = result.scalars().all()
    return [AttendanceResponse(
        id=r.id, employee_id=r.employee_id,
        employee_name=r.employee.full_name if r.employee else None,
        date=r.date, check_in=r.check_in, check_out=r.check_out,
        work_hours=float(r.work_hours) if r.work_hours else None,
        overtime_hours=float(r.overtime_hours) if r.overtime_hours else None,
        status=r.status.value if r.status else "present",
        notes=r.notes,
    ) for r in records]


@router.post("/attendance", response_model=AttendanceResponse, status_code=201)
async def create_attendance(
    body: AttendanceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin_or_manager(current_user)
    # Auto-calc work hours
    work_hours = body.work_hours
    if body.check_in and body.check_out and work_hours is None:
        delta = body.check_out - body.check_in
        work_hours = round(delta.total_seconds() / 3600, 2)
    rec = AttendanceRecord(
        tenant_id=current_user.tenant_id,
        employee_id=body.employee_id,
        date=body.date,
        check_in=body.check_in,
        check_out=body.check_out,
        work_hours=work_hours,
        overtime_hours=body.overtime_hours,
        status=body.status,
        notes=body.notes,
    )
    db.add(rec)
    await db.commit()
    await db.refresh(rec)
    result = await db.execute(
        select(AttendanceRecord).options(selectinload(AttendanceRecord.employee)).where(AttendanceRecord.id == rec.id)
    )
    r = result.scalar_one()
    return AttendanceResponse(
        id=r.id, employee_id=r.employee_id,
        employee_name=r.employee.full_name if r.employee else None,
        date=r.date, check_in=r.check_in, check_out=r.check_out,
        work_hours=float(r.work_hours) if r.work_hours else None,
        overtime_hours=float(r.overtime_hours) if r.overtime_hours else None,
        status=r.status.value, notes=r.notes,
    )


@router.put("/attendance/{rec_id}", response_model=AttendanceResponse)
async def update_attendance(
    rec_id: int,
    body: AttendanceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin_or_manager(current_user)
    result = await db.execute(
        select(AttendanceRecord).options(selectinload(AttendanceRecord.employee)).where(AttendanceRecord.id == rec_id)
    )
    r = result.scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Record not found")
    work_hours = body.work_hours
    if body.check_in and body.check_out and work_hours is None:
        delta = body.check_out - body.check_in
        work_hours = round(delta.total_seconds() / 3600, 2)
    r.employee_id = body.employee_id
    r.date = body.date
    r.check_in = body.check_in
    r.check_out = body.check_out
    r.work_hours = work_hours
    r.overtime_hours = body.overtime_hours
    r.status = body.status
    r.notes = body.notes
    await db.commit()
    await db.refresh(r)
    return AttendanceResponse(
        id=r.id, employee_id=r.employee_id,
        employee_name=r.employee.full_name if r.employee else None,
        date=r.date, check_in=r.check_in, check_out=r.check_out,
        work_hours=float(r.work_hours) if r.work_hours else None,
        overtime_hours=float(r.overtime_hours) if r.overtime_hours else None,
        status=r.status.value, notes=r.notes,
    )


# ─── Public Holidays ─────────────────────────────────────────────────────────

@router.get("/public-holidays", response_model=List[PublicHolidayResponse])
async def list_public_holidays(
    year: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(PublicHoliday)
    query = apply_tenant_filter(query, PublicHoliday, current_user)
    if year:
        query = query.where(PublicHoliday.year == year)
    result = await db.execute(query.order_by(PublicHoliday.date))
    return result.scalars().all()


@router.post("/public-holidays", response_model=PublicHolidayResponse, status_code=201)
async def create_public_holiday(
    body: PublicHolidayCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    ph = PublicHoliday(**body.model_dump(), tenant_id=current_user.tenant_id)
    db.add(ph)
    await db.commit()
    await db.refresh(ph)
    return ph


@router.delete("/public-holidays/{ph_id}", status_code=204)
async def delete_public_holiday(
    ph_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    result = await db.execute(select(PublicHoliday).where(PublicHoliday.id == ph_id))
    ph = result.scalar_one_or_none()
    if not ph:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(ph)
    await db.commit()


# ─── Salary Structures ───────────────────────────────────────────────────────

@router.get("/salary-structures", response_model=List[SalaryStructureResponse])
async def list_salary_structures(
    employee_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin_or_manager(current_user)
    query = select(SalaryStructure)
    query = apply_tenant_filter(query, SalaryStructure, current_user)
    if employee_id:
        query = query.where(SalaryStructure.employee_id == employee_id)
    result = await db.execute(query.order_by(SalaryStructure.effective_from.desc()))
    ss = result.scalars().all()
    return [SalaryStructureResponse(
        id=s.id, employee_id=s.employee_id,
        basic_salary=float(s.basic_salary),
        transport_allowance=float(s.transport_allowance) if s.transport_allowance else 0,
        housing_allowance=float(s.housing_allowance) if s.housing_allowance else 0,
        phone_allowance=float(s.phone_allowance) if s.phone_allowance else 0,
        other_allowance=float(s.other_allowance) if s.other_allowance else 0,
        other_allowance_name=s.other_allowance_name,
        effective_from=s.effective_from,
    ) for s in ss]


@router.post("/salary-structures", response_model=SalaryStructureResponse, status_code=201)
async def create_salary_structure(
    body: SalaryStructureCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin_or_manager(current_user)
    ss = SalaryStructure(**body.model_dump(), tenant_id=current_user.tenant_id)
    db.add(ss)
    await db.commit()
    await db.refresh(ss)
    return SalaryStructureResponse(
        id=ss.id, employee_id=ss.employee_id,
        basic_salary=float(ss.basic_salary),
        transport_allowance=float(ss.transport_allowance) if ss.transport_allowance else 0,
        housing_allowance=float(ss.housing_allowance) if ss.housing_allowance else 0,
        phone_allowance=float(ss.phone_allowance) if ss.phone_allowance else 0,
        other_allowance=float(ss.other_allowance) if ss.other_allowance else 0,
        other_allowance_name=ss.other_allowance_name,
        effective_from=ss.effective_from,
    )


# ─── Payroll ─────────────────────────────────────────────────────────────────

@router.get("/payroll", response_model=List[PayrollRunResponse])
async def list_payroll_runs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin_or_manager(current_user)
    query = select(PayrollRun)
    query = apply_tenant_filter(query, PayrollRun, current_user)
    result = await db.execute(query.order_by(PayrollRun.year.desc(), PayrollRun.month.desc()))
    runs = result.scalars().all()
    return [PayrollRunResponse(
        id=r.id, month=r.month, year=r.year, status=r.status.value,
        total_gross=float(r.total_gross) if r.total_gross else 0,
        total_net=float(r.total_net) if r.total_net else 0,
        total_employee_count=r.total_employee_count,
        notes=r.notes, finalized_at=r.finalized_at, created_at=r.created_at,
    ) for r in runs]


@router.post("/payroll", response_model=PayrollRunResponse, status_code=201)
async def create_payroll_run(
    body: PayrollRunCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin_or_manager(current_user)
    tenant_id = current_user.tenant_id

    # Fetch all active employees
    emp_q = select(Employee).where(
        Employee.employment_status.in_(["active", "probation"])
    )
    emp_q = apply_tenant_filter(emp_q, Employee, current_user)
    emp_result = await db.execute(emp_q)
    employees = emp_result.scalars().all()

    # Create payroll run
    run = PayrollRun(
        tenant_id=tenant_id,
        month=body.month,
        year=body.year,
        notes=body.notes,
        created_by=current_user.id,
    )
    db.add(run)
    await db.flush()

    total_gross = 0.0
    total_net = 0.0

    for emp in employees:
        # Get latest salary structure
        ss_result = await db.execute(
            select(SalaryStructure).where(SalaryStructure.employee_id == emp.id)
            .order_by(SalaryStructure.effective_from.desc()).limit(1)
        )
        ss = ss_result.scalar_one_or_none()

        basic = float(ss.basic_salary) if ss else float(emp.basic_salary or 0)
        transport = float(ss.transport_allowance or 0) if ss else 0
        housing = float(ss.housing_allowance or 0) if ss else 0
        phone = float(ss.phone_allowance or 0) if ss else 0
        other = float(ss.other_allowance or 0) if ss else 0

        # Claims approved for this employee for this month
        from datetime import date as _date
        m_start = _date(body.year, body.month, 1)
        m_end = _date(body.year + 1, 1, 1) if body.month == 12 else _date(body.year, body.month + 1, 1)
        claims_result = await db.execute(
            select(func.sum(ClaimApplication.amount)).where(
                ClaimApplication.employee_id == emp.id,
                ClaimApplication.status == "approved",
                ClaimApplication.claim_date >= m_start,
                ClaimApplication.claim_date < m_end,
            )
        )
        claims_reimbursement = float(claims_result.scalar() or 0)

        # Attendance summary
        att_result = await db.execute(
            select(AttendanceRecord).where(
                AttendanceRecord.employee_id == emp.id,
                AttendanceRecord.date >= m_start,
                AttendanceRecord.date < m_end,
            )
        )
        att_records = att_result.scalars().all()
        present_days = sum(1 for a in att_records if a.status.value in ["present", "late", "half_day"])
        absent_days = sum(1 for a in att_records if a.status.value == "absent")
        leave_days = sum(1 for a in att_records if a.status.value == "leave")
        overtime_hours = sum(float(a.overtime_hours or 0) for a in att_records)
        # Overtime pay: basic/26 * 1.5 per hour (simplified)
        daily_rate = basic / 26
        hourly_rate = daily_rate / 8
        overtime_pay = round(overtime_hours * hourly_rate * 1.5, 2)

        gross = basic + transport + housing + phone + other + overtime_pay + claims_reimbursement

        # Age estimate
        age = 30
        if emp.date_of_birth:
            today = date.today()
            age = today.year - emp.date_of_birth.year - (
                (today.month, today.day) < (emp.date_of_birth.month, emp.date_of_birth.day)
            )

        statutory = _calculate_malaysian_statutory(
            Decimal(str(gross)), age,
            children=emp.children_count or 0,
            spouse_working=emp.spouse_working or False,
        )

        net = gross - statutory["epf_employee"] - statutory["socso_employee"] - statutory["eis_employee"] - statutory["pcb"]

        line = PayslipLine(
            tenant_id=tenant_id,
            payroll_run_id=run.id,
            employee_id=emp.id,
            basic_salary=basic,
            transport_allowance=transport,
            housing_allowance=housing,
            phone_allowance=phone,
            other_allowance=other,
            overtime_pay=overtime_pay,
            claims_reimbursement=claims_reimbursement,
            gross_pay=gross,
            epf_employee=statutory["epf_employee"],
            epf_employer=statutory["epf_employer"],
            socso_employee=statutory["socso_employee"],
            socso_employer=statutory["socso_employer"],
            eis_employee=statutory["eis_employee"],
            eis_employer=statutory["eis_employer"],
            pcb=statutory["pcb"],
            net_pay=max(0, net),
            working_days=len(att_records),
            present_days=present_days,
            absent_days=absent_days,
            leave_days=leave_days,
        )
        db.add(line)
        total_gross += gross
        total_net += max(0, net)

    run.total_gross = total_gross
    run.total_net = total_net
    run.total_employee_count = len(employees)
    await db.commit()

    # Reload with lines
    result = await db.execute(
        select(PayrollRun).options(
            selectinload(PayrollRun.payslip_lines).selectinload(PayslipLine.employee)
        ).where(PayrollRun.id == run.id)
    )
    run = result.scalar_one()
    lines = [PayslipLineResponse(
        id=l.id, employee_id=l.employee_id,
        employee_name=l.employee.full_name if l.employee else None,
        employee_no=l.employee.employee_no if l.employee else None,
        basic_salary=float(l.basic_salary), transport_allowance=float(l.transport_allowance or 0),
        housing_allowance=float(l.housing_allowance or 0), phone_allowance=float(l.phone_allowance or 0),
        other_allowance=float(l.other_allowance or 0), overtime_pay=float(l.overtime_pay or 0),
        claims_reimbursement=float(l.claims_reimbursement or 0), gross_pay=float(l.gross_pay),
        epf_employee=float(l.epf_employee or 0), epf_employer=float(l.epf_employer or 0),
        socso_employee=float(l.socso_employee or 0), socso_employer=float(l.socso_employer or 0),
        eis_employee=float(l.eis_employee or 0), eis_employer=float(l.eis_employer or 0),
        pcb=float(l.pcb or 0), other_deduction=float(l.other_deduction or 0),
        net_pay=float(l.net_pay), working_days=l.working_days,
        present_days=l.present_days, absent_days=l.absent_days, leave_days=l.leave_days,
    ) for l in run.payslip_lines]

    return PayrollRunResponse(
        id=run.id, month=run.month, year=run.year, status=run.status.value,
        total_gross=float(run.total_gross), total_net=float(run.total_net),
        total_employee_count=run.total_employee_count, notes=run.notes,
        created_at=run.created_at, payslip_lines=lines,
    )


@router.get("/payroll/{run_id}", response_model=PayrollRunResponse)
async def get_payroll_run(
    run_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin_or_manager(current_user)
    result = await db.execute(
        select(PayrollRun).options(
            selectinload(PayrollRun.payslip_lines).selectinload(PayslipLine.employee)
        ).where(PayrollRun.id == run_id)
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found")
    lines = [PayslipLineResponse(
        id=l.id, employee_id=l.employee_id,
        employee_name=l.employee.full_name if l.employee else None,
        employee_no=l.employee.employee_no if l.employee else None,
        basic_salary=float(l.basic_salary), transport_allowance=float(l.transport_allowance or 0),
        housing_allowance=float(l.housing_allowance or 0), phone_allowance=float(l.phone_allowance or 0),
        other_allowance=float(l.other_allowance or 0), overtime_pay=float(l.overtime_pay or 0),
        claims_reimbursement=float(l.claims_reimbursement or 0), gross_pay=float(l.gross_pay),
        epf_employee=float(l.epf_employee or 0), epf_employer=float(l.epf_employer or 0),
        socso_employee=float(l.socso_employee or 0), socso_employer=float(l.socso_employer or 0),
        eis_employee=float(l.eis_employee or 0), eis_employer=float(l.eis_employer or 0),
        pcb=float(l.pcb or 0), other_deduction=float(l.other_deduction or 0),
        net_pay=float(l.net_pay), working_days=l.working_days,
        present_days=l.present_days, absent_days=l.absent_days, leave_days=l.leave_days,
    ) for l in run.payslip_lines]
    return PayrollRunResponse(
        id=run.id, month=run.month, year=run.year, status=run.status.value,
        total_gross=float(run.total_gross or 0), total_net=float(run.total_net or 0),
        total_employee_count=run.total_employee_count, notes=run.notes,
        finalized_at=run.finalized_at, created_at=run.created_at, payslip_lines=lines,
    )


@router.post("/payroll/{run_id}/finalize")
async def finalize_payroll(
    run_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    result = await db.execute(select(PayrollRun).where(PayrollRun.id == run_id))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found")
    run.status = PayrollStatus.finalized
    run.finalized_by = current_user.id
    run.finalized_at = datetime.utcnow()
    await db.commit()
    return {"status": "finalized"}


@router.delete("/payroll/{run_id}", status_code=204)
async def delete_payroll_run(
    run_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin(current_user)
    result = await db.execute(select(PayrollRun).where(PayrollRun.id == run_id))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Not found")
    if run.status == PayrollStatus.finalized:
        raise HTTPException(status_code=400, detail="Cannot delete a finalized payroll run")
    await db.delete(run)
    await db.commit()


@router.get("/payroll/{run_id}/payslip/{line_id}/pdf")
async def get_payslip_pdf(
    run_id: int,
    line_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import io as _io
    from fastapi.responses import StreamingResponse
    from jinja2 import Environment, FileSystemLoader, select_autoescape
    from pathlib import Path
    from app.services.pdf_service import _render_pdf
    from app.services.signature_service import get_logo_base64
    import asyncio

    require_admin_or_manager(current_user)

    run_result = await db.execute(select(PayrollRun).where(PayrollRun.id == run_id))
    run = run_result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found")

    line_result = await db.execute(
        select(PayslipLine).options(
            selectinload(PayslipLine.employee).selectinload(Employee.department_rel)
        ).where(PayslipLine.id == line_id, PayslipLine.payroll_run_id == run_id)
    )
    line = line_result.scalar_one_or_none()
    if not line:
        raise HTTPException(status_code=404, detail="Payslip not found")

    tid = get_effective_tenant_id(current_user)
    co_row = await db.execute(
        text("SELECT * FROM company_settings WHERE (tenant_id=:tid OR (tenant_id IS NULL AND :tid IS NULL)) LIMIT 1"),
        {"tid": tid},
    )
    company = dict(co_row.mappings().first() or {})
    logo_data = get_logo_base64(company.get("logo_url"))

    emp = line.employee
    MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]

    ctx = {
        "company": company,
        "logo_data": logo_data,
        "month_name": MONTHS[run.month - 1],
        "year": run.year,
        "employee": {
            "full_name": emp.full_name if emp else "",
            "employee_no": emp.employee_no if emp else "",
            "ic_no": emp.ic_no or "",
            "designation": emp.designation or "",
            "department": emp.department_rel.name if emp and emp.department_rel else "",
            "epf_no": emp.epf_no or "",
            "socso_no": emp.socso_no or "",
            "income_tax_no": emp.income_tax_no or "",
            "bank_name": emp.bank_name or "",
            "bank_account_no": emp.bank_account_no or "",
        },
        "line": {
            "basic_salary": float(line.basic_salary),
            "transport_allowance": float(line.transport_allowance or 0),
            "housing_allowance": float(line.housing_allowance or 0),
            "phone_allowance": float(line.phone_allowance or 0),
            "other_allowance": float(line.other_allowance or 0),
            "overtime_pay": float(line.overtime_pay or 0),
            "claims_reimbursement": float(line.claims_reimbursement or 0),
            "gross_pay": float(line.gross_pay),
            "epf_employee": float(line.epf_employee or 0),
            "epf_employer": float(line.epf_employer or 0),
            "socso_employee": float(line.socso_employee or 0),
            "socso_employer": float(line.socso_employer or 0),
            "eis_employee": float(line.eis_employee or 0),
            "eis_employer": float(line.eis_employer or 0),
            "pcb": float(line.pcb or 0),
            "other_deduction": float(line.other_deduction or 0),
            "net_pay": float(line.net_pay),
            "working_days": line.working_days,
            "present_days": line.present_days,
            "absent_days": line.absent_days,
            "leave_days": line.leave_days,
        },
    }

    TEMPLATES_DIR = Path(__file__).parent.parent / "templates" / "pdf"
    env = Environment(loader=FileSystemLoader(str(TEMPLATES_DIR)), autoescape=select_autoescape(["html"]))
    env.filters["fmt"] = lambda v: f"{float(v):,.2f}" if v else "0.00"
    template = env.get_template("payslip.html")
    html = template.render(**ctx)

    loop = asyncio.get_event_loop()
    pdf_bytes = await loop.run_in_executor(None, _render_pdf, html)

    safe_name = (emp.full_name if emp else "employee").replace(" ", "_")
    filename = f"payslip_{safe_name}_{MONTHS[run.month - 1]}_{run.year}.pdf"
    return StreamingResponse(
        _io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── Claims ──────────────────────────────────────────────────────────────────

@router.get("/claims", response_model=List[ClaimResponse])
async def list_claims(
    employee_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(ClaimApplication).options(selectinload(ClaimApplication.employee))
    query = apply_tenant_filter(query, ClaimApplication, current_user)
    if employee_id:
        query = query.where(ClaimApplication.employee_id == employee_id)
    if status:
        query = query.where(ClaimApplication.status == status)
    query = query.order_by(ClaimApplication.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    claims = result.scalars().all()
    return [ClaimResponse(
        id=c.id, employee_id=c.employee_id,
        employee_name=c.employee.full_name if c.employee else None,
        claim_type=c.claim_type, description=c.description, amount=float(c.amount),
        claim_date=c.claim_date, receipt_url=c.receipt_url,
        status=c.status.value, approved_by=c.approved_by,
        approved_at=c.approved_at, rejection_reason=c.rejection_reason,
        created_at=c.created_at,
    ) for c in claims]


@router.post("/claims", response_model=ClaimResponse, status_code=201)
async def create_claim(
    employee_id: int = Form(...),
    claim_type: str = Form(...),
    description: str = Form(...),
    amount: float = Form(...),
    claim_date: date = Form(...),
    receipt: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    receipt_url = None
    if receipt and receipt.filename:
        receipt_url = await _save_file(receipt, "hr/claims")
    claim = ClaimApplication(
        tenant_id=current_user.tenant_id,
        employee_id=employee_id,
        claim_type=claim_type,
        description=description,
        amount=amount,
        claim_date=claim_date,
        receipt_url=receipt_url,
        applied_by=current_user.id,
    )
    db.add(claim)
    await db.commit()
    await db.refresh(claim)
    return ClaimResponse(
        id=claim.id, employee_id=claim.employee_id, claim_type=claim.claim_type,
        description=claim.description, amount=float(claim.amount),
        claim_date=claim.claim_date, receipt_url=claim.receipt_url,
        status=claim.status.value, created_at=claim.created_at,
    )


@router.post("/claims/{claim_id}/approve")
async def approve_claim(
    claim_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin_or_manager(current_user)
    result = await db.execute(select(ClaimApplication).where(ClaimApplication.id == claim_id))
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    claim.status = ClaimStatus.approved
    claim.approved_by = current_user.id
    claim.approved_at = datetime.utcnow()
    await db.commit()
    return {"status": "approved"}


@router.post("/claims/{claim_id}/reject")
async def reject_claim(
    claim_id: int,
    reason: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin_or_manager(current_user)
    result = await db.execute(select(ClaimApplication).where(ClaimApplication.id == claim_id))
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    claim.status = ClaimStatus.rejected
    claim.approved_by = current_user.id
    claim.approved_at = datetime.utcnow()
    claim.rejection_reason = reason
    await db.commit()
    return {"status": "rejected"}


# ─── Performance Reviews ─────────────────────────────────────────────────────

@router.get("/performance", response_model=List[PerformanceReviewResponse])
async def list_performance(
    employee_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(PerformanceReview).options(selectinload(PerformanceReview.employee))
    query = apply_tenant_filter(query, PerformanceReview, current_user)
    if employee_id:
        query = query.where(PerformanceReview.employee_id == employee_id)
    result = await db.execute(query.order_by(PerformanceReview.review_date.desc()))
    reviews = result.scalars().all()
    return [PerformanceReviewResponse(
        id=r.id, employee_id=r.employee_id,
        employee_name=r.employee.full_name if r.employee else None,
        review_period=r.review_period, review_date=r.review_date,
        rating=r.rating.value if r.rating else None,
        kpi_score=float(r.kpi_score) if r.kpi_score else None,
        self_review=r.self_review, manager_review=r.manager_review,
        goals_next_period=r.goals_next_period, reviewed_by=r.reviewed_by,
        created_at=r.created_at,
    ) for r in reviews]


@router.post("/performance", response_model=PerformanceReviewResponse, status_code=201)
async def create_performance_review(
    body: PerformanceReviewCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin_or_manager(current_user)
    rev = PerformanceReview(
        **body.model_dump(),
        tenant_id=current_user.tenant_id,
        reviewed_by=current_user.id,
    )
    db.add(rev)
    await db.commit()
    await db.refresh(rev)
    return PerformanceReviewResponse(
        id=rev.id, employee_id=rev.employee_id,
        review_period=rev.review_period, review_date=rev.review_date,
        rating=rev.rating.value if rev.rating else None,
        kpi_score=float(rev.kpi_score) if rev.kpi_score else None,
        self_review=rev.self_review, manager_review=rev.manager_review,
        goals_next_period=rev.goals_next_period, reviewed_by=rev.reviewed_by,
        created_at=rev.created_at,
    )


@router.put("/performance/{rev_id}", response_model=PerformanceReviewResponse)
async def update_performance_review(
    rev_id: int,
    body: PerformanceReviewCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_admin_or_manager(current_user)
    result = await db.execute(
        select(PerformanceReview).options(selectinload(PerformanceReview.employee)).where(PerformanceReview.id == rev_id)
    )
    rev = result.scalar_one_or_none()
    if not rev:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in body.model_dump().items():
        setattr(rev, k, v)
    await db.commit()
    await db.refresh(rev)
    return PerformanceReviewResponse(
        id=rev.id, employee_id=rev.employee_id,
        employee_name=rev.employee.full_name if rev.employee else None,
        review_period=rev.review_period, review_date=rev.review_date,
        rating=rev.rating.value if rev.rating else None,
        kpi_score=float(rev.kpi_score) if rev.kpi_score else None,
        self_review=rev.self_review, manager_review=rev.manager_review,
        goals_next_period=rev.goals_next_period, reviewed_by=rev.reviewed_by,
        created_at=rev.created_at,
    )


# ─── HR Dashboard Stats ───────────────────────────────────────────────────────

@router.get("/stats")
async def hr_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    emp_q = select(func.count(Employee.id))
    emp_q = apply_tenant_filter(emp_q, Employee, current_user)
    total_employees = (await db.execute(emp_q)).scalar() or 0

    active_q = select(func.count(Employee.id)).where(Employee.employment_status == "active")
    active_q = apply_tenant_filter(active_q, Employee, current_user)
    active_employees = (await db.execute(active_q)).scalar() or 0

    today = date.today()
    pending_leave_q = select(func.count(LeaveApplication.id)).where(
        LeaveApplication.status == "pending"
    )
    pending_leave_q = apply_tenant_filter(pending_leave_q, LeaveApplication, current_user)
    pending_leave = (await db.execute(pending_leave_q)).scalar() or 0

    pending_claims_q = select(func.count(ClaimApplication.id)).where(
        ClaimApplication.status == "pending"
    )
    pending_claims_q = apply_tenant_filter(pending_claims_q, ClaimApplication, current_user)
    pending_claims = (await db.execute(pending_claims_q)).scalar() or 0

    on_leave_q = select(func.count(LeaveApplication.id)).where(
        LeaveApplication.status == "approved",
        LeaveApplication.start_date <= today,
        LeaveApplication.end_date >= today,
    )
    on_leave_q = apply_tenant_filter(on_leave_q, LeaveApplication, current_user)
    on_leave_today = (await db.execute(on_leave_q)).scalar() or 0

    return {
        "total_employees": total_employees,
        "active_employees": active_employees,
        "pending_leave_approvals": pending_leave,
        "pending_claims": pending_claims,
        "on_leave_today": on_leave_today,
    }
