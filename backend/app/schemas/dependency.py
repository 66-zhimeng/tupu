"""依赖关系相关 Pydantic 数据模型"""
import uuid
from datetime import datetime
from pydantic import BaseModel


class DependencyCreate(BaseModel):
    """创建依赖关系"""
    source_task_id: uuid.UUID
    target_task_id: uuid.UUID


class DependencyResponse(BaseModel):
    """依赖关系响应"""
    id: uuid.UUID
    source_task_id: uuid.UUID
    target_task_id: uuid.UUID
    is_iterative: bool
    iteration_count: int
    is_cycle_ended: bool
    created_at: datetime

    model_config = {"from_attributes": True}
