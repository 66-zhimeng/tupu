/**
 * 图谱画布组件 - AntV G6 力导向图
 *
 * 使用 G6 Combo 实现层级可视化：
 * - 有子任务的父任务 → Combo（可折叠分组）
 * - 子任务 → Combo 内的子节点
 * - 双击 Combo → 展开/收起（内置动画）
 * - 无子任务的任务 → 普通节点
 * - 节点颜色 = 完成度进度渐变
 */
import { useEffect, useRef } from 'react';
import { Graph } from '@antv/g6';
import { useGraphStore } from '../stores/graphStore';
import type { GraphNode, GraphMilestone } from '../services/api';
import './GraphCanvas.css';

/** 完成度 → 颜色 */
function progressColor(pct: number, status: string): string {
  if (status === '已取消') return '#D5DBDB';
  if (status === '已完成' || pct >= 100) return '#27AE60';
  if (pct <= 0) return '#BDC3C7';
  if (pct < 50) {
    const t = pct / 50;
    return `rgb(${Math.round(189 - t * 137)},${Math.round(195 - t * 43)},${Math.round(199 + t * 20)})`;
  }
  const t = (pct - 50) / 50;
  return `rgb(${Math.round(52 - t * 13)},${Math.round(152 + t * 22)},${Math.round(219 - t * 123)})`;
}

/** 节点大小 */
function nodeSize(hours: number): number {
  const min = 36, max = 80;
  if (!hours || hours <= 0) return min;
  return Math.min(max, min + Math.sqrt(hours) * 5);
}

/**
 * 构建 G6 数据（含 Combo）
 * - 有子任务的父任务 → combo
 * - 子节点指定 combo 字段
 */
