"""依赖关系 API 路由"""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.dependency_service import DependencyService
from app.schemas.dependency import DependencyCreate, DependencyResponse

router = APIRouter(prefix="/api/dependencies", tags=["依赖关系"])


@router.post("", response_model=DependencyResponse)
async def create_dependency(data: DependencyCreate, db: AsyncSession = Depends(get_db)):
    """创建依赖关系"""
    try:
        dep = await DependencyService.create(db, data)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return dep


@router.delete("/{dep_id}")
async def delete_dependency(dep_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """删除依赖关系"""
    success = await DependencyService.delete(db, dep_id)
    if not success:
        raise HTTPException(status_code=404, detail="依赖关系不存在")
    return {"message": "删除成功"}


@router.get("/task/{task_id}", response_model=list[DependencyResponse])
async def get_task_dependencies(task_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """获取指定任务的所有依赖关系"""
    return await DependencyService.get_by_task(db, task_id)
