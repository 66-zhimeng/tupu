/**
 * 布局引擎 — 使用 G6 内置布局算法 + JSON 导入/导出
 *
 * 提供 5 种高质量布局配置，直接传给 G6 graph.layout() 使用
 */

export type LayoutName = 'dagre' | 'force' | 'circular' | 'grid' | 'radial';

/** 每种布局的 G6 配置 */
export interface LayoutConfig {
    type: string;
    [key: string]: any;
}

export const LAYOUT_OPTIONS: { key: LayoutName; label: string; icon: string }[] = [
    { key: 'dagre', label: '层级流程图', icon: '🔀' },
    { key: 'force', label: '力导向', icon: '🧲' },
    { key: 'circular', label: '环形', icon: '⭕' },
    { key: 'grid', label: '网格', icon: '▦' },
    { key: 'radial', label: '辐射', icon: '🎯' },
];

/** G6 布局配置工厂 */
export function getLayoutConfig(name: LayoutName): LayoutConfig {
    switch (name) {
        case 'dagre':
            return {
                type: 'antv-dagre',
                rankdir: 'LR',        // 左→右
                nodesep: 40,           // 同层节点间距
                ranksep: 120,          // 层间距
                align: 'UL',
            };
        case 'force':
            return {
                type: 'd3-force',
                preventOverlap: true,
                nodeSize: 120,
                linkDistance: 200,
                nodeStrength: -800,
                edgeStrength: 0.6,
                collideStrength: 0.8,
                alphaDecay: 0.02,
                forceSimulation: null,
            };
        case 'circular':
            return {
                type: 'circular',
                radius: null,          // 自动计算
                divisions: 1,
                ordering: 'topology',  // 按拓扑顺序排列
                startAngle: 0,
                endAngle: 2 * Math.PI,
            };
        case 'grid':
            return {
                type: 'grid',
                rows: undefined,       // 自动计算
                cols: undefined,
                sortBy: 'degree',      // 按度数排列
                nodeSize: 150,
            };
        case 'radial':
            return {
                type: 'radial',
                unitRadius: 150,       // 每层半径增量
                linkDistance: 200,
                preventOverlap: true,
                nodeSize: 120,
                strictRadial: false,
            };
    }
}

// ==================== 导入/导出 ====================

export type PositionMap = Map<string, { x: number; y: number }>;

export interface LayoutExportData {
    layoutName?: string;
    positions: Record<string, { x: number; y: number }>;
}

export function exportLayout(positions: PositionMap, layoutName?: string): string {
    const data: LayoutExportData = {
        layoutName,
        positions: Object.fromEntries(positions),
    };
    return JSON.stringify(data, null, 2);
}

export function importLayout(json: string): PositionMap {
    const data: LayoutExportData = JSON.parse(json);
    const result: PositionMap = new Map();
    for (const [id, pos] of Object.entries(data.positions)) {
        result.set(id, pos);
    }
    return result;
}
