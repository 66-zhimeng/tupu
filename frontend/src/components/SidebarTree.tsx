/**
 * 左侧树状任务面板
 * 递归显示完整任务层级，可展开/折叠，点击导航到对应层级
 */
import { useState, useMemo } from 'react';
import {
    HomeOutlined,
    FolderOpenOutlined,
    FolderOutlined,
    FileOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    CaretRightOutlined,
    CaretDownOutlined,
    CheckCircleFilled,
} from '@ant-design/icons';
import { useGraphStore } from '../stores/graphStore';
import type { GraphNode } from '../services/api';
import './SidebarTree.css';

/* ===== 递归树节点 ===== */
function TreeNode({
    node,
    allNodes,
    depth,
    expandedIds,
    toggleExpand,
    currentParentId,
    onNavigate,
}: {
    node: GraphNode;
    allNodes: GraphNode[];
    depth: number;
    expandedIds: Set<string>;
    toggleExpand: (id: string) => void;
    currentParentId: string | null;
    onNavigate: (nodeId: string, hasChildren: boolean) => void;
}) {
    const children = allNodes.filter(n => n.parent_id === node.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    const isActive = currentParentId === node.id;
    const isCompleted = node.status === '已完成';
    const isCancelled = node.status === '已取消';

    // 进度色
    const progressPct = node.computed_progress || 0;

    return (
        <>
            <div
                className={`tree-node ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isCancelled ? 'cancelled' : ''}`}
                style={{ paddingLeft: 8 + depth * 16 }}
                onClick={() => onNavigate(node.id, hasChildren)}
                title={`${node.title}${hasChildren ? ` (${children.length} 子任务)` : ''} — ${node.status}`}
            >
                {/* 展开/折叠按钮 */}
                {hasChildren ? (
                    <span
                        className="tree-node-toggle"
                        onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }}
                    >
                        {isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
                    </span>
                ) : (
                    <span className="tree-node-toggle tree-node-toggle-spacer" />
                )}

                {/* 图标 */}
                <span className="tree-node-icon">
                    {isCompleted ? (
                        <CheckCircleFilled style={{ color: '#10B981' }} />
                    ) : hasChildren ? (
                        isExpanded ? <FolderOpenOutlined /> : <FolderOutlined />
                    ) : (
                        <FileOutlined />
                    )}
                </span>

                {/* 任务名 */}
                <span className="tree-node-label">{node.title}</span>

                {/* 进度 / 子任务数 */}
                {hasChildren ? (
                    <span className="tree-node-count">{children.length}</span>
                ) : progressPct > 0 && progressPct < 100 ? (
                    <span className="tree-node-pct">{Math.round(progressPct)}%</span>
                ) : null}
            </div>

            {/* 递归子节点 */}
            {hasChildren && isExpanded && (
                <div className="tree-children">
                    {children.map(child => (
                        <TreeNode
                            key={child.id}
                            node={child}
                            allNodes={allNodes}
                            depth={depth + 1}
                            expandedIds={expandedIds}
                            toggleExpand={toggleExpand}
                            currentParentId={currentParentId}
                            onNavigate={onNavigate}
                        />
                    ))}
                </div>
            )}
        </>
    );
}

/* ===== 主组件 ===== */
export default function SidebarTree() {
    const {
        graphData,
        currentParentId,
        drillDown,
        selectNode,
    } = useGraphStore();

    const [collapsed, setCollapsed] = useState(false);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    // 顶层节点
    const rootNodes = useMemo(
        () => graphData?.nodes.filter(n => !n.parent_id) || [],
        [graphData],
    );

    // 自动展开当前路径
    useMemo(() => {
        if (!graphData || !currentParentId) return;
        // 找到从根到当前节点的路径，全部展开
        const path = new Set<string>();
        let cur: string | null | undefined = currentParentId;
        while (cur) {
            path.add(cur);
            const node = graphData.nodes.find(n => n.id === cur);
            cur = node?.parent_id;
        }
        setExpandedIds(prev => {
            const next = new Set(prev);
            path.forEach(id => next.add(id));
            return next;
        });
    }, [currentParentId, graphData]);

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleNavigate = (nodeId: string, hasChildren: boolean) => {
        if (hasChildren) {
            drillDown(nodeId);
        } else {
            selectNode(nodeId, 'task');
        }
    };

    if (!graphData) return null;

    return (
        <div className={`sidebar-tree ${collapsed ? 'collapsed' : ''}`}>
            <div className="sidebar-header">
                {!collapsed && <span className="sidebar-title">任务树</span>}
                <button
                    className="sidebar-collapse-btn"
                    onClick={() => setCollapsed(!collapsed)}
                    title={collapsed ? '展开面板' : '折叠面板'}
                >
                    {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                </button>
            </div>

            <div className="sidebar-body">
                {/* 全部任务（根节点） */}
                <div
                    className={`tree-node tree-root ${currentParentId === null ? 'active' : ''}`}
                    onClick={() => {
                        if (currentParentId !== null) {
                            useGraphStore.getState().goToLevel(0);
                        }
                    }}
                >
                    <span className="tree-node-icon"><HomeOutlined /></span>
                    <span className="tree-node-label">全部任务</span>
                    <span className="tree-node-count">{rootNodes.length}</span>
                </div>

                {/* 递归任务树 */}
                <div className="tree-children">
                    {rootNodes.map(node => (
                        <TreeNode
                            key={node.id}
                            node={node}
                            allNodes={graphData.nodes}
                            depth={1}
                            expandedIds={expandedIds}
                            toggleExpand={toggleExpand}
                            currentParentId={currentParentId}
                            onNavigate={handleNavigate}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
