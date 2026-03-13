/**
 * 全局状态管理 - Zustand Store
 */
import { create } from 'zustand';
import {
  fetchGraphData,
  createTask,
  updateTask,
  deleteTask,
  createMilestone,
  createDependency,
  deleteDependency,
  updatePosition,
  batchCreateChildren,
  type GraphData,
  type GraphNode,
  type GraphMilestone,
  type TaskCreate,
  type TaskUpdate,
  type MilestoneCreate,
  type DependencyCreate,
} from '../services/api';

/** 面包屑条目 */
interface BreadcrumbItem {
  id: string | null; // null = 顶层
  title: string;
}

interface GraphStore {
  // 数据
  graphData: GraphData | null;
  loading: boolean;
  error: string | null;

  // 层级导航
  currentParentId: string | null; // null = 顶层视图
  breadcrumbs: BreadcrumbItem[];

  // 选中状态
  selectedNodeId: string | null;
  selectedNodeType: 'task' | 'milestone' | null;
  drawerVisible: boolean;

  // 右键菜单
  contextMenu: {
    visible: boolean;
    x: number;
    y: number;
    nodeId?: string;
    nodeType?: 'task' | 'milestone';
    canvasX: number;
    canvasY: number;
  };

  // 操作方法
  loadGraphData: () => Promise<void>;
  selectNode: (id: string, type: 'task' | 'milestone') => void;
  clearSelection: () => void;
  showContextMenu: (x: number, y: number, canvasX: number, canvasY: number, nodeId?: string, nodeType?: 'task' | 'milestone') => void;
  hideContextMenu: () => void;
  addTask: (data: TaskCreate) => Promise<void>;
  editTask: (id: string, data: TaskUpdate) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  addMilestone: (data: MilestoneCreate) => Promise<void>;
  addDependency: (data: DependencyCreate) => Promise<void>;
  removeDependency: (id: string) => Promise<void>;
  savePosition: (id: string, x: number, y: number) => Promise<void>;
  addChildrenBatch: (parentId: string, titles: string[], assignee?: string) => Promise<void>;

  // 层级导航方法
  drillDown: (taskId: string) => void;  // 双击进入子任务视图
  goUp: () => void;                      // 返回上一层
  goToLevel: (index: number) => void;    // 面包屑跳转到指定层

  // 获取当前层级的节点
  getCurrentLevelNodes: () => GraphNode[];
  getSelectedNode: () => GraphNode | GraphMilestone | null;
}

export const useGraphStore = create<GraphStore>((set, get) => ({
  graphData: null,
  loading: false,
  error: null,
  currentParentId: null,
  breadcrumbs: [{ id: null, title: '全部任务' }],
  selectedNodeId: null,
  selectedNodeType: null,
  drawerVisible: false,
  contextMenu: { visible: false, x: 0, y: 0, canvasX: 0, canvasY: 0 },

  loadGraphData: async () => {
    set({ loading: true, error: null });
    try {
      const data = await fetchGraphData();
      set({ graphData: data, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  selectNode: (id, type) => {
    set({ selectedNodeId: id, selectedNodeType: type, drawerVisible: true });
  },

  clearSelection: () => {
    set({ selectedNodeId: null, selectedNodeType: null, drawerVisible: false });
  },

  showContextMenu: (x, y, canvasX, canvasY, nodeId?, nodeType?) => {
    set({
      contextMenu: { visible: true, x, y, canvasX, canvasY, nodeId, nodeType },
    });
  },

  hideContextMenu: () => {
    set({
      contextMenu: { ...get().contextMenu, visible: false },
    });
  },

  addTask: async (data) => {
    // 如果在子层级中创建任务，自动设置 parent_id
    const { currentParentId } = get();
    const taskData = currentParentId
      ? { ...data, parent_id: currentParentId }
      : data;
    await createTask(taskData);
    await get().loadGraphData();
  },

  editTask: async (id, data) => {
    await updateTask(id, data);
    await get().loadGraphData();
  },

  removeTask: async (id) => {
    await deleteTask(id);
    if (get().selectedNodeId === id) {
      set({ selectedNodeId: null, drawerVisible: false });
    }
    await get().loadGraphData();
  },

  addMilestone: async (data) => {
    await createMilestone(data);
    await get().loadGraphData();
  },

  addDependency: async (data) => {
    await createDependency(data);
    await get().loadGraphData();
  },

  removeDependency: async (id) => {
    await deleteDependency(id);
    await get().loadGraphData();
  },

  savePosition: async (id, x, y) => {
    await updatePosition(id, x, y);
  },

  addChildrenBatch: async (parentId, titles, assignee?) => {
    await batchCreateChildren(parentId, titles, assignee);
    await get().loadGraphData();
  },

  // ===== 层级导航 =====

  drillDown: (taskId) => {
    const { graphData, breadcrumbs } = get();
    if (!graphData) return;

    const task = graphData.nodes.find(n => n.id === taskId);
    if (!task) return;

    // 检查此任务是否有子任务
    const children = graphData.nodes.filter(n => n.parent_id === taskId);
    if (children.length === 0) return; // 叶子节点不能展开

    set({
      currentParentId: taskId,
      breadcrumbs: [...breadcrumbs, { id: taskId, title: task.title }],
    });
  },

  goUp: () => {
    const { breadcrumbs } = get();
    if (breadcrumbs.length <= 1) return;

    const newBreadcrumbs = breadcrumbs.slice(0, -1);
    const parentLevel = newBreadcrumbs[newBreadcrumbs.length - 1];

    set({
      currentParentId: parentLevel.id,
      breadcrumbs: newBreadcrumbs,
    });
  },

  goToLevel: (index) => {
    const { breadcrumbs } = get();
    if (index < 0 || index >= breadcrumbs.length) return;

    const newBreadcrumbs = breadcrumbs.slice(0, index + 1);
    const targetLevel = newBreadcrumbs[newBreadcrumbs.length - 1];

    set({
      currentParentId: targetLevel.id,
      breadcrumbs: newBreadcrumbs,
    });
  },

  // 获取当前层级的节点（只返回 parent_id 匹配的直接子节点）
  getCurrentLevelNodes: () => {
    const { graphData, currentParentId } = get();
    if (!graphData) return [];

    return graphData.nodes.filter(n => {
      if (currentParentId === null) {
        return !n.parent_id; // 顶层：没有 parent 的任务
      }
      return n.parent_id === currentParentId; // 子层级：parent_id 匹配
    });
  },

  getSelectedNode: () => {
    const { graphData, selectedNodeId, selectedNodeType } = get();
    if (!graphData || !selectedNodeId) return null;

    if (selectedNodeType === 'milestone') {
      return graphData.milestones.find(m => m.id === selectedNodeId) || null;
    }
    return graphData.nodes.find(n => n.id === selectedNodeId) || null;
  },
}));
