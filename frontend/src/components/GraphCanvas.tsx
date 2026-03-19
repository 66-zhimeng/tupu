/**
 * 图谱画布组件 — 层级导航 + 扇形进度可视化
 *
 * 功能：
 * - 按层级过滤节点（只显示 currentParentId 的直接子节点）
 * - 有子任务的节点用 CSS conic-gradient 渲染扇形饼图
 * - 双击钻入子层级
 * - 位置缓存：跨层级保留节点位置
 */
import { useEffect, useRef } from 'react';
import { Graph } from '@antv/g6';
import { message } from 'antd';
import { useGraphStore } from '../stores/graphStore';
import type { GraphNode, GraphMilestone } from '../services/api';
import { getLayoutConfig, importLayout, exportLayout, type LayoutName, type PositionMap } from '../utils/layoutEngine';
import './GraphCanvas.css';

/* ===== 辅助函数 ===== */

/** 完成度 → 颜色 */
function progressColor(pct: number, status: string): string {
  if (status === '已取消') return '#CCCCCC';
  if (status === '已完成' || pct >= 100) return '#10B981';
  if (pct <= 0) return '#94A3B8';
  if (pct < 50) {
    const t = pct / 50;
    return `rgb(${Math.round(148 - t * 89)},${Math.round(163 - t * 33)},${Math.round(184 + t * 62)})`;
  }
  const t = (pct - 50) / 50;
  return `rgb(${Math.round(59 - t * 43)},${Math.round(130 + t * 55)},${Math.round(246 - t * 115)})`;
}

/** 节点圆圈半径 */
function nodeRadius(hours: number): number {
  const min = 55, max = 100;
  if (!hours || hours <= 0) return min;
  return Math.min(max, min + Math.log2(hours + 1) * 8);
}

