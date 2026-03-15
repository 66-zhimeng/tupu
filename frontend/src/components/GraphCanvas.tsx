/**
 * 图谱画布组件 — FlowEditor 风格
 *
 * 功能：
 * - G6 力导向图 + Combo 层级可视化
 * - create-edge 交互：拖拽创建依赖连线
 * - grid-line 网格背景
 * - minimap 小地图
 * - hover-activate 悬停高亮关联边
 * - 节点：矩形卡片样式（标题 + 负责人 + 工时）
 * - 边：贝塞尔曲线 + 箭头
 */
import { useEffect, useRef } from 'react';
import { Graph } from '@antv/g6';
import { message } from 'antd';
import { useGraphStore } from '../stores/graphStore';
import type { GraphNode, GraphMilestone } from '../services/api';
import './GraphCanvas.css';

/* ===== 辅助函数 ===== */

/** 完成度 → 颜色 */
function progressColor(pct: number, status: string): string {
  if (status === '已取消') return '#CBD5E1';
  if (status === '已完成' || pct >= 100) return '#10B981';
  if (pct <= 0) return '#94A3B8';
  if (pct < 50) {
    const t = pct / 50;
    return `rgb(${Math.round(148 - t * 89)},${Math.round(163 - t * 33)},${Math.round(184 + t * 62)})`;
  }
  const t = (pct - 50) / 50;
  return `rgb(${Math.round(59 - t * 43)},${Math.round(130 + t * 55)},${Math.round(246 - t * 115)})`;
}

/** 节点圆圈半径（对数增长，有最小尺寸） */
function nodeRadius(hours: number): number {
  const min = 55, max = 100;
  if (!hours || hours <= 0) return min;
  return Math.min(max, min + Math.log2(hours + 1) * 8);
}

