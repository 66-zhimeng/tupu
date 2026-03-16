/**
 * 全局状态管理 - Zustand Store
 * 管理图谱数据、UI 状态、连线模式等
 */
import { create } from 'zustand';
import {
  fetchGraphData,
  createTask,
  updateTask,
  deleteTask,
  createMilestone,
  deleteMilestone,
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
import type { Graph } from '@antv/g6';

/** 面包屑条目 */
interface BreadcrumbItem {
  id: string | null;
  title: string;
}

interface GraphStore {
  // 数据
  graphData: GraphData | null;
  loading: boolean;
  error: string | null;

  // G6 画布实例引用
  graphInstance: Graph | null;
  setGraphInstance: (g: Graph | null) => void;

  // 层级导航
  currentParentId: string | null;
  breadcrumbs: BreadcrumbItem[];

  // 选中状态
  selectedNodeId: string | null;
  selectedNodeType: 'task' | 'milestone' | null;
  drawerVisible: boolean;

  // 连线模式
  enableConnect: boolean;
  toggleConnect: () => void;

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
  removeMilestone: (id: string) => Promise<void>;
  addDependency: (data: DependencyCreate) => Promise<void>;
  removeDependency: (id: string) => Promise<void>;
  savePosition: (id: string, x: number, y: number) => Promise<void>;
  addChildrenBatch: (parentId: string, titles: string[], assignee?: string) => Promise<void>;

  // 画布控制
  zoomIn: () => void;
  zoomOut: () => void;
  fitView: () => void;

  // 层级导航
  drillDown: (taskId: string) => void;
  goUp: () => void;
  goToLevel: (index: number) => void;

  // Helpers
  getCurrentLevelNodes: () => GraphNode[];
  getSelectedNode: () => GraphNode | GraphMilestone | null;
  // 位置缓存（跨层级保留节点位置）
  positionCache: Map<string, { x: number; y: number }>;
  cacheCurrentPositions: () => void;
}

export const useGraphStore = create<GraphStore>((set, get) => ({
  graphData: null,
  loading: false,
  error: null,
  graphInstance: null,
  currentParentId: null,
  breadcrumbs: [{ id: null, title: '全部任务' }],
  selectedNodeId: null,
  selectedNodeType: null,
  drawerVisible: false,
  enableConnect: false,
  contextMenu: { visible: false, x: 0, y: 0, canvasX: 0, canvasY: 0 },
  positionCache: new Map(),

  setGraphInstance: (g) => set({ graphInstance: g }),

  toggleConnect: () => {
    const next = !get().enableConnect;
    set({ enableConnect: next });
    // 光标通过 CSS .connect-mode 类控制，不再依赖 G6 create-edge 行为
  },

  // ===== 画布缩放控制 =====
  zoomIn: () => {
    const graph = get().graphInstance;
    if (graph) graph.zoomBy(1.2);
  },
  zoomOut: () => {
    const graph = get().graphInstance;
    if (graph) graph.zoomBy(0.8);
  },
  fitView: () => {
    const graph = get().graphInstance;
    if (graph) graph.fitView();
  },

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
    const { currentParentId } = get();
    const taskData = currentParentId
      ? { ...data, parent_id: currentParentId }
      : data;
    await createTask(taskData);
    // 后台刷新，不阻塞 UI
    get().loadGraphData();
  },

  editTask: async (id, data) => {
    await updateTask(id, data);
    get().loadGraphData();
  },

  removeTask: async (id) => {
    // 乐观更新：立即从本地状态移除
    const gd = get().graphData;
    if (gd) {
      const removeIds = new Set<string>();
      const collect = (pid: string) => {
        removeIds.add(pid);
        gd.nodes.filter(n => n.parent_id === pid).forEach(n => collect(n.id));
      };
      collect(id);
      set({
        graphData: {
          ...gd,
          nodes: gd.nodes.filter(n => !removeIds.has(n.id)),
          edges: gd.edges.filter(e => !removeIds.has(e.source) && !removeIds.has(e.target)),
        },
      });
    }
    if (get().selectedNodeId === id) {
      set({ selectedNodeId: null, drawerVisible: false });
    }
    await deleteTask(id);
    get().loadGraphData();
  },

  addMilestone: async (data) => {
    await createMilestone(data);
    get().loadGraphData();
  },

  removeMilestone: async (id) => {
    // 乐观更新
    const gd = get().graphData;
    if (gd) {
      set({
        graphData: {
          ...gd,
          milestones: gd.milestones.filter(m => m.id !== id),
          nodes: gd.nodes.map(n => n.milestone_id === id ? { ...n, milestone_id: undefined } : n),
        },
      });
    }
    if (get().selectedNodeId === id) {
      set({ selectedNodeId: null, drawerVisible: false });
    }
    await deleteMilestone(id);
    get().loadGraphData();
  },

  addDependency: async (data) => {
    await createDependency(data);
    get().loadGraphData();
  },

  removeDependency: async (id) => {
    // 乐观更新
    const gd = get().graphData;
    if (gd) {
      set({
        graphData: { ...gd, edges: gd.edges.filter(e => e.id !== id) },
      });
    }
    await deleteDependency(id);
    get().loadGraphData();
  },

  savePosition: async (id, x, y) => {
    await updatePosition(id, x, y);
  },

  addChildrenBatch: async (parentId, titles, assignee?) => {
    await batchCreateChildren(parentId, titles, assignee);
    await get().loadGraphData();
  },

  // 缓存当前层级的节点位置
  cacheCurrentPositions: () => {
    const { graphInstance, positionCache } = get();
    if (!graphInstance) return;
    try {
      const allNodes = graphInstance.getNodeData();
      if (Array.isArray(allNodes)) {
        const newCache = new Map(positionCache);
        allNodes.forEach((n: any) => {
          try {
            const pos = graphInstance.getElementPosition(n.id as string);
            newCache.set(n.id as string, { x: pos[0], y: pos[1] });
          } catch {
            if (n?.style?.x != null && n?.style?.y != null) {
              newCache.set(n.id as string, { x: n.style.x, y: n.style.y });
            }
          }
        });
        set({ positionCache: newCache });
      }
    } catch { /* ignore */ }
  },

  // ===== 层级导航 =====
  drillDown: (taskId) => {
    // 先缓存当前层级的位置
    get().cacheCurrentPositions();
    const { graphData, breadcrumbs } = get();
    if (!graphData) return;
    const task = graphData.nodes.find(n => n.id === taskId);
    if (!task) return;
    const children = graphData.nodes.filter(n => n.parent_id === taskId);
    if (children.length === 0) return;
    set({
      currentParentId: taskId,
      breadcrumbs: [...breadcrumbs, { id: taskId, title: task.title }],
    });
  },

  goUp: () => {
    get().cacheCurrentPositions();
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
    get().cacheCurrentPositions();
    const { breadcrumbs } = get();
    if (index < 0 || index >= breadcrumbs.length) return;
    const newBreadcrumbs = breadcrumbs.slice(0, index + 1);
    const targetLevel = newBreadcrumbs[newBreadcrumbs.length - 1];
    set({
      currentParentId: targetLevel.id,
      breadcrumbs: newBreadcrumbs,
    });
  },

  getCurrentLevelNodes: () => {
    const { graphData, currentParentId } = get();
    if (!graphData) return [];
    return graphData.nodes.filter(n => {
      if (currentParentId === null) return !n.parent_id;
      return n.parent_id === currentParentId;
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
