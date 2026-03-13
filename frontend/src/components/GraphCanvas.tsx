/**
 * 图谱画布组件 - AntV G6 力导向图
 *
 * 层级切换方式：
 * - 默认显示顶层任务
 * - 滚轮放大超过阈值 → 自动切换到子节点层（父节点消失，子节点填满画布）
 * - 滚轮缩小回到阈值以下 → 自动返回父节点层
 * - 大节点颜色 = 完成度进度渐变（灰→蓝→绿）
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { Graph } from '@antv/g6';
import { useGraphStore } from '../stores/graphStore';
import type { GraphNode, GraphMilestone } from '../services/api';
import './GraphCanvas.css';

/** 缩放切换阈值 */
const ZOOM_IN_THRESHOLD = 2.5;
const ZOOM_OUT_THRESHOLD = 0.7;

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
  const min = 44, max = 120;
  if (!hours || hours <= 0) return min;
  return Math.min(max, min + Math.sqrt(hours) * 8);
}

/** 构建某一层级的 G6 数据 */
function buildLevelData(
  graphData: ReturnType<typeof useGraphStore.getState>['graphData'],
  parentId: string | null,
) {
  if (!graphData) return { nodes: [], edges: [] };

  // 当前层级的节点
  const levelNodes = graphData.nodes.filter(n =>
    parentId === null ? !n.parent_id : n.parent_id === parentId
  );
  const levelIds = new Set(levelNodes.map(n => n.id));

  const g6Nodes = levelNodes.map((node: GraphNode) => {
    const color = progressColor(node.computed_progress, node.status);
    const hasChildren = graphData.nodes.some(n => n.parent_id === node.id);
    const childCount = graphData.nodes.filter(n => n.parent_id === node.id).length;

    // 标签
    const parts: string[] = [];
    const title = node.title.length > 10 ? node.title.slice(0, 10) + '…' : node.title;
    parts.push(title);
    if (node.assignee) parts.push(`👤${node.assignee}`);
    if (node.computed_hours > 0) parts.push(`${node.computed_hours.toFixed(0)}h`);
    if (node.computed_progress > 0 && node.computed_progress < 100) {
      parts.push(`${node.computed_progress.toFixed(0)}%`);
    }
    if (hasChildren) parts.push(`📂${childCount}个子任务`);

    return {
      id: node.id,
      data: {
        ...node,
        size: nodeSize(node.computed_hours),
        progressColor: color,
        label: parts.join('\n'),
        hasChildren,
        childCount,
      },
    };
  });

  // 当前层级内的依赖关系
  const g6Edges = graphData.edges
    .filter(e => levelIds.has(e.source) && levelIds.has(e.target))
    .map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      data: {
        edgeType: e.is_iterative ? 'iterative' : 'dependency',
        iterationCount: e.iteration_count,
      },
    }));

  return { nodes: g6Nodes, edges: g6Edges };
}

