"""图谱数据服务层"""
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from app.models.task import TaskStatus
from app.services.task_service import TaskService
from app.services.milestone_service import MilestoneService
from app.services.dependency_service import DependencyService
from app.services import member_service
from app.schemas.graph import GraphNode, GraphMilestone, GraphEdge, GraphDataResponse


class GraphService:
    """图谱数据整合服务"""

    @staticmethod
    async def get_full_graph(db: AsyncSession) -> GraphDataResponse:
        """
        获取全量图谱数据，一次返回前端渲染所需的所有数据。
        包含：节点列表、里程碑列表、边列表、负责人列表。
        """
        # 获取所有任务
        tasks = await TaskService.get_all(db)
        # 获取所有里程碑
        milestones = await MilestoneService.get_all(db)
        # 获取所有依赖关系
        deps = await DependencyService.get_all(db)
        # 获取负责人列表
        assignees = await TaskService.get_all_assignees(db)
        # 获取所有成员
        members = await member_service.list_members(db)

        # 判断哪些任务有子任务
        parent_ids = {t.parent_id for t in tasks if t.parent_id}

        # 构造节点列表，并计算递归汇总
        nodes = []
        for task in tasks:
            is_leaf = task.id not in parent_ids

            if is_leaf:
                # 叶子节点直接用自身数据
                computed_hours = float(task.estimated_hours or 0)
                computed_progress = 100.0 if task.status == TaskStatus.COMPLETED else 0.0
            else:
                # 父节点递归汇总
                summary = await TaskService.compute_recursive(db, task.id)
                computed_hours = summary["computed_hours"]
                computed_progress = summary["computed_progress"]

            nodes.append(GraphNode(
                id=task.id,
                title=task.title,
                description=task.description,
                parent_id=task.parent_id,
                milestone_id=task.milestone_id,
                assignee=task.assignee,
                estimated_hours=task.estimated_hours,
                computed_hours=computed_hours,
                computed_progress=computed_progress,
                status=task.status,
                start_date=task.start_date,
                due_date=task.due_date,
                position_x=task.position_x,
                position_y=task.position_y,
                version=task.version,
                is_leaf=is_leaf,
                node_type="task",
            ))

        # 构造里程碑列表
        milestone_nodes = []
        for ms in milestones:
            # 计算里程碑下所有任务的汇总
            ms_tasks = [n for n in nodes if n.milestone_id == ms.id and n.parent_id is None]
            total_hours = sum(n.computed_hours for n in ms_tasks)
            total_progress = 0.0
            if total_hours > 0:
                total_progress = sum(
                    n.computed_hours * n.computed_progress for n in ms_tasks
                ) / total_hours

            milestone_nodes.append(GraphMilestone(
                id=ms.id,
                title=ms.title,
                description=ms.description,
                position_x=ms.position_x,
                position_y=ms.position_y,
                computed_hours=total_hours,
                computed_progress=round(total_progress, 2),
                node_type="milestone",
            ))

        # 构造边列表
        edges = [
            GraphEdge(
                id=dep.id,
                source=dep.source_task_id,
                target=dep.target_task_id,
                is_iterative=dep.is_iterative,
                iteration_count=dep.iteration_count,
                is_cycle_ended=dep.is_cycle_ended,
            )
            for dep in deps
        ]

        logger.info(
            f"图谱数据加载完成: {len(nodes)} 节点, "
            f"{len(milestone_nodes)} 里程碑, {len(edges)} 边"
        )

        return GraphDataResponse(
            nodes=nodes,
            milestones=milestone_nodes,
            edges=edges,
            assignees=assignees,
            members=[{"id": str(m.id), "name": m.name, "color": m.color} for m in members],
        )
