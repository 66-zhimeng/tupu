"""任务 API 路由"""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from app.core.database import get_db
from app.services.task_service import TaskService
from app.schemas.task import (
    TaskCreate, TaskUpdate, TaskPositionUpdate,
    TaskBatchCreate, TaskResponse,
)

router = APIRouter(prefix="/api/tasks", tags=["任务"])


@router.post("", response_model=TaskResponse)
async def create_task(data: TaskCreate, db: AsyncSession = Depends(get_db)):
    """创建任务"""
    task = await TaskService.create(db, data)
    is_leaf = not await TaskService.has_children(db, task.id)
    summary = await TaskService.compute_recursive(db, task.id)
    return TaskResponse(
        **{k: v for k, v in task.__dict__.items() if not k.startswith("_")},
        computed_hours=summary["computed_hours"],
        computed_progress=summary["computed_progress"],
        is_leaf=is_leaf,
    )


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(task_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """获取单个任务（含递归汇总）"""
    task = await TaskService.get_by_id(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    is_leaf = not await TaskService.has_children(db, task.id)
    summary = await TaskService.compute_recursive(db, task.id)
    return TaskResponse(
        **{k: v for k, v in task.__dict__.items() if not k.startswith("_")},
        computed_hours=summary["computed_hours"],
        computed_progress=summary["computed_progress"],
        is_leaf=is_leaf,
    )


@router.put("/{task_id}", response_model=TaskResponse)
async def update_task(task_id: uuid.UUID, data: TaskUpdate, db: AsyncSession = Depends(get_db)):
    """更新任务（含乐观锁校验）"""
    try:
        task = await TaskService.update(db, task_id, data)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    is_leaf = not await TaskService.has_children(db, task.id)
    summary = await TaskService.compute_recursive(db, task.id)
    return TaskResponse(
        **{k: v for k, v in task.__dict__.items() if not k.startswith("_")},
        computed_hours=summary["computed_hours"],
        computed_progress=summary["computed_progress"],
        is_leaf=is_leaf,
    )


@router.delete("/{task_id}")
async def delete_task(task_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """删除任务（级联删除子任务）"""
    success = await TaskService.delete(db, task_id)
    if not success:
        raise HTTPException(status_code=404, detail="任务不存在")
    return {"message": "删除成功"}


@router.post("/{task_id}/children/batch", response_model=list[TaskResponse])
async def batch_create_children(
    task_id: uuid.UUID, data: TaskBatchCreate, db: AsyncSession = Depends(get_db)
):
    """批量创建子任务"""
    try:
        tasks = await TaskService.batch_create_children(db, task_id, data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    result = []
    for task in tasks:
        result.append(TaskResponse(
            **{k: v for k, v in task.__dict__.items() if not k.startswith("_")},
            computed_hours=float(task.estimated_hours or 0),
            computed_progress=0.0,
            is_leaf=True,
        ))
    return result


@router.put("/{task_id}/position")
async def update_position(
    task_id: uuid.UUID, data: TaskPositionUpdate, db: AsyncSession = Depends(get_db)
):
    """更新节点位置"""
    task = await TaskService.update_position(db, task_id, data)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    return {"message": "位置已更新"}
