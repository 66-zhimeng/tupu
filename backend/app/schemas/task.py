"""任务相关 Pydantic 数据模型"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, Field

from app.models.task import TaskStatus


class TaskCreate(BaseModel):
    """创建任务"""
    title: str = Field(..., max_length=500)
    description: Optional[str] = None
    parent_id: Optional[uuid.UUID] = None
    milestone_id: Optional[uuid.UUID] = None
    assignee: Optional[str] = None
    estimated_hours: Optional[float] = 0
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None


class TaskUpdate(BaseModel):
    """更新任务"""
    title: Optional[str] = Field(None, max_length=500)
    description: Optional[str] = None
    parent_id: Optional[uuid.UUID] = None
    milestone_id: Optional[uuid.UUID] = None
    assignee: Optional[str] = None
    estimated_hours: Optional[float] = None
    status: Optional[TaskStatus] = None
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    version: int = Field(..., description="乐观锁版本号，必须提供")


class TaskPositionUpdate(BaseModel):
    """更新节点位置"""
    position_x: float
    position_y: float


class TaskBatchCreate(BaseModel):
    """批量创建子任务"""
    titles: List[str] = Field(..., min_length=1, description="子任务标题列表")
    assignee: Optional[str] = None


class TaskResponse(BaseModel):
    """任务响应"""
    id: uuid.UUID
    title: str
    description: Optional[str] = None
    parent_id: Optional[uuid.UUID] = None
    milestone_id: Optional[uuid.UUID] = None
    assignee: Optional[str] = None
    estimated_hours: Optional[float] = None
    computed_hours: Optional[float] = None
    computed_progress: Optional[float] = None
    status: TaskStatus
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    version: int
    is_leaf: bool = True
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TaskTreeResponse(BaseModel):
    """任务树响应（带子任务）"""
    id: uuid.UUID
    title: str
    description: Optional[str] = None
    parent_id: Optional[uuid.UUID] = None
    assignee: Optional[str] = None
    estimated_hours: Optional[float] = None
    computed_hours: Optional[float] = None
    computed_progress: Optional[float] = None
    status: TaskStatus
    children: List[TaskTreeResponse] = []

    model_config = {"from_attributes": True}
