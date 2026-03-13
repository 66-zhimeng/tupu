"""里程碑 API 路由"""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.milestone_service import MilestoneService
from app.schemas.milestone import MilestoneCreate, MilestoneUpdate, MilestoneResponse

router = APIRouter(prefix="/api/milestones", tags=["里程碑"])


@router.post("", response_model=MilestoneResponse)
async def create_milestone(data: MilestoneCreate, db: AsyncSession = Depends(get_db)):
    """创建里程碑"""
    milestone = await MilestoneService.create(db, data)
    return milestone


@router.get("", response_model=list[MilestoneResponse])
async def get_milestones(db: AsyncSession = Depends(get_db)):
    """获取所有里程碑"""
    return await MilestoneService.get_all(db)


@router.put("/{milestone_id}", response_model=MilestoneResponse)
async def update_milestone(
    milestone_id: uuid.UUID, data: MilestoneUpdate, db: AsyncSession = Depends(get_db)
):
    """更新里程碑"""
    milestone = await MilestoneService.update(db, milestone_id, data)
    if not milestone:
        raise HTTPException(status_code=404, detail="里程碑不存在")
    return milestone


@router.delete("/{milestone_id}")
async def delete_milestone(milestone_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """删除里程碑"""
    success = await MilestoneService.delete(db, milestone_id)
    if not success:
        raise HTTPException(status_code=404, detail="里程碑不存在")
    return {"message": "删除成功"}
