from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
import datetime

from app.database import get_db
from app.auth import parish_access, parish_editor_access, parish_admin_access
from app.models.parish import Parish
from app.models.work_order import WorkOrder
from app.models.building import Building
from app.models.todo import Todo
from app.models.user_profile import UserProfile
from app.models.history_entry import HistoryEntry
from app.permissions import CurrentUser, get_current_user

router = APIRouter()

def display_name(db, user, membership):
    profile = db.query(UserProfile).filter(UserProfile.sub == user.sub).first()
    return (profile.display_name if profile else None) or user.name or membership.account.email



PRIORITIES = ["low", "medium", "high", "urgent"]

DEFAULT_DUE_DAYS = {
    "urgent": 3,
    "high": 7,
    "medium": 14,
    "low": 30,
}

TRANSITIONS = {
    "claim": {
        "from": {"unassigned"},
        "to": "assigned",
        },
    "start": {
            "from": {"assigned"},
            "to": "in_progress",
        },
    "hold": {
            "from": {"assigned", "in_progress"},
            "to": "on_hold",
        },
    "resume": {
            "from": {"on_hold"},
            "to": None, # uses status_before_hold (either assigned or in_progress)
        },
    "submit": {
            "from": {"in_progress"},
            "to": "ready_for_review",
        },
    "close": {
            "from": {"ready_for_review"},
            "to": "closed",
        },
}

def apply_transition(order: WorkOrder, action: str) -> str:
    transition = TRANSITIONS[action]

    if (order.status not in transition["from"]):
        raise HTTPException(status_code=409, detail=f"Cannot {action} a work order that is {order.status}")

    if (transition["to"] is None):
        target = order.status_before_hold
    else:
        target = transition["to"]


    if (action == "hold"):
        order.status_before_hold = order.status
    elif (action == "resume"):
        order.status_before_hold = None

    if action == "resume" and target not in {"assigned", "in_progress"}:
        raise HTTPException(status_code=409, detail="Work order has no valid status to resume")
    order.status = target
    return target

def get_work_order(db: Session, parish_id: int, order_id: int) -> WorkOrder:
    work_order = (
        db.query(WorkOrder).filter(WorkOrder.id == order_id, WorkOrder.parish_id == parish_id).with_for_update().populate_existing().first()
    )

    if work_order is None:
        raise HTTPException(status_code=404, detail="Work order not found")

    return work_order

class WorkOrderCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: str = "medium"
    due_date: Optional[datetime.date] = None
    building_id: Optional[int] = None
    todo_id: Optional[int] = None
    requester_name: Optional[str] = None

class WorkOrderResponse(BaseModel):
    id: int
    parish_id: int
    display_number: str
    building_id: Optional[int]
    todo_id: Optional[int]

    title: str
    description: Optional[str]
    priority: str
    due_date: Optional[datetime.date]

    status: str
    status_before_hold: Optional[str]

    requester_sub: str
    requester_name: Optional[str]
    technician_sub: Optional[str]
    technician_name: Optional[str]

    completion_notes: Optional[str]

    created_at: Optional[datetime.datetime]
    updated_at: Optional[datetime.datetime]
    started_at: Optional[datetime.datetime]
    closed_at: Optional[datetime.datetime]

    class Config:
        from_attributes = True

# view a parish's work orders
@router.get("/{parish_id}/work-orders", response_model=List[WorkOrderResponse])
def list_work_orders(
    parish_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
    membership=Depends(parish_access),
):
    return (
        db.query(WorkOrder)
        .filter(WorkOrder.parish_id == parish_id)
        .order_by(WorkOrder.created_at.desc())
        .all()
    )

# create a work order
@router.post("/{parish_id}/work-orders", response_model=WorkOrderResponse)
def create_work_order(
    parish_id: int,
    data: WorkOrderCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
    membership=Depends(parish_editor_access),
):
    db.query(Parish).filter(Parish.id == parish_id).with_for_update().one()

    title = data.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")

    if data.priority not in PRIORITIES:
        raise HTTPException(status_code=400, detail=f"Priority must be one of {PRIORITIES}")

    if data.building_id is not None:
        building = (
            db.query(Building)
            .filter(Building.id == data.building_id, Building.parish_id == parish_id)
            .first()
        )
        if building is None:
            raise HTTPException(status_code=400, detail="Invalid building_id for this parish")

    if data.todo_id is not None:
        todo = (
            db.query(Todo)
            .filter(Todo.id == data.todo_id, Todo.parish_id == parish_id)
            .first()
        )
        if todo is None:
            raise HTTPException(status_code=400, detail="Invalid todo_id for this parish")

    if data.due_date is not None:
        due_date = data.due_date
    else:
        days = DEFAULT_DUE_DAYS[data.priority]
        due_date = datetime.date.today() + datetime.timedelta(days=days)

    numbers = db.query(WorkOrder.display_number).filter(WorkOrder.parish_id == parish_id).all()
    existing_count = max((int(n[0][3:]) for n in numbers if n[0].startswith("WO-") and n[0][3:].isdigit()), default=0)
    display_number = f"WO-{existing_count + 1:04d}" # WO-0001, WO-0002, etc.

    requester_name = display_name(db, user, membership)

    order = WorkOrder(
        parish_id=parish_id,
        display_number=display_number,
        building_id=data.building_id,
        todo_id=data.todo_id,
        title=title,
        description=data.description,
        priority=data.priority,
        due_date=due_date,
        status="unassigned",
        requester_sub=user.sub,
        requester_name=requester_name,
    )
    db.add(order)
    db.flush()

    db.add(HistoryEntry(
        parish_id=parish_id,
        entry_type="work_order_created",
        description=f"Work order {display_number} created: {title}",
        snapshot={"actor_sub": user.sub, "actor_name": display_name(db, user, membership)},
        related_type="work_order",
        related_id=order.id,
    ))

    db.commit()
    db.refresh(order)
    return order

