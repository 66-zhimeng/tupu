"""LLM 统一调用服务 — 支持 OpenAI 兼容 / Ollama / Dify"""
from __future__ import annotations

import json
import time
import uuid
import re
from typing import Optional, List, Dict, Any

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from app.models.llm_config import LLMConfig
from app.models.task import Task
from app.models.dependency import Dependency
from app.schemas.llm import (
    LLMConfigCreate, AIDecomposeRequest, AIDecomposeResponse,
    DecomposeTaskNode, AIDecomposeConfirm,
)


# ===== Prompt 模板 =====

DECOMPOSE_SYSTEM_PROMPT = """You are a professional project manager. Decompose the given task into a structured work breakdown.

Rules:
1. Follow the user's language — if the description is in Chinese, respond entirely in Chinese; if in English, respond in English.
2. Output ONLY valid JSON, no markdown fences, no explanation outside the JSON.
3. Each task has: title, description, estimated_hours, children (sub-tasks), dependencies (array of sibling 0-based indices that must finish first).
4. Depth should match the requested level. Leaf tasks should be actionable and concrete.
5. estimated_hours should be realistic for software development work.

JSON schema:
{
  "tasks": [
    {
      "title": "string",
      "description": "string or null",
      "estimated_hours": number,
      "children": [ ... recursive ... ],
      "dependencies": [0]  // this task depends on tasks[0] finishing first
    }
  ]
}"""

DECOMPOSE_USER_TEMPLATE = """Decompose the following task into sub-tasks with {depth} levels of depth.

Task description:
{description}

{context_section}

Return the JSON directly."""


