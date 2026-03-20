/**
 * 树状结构图组件 — 横向组织架构图
 *
 * 纯 HTML/CSS 实现，父→子从左到右展开，同级任务从上到下排列。
 * 支持两种数据模式：
 * - current: 当前层级的直接子节点
 * - all: 全部层级递归展开
 * 支持 Ctrl+滚轮缩放 + 鼠标拖拽平移画布
 * 每个顶层任务分支使用不同的背景色区分
 */
import React, { useState, useRef, useCallback } from 'react';
import { useGraphStore } from '../stores/graphStore';
import { getAssigneeColor, isAssigned } from '../utils/assigneeColors';
import type { GraphNode } from '../services/api';
import './TreeView.css';

interface TreeNodeData {
    node: GraphNode;
    children: TreeNodeData[];
}

/* ===== 分支背景色调色板 ===== */
const BRANCH_COLORS = [
    'rgba(59, 130, 246, 0.06)',   // 蓝
    'rgba(16, 185, 129, 0.06)',   // 绿
    'rgba(245, 158, 11, 0.06)',   // 橙
    'rgba(139, 92, 246, 0.06)',   // 紫
    'rgba(236, 72, 153, 0.06)',   // 粉
    'rgba(14, 165, 233, 0.06)',   // 天蓝
    'rgba(234, 88, 12, 0.06)',    // 深橙
    'rgba(34, 197, 94, 0.06)',    // 翠绿
    'rgba(168, 85, 247, 0.06)',   // 薰衣草
    'rgba(244, 63, 94, 0.06)',    // 玫红
];

const BRANCH_BORDER_COLORS = [
    'rgba(59, 130, 246, 0.15)',
    'rgba(16, 185, 129, 0.15)',
    'rgba(245, 158, 11, 0.15)',
    'rgba(139, 92, 246, 0.15)',
    'rgba(236, 72, 153, 0.15)',
    'rgba(14, 165, 233, 0.15)',
    'rgba(234, 88, 12, 0.15)',
    'rgba(34, 197, 94, 0.15)',
    'rgba(168, 85, 247, 0.15)',
    'rgba(244, 63, 94, 0.15)',
];