/** 生成环形饼图 SVG data URL（中间留空显示标签文字） */
function buildPieSvgUrl(slices: { completed: boolean; status: string }[], radius: number): string {
  if (slices.length === 0) return '';
  const size = radius * 2;
  const cx = radius, cy = radius;
  const rOuter = radius - 2;          // 外半径
  const rInner = radius * 0.45;       // 内半径 — 留出中心给文字
  const n = slices.length;

  // 颜色方案 — 高对比度
  const COLOR_DONE = '#10B981'; // 鲜绿
  const COLOR_TODO = '#CBD5E1'; // 蓝灰
  const COLOR_CANCEL = '#E2E8F0'; // 浅灰

  let paths = '';
  if (n === 1) {
    const s = slices[0];
    const fill = (s.completed || s.status === '已完成') ? COLOR_DONE
      : s.status === '已取消' ? COLOR_CANCEL : COLOR_TODO;
    // 外环 + 白色内圆
    paths = `<circle cx="${cx}" cy="${cy}" r="${rOuter}" fill="${fill}" />`;
    paths += `<circle cx="${cx}" cy="${cy}" r="${rInner}" fill="white" />`;
  } else {
    const gapDeg = 2;
    const sliceDeg = 360 / n;
    for (let i = 0; i < n; i++) {
      const s = slices[i];
      const fill = (s.completed || s.status === '已完成') ? COLOR_DONE
        : s.status === '已取消' ? COLOR_CANCEL : COLOR_TODO;

      const startDeg = -90 + i * sliceDeg + gapDeg / 2;
      const endDeg = -90 + (i + 1) * sliceDeg - gapDeg / 2;
      const startRad = (startDeg * Math.PI) / 180;
      const endRad = (endDeg * Math.PI) / 180;

      // 外弧端点
      const ox1 = cx + rOuter * Math.cos(startRad);
      const oy1 = cy + rOuter * Math.sin(startRad);
      const ox2 = cx + rOuter * Math.cos(endRad);
      const oy2 = cy + rOuter * Math.sin(endRad);
      // 内弧端点（反向）
      const ix1 = cx + rInner * Math.cos(endRad);
      const iy1 = cy + rInner * Math.sin(endRad);
      const ix2 = cx + rInner * Math.cos(startRad);
      const iy2 = cy + rInner * Math.sin(startRad);

      const largeArc = (endDeg - startDeg) > 180 ? 1 : 0;

      // 环形扇区：外弧 → 直线到内弧 → 内弧（反方向） → 闭合
      paths += `<path d="M ${ox1} ${oy1} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${ox2} ${oy2} L ${ix1} ${iy1} A ${rInner} ${rInner} 0 ${largeArc} 0 ${ix2} ${iy2} Z" fill="${fill}" stroke="white" stroke-width="1.5" />`;
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${paths}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/* ===== 构建 G6 数据（按层级过滤） ===== */
function buildG6Data(
  graphData: ReturnType<typeof useGraphStore.getState>['graphData'],
  currentParentId: string | null,
  positionCache: Map<string, { x: number; y: number }>,
  existingGraph?: any,
) {
  if (!graphData) return { nodes: [], edges: [], combos: [] };

  // 收集已有节点位置
  // 优先级: graph 实例 > DB 存储 > 自动布局
  const existingPositions = new Map<string, { x: number; y: number }>();
  // 1. 先从内存缓存加载
  positionCache.forEach((pos, id) => existingPositions.set(id, pos));
  // 2. 再从当前图实例加载（覆盖缓存）
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

  // ===== 只取当前层级的直接子节点 =====
  const levelNodes = graphData.nodes.filter(n => {
    if (currentParentId === null) return !n.parent_id;
    return n.parent_id === currentParentId;
  });

  // 3. 从 DB 存储的 position_x/y 加载（覆盖缓存，但低于图实例）
  // 放在 levelNodes 之后，仅对当前层级节点有效
  levelNodes.forEach(n => {
    if (n.position_x != null && n.position_y != null && !existingPositions.has(n.id)) {
      existingPositions.set(n.id, { x: n.position_x, y: n.position_y });
    }
  });

  // 为每个节点确定子任务信息
  const nodeChildrenMap = new Map<string, GraphNode[]>();
  levelNodes.forEach(n => {
    const children = graphData.nodes.filter(c => c.parent_id === n.id);
    if (children.length > 0) nodeChildrenMap.set(n.id, children);
  });

  // ===== 计算半径 =====
  const radiusMap = new Map<string, number>();
  levelNodes.forEach(n => {
    const hours = n.computed_hours || n.estimated_hours || 0;
    const children = nodeChildrenMap.get(n.id);
    if (children && children.length > 0) {
      const r = Math.max(65, Math.min(120, 50 + children.length * 8 + Math.log2(hours + 1) * 6));
      radiusMap.set(n.id, r);
    } else {
      radiusMap.set(n.id, nodeRadius(hours));
    }
  });

  // ===== 拓扑排序自动布局（仅对没有保存位置的节点生效） =====
  // 筛选出需要自动布局的节点
  const needsLayout = levelNodes.filter(n => !existingPositions.has(n.id));

  const layoutPosMap = new Map<string, { x: number; y: number }>();
  if (needsLayout.length > 0) {
    // 构建当前层级的依赖图
    const levelIds = new Set(levelNodes.map(n => n.id));
    const levelEdges = graphData.edges.filter(
      e => levelIds.has(e.source) && levelIds.has(e.target)
    );

    // Kahn 拓扑排序 → 计算每个节点的层级
    const inDeg = new Map<string, number>();
    const adj = new Map<string, string[]>();
    levelNodes.forEach(n => { inDeg.set(n.id, 0); adj.set(n.id, []); });
    levelEdges.forEach(e => {
      adj.get(e.source)?.push(e.target);
      inDeg.set(e.target, (inDeg.get(e.target) || 0) + 1);
    });

    const layerMap = new Map<string, number>(); // nodeId -> layer index
    const queue: string[] = [];
    levelNodes.forEach(n => { if ((inDeg.get(n.id) || 0) === 0) queue.push(n.id); });
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const curLayer = layerMap.get(cur) || 0;
      for (const next of (adj.get(cur) || [])) {
        const newLayer = curLayer + 1;
        if (newLayer > (layerMap.get(next) || 0)) layerMap.set(next, newLayer);
        inDeg.set(next, (inDeg.get(next) || 0) - 1);
        if (inDeg.get(next) === 0) queue.push(next);
      }
    }

    // 按 layer 分组
    const layers = new Map<number, typeof levelNodes>();
    levelNodes.forEach(n => {
      const layer = layerMap.get(n.id) || 0;
      if (!layers.has(layer)) layers.set(layer, []);
      layers.get(layer)!.push(n);
    });

    // 布局参数
    const colGap = 250;   // 列间距
    const rowGap = 50;    // 行间距
    const sortedLayers = [...layers.keys()].sort((a, b) => a - b);

    let colX = 0;
    for (const layerIdx of sortedLayers) {
      const nodesInLayer = layers.get(layerIdx)!;
      // 按半径从大到小排列
      nodesInLayer.sort((a, b) => (radiusMap.get(b.id) || 30) - (radiusMap.get(a.id) || 30));
      const maxR = Math.max(...nodesInLayer.map(n => radiusMap.get(n.id) || 55));
      let rowY = 0;
      for (const n of nodesInLayer) {
        const r = radiusMap.get(n.id) || 55;
        if (!existingPositions.has(n.id)) {
          layoutPosMap.set(n.id, { x: colX + maxR, y: rowY + r });
        }
        rowY += r * 2 + rowGap;
      }
      colX += maxR * 2 + colGap;
    }
  }

  // ===== 构建 G6 节点数据 =====
  const nodes = levelNodes.map((node: GraphNode) => {
    const color = progressColor(node.computed_progress, node.status);
    const r = radiusMap.get(node.id) || 55;
    const children = nodeChildrenMap.get(node.id) || [];
    const hasChildren = children.length > 0;
    const maxChars = 20;
    const title = node.title.length > maxChars ? node.title.slice(0, maxChars) + '…' : node.title;

    // 优先使用缓存位置，fallback 到布局位置
    const pos = existingPositions.get(node.id) || layoutPosMap.get(node.id) || { x: 0, y: 0 };

    const pieSlices = children.map(c => ({
      id: c.id,
      title: c.title,
      completed: c.status === '已完成',
      progress: c.computed_progress || 0,
      status: c.status,
    }));

    // 生成 SVG 饼图 data URL
    const pieSvg = hasChildren ? buildPieSvgUrl(pieSlices, r) : '';

    return {
      id: node.id,
      style: { x: pos.x, y: pos.y },
      data: {
        ...node,
        nodeRadius: r,
        progressColor: color,
        label: title,
        hasChildren,
        childCount: children.length,
        pieSlices,
        pieSvg,
      },
    };
  });

  // ===== 边：只保留当前层级节点之间的 =====
  const levelNodeIds = new Set(levelNodes.map(n => n.id));
  const edges = graphData.edges
    .filter(e => levelNodeIds.has(e.source) && levelNodeIds.has(e.target))
    .map(e => ({
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
    currentParentId,
    drillDown,
    positionCache,
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

      behaviors: [
        { type: 'drag-canvas', key: 'drag-canvas' },
        'zoom-canvas',
        {
          type: 'hover-activate',
          key: 'hover-highlight',
          degree: 1,
          state: 'highlight',
        },
      ],

      plugins: [
        {
          type: 'grid-line',
          key: 'grid',
          size: 30,
          stroke: '#E8E8E8',
          lineWidth: 0.4,
        },
        {
          type: 'minimap',
          key: 'minimap',
          size: [160, 100],
          position: 'right-bottom',
        },
        {
          type: 'tooltip',
          key: 'pie-tooltip',
          getContent: (_evt: any, items: any[]) => {
            if (!items || items.length === 0) return '';
            const item = items[0];
            const data = item?.data;
            if (!data) return '';
            const slices = data.pieSlices as any[] | undefined;
            if (slices && slices.length > 0) {
              const done = slices.filter((s: any) => s.completed || s.status === '已完成').length;
              let html = `<div style="font-family:'Space Grotesk',sans-serif;font-size:13px;min-width:160px">`;
              html += `<div style="font-weight:700;margin-bottom:6px;font-size:14px">${data.title || data.label}</div>`;
              html += `<div style="color:#666;margin-bottom:8px;font-family:'JetBrains Mono',monospace;font-size:12px">${done}/${slices.length} 完成</div>`;
              for (const s of slices) {
                const color = (s.completed || s.status === '已完成') ? '#10B981' : s.status === '已取消' ? '#CCC' : '#94A3B8';
                html += `<div style="display:flex;align-items:center;gap:6px;padding:2px 0">`;
                html += `<span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></span>`;
                html += `<span>${s.title}</span>`;
                html += `</div>`;
              }
              html += `</div>`;
              return html;
            }
            return `<div style="font-family:'Space Grotesk',sans-serif;font-size:13px">
              <div style="font-weight:700">${data.title || data.label}</div>
              <div style="color:#666;font-size:12px">${data.status} · ${(data.computed_progress || 0).toFixed(0)}%</div>
            </div>`;
          },
        },
      ],

      // 节点样式
      node: {
        type: 'circle',
        style: {
          size: (d: any) => (d.data?.nodeRadius || 55) * 2,
          fill: (d: any) => d.data?.progressColor || '#94A3B8',
          fillOpacity: (d: any) => d.data?.hasChildren ? 0.05 : 0.15,
          stroke: (d: any) => {
            if (d.data?.due_date && d.data?.status === '未完成') {
              if (new Date() > new Date(d.data.due_date)) return '#EF4444';
            }
            return d.data?.progressColor || '#E8E8E8';
          },
          lineWidth: 2,
          opacity: (d: any) => (d.data?.status === '已取消' ? 0.35 : 1),
          pointerEvents: 'auto',
          shadowColor: (d: any) => (d.data?.progressColor || '#94A3B8') + '18',
          shadowBlur: 8,
          shadowOffsetY: 2,

          // ★ SVG 扇形饼图嵌入节点（零残影）
          iconSrc: (d: any) => d.data?.pieSvg || undefined,
          iconWidth: (d: any) => d.data?.pieSvg ? (d.data?.nodeRadius || 55) * 2 - 4 : 0,
          iconHeight: (d: any) => d.data?.pieSvg ? (d.data?.nodeRadius || 55) * 2 - 4 : 0,

          labelText: (d: any) => {
            const label = d.data?.label || '';
            if (d.data?.hasChildren) return `${label}\n${d.data.childCount} 子任务`;
            return label;
          },
          labelFill: (d: any) => d.data?.hasChildren ? '#111' : '#333',
          labelFontSize: (d: any) => Math.max(11, Math.min(16, Math.round((d.data?.nodeRadius || 55) * 0.22))),
          labelFontWeight: (d: any) => d.data?.hasChildren ? 700 : 600,
          labelPlacement: 'center',
          labelWordWrap: true,
          labelMaxWidth: (d: any) => (d.data?.nodeRadius || 55) * 1.5,
          labelMaxLines: 3,
          labelFontFamily: "'Space Grotesk', 'Inter', sans-serif",

          port: true,
          ports: Array.from({ length: 12 }, (_, i) => {
            const angle = (i / 12) * Math.PI * 2;
            return {
              key: `p${i}`,
              placement: [0.5 + 0.5 * Math.cos(angle), 0.5 + 0.5 * Math.sin(angle)] as [number, number],
              r: 0,
            };
          }),
        },
        state: {
          highlight: { stroke: '#3B82F6', lineWidth: 3, shadowColor: 'rgba(59,130,246,0.25)', shadowBlur: 16 },
          dim: { opacity: 0.15 },
        },
      },

      // 边样式
      edge: {
        type: 'cubic',
        style: {
          stroke: (d: any) => d.data?.edgeType === 'iterative' ? '#F59E0B' : '#AAAAAA',
          lineWidth: (d: any) => d.data?.edgeType === 'iterative' ? 2.5 : 1.5,
          lineDash: (d: any) => d.data?.edgeType === 'iterative' ? [6, 4] : undefined,
          opacity: 0.7,
          endArrow: true,
          endArrowSize: 8,
          endArrowFill: (d: any) => d.data?.edgeType === 'iterative' ? '#F59E0B' : '#AAAAAA',
          labelText: (d: any) => {
            if (d.data?.edgeType === 'iterative' && d.data?.iterationCount > 0) return `×${d.data.iterationCount}`;
            return '';
          },
          labelFill: '#F59E0B',
          labelFontSize: 10,
          labelFontWeight: 600,
          labelFontFamily: "'JetBrains Mono', monospace",
          labelBackground: true,
          labelBackgroundFill: '#FFFBEB',
          labelBackgroundRadius: 4,
          labelBackgroundPadding: [2, 6],
        },
        state: {
          highlight: { stroke: '#3B82F6', lineWidth: 2, opacity: 1 },
          dim: { opacity: 0.1 },
        },
      },
    });

    graphRef.current = graph;
    setGraphInstance(graph);

    // ★ 辅助：查找节点
    function findNodeAt(gx: number, gy: number): string | null {
      const allNodes = graph.getNodeData();
      if (!Array.isArray(allNodes)) return null;
      let bestId: string | null = null;
      let bestRadius = Infinity;
      for (const n of allNodes) {
        let nx = 0, ny = 0;
        try { const pos = graph.getElementPosition(n.id as string); nx = pos[0]; ny = pos[1]; }
        catch { nx = (n.style as any)?.x || 0; ny = (n.style as any)?.y || 0; }
        const nr = Number(n.data?.nodeRadius) || 55;
        const dist = Math.sqrt((gx - nx) ** 2 + (gy - ny) ** 2);
        if (dist <= nr && nr < bestRadius) { bestRadius = nr; bestId = n.id as string; }
      }
      return bestId;
    }

    let _connectSource: string | null = null;

    // 单击 → 编辑面板（延迟区分双击）
    graph.on('node:click', (evt: any) => {
      const store = useGraphStore.getState();
      if (store.enableConnect) {
        const gx = evt.canvas?.x ?? 0, gy = evt.canvas?.y ?? 0;
        const clicked = findNodeAt(gx, gy) || (evt.target?.id as string);
        if (!clicked) return;
        if (!_connectSource) { _connectSource = clicked; message.info('请点击目标节点完成连线'); }
        else { if (clicked !== _connectSource) { addDependency({ source_task_id: _connectSource, target_task_id: clicked }); message.success('连线已创建'); } _connectSource = null; }
        return;
      }
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      clickTimerRef.current = setTimeout(() => {
        const gx = evt.canvas?.x ?? 0, gy = evt.canvas?.y ?? 0;
        const target = findNodeAt(gx, gy);
        if (target) selectNode(target, 'task');
        clickTimerRef.current = null;
      }, 280);
    });

    // 双击 → 钻入
    graph.on('node:dblclick', (evt: any) => {
      if (clickTimerRef.current) { clearTimeout(clickTimerRef.current); clickTimerRef.current = null; }
      const gx = evt.canvas?.x ?? 0, gy = evt.canvas?.y ?? 0;
      const target = findNodeAt(gx, gy);
      if (target) {
        const store = useGraphStore.getState();
        const children = store.graphData?.nodes.filter(n => n.parent_id === target) || [];
        if (children.length > 0) drillDown(target);
        else selectNode(target, 'task');
      }
    });

    graph.on('canvas:click', () => { hideContextMenu(); _connectSource = null; });
    graph.on('node:contextmenu', (evt: any) => {
      const e = evt.originalEvent || evt;
      e?.preventDefault?.(); e?.stopPropagation?.();
      const target = findNodeAt(evt.canvas?.x ?? 0, evt.canvas?.y ?? 0);
      if (target) showContextMenu(e?.clientX || 0, e?.clientY || 0, evt.canvas?.x ?? 0, evt.canvas?.y ?? 0, target, 'task');
    });
    graph.on('canvas:contextmenu', (evt: any) => {
      const e = evt.originalEvent || evt;
      e?.preventDefault?.(); e?.stopPropagation?.();
      showContextMenu(e?.clientX || 0, e?.clientY || 0, evt.canvas?.x || 0, evt.canvas?.y || 0);
    });

    // 拖拽
    let _dragTarget: string | null = null, _dragLastX = 0, _dragLastY = 0, _isDragging = false;
    function getNodePos(nodeId: string): [number, number] {
      try { const pos = graph.getElementPosition(nodeId); return [pos[0], pos[1]]; }
      catch { const nd = graph.getNodeData(nodeId); return [(nd?.style as any)?.x || 0, (nd?.style as any)?.y || 0]; }
    }
    graph.on('node:pointerdown', (evt: any) => {
      if ((evt.button ?? evt.originalEvent?.button ?? 0) !== 0) return;
      if (useGraphStore.getState().enableConnect) return;
      const target = findNodeAt(evt.canvas?.x ?? 0, evt.canvas?.y ?? 0);
      if (target) { _dragTarget = target; _dragLastX = evt.canvas?.x ?? 0; _dragLastY = evt.canvas?.y ?? 0; _isDragging = false; graph.updateBehavior({ key: 'drag-canvas', enable: false }); }
    });
    function handleDragMove(gx: number, gy: number) {
      if (!_dragTarget) return;
      _isDragging = true;
      const dx = gx - _dragLastX, dy = gy - _dragLastY;
      _dragLastX = gx; _dragLastY = gy;
      if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return;
      graph.translateElementBy(_dragTarget, [dx, dy], false);

      // ★ 碰撞检测：推开重叠节点
      const [myX, myY] = getNodePos(_dragTarget);
      const myR = Number(graph.getNodeData(_dragTarget)?.data?.nodeRadius) || 55;
      const allNodes = graph.getNodeData();
      if (Array.isArray(allNodes)) {
        for (const n of allNodes) {
          const nid = n.id as string;
          if (nid === _dragTarget) continue;
          const [nx, ny] = getNodePos(nid);
          const nR = Number(n.data?.nodeRadius) || 55;
          const minDist = myR + nR + 10; // 10px 间距
          const distX = nx - myX, distY = ny - myY;
          const dist = Math.sqrt(distX * distX + distY * distY);
          if (dist < minDist && dist > 0.1) {
            const overlap = minDist - dist;
            const pushX = (distX / dist) * overlap;
            const pushY = (distY / dist) * overlap;
            graph.translateElementBy(nid, [pushX, pushY], false);
          }
        }
      }
    }
    graph.on('node:pointermove', (evt: any) => handleDragMove(evt.canvas?.x ?? 0, evt.canvas?.y ?? 0));
    graph.on('canvas:pointermove', (evt: any) => handleDragMove(evt.canvas?.x ?? 0, evt.canvas?.y ?? 0));
    const endDrag = () => {
      if (_dragTarget && _isDragging) {
        const [fx, fy] = getNodePos(_dragTarget);
        console.log('[GraphCanvas] 保存位置:', _dragTarget, fx, fy);
        savePosition(_dragTarget, fx, fy);
        // 同时保存被碰撞推开的节点位置
        const allNodes = graph.getNodeData();
        if (Array.isArray(allNodes)) {
          for (const n of allNodes) {
            const nid = n.id as string;
            if (nid === _dragTarget) continue;
            const [nx, ny] = getNodePos(nid);
            const ox = Number(n.data?.position_x);
            const oy = Number(n.data?.position_y);
            if (isNaN(ox) || isNaN(oy) || Math.abs(nx - ox) > 1 || Math.abs(ny - oy) > 1) {
              savePosition(nid, nx, ny);
            }
          }
        }
      }
      if (_dragTarget) graph.updateBehavior({ key: 'drag-canvas', enable: true });
      _dragTarget = null; _isDragging = false;
    };
    graph.on('node:pointerup', endDrag);
    graph.on('canvas:pointerup', endDrag);

    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      setGraphInstance(null);
      graph.destroy();
      graphRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ★ 浏览器窗口/容器大小变化 → 自动调整画布
  useEffect(() => {
    if (!containerRef.current || !graphRef.current) return;
    const ro = new ResizeObserver(() => {
      if (!graphRef.current || !containerRef.current) return;
      const { width, height } = containerRef.current.getBoundingClientRect();
      if (width > 0 && height > 0) {
        graphRef.current.resize(width, height);
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [graphRef.current]); // re-attach if graph re-creates

  // ★ 布局模板事件监听
  useEffect(() => {
    const handleApplyLayout = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const layoutName: LayoutName = detail?.layout;
      if (!graphRef.current || !graphData) return;

      const graph = graphRef.current;
      const config = getLayoutConfig(layoutName);
      if (!config) return;

      try {
        // 使用 G6 内置布局算法
        graph.setLayout(config);
        await graph.layout();

        // 布局完成后保存所有节点位置到数据库
        const { savePosition } = useGraphStore.getState();
        const allNodes = graph.getNodeData();
        if (Array.isArray(allNodes)) {
          for (const n of allNodes) {
            try {
              const pos = graph.getElementPosition(n.id as string);
              savePosition(n.id as string, pos[0], pos[1]);
            } catch { /* skip */ }
          }
        }
        message.success(`已应用「${detail?.label || layoutName}」布局`);
      } catch (err) {
        console.error('[Layout]', err);
        message.error('布局失败，请重试');
      }
    };

    const handleImportLayout = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.json || !graphRef.current) return;
      try {
        const positions = importLayout(detail.json);
        applyPositionsToGraph(positions);
        message.success('已导入自定义布局');
      } catch {
        message.error('导入失败：JSON 格式错误');
      }
    };

    const handleExportLayout = () => {
      if (!graphRef.current) return;
      const allNodes = graphRef.current.getNodeData();
      if (!Array.isArray(allNodes)) return;
      const positions: PositionMap = new Map();
      allNodes.forEach((n: any) => {
        try {
          const pos = graphRef.current!.getElementPosition(n.id);
          positions.set(n.id, { x: pos[0], y: pos[1] });
        } catch { /* skip */ }
      });
      const json = exportLayout(positions, 'custom');
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'layout.json'; a.click();
      URL.revokeObjectURL(url);
      message.success('布局已导出');
    };

    function applyPositionsToGraph(positions: PositionMap) {
      if (!graphRef.current) return;
      const graph = graphRef.current;
      positions.forEach((pos, id) => {
        try {
          const curPos = graph.getElementPosition(id);
          const dx = pos.x - curPos[0], dy = pos.y - curPos[1];
          graph.translateElementBy(id, [dx, dy], false);
        } catch { /* node not in current view */ }
      });
      // 批量保存
      const { savePosition } = useGraphStore.getState();
      positions.forEach((pos, id) => savePosition(id, pos.x, pos.y));
      // fitView
      setTimeout(() => graph.fitView(), 100);
    }

    window.addEventListener('apply-layout', handleApplyLayout);
    window.addEventListener('import-layout', handleImportLayout);
    window.addEventListener('export-layout', handleExportLayout);
    return () => {
      window.removeEventListener('apply-layout', handleApplyLayout);
      window.removeEventListener('import-layout', handleImportLayout);
      window.removeEventListener('export-layout', handleExportLayout);
    };
  }, [graphData]);

  // 数据变化 / 层级变化 → 更新画布
  useEffect(() => {
    if (!graphRef.current || !graphData) return;
    const data = buildG6Data(graphData, currentParentId, positionCache, graphRef.current);
    graphRef.current.setData(data);
    graphRef.current.draw().then(() => {
      graphRef.current?.fitView();
    });
  }, [graphData, currentParentId, positionCache]);

  const milestones = graphData?.milestones || [];

  return (
    <div className={`canvas-wrapper ${enableConnect ? 'connect-mode' : ''}`}>
      {/* 里程碑标签栏（仅顶层显示） */}
      {currentParentId === null && milestones.length > 0 && (
        <div className="canvas-top-bar">
          <div className="milestone-tags">
            {milestones.map((ms: GraphMilestone) => (
              <button key={ms.id} className="milestone-tag" onClick={() => selectNode(ms.id, 'milestone')}>
                <span className="milestone-icon">◆</span>
                {ms.title}
                {ms.computed_progress > 0 && <span className="milestone-pct">{Math.round(ms.computed_progress)}%</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 操作提示 */}
      <div className="canvas-hint">
        {enableConnect
          ? '🔗 连线模式 — 点击源节点再点击目标节点创建依赖'
          : '双击展开子任务 · 单击编辑 · 滚轮缩放 · 右键菜单'}
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