function buildG6Data(
  graphData: ReturnType<typeof useGraphStore.getState>['graphData'],
) {
  if (!graphData) return { nodes: [], edges: [], combos: [] };

  // 找出所有有子任务的父任务 ID
  const parentIds = new Set<string>();
  graphData.nodes.forEach(n => { if (n.parent_id) parentIds.add(n.parent_id); });

  // Combos = 有子任务的父任务
  const combos = graphData.nodes
    .filter(n => parentIds.has(n.id))
    .map((node: GraphNode) => {
      const color = progressColor(node.computed_progress, node.status);
      const childCount = graphData.nodes.filter(c => c.parent_id === node.id).length;
      const title = node.title.length > 10 ? node.title.slice(0, 10) + '…' : node.title;

      const parts: string[] = [title];
      if (node.assignee) parts.push(`👤${node.assignee}`);
      if (node.computed_hours > 0) parts.push(`${node.computed_hours.toFixed(0)}h`);
      if (node.computed_progress > 0) parts.push(`${node.computed_progress.toFixed(0)}%`);
      parts.push(`📂${childCount}子`);

      // Combo 也可以嵌套在另一个 combo 里（支持多级）
      const parentComboId = node.parent_id && parentIds.has(node.parent_id)
        ? node.parent_id
        : undefined;

      return {
        id: node.id,
        combo: parentComboId,
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
      const title = node.title.length > 8 ? node.title.slice(0, 8) + '…' : node.title;

      const parts: string[] = [title];
      if (node.assignee) parts.push(`👤${node.assignee}`);
      if (node.computed_hours > 0) parts.push(`${node.computed_hours.toFixed(0)}h`);

      // 如果父节点是 combo，则属于该 combo
      const comboId = node.parent_id && comboIds.has(node.parent_id)
        ? node.parent_id
        : undefined;

      return {
        id: node.id,
        combo: comboId,
        data: {
          ...node,
          size: nodeSize(node.computed_hours || node.estimated_hours),
          progressColor: color,
          label: parts.join('\n'),
        },
      };
    });

  // 依赖关系边
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
  } = useGraphStore();

  useEffect(() => { loadGraphData(); }, [loadGraphData]);

  // 初始化 G6
  useEffect(() => {
    if (!containerRef.current || graphRef.current) return;

    const graph = new Graph({
      container: containerRef.current,
      autoFit: 'view',
      padding: [40, 40, 40, 40],
      animation: true,
      layout: {
        type: 'd3-force',
        preventOverlap: true,
        nodeStrength: -300,
        edgeStrength: 0.3,
        collide: {
          strength: 0.8,
          radius: (d: any) => (d.data?.size || 36) / 2 + 10,
        },
      },
      behaviors: [
        'drag-canvas',
        'zoom-canvas',
        // ★ 内置展开/收起 Combo 行为（双击触发）
        {
          type: 'collapse-expand',
          key: 'combo-collapse',
          trigger: 'dblclick',
        },
        { type: 'drag-element', key: 'drag-node' },
      ],
      node: {
        style: {
          size: (d: any) => d.data?.size || 36,
          fill: (d: any) => d.data?.progressColor || '#BDC3C7',
          stroke: (d: any) => {
            if (d.data?.due_date && d.data?.status === '未完成') {
              if (new Date() > new Date(d.data.due_date)) return '#E74C3C';
            }
            return d.data?.progressColor || '#BDC3C7';
          },
          lineWidth: 1,
          opacity: (d: any) => (d.data?.status === '已取消' ? 0.35 : 1),
          labelText: (d: any) => d.data?.label || '',
          labelFill: '#333',
          labelFontSize: 11,
          labelPlacement: 'center',
          labelLineHeight: 14,
          labelFontWeight: 'bold' as const,
        },
      },
      edge: {
        style: {
          stroke: (d: any) => (d.data?.edgeType === 'iterative' ? '#F39C12' : '#7F8C8D'),
          lineWidth: (d: any) => (d.data?.edgeType === 'iterative' ? 2 : 1.5),
          lineDash: (d: any) => (d.data?.edgeType === 'iterative' ? [6, 4] : undefined),
          opacity: 0.5,
          endArrow: true,
          labelText: (d: any) => {
            if (d.data?.edgeType === 'iterative' && d.data?.iterationCount > 0) {
              return `×${d.data.iterationCount}`;
            }
            return '';
          },
          labelFill: '#F39C12',
          labelFontSize: 10,
        },
      },
      combo: {
        style: {
          // Combo 样式（父任务的分组框）
          fill: (d: any) => {
            const color = d.data?.progressColor || '#ECF0F1';
            return color;
          },
          fillOpacity: 0.15,
          stroke: (d: any) => d.data?.progressColor || '#BDC3C7',
          lineWidth: 2,
          lineDash: [4, 4],
          radius: 12,
          padding: 20,
          labelText: (d: any) => d.data?.label || '',
          labelFill: '#2C3E50',
          labelFontSize: 13,
          labelFontWeight: 'bold' as const,
          labelPlacement: 'top',
          collapsedMarker: true,
          collapsedMarkerFontSize: 12,
          collapsedMarkerFill: '#2C3E50',
        },
      },
    });

    graphRef.current = graph;

    // ★ 单击（延时 300ms 防冲突双击）
    graph.on('node:click', (evt: any) => {
      const id = evt.target?.id;
      if (!id) return;
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      clickTimerRef.current = setTimeout(() => {
        selectNode(id, 'task');
        clickTimerRef.current = null;
      }, 300);
    });

    // Combo 单击也可编辑
    graph.on('combo:click', (evt: any) => {
      const id = evt.target?.id;
      if (!id) return;
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      clickTimerRef.current = setTimeout(() => {
        selectNode(id, 'task');
        clickTimerRef.current = null;
      }, 300);
    });

    // 双击 combo → collapse-expand 自动处理
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

    // 拖拽保存
    graph.on('node:dragend', (evt: any) => {
      const id = evt.target?.id;
      if (!id) return;
      const nd = graph.getNodeData(id);
      if (nd?.style) savePosition(id, (nd.style as any).x || 0, (nd.style as any).y || 0);
    });

    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
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
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {milestones.length > 0 && (
        <div className="canvas-top-bar">
          <div className="milestone-tags">
            {milestones.map((ms: GraphMilestone) => (
              <span
                key={ms.id}
                className="milestone-tag"
                onClick={() => selectNode(ms.id, 'milestone')}
              >
                ◆ {ms.title}
                {ms.computed_progress > 0 && (
                  <span className="milestone-pct">{Math.round(ms.computed_progress)}%</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="zoom-hint">
        双击展开/收起子任务 · 滚轮缩放 · 拖拽移动 · 右键菜单 · 单击编辑
      </div>

      <div
        ref={containerRef}
        id="graph-canvas"
        onContextMenu={(e) => e.preventDefault()}
        style={{
          width: '100%',
          height: milestones.length > 0 ? 'calc(100% - 40px)' : '100%',
          background: '#FAFBFC',
        }}
      />
    </div>
  );
}