/* ===== 构建 G6 数据 ===== */
function buildG6Data(
  graphData: ReturnType<typeof useGraphStore.getState>['graphData'],
  existingGraph?: any, // 传入已有 graph 实例，复用节点位置
) {
  if (!graphData) return { nodes: [], edges: [], combos: [] };

  // 收集已有节点位置（避免更新时跳动）
  const existingPositions = new Map<string, { x: number; y: number }>();
  if (existingGraph) {
    try {
      const allNodes = existingGraph.getNodeData();
      if (Array.isArray(allNodes)) {
        allNodes.forEach((n: any) => {
          if (n?.style?.x != null && n?.style?.y != null) {
            existingPositions.set(n.id, { x: n.style.x, y: n.style.y });
          }
        });
      }
    } catch { /* ignore */ }
  }

  // ===== 构建树结构 =====
  const nodeMap = new Map<string, GraphNode>();
  const childrenMap = new Map<string, GraphNode[]>();
  graphData.nodes.forEach(n => {
    nodeMap.set(n.id, n);
    if (n.parent_id) {
      if (!childrenMap.has(n.parent_id)) childrenMap.set(n.parent_id, []);
      childrenMap.get(n.parent_id)!.push(n);
    }
  });

  // ===== 递归计算每个节点的视觉半径 =====
  const radiusMap = new Map<string, number>();

  function computeRadius(nodeId: string): number {
    if (radiusMap.has(nodeId)) return radiusMap.get(nodeId)!;
    const children = childrenMap.get(nodeId) || [];
    const node = nodeMap.get(nodeId);
    const hours = node?.computed_hours || node?.estimated_hours || 0;

    if (children.length === 0) {
      // 叶子节点：对数增长 min=25 max=80
      const r = nodeRadius(hours);
      radiusMap.set(nodeId, r);
      return r;
    }

    // 父节点：基于工时的对数公式（更大的上下限）
    const parentMin = 80, parentMax = 300;
    const hoursR = hours > 0
      ? Math.min(parentMax, parentMin + Math.log2(hours + 1) * 15)
      : parentMin;

    // 同时保证能容纳所有子节点
    const childRadii = children.map(c => computeRadius(c.id));
    const totalChildArea = childRadii.reduce((sum, r) => sum + Math.PI * r * r, 0);
    const fitR = Math.sqrt(totalChildArea / Math.PI) * 2.0 + 30;
    const minFitR = Math.max(...childRadii) * 2 + 30;

    // 取最大值：工时公式 vs 容纳子节点 vs 绝对最小
    const r = Math.max(hoursR, fitR, minFitR, parentMin);
    radiusMap.set(nodeId, r);
    return r;
  }

  graphData.nodes.forEach(n => computeRadius(n.id));

  // ===== 计算子节点在父节点内部的相对位置 =====
  const relPosMap = new Map<string, { dx: number; dy: number }>();

  function layoutChildren(parentId: string) {
    const children = childrenMap.get(parentId) || [];
    if (children.length === 0) return;

    const parentR = radiusMap.get(parentId) || 60;

    if (children.length === 1) {
      relPosMap.set(children[0].id, { dx: 0, dy: 0 });
    } else {
      // 在父圆内部按同心圆排列子节点（轨道在父圆半径 40% 处）
      const maxChildR = Math.max(...children.map(c => radiusMap.get(c.id) || 30));
      const placeR = Math.min(parentR * 0.4, parentR - maxChildR - 5);
      children.forEach((child, i) => {
        const angle = (2 * Math.PI * i) / children.length - Math.PI / 2;
        relPosMap.set(child.id, {
          dx: Math.cos(angle) * Math.max(placeR, 0),
          dy: Math.sin(angle) * Math.max(placeR, 0),
        });
      });
    }

    // 递归处理子节点的子节点
    children.forEach(c => layoutChildren(c.id));
  }

  // 对所有顶层节点的子节点计算相对位置
  graphData.nodes.forEach(n => {
    if (!n.parent_id) layoutChildren(n.id);
  });

  // ===== 顶层节点布局（网格排列） =====
  const topNodes = graphData.nodes.filter(n => !n.parent_id);
  const topPositions = new Map<string, { x: number; y: number }>();

  // 按半径降序排列顶层节点
  const sortedTop = [...topNodes].sort((a, b) =>
    (radiusMap.get(b.id) || 30) - (radiusMap.get(a.id) || 30)
  );

  // 动态排列：考虑每个节点的实际半径
  const gap = 40; // 节点间最小间隙
  let cursorX = 0;
  let cursorY = 0;
  let rowMaxH = 0;
  const rowWidth = 800; // 每行最大宽度

  sortedTop.forEach(n => {
    const r = radiusMap.get(n.id) || 30;
    if (cursorX + r * 2 > rowWidth && cursorX > 0) {
      // 换行
      cursorX = 0;
      cursorY += rowMaxH + gap;
      rowMaxH = 0;
    }
    topPositions.set(n.id, {
      x: cursorX + r,
      y: cursorY + r,
    });
    cursorX += r * 2 + gap;
    rowMaxH = Math.max(rowMaxH, r * 2);
  });

  // ===== 递归计算每个节点的绝对位置 =====
  const absPos = new Map<string, { x: number; y: number }>();

  function computeAbsPos(nodeId: string, parentX: number, parentY: number) {
    // 已有位置的节点（被拖拽过）保持当前位置
    const existing = existingPositions.get(nodeId);
    if (existing) {
      absPos.set(nodeId, existing);
      // 用当前实际位置作为基准给子节点定位
      const children = childrenMap.get(nodeId) || [];
      children.forEach(c => computeAbsPos(c.id, existing.x, existing.y));
      return;
    }
    const rel = relPosMap.get(nodeId);
    const x = parentX + (rel?.dx || 0);
    const y = parentY + (rel?.dy || 0);
    absPos.set(nodeId, { x, y });
    // 递归子节点
    const children = childrenMap.get(nodeId) || [];
    children.forEach(c => computeAbsPos(c.id, x, y));
  }

  topNodes.forEach(n => {
    // 优先使用父节点当前实际位置（拖拽后的位置）
    const pos = existingPositions.get(n.id) || topPositions.get(n.id) || { x: 0, y: 0 };
    absPos.set(n.id, pos);
    const children = childrenMap.get(n.id) || [];
    children.forEach(c => computeAbsPos(c.id, pos.x, pos.y));
  });

  // ===== 构建 G6 节点数据 =====
  const nodes = graphData.nodes.map((node: GraphNode) => {
    const color = progressColor(node.computed_progress, node.status);
    const r = radiusMap.get(node.id) || 30;
    const isParent = childrenMap.has(node.id);
    const children = childrenMap.get(node.id) || [];
    const maxChars = 20;
    const title = node.title.length > maxChars ? node.title.slice(0, maxChars) + '…' : node.title;
    const depth = getDepth(node);

    // 优先使用已有位置，仅新节点用预计算位置
    const pos = existingPositions.get(node.id) || absPos.get(node.id) || { x: 0, y: 0 };

    return {
      id: node.id,
      style: {
        x: pos.x,
        y: pos.y,
        zIndex: depth * 10 + 10, // 子节点层级高于父节点，确保可点击
      },
      data: {
        ...node,
        nodeRadius: r,
        progressColor: color,
        label: title,
        isParent,
        childCount: children.length,
        depth,
      },
    };
  });

  function getDepth(node: GraphNode): number {
    let d = 0;
    let current = node;
    while (current.parent_id) {
      d++;
      const parent = nodeMap.get(current.parent_id);
      if (!parent) break;
      current = parent;
    }
    return d;
  }

  // 边
  const edges = graphData.edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    data: {
      edgeType: e.is_iterative ? 'iterative' : 'dependency',
      iterationCount: e.iteration_count,
    },
  }));

  return { nodes, edges, combos: [] };
}

