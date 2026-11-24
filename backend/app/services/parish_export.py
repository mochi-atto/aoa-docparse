"""Per-parish Excel export (AOA-39): one sheet per record type, built with openpyxl.

All timestamps are stored as naive UTC (datetime.utcnow), so date headers say "(UTC)".
Appraisals, utility bills and work orders reference buildings by name, so building IDs
are resolved by case-insensitive name match and left blank when nothing matches.
"""
import datetime
import io
import re
import unicodedata

from openpyxl import Workbook
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
from openpyxl.styles import Alignment, Font
from openpyxl.utils import get_column_letter
from sqlalchemy.orm import Session, selectinload

from app.models.appraisal import Appraisal
from app.models.asset import Asset
from app.models.building import Building
from app.models.parish import Parish
from app.models.parish_member import ParishMember
from app.models.todo import Todo
from app.models.utility_bill import UtilityBill
from app.models.work_order import WorkOrder
from app.routers.data import _build_account_map, _normalize_util_type, _to_float

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

# Column kinds -> Excel number formats (None = General)
FORMATS = {
    "text": None, "int": "0", "whole": "#,##0", "number": "#,##0.00", "currency": '"$"#,##0.00', "rate": '"$"#,##0.0000',
    "date": "yyyy-mm-dd", "datetime": "yyyy-mm-dd hh:mm",
}
FIXED_WIDTHS = {"date": 12, "datetime": 17}
MAX_WIDTH = 60
MAX_CELL_CHARS = 32767  # Excel's per-cell limit
TRUNCATED = "…(truncated)"

ROLE_LABEL = {"admin": "Admin", "editor": "Editor", "viewer": "Viewer"}
WO_STATUS_LABEL = {"unassigned": "Unassigned", "assigned": "Assigned", "in_progress": "In Progress",
                   "ready_for_review": "Ready for Review", "closed": "Closed", "on_hold": "On Hold"}


def export_filename(parish_name: str, today: datetime.date) -> str:
    ascii_name = unicodedata.normalize("NFKD", parish_name).encode("ascii", "ignore").decode()
    safe = re.sub(r"[^A-Za-z0-9-]+", "_", ascii_name.replace("'", "")).strip("_") or "parish"
    return f"{safe}_export_{today.isoformat()}.xlsx"


def _text(value):
    if value is None:
        return None
    text = ILLEGAL_CHARACTERS_RE.sub("", str(value))
    if len(text) > MAX_CELL_CHARS:
        text = text[:MAX_CELL_CHARS - len(TRUNCATED)] + TRUNCATED
    return text or None


def _utc(value):
    if isinstance(value, datetime.datetime) and value.tzinfo is not None:
        return value.astimezone(datetime.timezone.utc).replace(tzinfo=None)
    return value


def _parse_date(value):
    if value is None or isinstance(value, datetime.date):
        return value
    try:
        return datetime.date.fromisoformat(str(value).strip()[:10])
    except ValueError:
        return None


def _yes_no(flag: bool) -> str:
    return "Yes" if flag else "No"


def _write_sheet(wb: Workbook, title: str, columns: list[tuple[str, str]], rows: list[list]):
    ws = wb.create_sheet(title)
    ws.append([header for header, _ in columns])
    for cell in ws[1]:
        cell.font = Font(bold=True)
    ws.freeze_panes = "A2"

    widths = [len(header) for header, _ in columns]
    wrap = Alignment(wrap_text=True, vertical="top")
    for r, row in enumerate(rows, start=2):
        for c, ((_, kind), value) in enumerate(zip(columns, row), start=1):
            if kind == "text":
                value = _text(value)
            elif kind == "datetime":
                value = _utc(value)
            cell = ws.cell(row=r, column=c, value=value)
            if value is None:
                continue
            if FORMATS[kind]:
                cell.number_format = FORMATS[kind]
            if isinstance(value, str):
                if value.startswith("="):
                    cell.data_type = "s"  # store as text so Excel never evaluates user input as a formula
                if "\n" in value:
                    cell.alignment = wrap
                widths[c - 1] = max(widths[c - 1], max(len(line) for line in value.split("\n")))
            elif kind not in FIXED_WIDTHS:
                widths[c - 1] = max(widths[c - 1], len(f"{value:,.2f}" if isinstance(value, float) else str(value)))

    for c, ((header, kind), width) in enumerate(zip(columns, widths), start=1):
        width = max(width, FIXED_WIDTHS.get(kind, 0))
        ws.column_dimensions[get_column_letter(c)].width = min(max(width, len(header)) + 2, MAX_WIDTH)


class _BuildingIndex:
    def __init__(self, buildings: list[Building]):
        self._ids = {}
        for b in sorted(buildings, key=lambda b: b.id):
            self._ids.setdefault(b.name.strip().lower(), b.id)

    def id_for(self, name):
        return self._ids.get(name.strip().lower()) if name else None


