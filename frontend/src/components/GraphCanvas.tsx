/**
 * 图谱画布组件 - AntV G6 力导向图
 *
 * 修复：
 * - 显示所有节点（包括子任务），用父子连线表达层级
 * - 里程碑不再是独立节点，改为 X 轴背景标签
 * - 缩放和拖拽正常工作
 */
import { useEffect, useRef } from 'react';
import { Graph } from '@antv/g6';
import { useGraphStore } from '../stores/graphStore';
import { getAssigneeColor } from '../utils/colors';
import type { GraphNode, GraphMilestone } from '../services/api';

/** 根据工时计算节点半径 */
function getNodeSize(hours: number): number {
  const minSize = 32;
  const maxSize = 100;
  if (!hours || hours <= 0) return minSize;
  return Math.min(maxSize, minSize + Math.sqrt(hours) * 6);
}

/** 构建 G6 数据：显示所有任务 + 父子连线 + 依赖关系 */
function buildG6Data(
  graphData: ReturnType<typeof useGraphStore.getState>['graphData'],
) {
  if (!graphData) return { nodes: [], edges: [] };

  const assignees = graphData.assignees;

  // 所有任务节点（不再过滤子任务）
  const taskNodes = graphData.nodes.map((node: GraphNode) => {
    const size = getNodeSize(node.computed_hours);
    const color = node.assignee
      ? getAssigneeColor(node.assignee, assignees)
      : '#95A5A6';
    const progress = node.computed_progress / 100;
    const isLeaf = node.is_leaf;
    const hasParent = !!node.parent_id;

    return {
      id: node.id,
      data: {
        ...node,
        size: hasParent ? Math.max(size * 0.75, 28) : size, // 子节点稍小
        color,
        progress,
        label: node.title,
        type: 'task' as const,
        isLeaf,
        hasParent,
      },
    };
  });

  // 父子关系边（蓝灰色虚线，无箭头）
  const parentChildEdges = graphData.nodes
    .filter(n => n.parent_id)
    .map(n => ({
      id: `parent-${n.id}`,
      source: n.parent_id!,
      target: n.id,
      data: { edgeType: 'parent-child' },
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
    nodes: taskNodes,
    edges: [...parentChildEdges, ...depEdges],
  };
}

export default function GraphCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);
  const {
    graphData,
    loadGraphData,
    selectNode,
    showContextMenu,
    hideContextMenu,
    savePosition,
  } = useGraphStore();

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
      padding: [40, 40, 40, 40],
      animation: true,
      layout: {
        type: 'd3-force',
        preventOverlap: true,
        nodeStrength: -600,
        edgeStrength: 0.4,
        collide: {
          strength: 0.8,
          radius: (d: any) => (d.data?.size || 30) / 2 + 15,
        },
        link: {
          distance: (edge: any) => {
            // 父子关系边更短，使子节点围绕父节点
            if (edge.data?.edgeType === 'parent-child') return 80;
            return 200;
          },
        },
      },
      behaviors: [
        'drag-canvas',
        'zoom-canvas',
        'scroll-canvas',
        {
          type: 'drag-element',
          key: 'drag-node',
        },
      ],
      node: {
        style: {
          size: (d: any) => d.data?.size || 30,
          fill: (d: any) => {
            if (d.data?.status === '已取消') return '#D5DBDB';
            if (d.data?.status === '已完成') return d.data?.color || '#2ECC71';
            const progress = d.data?.progress || 0;
            if (progress <= 0) return '#ECF0F1';
            return d.data?.color || '#95A5A6';
          },
          stroke: (d: any) => {
            // 逾期红色边框
            if (d.data?.due_date && d.data?.status === '未完成') {
              const now = new Date();
              const due = new Date(d.data.due_date);
              if (now > due) return '#E74C3C';
            }
            // 父节点加深边框
            if (!d.data?.isLeaf && !d.data?.hasParent) return d.data?.color || '#7F8C8D';
            return d.data?.color || '#BDC3C7';
          },
          lineWidth: (d: any) => {
            // 父节点粗边框
            if (!d.data?.isLeaf && !d.data?.hasParent) return 2.5;
            // 逾期
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
          opacity: (d: any) => (d.data?.status === '已取消' ? 0.35 : 1),
          labelText: (d: any) => {
            const label = d.data?.label || '';
            return label.length > 10 ? label.slice(0, 10) + '…' : label;
          },
          labelFill: '#333',
          labelFontSize: (d: any) => (d.data?.hasParent ? 11 : 13),
          labelPlacement: 'bottom',
          labelOffsetY: 8,
          // 进度环效果：用 badge 显示进度百分比
          badge: true,
          badges: (d: any) => {
            const progress = d.data?.computed_progress;
            if (progress === undefined || progress === null) return [];
            if (progress <= 0) return [];
            return [
              {
                text: `${Math.round(progress)}%`,
                placement: 'right-top',
                fill: progress >= 100 ? '#27AE60' : '#3498DB',
                fontSize: 9,
                backgroundFill: '#fff',
                backgroundStroke: progress >= 100 ? '#27AE60' : '#3498DB',
                backgroundRadius: 6,
                backgroundLineWidth: 1,
              },
            ];
          },
        },
      },
      edge: {
        style: {
          stroke: (d: any) => {
            if (d.data?.edgeType === 'parent-child') return '#BDC3C7';
            if (d.data?.edgeType === 'iterative') return '#F39C12';
            return '#7F8C8D';
          },
          lineWidth: (d: any) => {
            if (d.data?.edgeType === 'parent-child') return 1;
            if (d.data?.edgeType === 'iterative') return 2;
            return 1.5;
          },
          lineDash: (d: any) => {
            if (d.data?.edgeType === 'parent-child') return [4, 4];
            if (d.data?.edgeType === 'iterative') return [6, 4];
            return undefined;
          },
          opacity: (d: any) => (d.data?.edgeType === 'parent-child' ? 0.5 : 0.6),
          endArrow: (d: any) => d.data?.edgeType !== 'parent-child',
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

  // 里程碑标签（X 轴标记，不是独立节点）
  const milestones = graphData?.milestones || [];

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* 里程碑 X 轴标记 */}
      {milestones.length > 0 && (
        <div className="milestone-bar">
          {milestones.map((ms: GraphMilestone, index: number) => (
            <div
              key={ms.id}
              className="milestone-marker"
              onClick={() => selectNode(ms.id, 'milestone')}
              title={ms.description || ms.title}
            >
              <span className="milestone-diamond">◆</span>
              <span className="milestone-label">{ms.title}</span>
              {ms.computed_progress > 0 && (
                <span className="milestone-progress">
                  {Math.round(ms.computed_progress)}%
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <div
        ref={containerRef}
        id="graph-canvas"
        style={{
          width: '100%',
          height: milestones.length > 0 ? 'calc(100% - 36px)' : '100%',
          background: '#FAFBFC',
        }}
      />
    </div>
  );
}
