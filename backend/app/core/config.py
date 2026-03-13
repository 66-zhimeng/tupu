"""应用配置模块"""
from pydantic_settings import BaseSettings
from loguru import logger


class Settings(BaseSettings):
    """应用配置，从环境变量读取"""

    # 数据库
    DATABASE_URL: str = "postgresql+asyncpg://tupu:tupu123@localhost:5432/tupu"

    # MinIO
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "tupu-files"

    # LLM
    LLM_API_BASE: str = ""
    LLM_API_KEY: str = ""
    LLM_MODEL: str = "gpt-4o-mini"

    # 应用
    APP_TITLE: str = "研发流程管理系统"
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
logger.info(f"应用配置加载完成: {settings.APP_TITLE}")
