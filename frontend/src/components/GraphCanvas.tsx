/**
 * 图谱画布组件 - AntV G6 力导向图
 */
import { useEffect, useRef, useCallback } from 'react';
import { Graph } from '@antv/g6';
import { useGraphStore } from '../stores/graphStore';
import { getAssigneeColor } from '../utils/colors';
import type { GraphNode, GraphMilestone } from '../services/api';

/** 根据工时计算节点半径 */
function getNodeSize(hours: number): number {
  const minSize = 30;
  const maxSize = 120;
  if (!hours || hours <= 0) return minSize;
  return Math.min(maxSize, minSize + Math.sqrt(hours) * 8);
}

/** 构建 G6 数据 */
function buildG6Data(
  graphData: ReturnType<typeof useGraphStore.getState>['graphData'],
) {
  if (!graphData) return { nodes: [], edges: [] };

  const assignees = graphData.assignees;

  // 任务节点
  const taskNodes = graphData.nodes
    .filter(n => !n.parent_id) // MVP 只显示顶层节点
    .map((node: GraphNode) => {
      const size = getNodeSize(node.computed_hours);
      const color = node.assignee
        ? getAssigneeColor(node.assignee, assignees)
        : '#7F8C8D';
      const progress = node.computed_progress / 100;

      return {
        id: node.id,
        data: {
          ...node,
          size,
          color,
          progress,
          label: node.title,
          type: 'task' as const,
        },
      };
    });

  // 里程碑节点
  const milestoneNodes = graphData.milestones.map((ms: GraphMilestone) => ({
    id: ms.id,
    data: {
      ...ms,
      size: 50,
      color: '#2C3E50',
      progress: ms.computed_progress / 100,
      label: ms.title,
      type: 'milestone' as const,
    },
  }));

  // 归属关系边（任务 → 里程碑，虚线）
  const belongEdges = graphData.nodes
    .filter(n => n.milestone_id && !n.parent_id)
    .map(n => ({
      id: `belong-${n.id}`,
      source: n.id,
      target: n.milestone_id!,
      data: { edgeType: 'belong' },
    }));

  // 依赖关系边
  const depEdges = graphData.edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    data: {
      edgeType: e.is_iterative ? 'iterative' : 'dependency',
      iterationCount: e.iteration_count,
      isCycleEnded: e.is_cycle_ended,
    },
  }));

  return {
    nodes: [...taskNodes, ...milestoneNodes],
    edges: [...depEdges, ...belongEdges],
  };
}

