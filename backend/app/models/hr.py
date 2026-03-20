import enum
from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Numeric, Boolean, Date, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class EmploymentType(str, enum.Enum):
    full_time = "full_time"
    part_time = "part_time"
    contract = "contract"
    intern = "intern"


class EmploymentStatus(str, enum.Enum):
    active = "active"
    probation = "probation"
    resigned = "resigned"
    terminated = "terminated"


class LeaveApplicationStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    cancelled = "cancelled"


class AttendanceStatus(str, enum.Enum):
    present = "present"
    absent = "absent"
    half_day = "half_day"
    late = "late"
    public_holiday = "public_holiday"
    leave = "leave"


class PayrollStatus(str, enum.Enum):
    draft = "draft"
    finalized = "finalized"


class ClaimStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    paid = "paid"


class PerformanceRating(str, enum.Enum):
    excellent = "excellent"
    good = "good"
    satisfactory = "satisfactory"
    needs_improvement = "needs_improvement"
    poor = "poor"


class Department(Base):
    __tablename__ = "hr_departments"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    employees = relationship("Employee", back_populates="department_rel")


class Employee(Base):
    __tablename__ = "hr_employees"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    department_id = Column(Integer, ForeignKey("hr_departments.id", ondelete="SET NULL"), nullable=True)

    # Personal info
    employee_no = Column(String(50), nullable=False)
    full_name = Column(String(255), nullable=False)
    ic_no = Column(String(20), nullable=True)
    passport_no = Column(String(30), nullable=True)
    date_of_birth = Column(Date, nullable=True)
    gender = Column(String(10), nullable=True)
    nationality = Column(String(50), nullable=True, default="Malaysian")
    religion = Column(String(50), nullable=True)
    marital_status = Column(String(20), nullable=True)

    # Contact
    phone = Column(String(20), nullable=True)
    email = Column(String(255), nullable=True)
    address = Column(Text, nullable=True)
    emergency_contact_name = Column(String(255), nullable=True)
    emergency_contact_phone = Column(String(20), nullable=True)
    emergency_contact_relation = Column(String(50), nullable=True)

    # Employment
    designation = Column(String(100), nullable=True)
    employment_type = Column(Enum(EmploymentType), nullable=False, default=EmploymentType.full_time)
    employment_status = Column(Enum(EmploymentStatus), nullable=False, default=EmploymentStatus.probation)
    join_date = Column(Date, nullable=True)
    confirmation_date = Column(Date, nullable=True)
    resignation_date = Column(Date, nullable=True)

    # Payroll
    basic_salary = Column(Numeric(12, 2), nullable=True, default=0)
    bank_name = Column(String(100), nullable=True)
    bank_account_no = Column(String(50), nullable=True)
    epf_no = Column(String(30), nullable=True)
    socso_no = Column(String(30), nullable=True)
    income_tax_no = Column(String(30), nullable=True)
    # Number of children (for PCB relief)
    children_count = Column(Integer, nullable=True, default=0)
    spouse_working = Column(Boolean, nullable=True, default=False)

    photo_url = Column(String(500), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    department_rel = relationship("Department", back_populates="employees")
    documents = relationship("EmployeeDocument", back_populates="employee", cascade="all, delete-orphan")
    leave_applications = relationship("LeaveApplication", back_populates="employee", cascade="all, delete-orphan")
    leave_balances = relationship("LeaveBalance", back_populates="employee", cascade="all, delete-orphan")
    attendance_records = relationship("AttendanceRecord", back_populates="employee", cascade="all, delete-orphan")
    salary_structures = relationship("SalaryStructure", back_populates="employee", cascade="all, delete-orphan")
    payslip_lines = relationship("PayslipLine", back_populates="employee")
    claim_applications = relationship("ClaimApplication", back_populates="employee", cascade="all, delete-orphan")
    performance_reviews = relationship("PerformanceReview", back_populates="employee", cascade="all, delete-orphan")


class EmployeeDocument(Base):
    __tablename__ = "hr_employee_documents"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("hr_employees.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    file_url = Column(String(500), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    employee = relationship("Employee", back_populates="documents")


class LeaveType(Base):
    __tablename__ = "hr_leave_types"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    name = Column(String(100), nullable=False)
    days_per_year = Column(Integer, nullable=False, default=0)
    is_paid = Column(Boolean, default=True)
    requires_document = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)

    applications = relationship("LeaveApplication", back_populates="leave_type_rel")
    balances = relationship("LeaveBalance", back_populates="leave_type_rel")


class LeaveBalance(Base):
    __tablename__ = "hr_leave_balances"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    employee_id = Column(Integer, ForeignKey("hr_employees.id", ondelete="CASCADE"), nullable=False)
    leave_type_id = Column(Integer, ForeignKey("hr_leave_types.id", ondelete="CASCADE"), nullable=False)
    year = Column(Integer, nullable=False)
    entitled = Column(Numeric(5, 1), nullable=False, default=0)
    taken = Column(Numeric(5, 1), nullable=False, default=0)

    employee = relationship("Employee", back_populates="leave_balances")
    leave_type_rel = relationship("LeaveType", back_populates="balances")


class LeaveApplication(Base):
    __tablename__ = "hr_leave_applications"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    employee_id = Column(Integer, ForeignKey("hr_employees.id", ondelete="CASCADE"), nullable=False)
    leave_type_id = Column(Integer, ForeignKey("hr_leave_types.id", ondelete="SET NULL"), nullable=True)

    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    days = Column(Numeric(5, 1), nullable=False)
    reason = Column(Text, nullable=True)
    document_url = Column(String(500), nullable=True)
    status = Column(Enum(LeaveApplicationStatus), nullable=False, default=LeaveApplicationStatus.pending)
    approved_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    rejection_reason = Column(Text, nullable=True)
    applied_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    employee = relationship("Employee", back_populates="leave_applications")
    leave_type_rel = relationship("LeaveType", back_populates="applications")


class AttendanceRecord(Base):
    __tablename__ = "hr_attendance"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    employee_id = Column(Integer, ForeignKey("hr_employees.id", ondelete="CASCADE"), nullable=False)

    date = Column(Date, nullable=False)
    check_in = Column(DateTime(timezone=True), nullable=True)
    check_out = Column(DateTime(timezone=True), nullable=True)
    work_hours = Column(Numeric(5, 2), nullable=True)
    overtime_hours = Column(Numeric(5, 2), nullable=True, default=0)
    status = Column(Enum(AttendanceStatus), nullable=False, default=AttendanceStatus.present)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    employee = relationship("Employee", back_populates="attendance_records")


class PublicHoliday(Base):
    __tablename__ = "hr_public_holidays"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    date = Column(Date, nullable=False)
    year = Column(Integer, nullable=False)


class SalaryStructure(Base):
    __tablename__ = "hr_salary_structures"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    employee_id = Column(Integer, ForeignKey("hr_employees.id", ondelete="CASCADE"), nullable=False)

    basic_salary = Column(Numeric(12, 2), nullable=False, default=0)
    transport_allowance = Column(Numeric(12, 2), nullable=True, default=0)
    housing_allowance = Column(Numeric(12, 2), nullable=True, default=0)
    phone_allowance = Column(Numeric(12, 2), nullable=True, default=0)
    other_allowance = Column(Numeric(12, 2), nullable=True, default=0)
    other_allowance_name = Column(String(100), nullable=True)
    effective_from = Column(Date, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    employee = relationship("Employee", back_populates="salary_structures")


class PayrollRun(Base):
    __tablename__ = "hr_payroll_runs"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)

    month = Column(Integer, nullable=False)
    year = Column(Integer, nullable=False)
    status = Column(Enum(PayrollStatus), nullable=False, default=PayrollStatus.draft)
    total_gross = Column(Numeric(15, 2), nullable=True, default=0)
    total_net = Column(Numeric(15, 2), nullable=True, default=0)
    total_employee_count = Column(Integer, nullable=True, default=0)
    notes = Column(Text, nullable=True)

    finalized_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    finalized_at = Column(DateTime(timezone=True), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    payslip_lines = relationship("PayslipLine", back_populates="payroll_run", cascade="all, delete-orphan")


class PayslipLine(Base):
    __tablename__ = "hr_payslip_lines"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    payroll_run_id = Column(Integer, ForeignKey("hr_payroll_runs.id", ondelete="CASCADE"), nullable=False)
    employee_id = Column(Integer, ForeignKey("hr_employees.id", ondelete="CASCADE"), nullable=False)

    # Earnings
    basic_salary = Column(Numeric(12, 2), nullable=False, default=0)
    transport_allowance = Column(Numeric(12, 2), nullable=True, default=0)
    housing_allowance = Column(Numeric(12, 2), nullable=True, default=0)
    phone_allowance = Column(Numeric(12, 2), nullable=True, default=0)
    other_allowance = Column(Numeric(12, 2), nullable=True, default=0)
    overtime_pay = Column(Numeric(12, 2), nullable=True, default=0)
    claims_reimbursement = Column(Numeric(12, 2), nullable=True, default=0)
    gross_pay = Column(Numeric(12, 2), nullable=False, default=0)

    # Statutory Deductions (Malaysia)
    epf_employee = Column(Numeric(10, 2), nullable=True, default=0)
    epf_employer = Column(Numeric(10, 2), nullable=True, default=0)
    socso_employee = Column(Numeric(10, 2), nullable=True, default=0)
    socso_employer = Column(Numeric(10, 2), nullable=True, default=0)
    eis_employee = Column(Numeric(10, 2), nullable=True, default=0)
    eis_employer = Column(Numeric(10, 2), nullable=True, default=0)
    pcb = Column(Numeric(10, 2), nullable=True, default=0)
    other_deduction = Column(Numeric(10, 2), nullable=True, default=0)
    net_pay = Column(Numeric(12, 2), nullable=False, default=0)

    # Attendance summary
    working_days = Column(Integer, nullable=True)
    present_days = Column(Integer, nullable=True)
    absent_days = Column(Integer, nullable=True)
    leave_days = Column(Integer, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    payroll_run = relationship("PayrollRun", back_populates="payslip_lines")
    employee = relationship("Employee", back_populates="payslip_lines")


class ClaimApplication(Base):
    __tablename__ = "hr_claims"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    employee_id = Column(Integer, ForeignKey("hr_employees.id", ondelete="CASCADE"), nullable=False)

    claim_type = Column(String(100), nullable=False)
    description = Column(Text, nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    claim_date = Column(Date, nullable=False)
    receipt_url = Column(String(500), nullable=True)
    status = Column(Enum(ClaimStatus), nullable=False, default=ClaimStatus.pending)
    approved_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    rejection_reason = Column(Text, nullable=True)
    payroll_run_id = Column(Integer, ForeignKey("hr_payroll_runs.id", ondelete="SET NULL"), nullable=True)
    applied_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    employee = relationship("Employee", back_populates="claim_applications")


class PerformanceReview(Base):
    __tablename__ = "hr_performance_reviews"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    employee_id = Column(Integer, ForeignKey("hr_employees.id", ondelete="CASCADE"), nullable=False)

    review_period = Column(String(20), nullable=False)
    review_date = Column(Date, nullable=False)
    rating = Column(Enum(PerformanceRating), nullable=True)
    kpi_score = Column(Numeric(5, 2), nullable=True)
    self_review = Column(Text, nullable=True)
    manager_review = Column(Text, nullable=True)
    goals_next_period = Column(Text, nullable=True)
    reviewed_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    employee = relationship("Employee", back_populates="performance_reviews")