/* ===== 组件 ===== */
export default function GraphCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    graphData,
    loadGraphData,
    selectNode,
    showContextMenu,
    hideContextMenu,
    savePosition,
    addDependency,
    enableConnect,
    setGraphInstance,
  } = useGraphStore();

  useEffect(() => { loadGraphData(); }, [loadGraphData]);

  // 初始化 G6
  useEffect(() => {
    if (!containerRef.current || graphRef.current) return;

    const graph = new Graph({
      container: containerRef.current,
      autoFit: 'view',
      padding: [60, 60, 60, 60],
      animation: true,

      // 位置已在 buildG6Data 中预计算，不使用自动布局

      // 交互
      behaviors: [
        { type: 'drag-canvas', key: 'drag-canvas' },
        'zoom-canvas',
        // 不使用 drag-element（不尊重 zIndex），改用自定义拖拽
        {
          type: 'hover-activate',
          key: 'hover-highlight',
          degree: 1,
          state: 'highlight',
        },
        // 不使用 G6 create-edge（坐标偏移 bug），改用自定义两步连线
      ],

      // 插件
      plugins: [
        {
          type: 'grid-line',
          key: 'grid',
          size: 30,
          stroke: '#E2E8F0',
          lineWidth: 0.5,
        },
        {
          type: 'minimap',
          key: 'minimap',
          size: [160, 100],
          position: 'right-bottom',
        },
      ],

      // 节点样式 — 圆形（父节点大圆 + 叶子节点小圆）
      node: {
        type: 'circle',
        style: {
          size: (d: any) => (d.data?.nodeRadius || 30) * 2,
          fill: (d: any) => {
            const color = d.data?.progressColor || '#94A3B8';
            return color;
          },
          // 父节点半透明大圆，叶子节点稍浓
          fillOpacity: (d: any) => d.data?.isParent ? 0.06 : 0.15,
          stroke: (d: any) => {
            if (d.data?.due_date && d.data?.status === '未完成') {
              if (new Date() > new Date(d.data.due_date)) return '#EF4444';
            }
            return d.data?.progressColor || '#E2E8F0';
          },
          lineWidth: (d: any) => d.data?.isParent ? 1.5 : 2.5,
          lineDash: (d: any) => d.data?.isParent ? [6, 4] : undefined,
          opacity: (d: any) => (d.data?.status === '已取消' ? 0.4 : 1),
          // 所有节点填充区域都响应事件，靠 zIndex 区分父子
          pointerEvents: 'auto',
          shadowColor: 'rgba(0, 0, 0, 0.06)',
          shadowBlur: 4,
          shadowOffsetY: 1,

          // 标签：大小与节点尺寸成正比，加粗加深
          labelText: (d: any) => d.data?.label || '',
          labelFill: (d: any) => d.data?.isParent ? '#0F172A' : '#1E293B',
          labelFontSize: (d: any) => {
            const r = d.data?.nodeRadius || 55;
            return Math.max(11, Math.min(18, Math.round(r * 0.25)));
          },
          labelFontWeight: (d: any) => d.data?.isParent ? 700 : 600,
          // 所有节点标签在中心，自动换行
          labelPlacement: 'center',
          labelWordWrap: true,
          labelMaxWidth: (d: any) => (d.data?.nodeRadius || 55) * 1.6,
          labelMaxLines: 3,
          labelFontFamily: "'Inter', sans-serif",

          // 圆形边缘均匀分布的不可见端口，供 create-edge 使用
          port: true,
          ports: Array.from({ length: 12 }, (_, i) => {
            const angle = (i / 12) * Math.PI * 2;
            return {
              key: `p${i}`,
              placement: [
                0.5 + 0.5 * Math.cos(angle),
                0.5 + 0.5 * Math.sin(angle),
              ] as [number, number],
              r: 0,  // 不可见
            };
          }),
        },
        state: {
          highlight: {
            stroke: '#3B82F6',
            lineWidth: 3,
            shadowColor: 'rgba(59, 130, 246, 0.3)',
            shadowBlur: 12,
          },
          dim: {
            opacity: 0.2,
          },
        },
      },

      // 边样式
      edge: {
        type: 'cubic',
        style: {
          stroke: (d: any) => (d.data?.edgeType === 'iterative' ? '#F59E0B' : '#64748B'),
          lineWidth: (d: any) => (d.data?.edgeType === 'iterative' ? 3 : 2.5),
          lineDash: (d: any) => (d.data?.edgeType === 'iterative' ? [6, 4] : undefined),
          opacity: 0.85,
          endArrow: true,
          endArrowSize: 10,
          endArrowFill: (d: any) => (d.data?.edgeType === 'iterative' ? '#F59E0B' : '#64748B'),
          labelText: (d: any) => {
            if (d.data?.edgeType === 'iterative' && d.data?.iterationCount > 0) {
              return `×${d.data.iterationCount}`;
            }
            return '';
          },
          labelFill: '#F59E0B',
          labelFontSize: 10,
          labelFontWeight: 600,
          labelBackground: true,
          labelBackgroundFill: '#FFFBEB',
          labelBackgroundRadius: 4,
          labelBackgroundPadding: [2, 6],
        },
        state: {
          highlight: {
            stroke: '#3B82F6',
            lineWidth: 2.5,
            opacity: 1,
          },
          dim: {
            opacity: 0.15,
          },
        },
      },

      // 不使用 Combo（所有任务都是圆节点）
    });

    graphRef.current = graph;
    setGraphInstance(graph);

    // ★ 辅助函数：在 graph 坐标处找到最内层（depth 最深、半径最小）的节点
    function findDeepestNodeAt(gx: number, gy: number): string | null {
      const allNodes = graph.getNodeData();
      if (!Array.isArray(allNodes)) return null;

      let bestId: string | null = null;
      let bestDepth = -1;
      let bestRadius = Infinity;

      for (const n of allNodes) {
        // 获取节点实际渲染位置
        let nx = 0, ny = 0;
        try {
          const pos = graph.getElementPosition(n.id as string);
          nx = pos[0]; ny = pos[1];
        } catch {
          nx = (n.style as any)?.x || 0;
          ny = (n.style as any)?.y || 0;
        }
        const nr = Number(n.data?.nodeRadius) || 55;
        const dx = gx - nx;
        const dy = gy - ny;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= nr) {
          const depth = Number(n.data?.depth) || 0;
          // 优先选 depth 更深的；depth 相同优先选半径更小的（子节点更小）
          if (depth > bestDepth || (depth === bestDepth && nr < bestRadius)) {
            bestDepth = depth;
            bestRadius = nr;
            bestId = n.id as string;
          }
        }
      }
      return bestId;
    }

    // ★ 自定义两步连线模式（替代 G6 create-edge）
    let _connectSource: string | null = null;

    // ★ 单击节点
    graph.on('node:click', (evt: any) => {
      const store = useGraphStore.getState();

      // 连线模式
      if (store.enableConnect) {
        const gx = evt.canvas?.x ?? evt.x ?? 0;
        const gy = evt.canvas?.y ?? evt.y ?? 0;
        const clicked = findDeepestNodeAt(gx, gy) || (evt.target?.id as string);
        if (!clicked) return;

        if (!_connectSource) {
          // 第一步：记录源节点
          _connectSource = clicked;
          message.info('请点击目标节点完成连线');
        } else {
          // 第二步：创建连线
          if (clicked !== _connectSource) {
            addDependency({
              source_task_id: _connectSource,
              target_task_id: clicked,
            });
            message.success('连线已创建');
          }
          _connectSource = null;
        }
        return;
      }

      // 正常模式：打开编辑面板
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      clickTimerRef.current = setTimeout(() => {
        const gx = evt.canvas?.x ?? evt.x ?? 0;
        const gy = evt.canvas?.y ?? evt.y ?? 0;
        const deepest = findDeepestNodeAt(gx, gy);
        if (deepest) selectNode(deepest, 'task');
        clickTimerRef.current = null;
      }, 250);
    });

    // 点击空白取消连线
    graph.on('canvas:click', () => {
      hideContextMenu();
      _connectSource = null;
    });
    // 右键菜单（同样智能定位最深节点）
    graph.on('node:contextmenu', (evt: any) => {
      const e = evt.originalEvent || evt;
      if (e?.preventDefault) e.preventDefault();
      if (e?.stopPropagation) e.stopPropagation();
      const canvasX = evt.canvas?.x ?? evt.x ?? 0;
      const canvasY = evt.canvas?.y ?? evt.y ?? 0;
      const deepest = findDeepestNodeAt(canvasX, canvasY);
      if (deepest) {
        showContextMenu(e?.clientX || 0, e?.clientY || 0, canvasX, canvasY, deepest, 'task');
      }
    });

    graph.on('canvas:contextmenu', (evt: any) => {
      const e = evt.originalEvent || evt;
      if (e?.preventDefault) e.preventDefault();
      if (e?.stopPropagation) e.stopPropagation();
      showContextMenu(e?.clientX || 0, e?.clientY || 0, evt.canvas?.x || 0, evt.canvas?.y || 0);
    });

    graph.on('canvas:click', () => hideContextMenu());

    // ★ 自定义拖拽（canvas 级别，始终操作最深层节点）
    // 递归获取所有子孙节点 ID
    function getAllDescendants(nodeId: string): string[] {
      const result: string[] = [];
      const allNodes = graph.getNodeData();
      if (!Array.isArray(allNodes)) return result;
      const stack = [nodeId];
      while (stack.length > 0) {
        const pid = stack.pop()!;
        for (const n of allNodes) {
          if (n.data?.parent_id === pid && n.id !== nodeId) {
            result.push(n.id as string);
            stack.push(n.id as string);
          }
        }
      }
      return result;
    }

    let _dragTarget: string | null = null;
    let _dragLastX = 0;
    let _dragLastY = 0;
    let _isDragging = false;

    // 获取节点的 graph 坐标位置
    function getNodePos(nodeId: string): [number, number] {
      try {
        const pos = graph.getElementPosition(nodeId);
        return [pos[0], pos[1]];
      } catch {
        const nd = graph.getNodeData(nodeId);
        return [(nd?.style as any)?.x || 0, (nd?.style as any)?.y || 0];
      }
    }
    // 只在 node:pointerdown（左键）设置拖拽目标
    graph.on('node:pointerdown', (evt: any) => {
      // 只在左键时启动拖拽，右键保留给 contextmenu
      const btn = evt.button ?? evt.originalEvent?.button ?? 0;
      if (btn !== 0) return;
      // 连线模式时不启动拖拽
      if (useGraphStore.getState().enableConnect) return;

      const gx = evt.canvas?.x ?? 0;
      const gy = evt.canvas?.y ?? 0;
      const target = findDeepestNodeAt(gx, gy);
      if (target) {
        _dragTarget = target;
        _dragLastX = gx;
        _dragLastY = gy;
        _isDragging = false;
        // 禁用 drag-canvas 防止同时平移
        graph.updateBehavior({ key: 'drag-canvas', enable: false });
      }
    });

    // 拖拽移动处理（核心逻辑）
    function handleDragMove(gx: number, gy: number) {
      if (!_dragTarget) return;
      _isDragging = true;

      const id = _dragTarget;
      const dx = gx - _dragLastX;
      const dy = gy - _dragLastY;
      _dragLastX = gx;
      _dragLastY = gy;

      if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return;

      // 移动目标节点
      graph.translateElementBy(id, [dx, dy], false);

      // ① 约束在父圆内
      const nd = graph.getNodeData(id);
      let actualDx = dx, actualDy = dy;
      if (nd?.data?.parent_id) {
        const parentId = nd.data.parent_id as string;
        const [px, py] = getNodePos(parentId);
        const [nx2, ny2] = getNodePos(id);
        const parentR = Number(graph.getNodeData(parentId)?.data?.nodeRadius) || 80;
        const childR = Number(nd.data?.nodeRadius) || 55;
        const ddx = nx2 - px;
        const ddy = ny2 - py;
        const dist = Math.sqrt(ddx * ddx + ddy * ddy);
        const maxDist = parentR - childR - 5;

        if (dist > maxDist && maxDist > 0) {
          const scale = maxDist / dist;
          const clampedX = px + ddx * scale;
          const clampedY = py + ddy * scale;
          const [beforeX, beforeY] = getNodePos(id);
          graph.translateElementTo(id, [clampedX, clampedY], false);
          actualDx = clampedX - (beforeX - dx);
          actualDy = clampedY - (beforeY - dy);
        }
      }

      // ② 移动所有子孙
      const descendants = getAllDescendants(id);
      if (descendants.length > 0 && (actualDx !== 0 || actualDy !== 0)) {
        for (const cid of descendants) {
          graph.translateElementBy(cid, [actualDx, actualDy], false);
        }
      }

      // ③ 同级碰撞检测
      const allNodes = graph.getNodeData();
      if (Array.isArray(allNodes)) {
        const myParent = nd?.data?.parent_id || null;
        const collisionGap = 5;
        const siblings = allNodes.filter(n => (n.data?.parent_id || null) === myParent);

        if (siblings.length > 1) {
          let pBoundX = 0, pBoundY = 0, pBoundR = Infinity;
          if (myParent) {
            const [bx, by] = getNodePos(myParent as string);
            pBoundX = bx; pBoundY = by;
            pBoundR = Number(graph.getNodeData(myParent as string)?.data?.nodeRadius) || 200;
          }

          const pos = new Map<string, { x: number; y: number }>();
          for (const s of siblings) {
            const [sx, sy] = getNodePos(s.id as string);
            pos.set(s.id as string, { x: sx, y: sy });
          }

          for (let iter = 0; iter < 3; iter++) {
            for (let i = 0; i < siblings.length; i++) {
              for (let j = i + 1; j < siblings.length; j++) {
                const a = siblings[i], b = siblings[j];
                const aId = a.id as string, bId = b.id as string;
                const aPos = pos.get(aId)!, bPos = pos.get(bId)!;
                const aR = Number(a.data?.nodeRadius) || 30;
                const bR = Number(b.data?.nodeRadius) || 30;
                const cdx = bPos.x - aPos.x, cdy = bPos.y - aPos.y;
                const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
                const minDist = aR + bR + collisionGap;

                if (cdist < minDist) {
                  const overlap = minDist - cdist;
                  let cnx: number, cny: number;
                  if (cdist > 0.01) { cnx = cdx / cdist; cny = cdy / cdist; }
                  else { const ang = Math.random() * Math.PI * 2; cnx = Math.cos(ang); cny = Math.sin(ang); }

                  const isADrag = aId === id, isBDrag = bId === id;
                  const pA = isBDrag ? 1 : isADrag ? 0 : 0.5;
                  const pB = isADrag ? 1 : isBDrag ? 0 : 0.5;

                  aPos.x -= cnx * overlap * pA; aPos.y -= cny * overlap * pA;
                  bPos.x += cnx * overlap * pB; bPos.y += cny * overlap * pB;

                  if (myParent && pBoundR < Infinity) {
                    for (const [sId, sR] of [[aId, aR], [bId, bR]] as [string, number][]) {
                      const sp = pos.get(sId)!;
                      const pdx2 = sp.x - pBoundX, pdy2 = sp.y - pBoundY;
                      const pdist = Math.sqrt(pdx2 * pdx2 + pdy2 * pdy2);
                      const maxD = pBoundR - sR - 5;
                      if (pdist > maxD && maxD > 0) { sp.x = pBoundX + pdx2 * (maxD / pdist); sp.y = pBoundY + pdy2 * (maxD / pdist); }
                    }
                  }
                }
              }
            }
          }

          for (const s of siblings) {
            const sId = s.id as string;
            if (sId === id) continue;
            const [ox, oy] = getNodePos(sId);
            const np = pos.get(sId)!;
            const mdx = np.x - ox, mdy = np.y - oy;
            if (Math.abs(mdx) < 0.01 && Math.abs(mdy) < 0.01) continue;
            graph.translateElementBy(sId, [mdx, mdy], false);
            for (const descId of getAllDescendants(sId)) {
              graph.translateElementBy(descId, [mdx, mdy], false);
            }
          }
        }
      }
    }

    // 使用 G6 事件（evt.canvas 已是 graph 坐标，无需手动转换）
    graph.on('node:pointermove', (evt: any) => {
      handleDragMove(evt.canvas?.x ?? 0, evt.canvas?.y ?? 0);
    });
    graph.on('canvas:pointermove', (evt: any) => {
      handleDragMove(evt.canvas?.x ?? 0, evt.canvas?.y ?? 0);
    });

    graph.on('node:pointerup', () => {
      if (_dragTarget && _isDragging) {
        const [fx, fy] = getNodePos(_dragTarget);
        savePosition(_dragTarget, fx, fy);
      }
      if (_dragTarget) graph.updateBehavior({ key: 'drag-canvas', enable: true });
      _dragTarget = null;
      _isDragging = false;
    });
    graph.on('canvas:pointerup', () => {
      if (_dragTarget && _isDragging) {
        const [fx, fy] = getNodePos(_dragTarget);
        savePosition(_dragTarget, fx, fy);
      }
      if (_dragTarget) graph.updateBehavior({ key: 'drag-canvas', enable: true });
      _dragTarget = null;
      _isDragging = false;
    });
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      setGraphInstance(null);
      graph.destroy();
      graphRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 数据变化 → 更新画布
  useEffect(() => {
    if (!graphRef.current || !graphData) return;
    graphRef.current.setData(buildG6Data(graphData, graphRef.current));
    graphRef.current.draw(); // draw 而非 render，避免重新布局
  }, [graphData]);

  const milestones = graphData?.milestones || [];

  return (
    <div className={`canvas-wrapper ${enableConnect ? 'connect-mode' : ''}`}>
      {/* 里程碑标签栏 */}
      {milestones.length > 0 && (
        <div className="canvas-top-bar">
          <div className="milestone-tags">
            {milestones.map((ms: GraphMilestone) => (
              <button
                key={ms.id}
                className="milestone-tag"
                onClick={() => selectNode(ms.id, 'milestone')}
              >
                <span className="milestone-icon">◆</span>
                {ms.title}
                {ms.computed_progress > 0 && (
                  <span className="milestone-pct">{Math.round(ms.computed_progress)}%</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 操作提示 */}
      <div className="canvas-hint">
        {enableConnect
          ? '🔗 连线模式 — 从节点拖向目标节点创建依赖'
          : '双击展开/收起 · 滚轮缩放 · 右键菜单'}
      </div>

      {/* G6 画布容器 */}
      <div
        ref={containerRef}
        id="graph-canvas"
        onContextMenu={(e) => e.preventDefault()}
        className="canvas-container"
      />
    </div>
  );
}
