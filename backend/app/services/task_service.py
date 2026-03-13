"""任务业务逻辑层"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any

from sqlalchemy import select, text, func
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from app.models.task import Task, TaskStatus
from app.schemas.task import TaskCreate, TaskUpdate, TaskPositionUpdate, TaskBatchCreate


class TaskService:
    """任务服务"""

    @staticmethod
    async def create(db: AsyncSession, data: TaskCreate) -> Task:
        """创建任务"""
        task = Task(
            title=data.title,
            description=data.description,
            parent_id=data.parent_id,
            milestone_id=data.milestone_id,
            assignee=data.assignee,
            estimated_hours=data.estimated_hours,
            start_date=data.start_date,
            due_date=data.due_date,
            position_x=data.position_x,
            position_y=data.position_y,
        )
        db.add(task)
        await db.flush()
        logger.info(f"创建任务: {task.id} - {task.title}")
        return task

    @staticmethod
    async def get_by_id(db: AsyncSession, task_id: uuid.UUID) -> Optional[Task]:
        """根据 ID 获取任务"""
        result = await db.execute(select(Task).where(Task.id == task_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def update(db: AsyncSession, task_id: uuid.UUID, data: TaskUpdate) -> Optional[Task]:
        """更新任务（含乐观锁校验）"""
        task = await TaskService.get_by_id(db, task_id)
        if not task:
            return None

        # 乐观锁检查
        if task.version != data.version:
            raise ValueError(f"数据已被修改，请刷新后重试。当前版本: {task.version}，提交版本: {data.version}")

        update_data = data.model_dump(exclude_unset=True, exclude={"version"})
        for key, value in update_data.items():
            setattr(task, key, value)

        task.version += 1
        task.updated_at = datetime.utcnow()
        await db.flush()
        logger.info(f"更新任务: {task.id} - {task.title}, 版本: {task.version}")
        return task

    @staticmethod
    async def delete(db: AsyncSession, task_id: uuid.UUID) -> bool:
        """删除任务（级联删除子任务）"""
        task = await TaskService.get_by_id(db, task_id)
        if not task:
            return False
        await db.delete(task)
        await db.flush()
        logger.info(f"删除任务: {task_id}")
        return True

    @staticmethod
    async def update_position(db: AsyncSession, task_id: uuid.UUID, data: TaskPositionUpdate) -> Optional[Task]:
        """更新节点位置"""
        task = await TaskService.get_by_id(db, task_id)
        if not task:
            return None
        task.position_x = data.position_x
        task.position_y = data.position_y
        await db.flush()
        return task

    @staticmethod
    async def batch_create_children(
        db: AsyncSession, parent_id: uuid.UUID, data: TaskBatchCreate
    ) -> List[Task]:
        """批量创建子任务"""
        parent = await TaskService.get_by_id(db, parent_id)
        if not parent:
            raise ValueError(f"父任务不存在: {parent_id}")

        tasks: List[Task] = []
        for title in data.titles:
            task = Task(
                title=title.strip(),
                parent_id=parent_id,
                milestone_id=parent.milestone_id,
                assignee=data.assignee,
            )
            db.add(task)
            tasks.append(task)

        await db.flush()
        logger.info(f"批量创建 {len(tasks)} 个子任务，父任务: {parent_id}")
        return tasks

    @staticmethod
    async def get_all(db: AsyncSession) -> List[Task]:
        """获取所有任务"""
        result = await db.execute(select(Task).order_by(Task.created_at))
        return list(result.scalars().all())

    @staticmethod
    async def has_children(db: AsyncSession, task_id: uuid.UUID) -> bool:
        """检查任务是否有子任务"""
        result = await db.execute(
            select(func.count()).select_from(Task).where(Task.parent_id == task_id)
        )
        count = result.scalar()
        return count is not None and count > 0

    @staticmethod
    async def compute_recursive(db: AsyncSession, task_id: uuid.UUID) -> Dict[str, Any]:
        """
        递归计算任务的汇总工时和进度。
        工时：父节点工时 = Σ 所有直接子节点工时
        进度：父节点进度 = Σ(子节点工时 × 完成比例) / 父节点总工时
        """
        query = text("""
            WITH RECURSIVE task_tree AS (
                SELECT id, parent_id, estimated_hours, status, 0 as depth
                FROM tasks
                WHERE id = :task_id

                UNION ALL

                SELECT t.id, t.parent_id, t.estimated_hours, t.status, tt.depth + 1
                FROM tasks t
                INNER JOIN task_tree tt ON t.parent_id = tt.id
            ),
            leaves AS (
                SELECT tt.id, tt.estimated_hours, tt.status
                FROM task_tree tt
                WHERE NOT EXISTS (
                    SELECT 1 FROM tasks t2 WHERE t2.parent_id = tt.id
                )
                AND tt.id != :task_id
            )
            SELECT
                COALESCE(SUM(estimated_hours), 0) as total_hours,
                CASE
                    WHEN COALESCE(SUM(estimated_hours), 0) = 0 THEN 0
                    ELSE SUM(
                        CASE
                            WHEN status = '已完成' THEN estimated_hours
                            WHEN status = '已取消' THEN 0
                            ELSE 0
                        END
                    ) * 100.0 / NULLIF(
                        SUM(
                            CASE
                                WHEN status != '已取消' THEN estimated_hours
                                ELSE 0
                            END
                        ), 0
                    )
                END as progress
            FROM leaves
        """)

        result = await db.execute(query, {"task_id": str(task_id)})
        row = result.fetchone()

        if row and row.total_hours > 0:
            return {
                "computed_hours": float(row.total_hours),
                "computed_progress": round(float(row.progress or 0), 2),
            }

        # 如果是叶子节点，直接返回自身数据
        task = await TaskService.get_by_id(db, task_id)
        if task:
            progress = 0.0
            if task.status == TaskStatus.COMPLETED:
                progress = 100.0
            return {
                "computed_hours": float(task.estimated_hours or 0),
                "computed_progress": progress,
            }

        return {"computed_hours": 0, "computed_progress": 0}

    @staticmethod
    async def get_all_assignees(db: AsyncSession) -> List[str]:
        """获取所有不重复的负责人列表"""
        result = await db.execute(
            select(Task.assignee)
            .where(Task.assignee.isnot(None))
            .where(Task.assignee != "")
            .distinct()
            .order_by(Task.assignee)
        )
        return [row[0] for row in result.all()]
