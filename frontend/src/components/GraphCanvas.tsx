/**
 * 图谱画布组件 - AntV G6 力导向图
 *
 * 层级视图：
 * - 默认显示顶层任务（无 parent 的任务）
 * - 双击父任务 → 进入子任务视图
 * - 面包屑可跳回任意层级
 * - 父任务工时 = 子任务工时之和（后端 compute_recursive 计算）
 */
import { useEffect, useRef } from 'react';
import { Graph } from '@antv/g6';
import { useGraphStore } from '../stores/graphStore';
import { getAssigneeColor } from '../utils/colors';
import type { GraphNode, GraphMilestone } from '../services/api';
import './GraphCanvas.css';

/** 根据工时计算节点半径 */
function getNodeSize(hours: number): number {
  const minSize = 36;
  const maxSize = 110;
  if (!hours || hours <= 0) return minSize;
  return Math.min(maxSize, minSize + Math.sqrt(hours) * 7);
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
    drillDown,
    getCurrentLevelNodes,
    currentParentId,
    breadcrumbs,
    goToLevel,
  } = useGraphStore();

  // 初始化加载
  useEffect(() => {
    loadGraphData();
  }, [loadGraphData]);

  // 初始化 G6 图（只初始化一次）
  useEffect(() => {
    if (!containerRef.current || graphRef.current) return;

    const graph = new Graph({
      container: containerRef.current,
      autoFit: 'view',
      padding: [50, 50, 50, 50],
      animation: true,
      layout: {
        type: 'd3-force',
        preventOverlap: true,
        nodeStrength: -500,
        edgeStrength: 0.3,
        collide: {
          strength: 0.8,
          radius: (d: any) => (d.data?.size || 36) / 2 + 20,
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
          size: (d: any) => d.data?.size || 36,
          fill: (d: any) => {
            if (d.data?.status === '已取消') return '#D5DBDB';
            if (d.data?.status === '已完成') return d.data?.color || '#2ECC71';
            const progress = d.data?.progress || 0;
            if (progress <= 0) return '#ECF0F1';
            return d.data?.color || '#95A5A6';
          },
          stroke: (d: any) => {
            // 逾期红色
            if (d.data?.due_date && d.data?.status === '未完成') {
              const now = new Date();
              const due = new Date(d.data.due_date);
              if (now > due) return '#E74C3C';
            }
            // 有子任务的父节点 → 粗边框
            if (d.data?.hasChildren) return d.data?.color || '#34495E';
            return d.data?.color || '#BDC3C7';
          },
          lineWidth: (d: any) => {
            if (d.data?.hasChildren) return 3;
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
          cursor: (d: any) => (d.data?.hasChildren ? 'pointer' : 'default'),
          labelText: (d: any) => {
            const label = d.data?.label || '';
            return label.length > 10 ? label.slice(0, 10) + '…' : label;
          },
          labelFill: '#333',
          labelFontSize: 13,
          labelPlacement: 'bottom',
          labelOffsetY: 8,
        },
      },
      edge: {
        style: {
          stroke: (d: any) => {
            if (d.data?.edgeType === 'iterative') return '#F39C12';
            return '#7F8C8D';
          },
          lineWidth: (d: any) => (d.data?.edgeType === 'iterative' ? 2 : 1.5),
          lineDash: (d: any) => {
            if (d.data?.edgeType === 'iterative') return [6, 4];
            return undefined;
          },
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
          labelBackground: true,
          labelBackgroundFill: '#fff',
          labelBackgroundOpacity: 0.8,
          labelBackgroundRadius: 4,
        },
      },
    });

    graphRef.current = graph;

    // 单击 → 选中节点
    graph.on('node:click', (evt: any) => {
      const nodeId = evt.target?.id;
      if (!nodeId) return;
      selectNode(nodeId, 'task');
    });

    // 双击 → 钻入子任务
    graph.on('node:dblclick', (evt: any) => {
      const nodeId = evt.target?.id;
      if (!nodeId) return;
      drillDown(nodeId);
    });

    // 右键菜单
    graph.on('node:contextmenu', (evt: any) => {
      evt.preventDefault?.();
      const nodeId = evt.target?.id;
      if (!nodeId) return;
      showContextMenu(
        evt.client?.x || evt.clientX || 0,
        evt.client?.y || evt.clientY || 0,
        evt.canvas?.x || 0,
        evt.canvas?.y || 0,
        nodeId,
        'task',
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

    // 保存拖拽位置
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

  // 当 graphData 或 currentParentId 变化 → 更新画布显示的节点
  useEffect(() => {
    if (!graphRef.current || !graphData) return;

    const graph = graphRef.current;
    const levelNodes = getCurrentLevelNodes();
    const assignees = graphData.assignees;

    // 当前层级的所有节点 ID 集合
    const levelNodeIds = new Set(levelNodes.map(n => n.id));

    // 构建 G6 节点
    const g6Nodes = levelNodes.map((node: GraphNode) => {
      const size = getNodeSize(node.computed_hours);
      const color = node.assignee
        ? getAssigneeColor(node.assignee, assignees)
        : '#95A5A6';
      const progress = node.computed_progress / 100;

      // 检查是否有子任务
      const hasChildren = graphData.nodes.some(n => n.parent_id === node.id);

      return {
        id: node.id,
        data: {
          ...node,
          size,
          color,
          progress,
          label: node.title,
          type: 'task' as const,
          hasChildren,
        },
      };
    });

    // 仅包含当前层级节点之间的依赖关系边
    const g6Edges = graphData.edges
      .filter(e => levelNodeIds.has(e.source) && levelNodeIds.has(e.target))
      .map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        data: {
          edgeType: e.is_iterative ? 'iterative' : 'dependency',
          iterationCount: e.iteration_count,
          isCycleEnded: e.is_cycle_ended,
        },
      }));

    graph.setData({ nodes: g6Nodes, edges: g6Edges });
    graph.render();
  }, [graphData, currentParentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 里程碑标记
  const milestones = graphData?.milestones || [];

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* 面包屑导航 + 里程碑标记 */}
      <div className="canvas-top-bar">
        {/* 面包屑 */}
        <div className="breadcrumbs">
          {breadcrumbs.map((item, index) => (
            <span key={item.id ?? 'root'}>
              {index > 0 && <span className="breadcrumb-sep">/</span>}
              <span
                className={`breadcrumb-item ${index === breadcrumbs.length - 1 ? 'active' : ''}`}
                onClick={() => goToLevel(index)}
              >
                {item.title}
              </span>
            </span>
          ))}
        </div>

        {/* 里程碑标记 */}
        {milestones.length > 0 && (
          <div className="milestone-tags">
            {milestones.map((ms: GraphMilestone) => (
              <span
                key={ms.id}
                className="milestone-tag"
                onClick={() => selectNode(ms.id, 'milestone')}
                title={ms.description || ms.title}
              >
                ◆ {ms.title}
                {ms.computed_progress > 0 && (
                  <span className="milestone-pct">{Math.round(ms.computed_progress)}%</span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 当前层级信息提示 */}
      {currentParentId && (
        <div className="level-hint">
          双击节点进入下一层 · 点击面包屑返回上层
        </div>
      )}

      {/* 图谱画布 */}
      <div
        ref={containerRef}
        id="graph-canvas"
        style={{
          width: '100%',
          height: 'calc(100% - 40px)',
          background: '#FAFBFC',
        }}
      />
    </div>
  );
}
