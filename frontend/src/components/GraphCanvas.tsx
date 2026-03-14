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

/** 节点尺寸（宽度） */
function nodeWidth(hours: number): number {
  const min = 140, max = 220;
  if (!hours || hours <= 0) return min;
  return Math.min(max, min + Math.sqrt(hours) * 10);
}

/** 节点高度 */
function nodeHeight(_hours: number): number {
  return 52;
}

/* ===== 构建 G6 数据 ===== */
function buildG6Data(
  graphData: ReturnType<typeof useGraphStore.getState>['graphData'],
) {
  if (!graphData) return { nodes: [], edges: [], combos: [] };

  const parentIds = new Set<string>();
  graphData.nodes.forEach(n => { if (n.parent_id) parentIds.add(n.parent_id); });

  // 找出只有叶子节点子代的父任务（才创建 Combo）
  // 如果一个父任务的子节点中有任何一个也是父任务（拥有自己的子节点），则不创建 Combo
  // 这样保证只有最底层的分组成为 Combo，避免大圆套小圆
  const deepestParents = new Set<string>();
  parentIds.forEach(pid => {
    const children = graphData.nodes.filter(n => n.parent_id === pid);
    const hasComboChild = children.some(c => parentIds.has(c.id));
    if (!hasComboChild && children.length > 0) {
      deepestParents.add(pid);
    }
  });

  // Combos = 只有最底层父任务
  const combos = graphData.nodes
    .filter(n => deepestParents.has(n.id))
    .map((node: GraphNode) => {
      const color = progressColor(node.computed_progress, node.status);
      const childCount = graphData.nodes.filter(c => c.parent_id === node.id).length;
      const title = node.title.length > 12 ? node.title.slice(0, 12) + '…' : node.title;

      const parts: string[] = [title];
      if (node.assignee) parts.push(`${node.assignee}`);
      if (node.computed_hours > 0) parts.push(`${node.computed_hours.toFixed(0)}h`);
      if (node.computed_progress > 0) parts.push(`${node.computed_progress.toFixed(0)}%`);
      parts.push(`${childCount}子任务`);

      return {
        id: node.id,
        data: {
          ...node,
          progressColor: color,
          label: parts.join(' · '),
          childCount,
        },
      };
    });

  const comboIds = new Set(combos.map(c => c.id));

  // Nodes = 非 combo 的任务节点
  const nodes = graphData.nodes
    .filter(n => !comboIds.has(n.id))
    .map((node: GraphNode) => {
      const color = progressColor(node.computed_progress, node.status);
      const title = node.title.length > 10 ? node.title.slice(0, 10) + '…' : node.title;

      const parts: string[] = [title];
      if (node.assignee) parts.push(node.assignee);
      if (node.computed_hours > 0) parts.push(`${node.computed_hours.toFixed(0)}h`);

      const comboId = node.parent_id && comboIds.has(node.parent_id)
        ? node.parent_id
        : undefined;

      const w = nodeWidth(node.computed_hours || node.estimated_hours);
      const h = nodeHeight(node.computed_hours || node.estimated_hours);

      return {
        id: node.id,
        combo: comboId,
        data: {
          ...node,
          nodeWidth: w,
          nodeHeight: h,
          progressColor: color,
          label: parts.join('\n'),
        },
      };
    });

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

  return { nodes, edges, combos };
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

      // 布局 — combo-combined: 默认内部 Concentric + 外部 gForce（含 Combo 碰撞）
      layout: {
        type: 'combo-combined',
        comboPadding: 30,
        spacing: 100,
        nodeSize: 160,
      },

      // 交互
      behaviors: [
        'drag-canvas',
        'zoom-canvas',
        {
          type: 'collapse-expand',
          key: 'combo-collapse',
          trigger: 'dblclick',
        },
        { type: 'drag-element', key: 'drag-node' },
        {
          type: 'hover-activate',
          key: 'hover-highlight',
          degree: 1,
          state: 'highlight',
          inactiveState: 'dim',
        },
        // ★ 拖拽创建边
        {
          type: 'create-edge',
          key: 'create-edge',
          trigger: 'drag',
          enable: false, // 默认关闭，通过 toggleConnect() 开启
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

      // 节点样式 — 矩形卡片
      node: {
        type: 'rect',
        style: {
          size: (d: any) => [d.data?.nodeWidth || 140, d.data?.nodeHeight || 52],
          fill: '#FFFFFF',
          stroke: (d: any) => {
            // 逾期红色边框
            if (d.data?.due_date && d.data?.status === '未完成') {
              if (new Date() > new Date(d.data.due_date)) return '#EF4444';
            }
            return d.data?.progressColor || '#E2E8F0';
          },
          lineWidth: 2,
          radius: 10,
          opacity: (d: any) => (d.data?.status === '已取消' ? 0.4 : 1),
          shadowColor: 'rgba(0, 0, 0, 0.06)',
          shadowBlur: 8,
          shadowOffsetY: 2,

          // 标签
          labelText: (d: any) => d.data?.label || '',
          labelFill: '#1E293B',
          labelFontSize: 12,
          labelFontWeight: 600,
          labelPlacement: 'center',
          labelLineHeight: 16,
          labelFontFamily: "'Inter', sans-serif",

          // 左侧进度色条
          badgeFill: (d: any) => d.data?.progressColor || '#94A3B8',

          // 连接端口
          port: true,
          ports: [
            { key: 'top', placement: [0.5, 0], r: 3, fill: '#3B82F6', stroke: '#fff', lineWidth: 1 },
            { key: 'right', placement: [1, 0.5], r: 3, fill: '#3B82F6', stroke: '#fff', lineWidth: 1 },
            { key: 'bottom', placement: [0.5, 1], r: 3, fill: '#3B82F6', stroke: '#fff', lineWidth: 1 },
            { key: 'left', placement: [0, 0.5], r: 3, fill: '#3B82F6', stroke: '#fff', lineWidth: 1 },
          ],
        },
        // 状态
        state: {
          highlight: {
            stroke: '#3B82F6',
            lineWidth: 2.5,
            shadowColor: 'rgba(59, 130, 246, 0.3)',
            shadowBlur: 12,
          },
          dim: {
            opacity: 0.3,
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

      // Combo 样式
      combo: {
        style: {
          fill: (d: any) => d.data?.progressColor || '#F1F5F9',
          fillOpacity: 0.08,
          stroke: (d: any) => d.data?.progressColor || '#CBD5E1',
          lineWidth: 1.5,
          lineDash: [6, 4],
          radius: 14,
          padding: 15,
          labelText: (d: any) => d.data?.label || '',
          labelFill: '#334155',
          labelFontSize: 13,
          labelFontWeight: 600,
          labelPlacement: 'top',
          collapsedMarker: true,
          collapsedMarkerFontSize: 12,
          collapsedMarkerFill: '#334155',
        },
      },
    });

    graphRef.current = graph;
    setGraphInstance(graph);

    // ★ 单击（延时 250ms 防双击冲突）
    graph.on('node:click', (evt: any) => {
      const id = evt.target?.id;
      if (!id) return;
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      clickTimerRef.current = setTimeout(() => {
        selectNode(id, 'task');
        clickTimerRef.current = null;
      }, 250);
    });

    graph.on('combo:dblclick', () => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
    });

    // 右键菜单
    graph.on('node:contextmenu', (evt: any) => {
      const e = evt.originalEvent || evt;
      if (e?.preventDefault) e.preventDefault();
      if (e?.stopPropagation) e.stopPropagation();
      const id = evt.target?.id;
      if (!id) return;
      showContextMenu(e?.clientX || 0, e?.clientY || 0, evt.canvas?.x || 0, evt.canvas?.y || 0, id, 'task');
    });

    graph.on('combo:contextmenu', (evt: any) => {
      const e = evt.originalEvent || evt;
      if (e?.preventDefault) e.preventDefault();
      if (e?.stopPropagation) e.stopPropagation();
      const id = evt.target?.id;
      if (!id) return;
      showContextMenu(e?.clientX || 0, e?.clientY || 0, evt.canvas?.x || 0, evt.canvas?.y || 0, id, 'task');
    });

    graph.on('canvas:contextmenu', (evt: any) => {
      const e = evt.originalEvent || evt;
      if (e?.preventDefault) e.preventDefault();
      if (e?.stopPropagation) e.stopPropagation();
      showContextMenu(e?.clientX || 0, e?.clientY || 0, evt.canvas?.x || 0, evt.canvas?.y || 0);
    });

    graph.on('canvas:click', () => hideContextMenu());

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
    graphRef.current.setData(buildG6Data(graphData));
    graphRef.current.render();
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
