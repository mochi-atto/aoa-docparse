from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import verify_token
from app.models.todo import Todo
from app.models.history_entry import HistoryEntry
from pydantic import BaseModel
from typing import Optional, List
import datetime

router = APIRouter()

# ── Schemas ──

class TodoCreate(BaseModel):
    text: str
    building: str
    priority: str = "green"

class TodoUpdate(BaseModel):
    text: Optional[str] = None
    building: Optional[str] = None
    priority: Optional[str] = None
    done: Optional[bool] = None

class TodoResponse(BaseModel):
    id: int
    parish_id: int
    text: str
    building: str
    priority: str
    prev_priority: Optional[str]
    done: bool
    created_at: datetime.datetime
    class Config:
        from_attributes = True

class HistoryCreate(BaseModel):
    entry_type: str
    description: str

class HistoryResponse(BaseModel):
    id: int
    parish_id: int
    entry_type: str
    description: str
    created_at: datetime.datetime
    undone: Optional[str] = None
    class Config:
        from_attributes = True


# ── Todo endpoints ──

@router.get("/{parish_id}/todos", response_model=List[TodoResponse])
def list_todos(parish_id: int, db: Session = Depends(get_db), user=Depends(verify_token)):
    return db.query(Todo).filter(Todo.parish_id == parish_id).order_by(Todo.created_at.asc()).all()


@router.post("/{parish_id}/todos", response_model=TodoResponse)
def create_todo(parish_id: int, data: TodoCreate, db: Session = Depends(get_db), user=Depends(verify_token)):
    todo = Todo(parish_id=parish_id, text=data.text, building=data.building, priority=data.priority)
    db.add(todo)
    entry = HistoryEntry(parish_id=parish_id, entry_type="task_added", description=f'Task added: "{data.text}" for {data.building}')
    db.add(entry)
    db.commit()
    db.refresh(todo)
    return todo


@router.put("/{parish_id}/todos/{todo_id}", response_model=TodoResponse)
def update_todo(parish_id: int, todo_id: int, data: TodoUpdate, db: Session = Depends(get_db), user=Depends(verify_token)):
    todo = db.query(Todo).filter(Todo.id == todo_id, Todo.parish_id == parish_id).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")

    history_entries = []

    # Handle done toggle
    if data.done is not None and data.done != todo.done:
        if data.done:
            todo.prev_priority = todo.priority
            todo.priority = "blue"
            todo.done = True
            history_entries.append(HistoryEntry(parish_id=parish_id, entry_type="task_addressed", description=f"Task addressed: {todo.text}"))
        else:
            revert = todo.prev_priority or "green"
            todo.priority = revert
            todo.prev_priority = None
            todo.done = False
            history_entries.append(HistoryEntry(parish_id=parish_id, entry_type="task_changed", description=f"Task unaddressed: {todo.text} (reverted to {revert})"))

    # Handle text change
    if data.text is not None and data.text != todo.text:
        old_text = todo.text
        todo.text = data.text
        history_entries.append(HistoryEntry(parish_id=parish_id, entry_type="task_changed", description=f'Task renamed: "{old_text}" → "{data.text}"'))

    # Handle building change
    if data.building is not None and data.building != todo.building:
        old_building = todo.building
        todo.building = data.building
        history_entries.append(HistoryEntry(parish_id=parish_id, entry_type="task_changed", description=f'Task moved: "{todo.text}" from {old_building} → {data.building}'))

    # Handle priority change (only if not being addressed/unaddressed)
    if data.priority is not None and data.done is None and data.priority != todo.priority:
        old_prio = todo.priority
        todo.priority = data.priority
        history_entries.append(HistoryEntry(parish_id=parish_id, entry_type="task_changed", description=f'Task priority: "{todo.text}" {old_prio} → {data.priority}'))

    for entry in history_entries:
        db.add(entry)

    db.commit()
    db.refresh(todo)
    return todo


@router.delete("/{parish_id}/todos/{todo_id}")
def delete_todo(parish_id: int, todo_id: int, db: Session = Depends(get_db), user=Depends(verify_token)):
    todo = db.query(Todo).filter(Todo.id == todo_id, Todo.parish_id == parish_id).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    entry = HistoryEntry(parish_id=parish_id, entry_type="task_changed", description=f"Task removed: {todo.text}")
    db.add(entry)
    db.delete(todo)
    db.commit()
    return {"detail": "Todo deleted"}


# ── History endpoints ──

@router.get("/{parish_id}/history", response_model=List[HistoryResponse])
def list_history(parish_id: int, db: Session = Depends(get_db), user=Depends(verify_token)):
    return db.query(HistoryEntry).filter(HistoryEntry.parish_id == parish_id).order_by(HistoryEntry.created_at.desc()).all()


@router.post("/{parish_id}/history", response_model=HistoryResponse)
def create_history(parish_id: int, data: HistoryCreate, db: Session = Depends(get_db), user=Depends(verify_token)):
    entry = HistoryEntry(parish_id=parish_id, entry_type=data.entry_type, description=data.description)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry