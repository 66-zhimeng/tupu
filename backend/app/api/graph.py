"""图谱数据 API 路由"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.graph_service import GraphService
from app.schemas.graph import GraphDataResponse

router = APIRouter(prefix="/api/graph", tags=["图谱"])


@router.get("", response_model=GraphDataResponse)
async def get_graph_data(db: AsyncSession = Depends(get_db)):
    """获取全量图谱数据（前端初始化渲染用）"""
    return await GraphService.get_full_graph(db)
