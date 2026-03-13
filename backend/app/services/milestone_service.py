"""里程碑业务逻辑层"""
from __future__ import annotations

import uuid
from typing import Optional, List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from app.models.milestone import Milestone
from app.schemas.milestone import MilestoneCreate, MilestoneUpdate


class MilestoneService:
    """里程碑服务"""

    @staticmethod
    async def create(db: AsyncSession, data: MilestoneCreate) -> Milestone:
        """创建里程碑"""
        milestone = Milestone(
            title=data.title,
            description=data.description,
            position_x=data.position_x,
            position_y=data.position_y,
        )
        db.add(milestone)
        await db.flush()
        logger.info(f"创建里程碑: {milestone.id} - {milestone.title}")
        return milestone

    @staticmethod
    async def get_by_id(db: AsyncSession, milestone_id: uuid.UUID) -> Optional[Milestone]:
        """根据 ID 获取里程碑"""
        result = await db.execute(
            select(Milestone).where(Milestone.id == milestone_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_all(db: AsyncSession) -> List[Milestone]:
        """获取所有里程碑"""
        result = await db.execute(
            select(Milestone).order_by(Milestone.created_at)
        )
        return list(result.scalars().all())

    @staticmethod
    async def update(db: AsyncSession, milestone_id: uuid.UUID, data: MilestoneUpdate) -> Optional[Milestone]:
        """更新里程碑"""
        milestone = await MilestoneService.get_by_id(db, milestone_id)
        if not milestone:
            return None

        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(milestone, key, value)

        await db.flush()
        logger.info(f"更新里程碑: {milestone.id} - {milestone.title}")
        return milestone

    @staticmethod
    async def delete(db: AsyncSession, milestone_id: uuid.UUID) -> bool:
        """删除里程碑"""
        milestone = await MilestoneService.get_by_id(db, milestone_id)
        if not milestone:
            return False
        await db.delete(milestone)
        await db.flush()
        logger.info(f"删除里程碑: {milestone_id}")
        return True
