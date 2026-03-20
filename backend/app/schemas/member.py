"""人员 Pydantic 模型"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class MemberBase(BaseModel):
    name: str
    color: str = "#3B82F6"


class MemberCreate(MemberBase):
    pass


class MemberUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None


class MemberResponse(MemberBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