# claim a work order (unassigned -> assigned)
@router.post("/{parish_id}/work-orders/{order_id}/claim", response_model=WorkOrderResponse)
def claim_work_order(
    parish_id: int,
    order_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
    membership=Depends(parish_editor_access),
):

    work_order = get_work_order(db, parish_id, order_id)

    apply_transition(work_order, "claim")
    work_order.technician_sub = user.sub
    work_order.technician_name = display_name(db, user, membership)

    db.add(HistoryEntry(
        parish_id=parish_id,
        entry_type="work_order_claimed",
        description=f"Work order {work_order.display_number} claimed by: {display_name(db, user, membership)}",
        snapshot={"actor_sub": user.sub, "actor_name": display_name(db, user, membership)},
        related_type="work_order",
        related_id=work_order.id,
    ))

    db.commit()
    db.refresh(work_order)
    return work_order

# start a work order (assigned -> in_progress)
@router.post("/{parish_id}/work-orders/{order_id}/start", response_model=WorkOrderResponse)
def start_work_order(
    parish_id: int,
    order_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
    membership=Depends(parish_editor_access),
):

    work_order = get_work_order(db, parish_id, order_id)

    authorize_assignee(work_order, membership, user.sub)
    apply_transition(work_order, "start")
    work_order.started_at = datetime.datetime.utcnow()

    db.add(HistoryEntry(
        parish_id=parish_id,
        entry_type="work_order_started",
        description=f"Work order {work_order.display_number} started by: {display_name(db, user, membership)}",
        snapshot={"actor_sub": user.sub, "actor_name": display_name(db, user, membership)},
        related_type="work_order",
        related_id=work_order.id,
    ))

    db.commit()
    db.refresh(work_order)
    return work_order

# hold a work order (assigned/in_progress -> on_hold)
@router.post("/{parish_id}/work-orders/{order_id}/hold", response_model=WorkOrderResponse)
def hold_work_order(
    parish_id: int,
    order_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
    membership=Depends(parish_editor_access),
):

    work_order = get_work_order(db, parish_id, order_id)

    authorize_assignee(work_order, membership, user.sub)
    apply_transition(work_order, "hold")

    db.add(HistoryEntry(
        parish_id=parish_id,
        entry_type="work_order_on_hold",
        description=f"Work order {work_order.display_number} put on hold by: {display_name(db, user, membership)}",
        snapshot={"actor_sub": user.sub, "actor_name": display_name(db, user, membership)},
        related_type="work_order",
        related_id=work_order.id,
    ))

    db.commit()
    db.refresh(work_order)
    return work_order

# resume a work order (on_hold -> assigned/in_progress )
@router.post("/{parish_id}/work-orders/{order_id}/resume", response_model=WorkOrderResponse)
def resume_work_order(
    parish_id: int,
    order_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
    membership=Depends(parish_editor_access),
):

    work_order = get_work_order(db, parish_id, order_id)

    authorize_assignee(work_order, membership, user.sub)
    apply_transition(work_order, "resume")

    db.add(HistoryEntry(
        parish_id=parish_id,
        entry_type="work_order_resumed",
        description=f"Work order {work_order.display_number} resumed by: {display_name(db, user, membership)}",
        snapshot={"actor_sub": user.sub, "actor_name": display_name(db, user, membership)},
        related_type="work_order",
        related_id=work_order.id,
    ))

    db.commit()
    db.refresh(work_order)
    return work_order

def authorize_assignee(order, membership, subject):
    if membership.role != "admin" and order.technician_sub != subject:
        raise HTTPException(status_code=403, detail="Only the assigned technician or parish administrator can change this order")

class SubmitRequest(BaseModel):
    completion_notes: str

@router.post("/{parish_id}/work-orders/{order_id}/submit", response_model=WorkOrderResponse)
def submit_work_order(parish_id: int, order_id: int, data: SubmitRequest,
                      membership=Depends(parish_editor_access), db: Session = Depends(get_db)):
    order = get_work_order(db, parish_id, order_id)
    authorize_assignee(order, membership, membership.account.auth0_sub)
    if not data.completion_notes.strip():
        raise HTTPException(status_code=422, detail="Completion notes are required")
    apply_transition(order, "submit")
    order.completion_notes = data.completion_notes.strip()
    db.add(HistoryEntry(parish_id=parish_id, entry_type="work_order_submitted",
        description=f"Work order {order.display_number} submitted for review",
        snapshot={"actor_sub": membership.account.auth0_sub},
        related_type="work_order", related_id=order.id))
    db.commit()
    db.refresh(order)
    return order

@router.post("/{parish_id}/work-orders/{order_id}/close", response_model=WorkOrderResponse)
def close_work_order(parish_id: int, order_id: int,
                     membership=Depends(parish_admin_access), db: Session = Depends(get_db)):
    order = get_work_order(db, parish_id, order_id)
    apply_transition(order, "close")
    order.closed_at = datetime.datetime.utcnow()
    db.add(HistoryEntry(parish_id=parish_id, entry_type="work_order_closed",
        description=f"Work order {order.display_number} closed after review",
        snapshot={"actor_sub": membership.account.auth0_sub},
        related_type="work_order", related_id=order.id))
    db.commit()
    db.refresh(order)
    return order
