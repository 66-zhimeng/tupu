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
    const rel = relPosMap.get(nodeId);
    const x = parentX + (rel?.dx || 0);
    const y = parentY + (rel?.dy || 0);
    absPos.set(nodeId, { x, y });
    // 递归子节点
    const children = childrenMap.get(nodeId) || [];
    children.forEach(c => computeAbsPos(c.id, x, y));
  }

  topNodes.forEach(n => {
    const pos = topPositions.get(n.id) || { x: 0, y: 0 };
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
        'drag-canvas',
        'zoom-canvas',
        { type: 'drag-element', key: 'drag-node' },
        {
          type: 'hover-activate',
          key: 'hover-highlight',
          degree: 1,
          state: 'highlight',
          inactiveState: 'dim',
        },
        // ★ 点击创建边（click 模式：先点源节点，再点目标节点）
        {
          type: 'create-edge',
          key: 'create-edge',
          trigger: 'click',
          enable: false,
          style: {
            stroke: '#3B82F6',
            lineWidth: 2,
            lineDash: [6, 4],
            endArrow: true,
          },
          onCreate: (edge: any) => {
            const source = edge.source;
            const target = edge.target;
            if (source && target && source !== target) {
              addDependency({
                source_task_id: source,
                target_task_id: target,
              });
            }
          },
        },
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

          // 连接端口
          port: true,
          ports: [
            { key: 'top', placement: [0.5, 0], r: 3, fill: '#3B82F6', stroke: '#fff', lineWidth: 1 },
            { key: 'right', placement: [1, 0.5], r: 3, fill: '#3B82F6', stroke: '#fff', lineWidth: 1 },
            { key: 'bottom', placement: [0.5, 1], r: 3, fill: '#3B82F6', stroke: '#fff', lineWidth: 1 },
            { key: 'left', placement: [0, 0.5], r: 3, fill: '#3B82F6', stroke: '#fff', lineWidth: 1 },
          ],
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
          stroke: (d: any) => (d.data?.edgeType === 'iterative' ? '#F59E0B' : '#94A3B8'),
          lineWidth: (d: any) => (d.data?.edgeType === 'iterative' ? 2.5 : 1.5),
          lineDash: (d: any) => (d.data?.edgeType === 'iterative' ? [6, 4] : undefined),
          opacity: 0.6,
          endArrow: true,
          endArrowSize: 6,
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

    // ★ 单击（延时 250ms 防双击冲突，智能选中最内层节点）
    graph.on('node:click', (evt: any) => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      clickTimerRef.current = setTimeout(() => {
        const gx = evt.canvas?.x ?? evt.x ?? 0;
        const gy = evt.canvas?.y ?? evt.y ?? 0;
        const deepest = findDeepestNodeAt(gx, gy);
        if (deepest) selectNode(deepest, 'task');
        clickTimerRef.current = null;
      }, 250);
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

    // ★ 拖拽逻辑：父节点带动子节点 + 子节点约束在父圆内
    const _lastDragPos = new Map<string, { x: number; y: number }>();

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

    graph.on('node:dragstart', (evt: any) => {
      const id = evt.target?.id;
      if (!id) return;
      const nd = graph.getNodeData(id);
      if (!nd?.style) return;
      _lastDragPos.set(id, { x: (nd.style as any).x || 0, y: (nd.style as any).y || 0 });
    });

    graph.on('node:drag', (evt: any) => {
      const id = evt.target?.id;
      if (!id) return;
      const nd = graph.getNodeData(id);
      if (!nd?.style) return;

      let curX = (nd.style as any).x || 0;
      let curY = (nd.style as any).y || 0;
      const last = _lastDragPos.get(id) || { x: curX, y: curY };

      // ① 先约束本节点在父圆内（若是子节点）
      if (nd.data?.parent_id) {
        const parentId = nd.data.parent_id as string;
        const parentNd = graph.getNodeData(parentId);
        if (parentNd?.style) {
          const px = (parentNd.style as any).x || 0;
          const py = (parentNd.style as any).y || 0;
          const parentR = Number(parentNd.data?.nodeRadius) || 60;
          const childR = Number(nd.data?.nodeRadius) || 30;
          const dx = curX - px;
          const dy = curY - py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const maxDist = parentR - childR - 5;

          if (dist > maxDist && maxDist > 0) {
            const scale = maxDist / dist;
            curX = px + dx * scale;
            curY = py + dy * scale;
            graph.updateNodeData([{ id, style: { x: curX, y: curY } }]);
          }
        }
      }

      // ② 计算约束后的实际增量
      const actualMoveX = curX - last.x;
      const actualMoveY = curY - last.y;
      _lastDragPos.set(id, { x: curX, y: curY });

      // ③ 用实际增量移动所有子孙（父节点被边界卡住时增量为0，子孙也不动）
      const descendants = getAllDescendants(id);
      if (descendants.length > 0 && (actualMoveX !== 0 || actualMoveY !== 0)) {
        const updates = descendants.map(cid => {
          const cnd = graph.getNodeData(cid);
          return {
            id: cid,
            style: {
              x: ((cnd?.style as any)?.x || 0) + actualMoveX,
              y: ((cnd?.style as any)?.y || 0) + actualMoveY,
            },
          };
        });
        graph.updateNodeData(updates);
      }

      // ④ 同级碰撞检测（多轮迭代，所有兄弟对都检查）
      const allNodes = graph.getNodeData();
      if (Array.isArray(allNodes)) {
        const myParent = nd.data?.parent_id || null;
        const collisionGap = 5;

        // 收集同级兄弟（含自己）
        const siblings = allNodes.filter(n =>
          (n.data?.parent_id || null) === myParent
        );

        if (siblings.length > 1) {
          // 父圆边界
          let pBoundX = 0, pBoundY = 0, pBoundR = Infinity;
          if (myParent) {
            const pNd = graph.getNodeData(myParent as string);
            if (pNd?.style) {
              pBoundX = (pNd.style as any).x || 0;
              pBoundY = (pNd.style as any).y || 0;
              pBoundR = Number(pNd.data?.nodeRadius) || 200;
            }
          }

          // 工作副本：当前位置
          const pos = new Map<string, { x: number; y: number }>();
          for (const s of siblings) {
            pos.set(s.id as string, {
              x: (s.style as any)?.x || 0,
              y: (s.style as any)?.y || 0,
            });
          }

          // 迭代 3 轮解决级联重叠
          for (let iter = 0; iter < 3; iter++) {
            for (let i = 0; i < siblings.length; i++) {
              for (let j = i + 1; j < siblings.length; j++) {
                const a = siblings[i];
                const b = siblings[j];
                const aId = a.id as string;
                const bId = b.id as string;
                const aPos = pos.get(aId)!;
                const bPos = pos.get(bId)!;
                const aR = Number(a.data?.nodeRadius) || 30;
                const bR = Number(b.data?.nodeRadius) || 30;

                const dx = bPos.x - aPos.x;
                const dy = bPos.y - aPos.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const minDist = aR + bR + collisionGap;

                if (dist < minDist) {
                  const overlap = minDist - dist;
                  let nx: number, ny: number;
                  if (dist > 0.01) {
                    nx = dx / dist;
                    ny = dy / dist;
                  } else {
                    const angle = Math.random() * Math.PI * 2;
                    nx = Math.cos(angle);
                    ny = Math.sin(angle);
                  }

                  // 被拖拽的节点不动，另一方全推；其他情况各推一半
                  const isADragged = aId === id;
                  const isBDragged = bId === id;
                  const pushA = isBDragged ? 1 : isADragged ? 0 : 0.5;
                  const pushB = isADragged ? 1 : isBDragged ? 0 : 0.5;

                  aPos.x -= nx * overlap * pushA;
                  aPos.y -= ny * overlap * pushA;
                  bPos.x += nx * overlap * pushB;
                  bPos.y += ny * overlap * pushB;

                  // 约束在父圆内
                  if (myParent && pBoundR < Infinity) {
                    for (const [sId, sR] of [[aId, aR], [bId, bR]] as [string, number][]) {
                      const sp = pos.get(sId)!;
                      const pdx = sp.x - pBoundX;
                      const pdy = sp.y - pBoundY;
                      const pdist = Math.sqrt(pdx * pdx + pdy * pdy);
                      const maxD = pBoundR - sR - 5;
                      if (pdist > maxD && maxD > 0) {
                        const clamp = maxD / pdist;
                        sp.x = pBoundX + pdx * clamp;
                        sp.y = pBoundY + pdy * clamp;
                      }
                    }
                  }
                }
              }
            }
          }

          // 应用位置变化（含子孙跟随）
          const updates: any[] = [];
          for (const s of siblings) {
            const sId = s.id as string;
            if (sId === id) continue; // 拖拽节点位置已由 G6 drag 控制
            const oldX = (s.style as any)?.x || 0;
            const oldY = (s.style as any)?.y || 0;
            const newP = pos.get(sId)!;
            const moveDx = newP.x - oldX;
            const moveDy = newP.y - oldY;
            if (Math.abs(moveDx) < 0.01 && Math.abs(moveDy) < 0.01) continue;

            updates.push({ id: sId, style: { x: newP.x, y: newP.y } });
            for (const descId of getAllDescendants(sId)) {
              const descNd = graph.getNodeData(descId);
              updates.push({
                id: descId,
                style: {
                  x: ((descNd?.style as any)?.x || 0) + moveDx,
                  y: ((descNd?.style as any)?.y || 0) + moveDy,
                },
              });
            }
          }

          if (updates.length > 0) graph.updateNodeData(updates);
        }
      }

      graph.draw();
    });

    // 拖拽保存位置
    graph.on('node:dragend', (evt: any) => {
      const id = evt.target?.id;
      if (!id) return;
      const nd = graph.getNodeData(id);
      if (nd?.style) savePosition(id, (nd.style as any).x || 0, (nd.style as any).y || 0);
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
