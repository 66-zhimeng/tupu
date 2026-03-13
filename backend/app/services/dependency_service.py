"""依赖关系业务逻辑层"""
import uuid

from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from app.models.dependency import Dependency
from app.schemas.dependency import DependencyCreate


class DependencyService:
    """依赖关系服务"""

    @staticmethod
    async def create(db: AsyncSession, data: DependencyCreate) -> Dependency:
        """创建依赖关系"""
        # 检查是否已存在相同的依赖
        existing = await db.execute(
            select(Dependency).where(
                Dependency.source_task_id == data.source_task_id,
                Dependency.target_task_id == data.target_task_id,
            )
        )
        if existing.scalar_one_or_none():
            raise ValueError("该依赖关系已存在")

        dep = Dependency(
            source_task_id=data.source_task_id,
            target_task_id=data.target_task_id,
        )
        db.add(dep)
        await db.flush()
        logger.info(f"创建依赖: {data.source_task_id} → {data.target_task_id}")
        return dep

    @staticmethod
    async def delete(db: AsyncSession, dep_id: uuid.UUID) -> bool:
        """删除依赖关系"""
        result = await db.execute(
            select(Dependency).where(Dependency.id == dep_id)
        )
        dep = result.scalar_one_or_none()
        if not dep:
            return False
        await db.delete(dep)
        await db.flush()
        logger.info(f"删除依赖: {dep_id}")
        return True

    @staticmethod
    async def get_all(db: AsyncSession) -> list[Dependency]:
        """获取所有依赖关系"""
        result = await db.execute(
            select(Dependency).order_by(Dependency.created_at)
        )
        return list(result.scalars().all())

    @staticmethod
    async def get_by_task(db: AsyncSession, task_id: uuid.UUID) -> list[Dependency]:
        """获取指定任务的所有依赖关系（前置 + 后置）"""
        result = await db.execute(
            select(Dependency).where(
                or_(
                    Dependency.source_task_id == task_id,
                    Dependency.target_task_id == task_id,
                )
            )
        )
        return list(result.scalars().all())