class LLMService:
    """LLM 统一服务"""

    # ---------- 配置管理 ----------

    @staticmethod
    async def get_active_config(db: AsyncSession) -> Optional[LLMConfig]:
        """获取当前活跃的 LLM 配置"""
        result = await db.execute(
            select(LLMConfig).where(LLMConfig.is_active == True).limit(1)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def save_config(db: AsyncSession, data: LLMConfigCreate) -> LLMConfig:
        """保存 LLM 配置（覆盖旧配置）"""
        # 将所有现有配置设为非活跃
        await db.execute(
            update(LLMConfig).values(is_active=False)
        )

        config = LLMConfig(
            provider=data.provider,
            api_key=data.api_key,
            base_url=data.base_url.rstrip("/"),
            model_name=data.model_name,
            is_active=True,
        )
        db.add(config)
        await db.flush()
        logger.info(f"LLM 配置已保存: provider={data.provider}, model={data.model_name}")
        return config

    @staticmethod
    def mask_api_key(key: Optional[str]) -> str:
        """API Key 脱敏"""
        if not key:
            return ""
        if len(key) <= 8:
            return "****"
        return key[:4] + "****" + key[-4:]

    # ---------- LLM 调用 ----------

    @staticmethod
    async def call_llm(
        config: LLMConfig,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> str:
        """根据 provider 分发调用 LLM"""
        provider = config.provider.lower()

        if provider == "openai":
            return await LLMService._call_openai(config, system_prompt, user_prompt, temperature, max_tokens)
        elif provider == "ollama":
            return await LLMService._call_ollama(config, system_prompt, user_prompt, temperature)
        elif provider == "dify":
            return await LLMService._call_dify(config, user_prompt)
        else:
            raise ValueError(f"不支持的 LLM 类型: {provider}")

    @staticmethod
    async def _call_openai(
        config: LLMConfig,
        system_prompt: str,
        user_prompt: str,
        temperature: float,
        max_tokens: int,
    ) -> str:
        """调用 OpenAI 兼容接口"""
        headers = {"Content-Type": "application/json"}
        if config.api_key:
            headers["Authorization"] = f"Bearer {config.api_key}"

        payload = {
            "model": config.model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        base_url = config.base_url.rstrip("/")
        url = f"{base_url}/chat/completions"

        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        return data["choices"][0]["message"]["content"]

    @staticmethod
    async def _call_ollama(
        config: LLMConfig,
        system_prompt: str,
        user_prompt: str,
        temperature: float,
    ) -> str:
        """调用 Ollama 本地接口"""
        base_url = config.base_url.rstrip("/")
        url = f"{base_url}/api/chat"

        payload = {
            "model": config.model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "stream": False,
            "options": {"temperature": temperature},
        }

        async with httpx.AsyncClient(timeout=300) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()

        return data["message"]["content"]

    @staticmethod
    async def _call_dify(config: LLMConfig, user_prompt: str) -> str:
        """调用 Dify Workflow API"""
        base_url = config.base_url.rstrip("/")
        url = f"{base_url}/v1/workflows/run"

        headers = {
            "Authorization": f"Bearer {config.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "inputs": {"query": user_prompt},
            "response_mode": "blocking",
            "user": "graph-studio",
        }

        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        # Dify 返回结构
        if "data" in data and "outputs" in data["data"]:
            outputs = data["data"]["outputs"]
            return outputs.get("text", outputs.get("result", json.dumps(outputs)))
        return json.dumps(data)

    # ---------- 连通性测试 ----------

    @staticmethod
    async def test_connection(config: LLMConfig) -> Dict[str, Any]:
        """测试 LLM 接口连通性"""
        start = time.time()
        try:
            response = await LLMService.call_llm(
                config,
                system_prompt="You are a helpful assistant.",
                user_prompt="Reply with exactly: OK",
                temperature=0,
                max_tokens=10,
            )
            elapsed = int((time.time() - start) * 1000)
            return {
                "success": True,
                "message": f"连接成功 — 模型: {config.model_name}",
                "model": config.model_name,
                "response_time_ms": elapsed,
            }
        except httpx.HTTPStatusError as e:
            return {
                "success": False,
                "message": f"HTTP 错误 {e.response.status_code}: {e.response.text[:200]}",
            }
        except httpx.ConnectError:
            return {
                "success": False,
                "message": f"无法连接到 {config.base_url}，请检查地址是否正确",
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"连接失败: {str(e)[:200]}",
            }

    # ---------- AI 任务拆解 ----------

    @staticmethod
    def _extract_json(text: str) -> dict:
        """从 LLM 返回中提取 JSON"""
        # 尝试直接解析
        text = text.strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # 尝试从 markdown 代码块中提取
        match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1).strip())
            except json.JSONDecodeError:
                pass

        # 尝试找到第一个 { 和最后一个 }
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                pass

        raise ValueError(f"无法从 LLM 响应中解析 JSON:\n{text[:500]}")

    @staticmethod
    async def decompose_task(
        db: AsyncSession, request: AIDecomposeRequest
    ) -> AIDecomposeResponse:
        """AI 任务拆解 → 返回预览树"""
        config = await LLMService.get_active_config(db)
        if not config:
            raise ValueError("请先在设置中配置 LLM 接口")

        context_section = ""
        if request.context:
            context_section = f"Additional context:\n{request.context}"
        if request.parent_task_id:
            parent = await db.execute(
                select(Task).where(Task.id == request.parent_task_id)
            )
            parent_task = parent.scalar_one_or_none()
            if parent_task:
                context_section += f"\nThis is a sub-task breakdown for: {parent_task.title}"
                if parent_task.description:
                    context_section += f"\nParent description: {parent_task.description}"

        user_prompt = DECOMPOSE_USER_TEMPLATE.format(
            depth=request.depth,
            description=request.description,
            context_section=context_section,
        )

        raw_response = await LLMService.call_llm(
            config,
            system_prompt=DECOMPOSE_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.7,
            max_tokens=4096,
        )

        parsed = LLMService._extract_json(raw_response)
        tasks_data = parsed.get("tasks", [])

        def parse_node(d: dict) -> DecomposeTaskNode:
            return DecomposeTaskNode(
                title=d.get("title", "未命名任务"),
                description=d.get("description"),
                estimated_hours=d.get("estimated_hours"),
                children=[parse_node(c) for c in d.get("children", [])],
                dependencies=d.get("dependencies", []),
            )

        tasks = [parse_node(t) for t in tasks_data]

        root_title = request.description[:50]
        if request.parent_task_id:
            parent_result = await db.execute(
                select(Task.title).where(Task.id == request.parent_task_id)
            )
            pt = parent_result.scalar_one_or_none()
            if pt:
                root_title = pt

        return AIDecomposeResponse(
            root_title=root_title,
            tasks=tasks,
            raw_response=raw_response[:2000],
        )

    # ---------- 确认拆解并创建任务 + 依赖 ----------

    @staticmethod
    async def confirm_decompose(
        db: AsyncSession, data: AIDecomposeConfirm
    ) -> List[Dict[str, Any]]:
        """确认 AI 拆解结果，批量创建任务 + 依赖关系"""
        created: List[Dict[str, Any]] = []

        async def create_recursive(
            nodes: List[DecomposeTaskNode],
            parent_id: Optional[uuid.UUID],
            depth: int = 0,
        ):
            # 记录本级已创建任务的 index → task_id 映射
            index_to_id: Dict[int, uuid.UUID] = {}

            for idx, node in enumerate(nodes):
                task = Task(
                    title=node.title,
                    description=node.description,
                    parent_id=parent_id,
                    estimated_hours=node.estimated_hours or 0,
                )
                db.add(task)
                await db.flush()
                index_to_id[idx] = task.id
                created.append({
                    "id": str(task.id),
                    "title": task.title,
                    "parent_id": str(parent_id) if parent_id else None,
                    "depth": depth,
                })
                logger.info(f"AI 创建任务: {task.title} (depth={depth})")

                # 递归创建子任务
                if node.children:
                    await create_recursive(node.children, task.id, depth + 1)

            # 创建依赖关系
            for idx, node in enumerate(nodes):
                for dep_idx in node.dependencies:
                    if dep_idx in index_to_id and idx in index_to_id:
                        dep = Dependency(
                            source_task_id=index_to_id[dep_idx],
                            target_task_id=index_to_id[idx],
                        )
                        db.add(dep)
                        logger.info(
                            f"AI 创建依赖: {nodes[dep_idx].title} → {node.title}"
                        )

        await create_recursive(data.tasks, data.parent_task_id)
        await db.flush()
        return created
