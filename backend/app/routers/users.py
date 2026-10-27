from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models.user_profile import UserProfile
from app.permissions import CurrentUser, get_current_user

router = APIRouter()


class ProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    picture_data: Optional[str] = None


class ProfileResponse(BaseModel):
    sub: str
    display_name: Optional[str]
    picture_data: Optional[str]

    class Config:
        from_attributes = True


@router.get("/me", response_model=ProfileResponse)
def get_my_profile(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    profile = db.query(UserProfile).filter(UserProfile.sub == user.sub).first()
    if profile is None:
        # No saved settings yet; nothing to return beyond the id
        return ProfileResponse(sub=user.sub, display_name=None, picture_data=None)
    return profile


@router.put("/me", response_model=ProfileResponse)
def update_my_profile(
    data: ProfileUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    profile = db.query(UserProfile).filter(UserProfile.sub == user.sub).first()
    if profile is None:
        profile = UserProfile(sub=user.sub)
        db.add(profile)

    if data.display_name is not None:
        profile.display_name = data.display_name.strip() or None
    if data.picture_data is not None:
        profile.picture_data = data.picture_data or None

    db.commit()
    db.refresh(profile)
    return profile
