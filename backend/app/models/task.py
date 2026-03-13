"""任务模型"""
from __future__ import annotations

import uuid
from datetime import datetime, date
from typing import Optional

from sqlalchemy import String, Text, Float, Integer, Date, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
import enum

from app.core.database import Base


class TaskStatus(str, enum.Enum):
    """任务状态枚举"""
    INCOMPLETE = "未完成"
    COMPLETED = "已完成"
    CANCELLED = "已取消"


class Task(Base):
    """任务模型"""
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True, index=True
    )
    milestone_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("milestones.id", ondelete="SET NULL"), nullable=True, index=True
    )
    assignee: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    estimated_hours: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=0)
    status: Mapped[TaskStatus] = mapped_column(
        SAEnum(TaskStatus, values_callable=lambda x: [e.value for e in x]),
        default=TaskStatus.INCOMPLETE,
        nullable=False,
    )
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    position_x: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    position_y: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # 关系
    children: Mapped[list[Task]] = relationship(
        "Task", back_populates="parent", cascade="all, delete-orphan"
    )
    parent: Mapped[Optional[Task]] = relationship(
        "Task", back_populates="children", remote_side="Task.id"
    )
    milestone: Mapped[Optional[Milestone]] = relationship(
        "Milestone", back_populates="tasks"
    )


# 避免循环导入
from app.models.milestone import Milestone  # noqa: E402
