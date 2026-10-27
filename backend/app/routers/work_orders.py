from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
import datetime

from app.database import get_db
from app.models.work_order import WorkOrder
from app.models.building import Building
from app.models.todo import Todo
from app.models.user_profile import UserProfile
from app.models.history_entry import HistoryEntry
from app.permissions import CurrentUser, get_current_user, require

router = APIRouter()

PRIORITIES = ["low", "medium", "high", "urgent"]

DEFAULT_DUE_DAYS = {
    "urgent": 3,
    "high": 7,
    "medium": 14,
    "low": 30,
}

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


@router.get("/{parish_id}/work-orders", response_model=List[WorkOrderResponse])
def list_work_orders(
    parish_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    # anyone logged in can view; no require() call here
    return (
        db.query(WorkOrder)
        .filter(WorkOrder.parish_id == parish_id)
        .order_by(WorkOrder.created_at.desc())
        .all()
    )

@router.post("/{parish_id}/work-orders", response_model=WorkOrderResponse)
def create_work_order(
    parish_id: int,
    data: WorkOrderCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    require(user, "work_orders.create")

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

    existing_count = db.query(WorkOrder).filter(WorkOrder.parish_id == parish_id).count()
    display_number = f"WO-{existing_count + 1:04d}" # WO-0001, WO-0002, etc.

    # Prefer the user's saved display name, then the token's name, then what the client sent
    profile = db.query(UserProfile).filter(UserProfile.sub == user.sub).first()
    if profile and profile.display_name:
        requester_name = profile.display_name
    elif user.name:
        requester_name = user.name
    else:
        requester_name = data.requester_name

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
        related_type="work_order",
        related_id=order.id,
    ))

    db.commit()
    db.refresh(order)
    return order

