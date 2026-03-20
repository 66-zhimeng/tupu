"""FastAPI 应用入口"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from app.core.config import settings
from app.core.database import init_db
from app.api import tasks, milestones, dependencies, graph, llm, members


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    logger.info(f"启动 {settings.APP_TITLE}")
    await init_db()
    yield
    logger.info(f"关闭 {settings.APP_TITLE}")


app = FastAPI(
    title=settings.APP_TITLE,
    description="基于力导向图的研发流程管理系统",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS 中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(tasks.router)
app.include_router(milestones.router)
app.include_router(dependencies.router)
app.include_router(graph.router)
app.include_router(llm.router)
app.include_router(members.router)


@app.get("/api/health")
async def health_check():
    """健康检查"""
    return {"status": "ok", "app": settings.APP_TITLE}
