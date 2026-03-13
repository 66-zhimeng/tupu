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

interface GraphStore {
  // 数据
  graphData: GraphData | null;
  loading: boolean;
  error: string | null;

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

  // 获取选中节点的数据
  getSelectedNode: () => GraphNode | GraphMilestone | null;
}

export const useGraphStore = create<GraphStore>((set, get) => ({
  graphData: null,
  loading: false,
  error: null,
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
    await createTask(data);
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

  getSelectedNode: () => {
    const { graphData, selectedNodeId, selectedNodeType } = get();
    if (!graphData || !selectedNodeId) return null;

    if (selectedNodeType === 'milestone') {
      return graphData.milestones.find(m => m.id === selectedNodeId) || null;
    }
    return graphData.nodes.find(n => n.id === selectedNodeId) || null;
  },
}));