export default function GraphCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);
  const [currentLevel, setCurrentLevel] = useState<string | null>(null); // null = 顶层
  const [levelStack, setLevelStack] = useState<Array<{ id: string | null; title: string }>>([
    { id: null, title: '全部任务' },
  ]);

  const {
    graphData,
    loadGraphData,
    selectNode,
    showContextMenu,
    hideContextMenu,
    savePosition,
  } = useGraphStore();

  useEffect(() => { loadGraphData(); }, [loadGraphData]);

  // 切换到子层级
  const drillInto = useCallback((taskId: string) => {
    if (!graphData) return;
    const task = graphData.nodes.find(n => n.id === taskId);
    if (!task) return;
    const children = graphData.nodes.filter(n => n.parent_id === taskId);
    if (children.length === 0) return;

    setCurrentLevel(taskId);
    setLevelStack(prev => [...prev, { id: taskId, title: task.title }]);
  }, [graphData]);

  // 返回上一层
  const goUp = useCallback(() => {
    if (levelStack.length <= 1) return;
    const newStack = levelStack.slice(0, -1);
    setCurrentLevel(newStack[newStack.length - 1].id);
    setLevelStack(newStack);
  }, [levelStack]);

  // 跳到指定层
  const goToLevel = useCallback((index: number) => {
    if (index < 0 || index >= levelStack.length) return;
    const newStack = levelStack.slice(0, index + 1);
    setCurrentLevel(newStack[newStack.length - 1].id);
    setLevelStack(newStack);
  }, [levelStack]);

  // 初始化 G6
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
        nodeStrength: -400,
        edgeStrength: 0.3,
        collide: {
          strength: 0.8,
          radius: (d: any) => (d.data?.size || 44) / 2 + 15,
        },
      },
      behaviors: [
        'drag-canvas',
        'zoom-canvas',
        { type: 'drag-element', key: 'drag-node' },
      ],
      node: {
        style: {
          size: (d: any) => d.data?.size || 44,
          fill: (d: any) => d.data?.progressColor || '#BDC3C7',
          stroke: (d: any) => {
            if (d.data?.due_date && d.data?.status === '未完成') {
              if (new Date() > new Date(d.data.due_date)) return '#E74C3C';
            }
            if (d.data?.hasChildren) return '#2C3E50';
            return d.data?.progressColor || '#BDC3C7';
          },
          lineWidth: (d: any) => (d.data?.hasChildren ? 2.5 : 1),
          opacity: (d: any) => (d.data?.status === '已取消' ? 0.35 : 1),
          // 有子节点的父任务显示「内部小点」装饰
          iconSrc: (d: any) => d.data?.hasChildren ? undefined : undefined,
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
    });

    graphRef.current = graph;

    // 单击选中
    graph.on('node:click', (evt: any) => {
      const id = evt.target?.id;
      if (id) selectNode(id, 'task');
    });

    // 双击 → 进入子层级
    graph.on('node:dblclick', (evt: any) => {
      const id = evt.target?.id;
      if (id) drillInto(id);
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

    // ★ 监听缩放 → 自动层级切换
    let zoomCheckTimer: ReturnType<typeof setTimeout> | null = null;
    const checkZoomLevel = () => {
      if (!graphRef.current) return;
      const zoom = graphRef.current.getZoom();

      if (zoom > ZOOM_IN_THRESHOLD) {
        // 找到视口中心最近的有子任务的节点，钻入
        const allNodeData = graphRef.current.getNodeData();
        const parentNodes = allNodeData.filter(n => n.data?.hasChildren);
        if (parentNodes.length > 0) {
          // 钻入第一个有子任务的父节点
          const target = parentNodes[0];
          drillInto(target.id as string);
          // 重置缩放
          setTimeout(() => {
            if (graphRef.current) {
              graphRef.current.zoomTo(1, true);
            }
          }, 200);
        }
      } else if (zoom < ZOOM_OUT_THRESHOLD) {
        // 缩小 → 返回上层
        goUp();
        setTimeout(() => {
          if (graphRef.current) {
            graphRef.current.zoomTo(1, true);
          }
        }, 200);
      }
    };

    // 轮询检测缩放级别
    zoomCheckTimer = setInterval(checkZoomLevel, 500);

    return () => {
      if (zoomCheckTimer) clearInterval(zoomCheckTimer);
      graph.destroy();
      graphRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 当 graphData 或 currentLevel 变化 → 更新画布数据
  useEffect(() => {
    if (!graphRef.current || !graphData) return;
    const data = buildLevelData(graphData, currentLevel);
    graphRef.current.setData(data);
    graphRef.current.render();
  }, [graphData, currentLevel]);

  // 里程碑
  const milestones = graphData?.milestones || [];

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* 面包屑导航 + 里程碑 */}
      <div className="canvas-top-bar">
        <div className="breadcrumbs">
          {levelStack.map((item, i) => (
            <span key={item.id ?? 'root'}>
              {i > 0 && <span className="bc-sep"> / </span>}
              <span
                className={`bc-item ${i === levelStack.length - 1 ? 'active' : ''}`}
                onClick={() => goToLevel(i)}
              >
                {item.title}
              </span>
            </span>
          ))}
        </div>

        {milestones.length > 0 && (
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
        )}
      </div>

      <div className="zoom-hint">
        滚轮放大进入子任务 · 缩小返回上层 · 双击也可进入 · 右键新建 · 单击编辑
      </div>

      <div
        ref={containerRef}
        id="graph-canvas"
        onContextMenu={(e) => e.preventDefault()}
        style={{
          width: '100%',
          height: 'calc(100% - 40px)',
          background: '#FAFBFC',
        }}
      />
    </div>
  );
}