export default function TreeView() {
    const { graphData, currentParentId, selectNode, drillDown } = useGraphStore();
    const [mode, setMode] = useState<'current' | 'all'>('all');
    const [scale, setScale] = useState(1);
    const canvasRef = useRef<HTMLDivElement>(null);

    // ★ 画布拖拽平移
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const isPanningRef = useRef(false);
    const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button === 0 || e.button === 1) {
            isPanningRef.current = true;
            panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
        }
    }, [pan]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isPanningRef.current) return;
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
            if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
            setPan({ x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy });
        }
    }, []);

    const handleMouseUp = useCallback(() => {
        isPanningRef.current = false;
        if (canvasRef.current) canvasRef.current.style.cursor = '';
    }, []);

    // ★ Ctrl+滚轮缩放
    const handleWheel = useCallback((e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setScale(prev => {
                const delta = e.deltaY > 0 ? -0.08 : 0.08;
                return Math.max(0.2, Math.min(3.0, prev + delta));
            });
        }
    }, []);

    if (!graphData) return <div className="tree-empty">暂无数据</div>;

    // 构建树
    function buildTree(parentId: string | null): TreeNodeData[] {
        const children = graphData!.nodes
            .filter(n => n.parent_id === parentId || (!n.parent_id && parentId === null))
            .sort((a, b) => a.title.localeCompare(b.title));

        return children.map(node => ({
            node,
            children: mode === 'all' ? buildTree(node.id) : [],
        }));
    }

    const tree = mode === 'current'
        ? buildTree(currentParentId)
        : buildTree(null);

    // 渲染单个节点
    function renderNode(item: TreeNodeData, depth: number): React.ReactNode {
        const { node, children } = item;
        const color = getAssigneeColor(node.assignee);
        const unassigned = !isAssigned(node.assignee);
        const progress = Math.round(node.computed_progress || 0);
        const isDone = node.status === '已完成';
        const isCancelled = node.status === '已取消';

        // 计算子任务数（直接子，不管 mode）
        const directChildren = graphData!.nodes.filter(n => n.parent_id === node.id);

        return (
            <div className="tree-branch" key={node.id}>
                <div
                    className={`tree-card ${isDone ? 'done' : ''} ${isCancelled ? 'cancelled' : ''} ${unassigned ? 'unassigned' : ''}`}
                    style={{
                        borderLeftColor: color,
                        '--node-color': color,
                    } as React.CSSProperties}
                    onClick={() => selectNode(node.id, 'task')}
                    onDoubleClick={() => directChildren.length > 0 && drillDown(node.id)}
                >
                    <div className="tree-card-header">
                        <span className="tree-card-title">{node.title}</span>
                        {directChildren.length > 0 && (
                            <span className="tree-card-badge">{directChildren.length}</span>
                        )}
                    </div>
                    <div className="tree-card-meta">
                        {node.assignee ? (
                            <span className="tree-card-assignee" style={{ color }}>
                                ● {node.assignee}
                            </span>
                        ) : (
                            <span className="tree-card-unassigned">⚠ 未分配</span>
                        )}
                        <span className="tree-card-progress" style={{ color: isDone ? '#10B981' : '#71717A' }}>
                            {progress}%
                        </span>
                    </div>
                    {/* 工时 */}
                    {node.computed_hours > 0 && (
                        <div className="tree-card-hours">
                            ⏱ {node.computed_hours}人天
                        </div>
                    )}
                    {/* 进度条 */}
                    <div className="tree-card-bar">
                        <div
                            className="tree-card-bar-fill"
                            style={{ width: `${progress}%`, background: color }}
                        />
                    </div>
                </div>
                {children.length > 0 && (
                    <div className="tree-children">
                        {children.map(child => renderNode(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    }

    // ★ 渲染顶层分支（带背景色包裹）
    function renderTopBranch(item: TreeNodeData, index: number): React.ReactNode {
        const bgColor = BRANCH_COLORS[index % BRANCH_COLORS.length];
        const borderColor = BRANCH_BORDER_COLORS[index % BRANCH_BORDER_COLORS.length];

        return (
            <div
                key={item.node.id}
                className="tree-branch-wrapper"
                style={{
                    background: bgColor,
                    border: `1px solid ${borderColor}`,
                    borderRadius: 12,
                    padding: '16px 20px',
                }}
            >
                {renderNode(item, 0)}
            </div>
        );
    }

    // 统计节点总数
    function countNodes(items: TreeNodeData[]): number {
        return items.reduce((sum, item) => sum + 1 + countNodes(item.children), 0);
    }

    return (
        <div className="tree-view">
            {/* 工具栏 */}
            <div className="tree-toolbar">
                <div className="tree-toolbar-left">
                    <div className="tree-mode-switch">
                        <button
                            className={`tree-mode-btn ${mode === 'current' ? 'active' : ''}`}
                            onClick={() => setMode('current')}
                        >
                            当前层级
                        </button>
                        <button
                            className={`tree-mode-btn ${mode === 'all' ? 'active' : ''}`}
                            onClick={() => setMode('all')}
                        >
                            全部层级
                        </button>
                    </div>
                </div>
                <div className="tree-toolbar-right">
                    <span className="tree-zoom-label">{Math.round(scale * 100)}%</span>
                    {(scale !== 1 || pan.x !== 0 || pan.y !== 0) && (
                        <button className="tree-zoom-reset" onClick={() => { setScale(1); setPan({ x: 0, y: 0 }); }}>
                            重置
                        </button>
                    )}
                    <span className="tree-count">{countNodes(tree)} 个节点</span>
                </div>
            </div>

            {/* 树（支持缩放 + 拖拽平移） */}
            <div
                className="tree-canvas"
                ref={canvasRef}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                {tree.length === 0 ? (
                    <div className="tree-empty">此层级暂无任务</div>
                ) : (
                    <div
                        className="tree-root"
                        style={{
                            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                            transformOrigin: 'top left',
                        }}
                    >
                        {tree.map((item, idx) => renderTopBranch(item, idx))}
                    </div>
                )}
            </div>

            {/* 缩放操作提示 */}
            {scale === 1 && pan.x === 0 && pan.y === 0 && (
                <div className="tree-zoom-hint">Ctrl + 滚轮缩放 · 拖拽平移画布</div>
            )}
        </div>
    );
}