def _buildings_sheet(wb, buildings):
    utility_keys = sorted({k for b in buildings if isinstance(b.account_numbers, dict) for k in b.account_numbers})
    columns = [("Building ID", "int"), ("Name", "text")]
    columns += [(f"Account # ({key})", "text") for key in utility_keys]
    columns += [("Created (UTC)", "datetime")]
    rows = []
    for b in buildings:
        accounts = b.account_numbers if isinstance(b.account_numbers, dict) else {}
        rows.append([b.id, b.name, *[accounts.get(k) for k in utility_keys], b.created_at])
    _write_sheet(wb, "Buildings", columns, rows)


def _appraisals_sheet(wb, appraisals, index):
    columns = [
        ("Appraisal ID", "int"), ("Valuation #", "text"), ("Building", "text"), ("Building ID", "int"),
        ("Building value", "currency"), ("Content value", "currency"), ("Total valuation", "currency"),
        ("Gross sq ft", "whole"), ("Entity name", "text"), ("Property address", "text"), ("County", "text"),
        ("Appraisal date", "date"), ("Expiration date", "date"), ("Appraiser firm", "text"), ("Appraiser name", "text"),
        ("Year built", "int"), ("Stories", "int"), ("Construction type", "text"),
        ("Cost of replacement new", "currency"), ("Total exclusions", "currency"),
        ("Cost less exclusions", "currency"), ("Flood value", "currency"),
        ("Source file", "text"), ("Created (UTC)", "datetime"),
    ]
    rows = []
    for a in appraisals:
        raw = a.raw_extracted if isinstance(a.raw_extracted, dict) else {}
        document = [
            a.entity_name, a.property_address, a.county, a.appraisal_date, _parse_date(raw.get("expiration_date")),
            a.appraiser_firm, a.appraiser_name, a.year_built, a.num_stories, a.construction_type,
            a.cost_of_replacement_new, a.total_exclusions, a.cost_less_exclusions, a.flood_value,
            a.original_filename, a.uploaded_at,
        ]
        # Same per-building rows the Valuations tab shows (see routers/data.get_appraisal_data)
        sections = raw.get("sections")
        if sections and isinstance(sections, list):
            for sec in (s for s in sections if isinstance(s, dict)):
                name = sec.get("building_name")
                rows.append([a.id, sec.get("valuation_number"), name, index.id_for(name),
                             _to_float(sec.get("building_value")), _to_float(sec.get("content_value")),
                             _to_float(sec.get("total_valuation")), _to_float(sec.get("gross_sq_ft")), *document])
        else:
            rows.append([a.id, None, a.entity_name, index.id_for(a.entity_name),
                         _to_float(a.cost_of_replacement_new), None, _to_float(a.cost_less_exclusions),
                         _to_float(a.gross_sq_ft), *document])
    _write_sheet(wb, "Appraisals", columns, rows)


def _utilities_sheet(wb, bills, index, account_map):
    # One usage column per unit, since a parish mixes kWh, therms, gallons, etc.
    units = {}
    for bill in bills:
        if bill.usage_unit and bill.usage_unit.strip():
            units.setdefault(bill.usage_unit.strip().lower(), bill.usage_unit.strip())
    unit_keys = sorted(units)
    unitless = any(b.usage_quantity is not None and not (b.usage_unit or "").strip() for b in bills)
    usage_headers = [f"Usage ({units[k]})" for k in unit_keys]
    if unitless or not usage_headers:
        usage_headers.append("Usage (unit not recorded)")

    columns = [
        ("Bill ID", "int"), ("Building", "text"), ("Building ID", "int"), ("Utility type", "text"),
        ("Provider", "text"), ("Service address", "text"), ("Account #", "text"),
        ("Bill date", "date"), ("Due date", "date"), ("Billing period start", "date"), ("Billing period end", "date"),
        ("Total cost", "currency"), *[(h, "number") for h in usage_headers], ("Rate (per unit)", "rate"),
        ("Notes", "text"), ("Source file", "text"), ("Created (UTC)", "datetime"),
    ]
    rows = []
    for bill in bills:
        # Same fallback the Utilities tab uses: stored name, then account mapping, then address
        building = bill.building_name
        if not building and bill.account_number:
            building = account_map.get(str(bill.account_number).strip())
        building = building or bill.service_address

        usage = [None] * len(usage_headers)
        unit = (bill.usage_unit or "").strip().lower()
        if bill.usage_quantity is not None:
            usage[unit_keys.index(unit) if unit else -1] = bill.usage_quantity

        rows.append([
            bill.id, building, index.id_for(building), _normalize_util_type(bill.utility_type),
            bill.provider_name, bill.service_address, bill.account_number,
            bill.bill_date, bill.due_date, bill.billing_period_start, bill.billing_period_end,
            bill.total_amount, *usage, bill.rate, bill.usage_note, bill.original_filename, bill.uploaded_at,
        ])
    _write_sheet(wb, "Utilities", columns, rows)


