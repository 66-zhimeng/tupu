"""里程碑相关 Pydantic 数据模型"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class MilestoneCreate(BaseModel):
    """创建里程碑"""
    title: str = Field(..., max_length=500)
    description: Optional[str] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None


class MilestoneUpdate(BaseModel):
    """更新里程碑"""
    title: Optional[str] = Field(None, max_length=500)
    description: Optional[str] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None


class MilestoneResponse(BaseModel):
    """里程碑响应"""
    id: uuid.UUID
    title: str
    description: Optional[str] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
