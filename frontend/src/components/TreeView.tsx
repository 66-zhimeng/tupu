/**
 * 树状结构图组件 — 横向组织架构图
 *
 * 纯 HTML/CSS 实现，父→子从左到右展开，同级任务从上到下排列。
 * 支持两种数据模式：
 * - current: 当前层级的直接子节点
 * - all: 全部层级递归展开
 * 支持 Ctrl+滚轮缩放 + 鼠标拖拽平移画布
 * 每个顶层任务分支使用不同的背景色区分
 * 顶层分支支持拖拽排序
 */
import React, { useState, useRef, useCallback, useMemo } from 'react';
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

    // ★ 分支排序 — 存储用户自定义的顶层分支 ID 顺序
    const [customOrder, setCustomOrder] = useState<string[]>([]);

    // ★ 拖拽状态
    const [dragId, setDragId] = useState<string | null>(null);
    const [dropTargetId, setDropTargetId] = useState<string | null>(null);
    const [dropPosition, setDropPosition] = useState<'before' | 'after'>('before');

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

    // ★ 根据自定义排序调整顶层分支顺序
    const orderedTree = useMemo(() => {
        if (customOrder.length === 0) return tree;

        const ordered: TreeNodeData[] = [];
        const remaining = [...tree];

        // 按自定义顺序排列已知 id
        for (const id of customOrder) {
            const idx = remaining.findIndex(item => item.node.id === id);
            if (idx !== -1) {
                ordered.push(remaining.splice(idx, 1)[0]);
            }
        }

        // 追加不在自定义顺序中的新分支
        ordered.push(...remaining);
        return ordered;
    }, [tree, customOrder]);

    // ★ 拖拽排序处理
    const handleDragStart = useCallback((e: React.DragEvent, nodeId: string) => {
        e.stopPropagation();
        setDragId(nodeId);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', nodeId);
        // 使拖拽预览半透明
        if (e.currentTarget instanceof HTMLElement) {
            e.currentTarget.style.opacity = '0.5';
        }
    }, []);

    const handleDragEnd = useCallback((e: React.DragEvent) => {
        e.stopPropagation();
        setDragId(null);
        setDropTargetId(null);
        if (e.currentTarget instanceof HTMLElement) {
            e.currentTarget.style.opacity = '1';
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent, nodeId: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (!dragId || dragId === nodeId) return;

        e.dataTransfer.dropEffect = 'move';

        // 计算放置位置：上半部分 = before，下半部分 = after
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const pos = e.clientY < midY ? 'before' : 'after';

        setDropTargetId(nodeId);
        setDropPosition(pos);
    }, [dragId]);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.stopPropagation();
        // 只在真正离开元素（而非进入子元素）时清除
        const related = e.relatedTarget as HTMLElement | null;
        if (!related || !(e.currentTarget as HTMLElement).contains(related)) {
            setDropTargetId(null);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        e.stopPropagation();

        if (!dragId || dragId === targetId) {
            setDragId(null);
            setDropTargetId(null);
            return;
        }

        // 计算放置位置
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const pos = e.clientY < midY ? 'before' : 'after';

        // 构建新顺序
        const currentIds = orderedTree.map(item => item.node.id);
        const fromIdx = currentIds.indexOf(dragId);
        const toIdx = currentIds.indexOf(targetId);

        if (fromIdx === -1 || toIdx === -1) {
            setDragId(null);
            setDropTargetId(null);
            return;
        }

        // 从当前位置移除
        const newOrder = [...currentIds];
        newOrder.splice(fromIdx, 1);

        // 计算新的插入位置
        let insertIdx = newOrder.indexOf(targetId);
        if (pos === 'after') insertIdx += 1;

        newOrder.splice(insertIdx, 0, dragId);
        setCustomOrder(newOrder);

        setDragId(null);
        setDropTargetId(null);
    }, [dragId, orderedTree]);

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

    // ★ 渲染顶层分支（带背景色包裹 + 拖拽）
    function renderTopBranch(item: TreeNodeData, index: number): React.ReactNode {
        const bgColor = BRANCH_COLORS[index % BRANCH_COLORS.length];
        const borderColor = BRANCH_BORDER_COLORS[index % BRANCH_BORDER_COLORS.length];
        const isDragging = dragId === item.node.id;
        const isDropTarget = dropTargetId === item.node.id;

        return (
            <div
                key={item.node.id}
                className={`tree-branch-wrapper ${isDragging ? 'dragging' : ''} ${isDropTarget ? `drop-target drop-${dropPosition}` : ''}`}
                style={{
                    background: bgColor,
                    border: `1px solid ${borderColor}`,
                    borderRadius: 12,
                    padding: '16px 20px',
                }}
                draggable
                onDragStart={(e) => handleDragStart(e, item.node.id)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, item.node.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, item.node.id)}
            >
                {/* 拖拽手柄 */}
                <div className="tree-branch-handle" title="拖动排序">
                    <span className="tree-branch-handle-icon">⠿</span>
                </div>
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
                    <span className="tree-count">{countNodes(orderedTree)} 个节点</span>
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
                {orderedTree.length === 0 ? (
                    <div className="tree-empty">此层级暂无任务</div>
                ) : (
                    <div
                        className="tree-root"
                        style={{
                            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                            transformOrigin: 'top left',
                        }}
                    >
                        {orderedTree.map((item, idx) => renderTopBranch(item, idx))}
                    </div>
                )}
            </div>

            {/* 缩放操作提示 */}
            {scale === 1 && pan.x === 0 && pan.y === 0 && (
                <div className="tree-zoom-hint">Ctrl + 滚轮缩放 · 拖拽平移画布 · 拖动⠿手柄排序分支</div>
            )}
        </div>
    );
}
