"""LLM 配置模型"""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Text, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class LLMConfig(Base):
    """LLM 配置（全局共享，单例激活）"""
    __tablename__ = "llm_configs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    provider: Mapped[str] = mapped_column(
        String(20), nullable=False, default="openai",
        comment="接口类型: openai / ollama / dify"
    )
    api_key: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="API Key（OpenAI/Dify 需要）"
    )
    base_url: Mapped[str] = mapped_column(
        String(500), nullable=False, default="https://api.openai.com/v1",
        comment="API Base URL"
    )
    model_name: Mapped[str] = mapped_column(
        String(100), nullable=False, default="gpt-4o-mini",
        comment="模型名称"
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False,
        comment="是否为当前激活的配置"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
