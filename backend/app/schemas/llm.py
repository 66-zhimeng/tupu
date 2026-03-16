"""LLM 相关 Pydantic schemas"""
from __future__ import annotations

import uuid
from typing import Optional, List
from pydantic import BaseModel, Field


# ==================== LLM 配置 ====================

class LLMConfigCreate(BaseModel):
    """创建/更新 LLM 配置"""
    provider: str = Field("openai", description="接口类型: openai / ollama / dify")
    api_key: Optional[str] = Field(None, description="API Key")
    base_url: str = Field("https://api.openai.com/v1", description="API Base URL")
    model_name: str = Field("gpt-4o-mini", description="模型名称")
    temperature: float = Field(0.7, ge=0.0, le=2.0, description="温度")
    enable_thinking: bool = Field(False, description="启用思考/推理模式")


class LLMConfigResponse(BaseModel):
    """LLM 配置响应（API Key 脱敏）"""
    id: uuid.UUID
    provider: str
    api_key_masked: str = Field("", description="脱敏后的 API Key")
    base_url: str
    model_name: str
    is_active: bool
    temperature: float = 0.7
    enable_thinking: bool = False

    model_config = {"from_attributes": True}


# ==================== AI 任务拆解 ====================

class DecomposeTaskNode(BaseModel):
    """AI 拆解后的单个任务节点"""
    title: str
    description: Optional[str] = None
    estimated_hours: Optional[float] = None
    assignee: Optional[str] = None
    children: List[DecomposeTaskNode] = []
    dependencies: List[int] = Field(
        default=[],
        description="依赖的同级任务索引（0-based），表示该任务依赖哪些前置任务"
    )


class AIDecomposeRequest(BaseModel):
    """AI 任务拆解请求"""
    description: str = Field(..., min_length=2, description="任务描述（自然语言）")
    parent_task_id: Optional[uuid.UUID] = Field(
        None, description="父任务 ID，为空则创建顶层任务"
    )
    depth: int = Field(2, ge=1, le=4, description="拆解层数")
    context: Optional[str] = Field(
        None, description="额外上下文（如已有任务信息）"
    )


class AIDecomposeResponse(BaseModel):
    """AI 任务拆解响应（预览）"""
    root_title: str
    tasks: List[DecomposeTaskNode]
    raw_response: Optional[str] = Field(None, description="LLM 原始返回（调试用）")


class AIDecomposeConfirm(BaseModel):
    """确认 AI 拆解结果，批量创建"""
    parent_task_id: Optional[uuid.UUID] = None
    tasks: List[DecomposeTaskNode]


class LLMTestResponse(BaseModel):
    """LLM 连通性测试结果"""
    success: bool
    message: str
    model: Optional[str] = None
    response_time_ms: Optional[int] = None
