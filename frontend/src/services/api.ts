/**
 * API 服务层 - 封装所有后端接口调用
 */
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000',
  timeout: 10000,
});

// ==================== 类型定义 ====================

export type TaskStatus = '未完成' | '已完成' | '已取消';

export interface GraphNode {
  id: string;
  title: string;
  description?: string;
  parent_id?: string;
  milestone_id?: string;
  assignee?: string;
  estimated_hours: number;
  computed_hours: number;
  computed_progress: number;
  status: TaskStatus;
  start_date?: string;
  due_date?: string;
  position_x?: number;
  position_y?: number;
  version: number;
  is_leaf: boolean;
  node_type: 'task';
}

export interface GraphMilestone {
  id: string;
  title: string;
  description?: string;
  position_x?: number;
  position_y?: number;
  computed_hours: number;
  computed_progress: number;
  node_type: 'milestone';
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  is_iterative: boolean;
  iteration_count: number;
  is_cycle_ended: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  milestones: GraphMilestone[];
  edges: GraphEdge[];
  assignees: string[];
}

export interface TaskCreate {
  title: string;
  description?: string;
  parent_id?: string;
  milestone_id?: string;
  assignee?: string;
  estimated_hours?: number;
  start_date?: string;
  due_date?: string;
  position_x?: number;
  position_y?: number;
}

export interface TaskUpdate {
  title?: string;
  description?: string;
  parent_id?: string;
  milestone_id?: string;
  assignee?: string;
  estimated_hours?: number;
  status?: TaskStatus;
  start_date?: string;
  due_date?: string;
  version: number;
}

export interface MilestoneCreate {
  title: string;
  description?: string;
  position_x?: number;
  position_y?: number;
}

export interface DependencyCreate {
  source_task_id: string;
  target_task_id: string;
}

// ==================== API 调用 ====================

/** 获取全量图谱数据 */
export const fetchGraphData = () =>
  api.get<GraphData>('/api/graph').then(res => res.data);

/** 创建任务 */
export const createTask = (data: TaskCreate) =>
  api.post<GraphNode>('/api/tasks', data).then(res => res.data);

/** 更新任务 */
export const updateTask = (id: string, data: TaskUpdate) =>
  api.put<GraphNode>(`/api/tasks/${id}`, data).then(res => res.data);

/** 删除任务 */
export const deleteTask = (id: string) =>
  api.delete(`/api/tasks/${id}`).then(res => res.data);

/** 批量创建子任务 */
export const batchCreateChildren = (parentId: string, titles: string[], assignee?: string) =>
  api.post<GraphNode[]>(`/api/tasks/${parentId}/children/batch`, { titles, assignee }).then(res => res.data);

/** 更新节点位置 */
export const updatePosition = (id: string, position_x: number, position_y: number) =>
  api.put(`/api/tasks/${id}/position`, { position_x, position_y });

/** 创建里程碑 */
export const createMilestone = (data: MilestoneCreate) =>
  api.post<GraphMilestone>('/api/milestones', data).then(res => res.data);

/** 更新里程碑 */
export const updateMilestone = (id: string, data: Partial<MilestoneCreate>) =>
  api.put<GraphMilestone>(`/api/milestones/${id}`, data).then(res => res.data);

/** 删除里程碑 */
export const deleteMilestone = (id: string) =>
  api.delete(`/api/milestones/${id}`).then(res => res.data);

/** 创建依赖关系 */
export const createDependency = (data: DependencyCreate) =>
  api.post('/api/dependencies', data).then(res => res.data);

/** 删除依赖关系 */
export const deleteDependency = (id: string) =>
  api.delete(`/api/dependencies/${id}`).then(res => res.data);

export default api;