def _assets_sheet(wb, assets, index, today):
    columns = [
        ("Asset ID", "int"), ("Name", "text"), ("Type", "text"), ("Location", "text"), ("Building ID", "int"),
        ("Manufacturer", "text"), ("Model #", "text"), ("Serial #", "text"),
        ("Year installed", "int"), ("Expected life (years)", "int"), (f"Remaining life (years, as of {today.year})", "int"),
        ("Initial cost", "currency"), ("Annual accrual", "currency"), ("Accrual manually set", "text"),
        ("Has photo", "text"), ("Document count", "int"), ("Documents", "text"),
        ("Created (UTC)", "datetime"), ("Updated (UTC)", "datetime"),
    ]
    rows = []
    for a in assets:
        # Same derived values as routers/assets._asset
        remaining = max(0, a.expected_life - max(0, today.year - a.year_installed))
        accrual = a.accrual_override if a.accrual_override is not None else a.initial_cost / a.expected_life
        docs = sorted(a.documents, key=lambda d: d.id)
        listing = "\n".join(d.filename + (" (catalog)" if d.source == "catalog" else "") for d in docs)
        rows.append([
            a.id, a.name, a.asset_type, a.location, index.id_for(a.location),
            a.manufacturer, a.model_number, a.serial_number,
            a.year_installed, a.expected_life, remaining, a.initial_cost, accrual, _yes_no(a.accrual_override is not None),
            _yes_no(a.photo_path is not None), len(docs), listing or None, a.created_at, a.updated_at,
        ])
    _write_sheet(wb, "Assets", columns, rows)


def _work_orders_sheet(wb, orders, todos):
    # TODO(AOA-12): add "Asset" and "Asset ID" columns once work orders link to assets.
    columns = [
        ("Work order ID", "int"), ("Number", "text"), ("Title", "text"), ("Description", "text"),
        ("Status", "text"), ("Priority", "text"), ("Building", "text"), ("Building ID", "int"),
        ("Backlog item", "text"), ("Backlog item ID", "int"), ("Requester", "text"), ("Technician", "text"),
        ("Due date", "date"), ("Completion notes", "text"), ("Note count", "int"), ("Notes", "text"),
        ("Created (UTC)", "datetime"), ("Updated (UTC)", "datetime"),
        ("Started (UTC)", "datetime"), ("Closed (UTC)", "datetime"),
    ]
    rows = []
    for wo in orders:
        notes = "\n".join(
            f"{_utc(n.created_at):%Y-%m-%d %H:%M} UTC — {n.author_name or 'Unknown'}: {n.body}" for n in wo.notes)
        todo = todos.get(wo.todo_id)
        rows.append([
            wo.id, wo.display_number, wo.title, wo.description,
            WO_STATUS_LABEL.get(wo.status, wo.status), (wo.priority or "").capitalize() or None,
            wo.building.name if wo.building else None, wo.building_id,
            todo.text if todo else None, wo.todo_id, wo.requester_name, wo.technician_name,
            wo.due_date, wo.completion_notes, len(wo.notes), notes or None,
            wo.created_at, wo.updated_at, wo.started_at, wo.closed_at,
        ])
    _write_sheet(wb, "Work Orders", columns, rows)


def _access_sheet(wb, parish, members):
    columns = [
        ("Member ID", "int"), ("Email", "text"), ("Role", "text"), ("Status", "text"),
        ("Parish owner", "text"), ("Added (UTC)", "datetime"),
    ]
    rows = [[
        m.id, m.email, ROLE_LABEL.get(m.role, m.role), "Active" if m.account_id else "Pending invitation",
        _yes_no(m.account_id is not None and m.account_id == parish.owner_account_id), m.created_at,
    ] for m in members]
    _write_sheet(wb, "Access", columns, rows)


def build_parish_workbook(db: Session, parish: Parish, include_access: bool, today: datetime.date) -> bytes:
    pid = parish.id
    buildings = db.query(Building).filter(Building.parish_id == pid).order_by(Building.id).all()
    index = _BuildingIndex(buildings)
    appraisals = (db.query(Appraisal).filter(Appraisal.parish_id == pid)
                  .order_by(Appraisal.appraisal_date.asc(), Appraisal.id).all())
    bills = (db.query(UtilityBill).filter(UtilityBill.parish_id == pid)
             .order_by(UtilityBill.bill_date.asc(), UtilityBill.id).all())
    assets = (db.query(Asset).options(selectinload(Asset.documents))
              .filter(Asset.parish_id == pid).order_by(Asset.id).all())
    orders = (db.query(WorkOrder).options(selectinload(WorkOrder.notes), selectinload(WorkOrder.building))
              .filter(WorkOrder.parish_id == pid).order_by(WorkOrder.id).all())
    todos = {t.id: t for t in db.query(Todo).filter(Todo.parish_id == pid).all()}

    wb = Workbook()
    wb.remove(wb.active)
    _buildings_sheet(wb, buildings)
    _appraisals_sheet(wb, appraisals, index)
    _utilities_sheet(wb, bills, index, _build_account_map(pid, db))
    _assets_sheet(wb, assets, index, today)
    _work_orders_sheet(wb, orders, todos)
    if include_access:
        members = db.query(ParishMember).filter(ParishMember.parish_id == pid).order_by(ParishMember.id).all()
        _access_sheet(wb, parish, members)

    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()
