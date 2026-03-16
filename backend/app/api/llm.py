"""LLM 配置与 AI 拆解 API 路由"""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from app.core.database import get_db
from app.services.llm_service import LLMService
from app.schemas.llm import (
    LLMConfigCreate, LLMConfigResponse,
    AIDecomposeRequest, AIDecomposeResponse,
    AIDecomposeConfirm, LLMTestResponse,
)

router = APIRouter(prefix="/api/llm", tags=["LLM"])


@router.get("/config", response_model=LLMConfigResponse | None)
async def get_llm_config(db: AsyncSession = Depends(get_db)):
    """获取当前 LLM 配置"""
    config = await LLMService.get_active_config(db)
    if not config:
        return None
    return LLMConfigResponse(
        id=config.id,
        provider=config.provider,
        api_key_masked=LLMService.mask_api_key(config.api_key),
        base_url=config.base_url,
        model_name=config.model_name,
        is_active=config.is_active,
        temperature=config.temperature,
        enable_thinking=config.enable_thinking,
    )


@router.post("/config", response_model=LLMConfigResponse)
async def save_llm_config(data: LLMConfigCreate, db: AsyncSession = Depends(get_db)):
    """保存 LLM 配置"""
    config = await LLMService.save_config(db, data)
    return LLMConfigResponse(
        id=config.id,
        provider=config.provider,
        api_key_masked=LLMService.mask_api_key(config.api_key),
        base_url=config.base_url,
        model_name=config.model_name,
        is_active=config.is_active,
        temperature=config.temperature,
        enable_thinking=config.enable_thinking,
    )


@router.post("/test", response_model=LLMTestResponse)
async def test_llm_connection(db: AsyncSession = Depends(get_db)):
    """测试 LLM 连接"""
    config = await LLMService.get_active_config(db)
    if not config:
        raise HTTPException(status_code=400, detail="请先配置 LLM 接口")
    result = await LLMService.test_connection(config)
    return LLMTestResponse(**result)


@router.post("/decompose", response_model=AIDecomposeResponse)
async def decompose_task(request: AIDecomposeRequest, db: AsyncSession = Depends(get_db)):
    """AI 任务拆解（返回预览，不创建）"""
    try:
        result = await LLMService.decompose_task(db, request)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"AI 拆解失败: {e}")
        raise HTTPException(status_code=500, detail=f"AI 拆解失败: {str(e)[:200]}")


@router.post("/decompose/confirm")
async def confirm_decompose(data: AIDecomposeConfirm, db: AsyncSession = Depends(get_db)):
    """确认 AI 拆解结果，批量创建任务和依赖"""
    try:
        created = await LLMService.confirm_decompose(db, data)
        return {"message": f"成功创建 {len(created)} 个任务", "tasks": created}
    except Exception as e:
        logger.error(f"确认拆解失败: {e}")
        raise HTTPException(status_code=500, detail=f"创建失败: {str(e)[:200]}")
