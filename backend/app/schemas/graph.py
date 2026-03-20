"""全量图谱数据 Pydantic 模型"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel

from app.models.task import TaskStatus


class GraphNode(BaseModel):
    """图谱节点"""
    id: uuid.UUID
    title: str
    description: Optional[str] = None
    parent_id: Optional[uuid.UUID] = None
    milestone_id: Optional[uuid.UUID] = None
    assignee: Optional[str] = None
    estimated_hours: Optional[float] = 0
    computed_hours: float = 0
    computed_progress: float = 0
    status: TaskStatus
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    version: int = 1
    is_leaf: bool = True
    node_type: str = "task"


class GraphMilestone(BaseModel):
    """图谱里程碑节点"""
    id: uuid.UUID
    title: str
    description: Optional[str] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    computed_hours: float = 0
    computed_progress: float = 0
    node_type: str = "milestone"


class GraphEdge(BaseModel):
    """图谱边（依赖关系）"""
    id: uuid.UUID
    source: uuid.UUID
    target: uuid.UUID
    is_iterative: bool = False
    iteration_count: int = 0
    is_cycle_ended: bool = False


class GraphDataResponse(BaseModel):
    """全量图谱数据响应"""
    nodes: List[GraphNode] = []
    milestones: List[GraphMilestone] = []
    edges: List[GraphEdge] = []
    assignees: List[str] = []
    members: List[dict] = []