export default function GraphCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);
  const { graphData, loadGraphData, selectNode, showContextMenu, hideContextMenu, savePosition } =
    useGraphStore();

  // 初始化加载
  useEffect(() => {
    loadGraphData();
  }, [loadGraphData]);

  // 初始化 G6 图
  useEffect(() => {
    if (!containerRef.current || graphRef.current) return;

    const graph = new Graph({
      container: containerRef.current,
      autoFit: 'view',
      animation: true,
      layout: {
        type: 'd3-force',
        preventOverlap: true,
        nodeStrength: -800,
        edgeStrength: 0.3,
        collide: {
          strength: 0.8,
          radius: (d: any) => (d.data?.size || 30) / 2 + 10,
        },
      },
      behaviors: [
        'drag-canvas',
        'zoom-canvas',
        {
          type: 'drag-element',
          key: 'drag-node',
        },
      ],
      node: {
        style: {
          size: (d: any) => d.data?.size || 30,
          fill: (d: any) => {
            if (d.data?.type === 'milestone') return '#2C3E50';
            if (d.data?.status === '已取消') return '#BDC3C7';
            const progress = d.data?.progress || 0;
            const color = d.data?.color || '#7F8C8D';
            if (progress >= 1) return color;
            if (progress <= 0) return '#ECF0F1';
            return color; // G6 will handle via palette
          },
          stroke: (d: any) => {
            if (d.data?.type === 'milestone') return '#1A252F';
            // 逾期检测
            if (d.data?.due_date && d.data?.status === '未完成') {
              const now = new Date();
              const due = new Date(d.data.due_date);
              if (now > due) return '#E74C3C';
            }
            return d.data?.color || '#BDC3C7';
          },
          lineWidth: (d: any) => {
            if (d.data?.due_date && d.data?.status === '未完成') {
              const now = new Date();
              const due = new Date(d.data.due_date);
              if (now > due) return 3;
            }
            return 1.5;
          },
          lineDash: (d: any) => {
            if (d.data?.due_date && d.data?.status === '未完成') {
              const now = new Date();
              const due = new Date(d.data.due_date);
              if (now > due) return [5, 3];
            }
            return undefined;
          },
          opacity: (d: any) => (d.data?.status === '已取消' ? 0.4 : 1),
          labelText: (d: any) => {
            const label = d.data?.label || '';
            return label.length > 8 ? label.slice(0, 8) + '...' : label;
          },
          labelFill: '#333',
          labelFontSize: 12,
          labelPlacement: 'bottom',
          labelOffsetY: 8,
        },
      },
      edge: {
        style: {
          stroke: (d: any) => {
            if (d.data?.edgeType === 'iterative') return '#F39C12';
            if (d.data?.edgeType === 'belong') return '#BDC3C7';
            return '#95A5A6';
          },
          lineWidth: (d: any) => (d.data?.edgeType === 'iterative' ? 2 : 1),
          lineDash: (d: any) => {
            if (d.data?.edgeType === 'iterative') return [6, 4];
            if (d.data?.edgeType === 'belong') return [3, 3];
            return undefined;
          },
          opacity: 0.4,
          endArrow: (d: any) => d.data?.edgeType !== 'belong',
          labelText: (d: any) => {
            if (d.data?.edgeType === 'iterative' && d.data?.iterationCount > 0) {
              return `×${d.data.iterationCount}`;
            }
            return '';
          },
          labelFill: '#F39C12',
          labelFontSize: 10,
          labelBackground: true,
          labelBackgroundFill: '#fff',
          labelBackgroundOpacity: 0.8,
          labelBackgroundRadius: 4,
        },
      },
    });

    graphRef.current = graph;

    // 事件监听
    graph.on('node:click', (evt: any) => {
      const nodeId = evt.target?.id;
      if (!nodeId) return;
      const nodeData = graph.getNodeData(nodeId);
      const nodeType = nodeData?.data?.type === 'milestone' ? 'milestone' : 'task';
      selectNode(nodeId, nodeType);
    });

    graph.on('node:contextmenu', (evt: any) => {
      evt.preventDefault?.();
      const nodeId = evt.target?.id;
      if (!nodeId) return;
      const nodeData = graph.getNodeData(nodeId);
      const nodeType = nodeData?.data?.type === 'milestone' ? 'milestone' : 'task';
      showContextMenu(
        evt.client?.x || evt.clientX || 0,
        evt.client?.y || evt.clientY || 0,
        evt.canvas?.x || 0,
        evt.canvas?.y || 0,
        nodeId,
        nodeType,
      );
    });

    graph.on('canvas:click', () => {
      hideContextMenu();
    });

    graph.on('canvas:contextmenu', (evt: any) => {
      evt.preventDefault?.();
      showContextMenu(
        evt.client?.x || evt.clientX || 0,
        evt.client?.y || evt.clientY || 0,
        evt.canvas?.x || 0,
        evt.canvas?.y || 0,
      );
    });

    // 节点拖拽结束后保存位置
    graph.on('node:dragend', (evt: any) => {
      const nodeId = evt.target?.id;
      if (!nodeId) return;
      const nodeData = graph.getNodeData(nodeId);
      if (nodeData?.style) {
        const x = (nodeData.style as any).x || 0;
        const y = (nodeData.style as any).y || 0;
        savePosition(nodeId, x, y);
      }
    });

    return () => {
      graph.destroy();
      graphRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 数据变化时更新图
  useEffect(() => {
    if (!graphRef.current || !graphData) return;

    const g6Data = buildG6Data(graphData);
    const graph = graphRef.current;

    graph.setData(g6Data);
    graph.render();
  }, [graphData]);

  return (
    <div
      ref={containerRef}
      id="graph-canvas"
      style={{
        width: '100%',
        height: '100%',
        background: '#FAFBFC',
      }}
    />
  );
}
