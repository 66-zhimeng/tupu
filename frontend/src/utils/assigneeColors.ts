/**
 * 负责人颜色管理
 *
 * 每个负责人对应一个颜色，用于节点着色和饼图渲染。
 * 颜色持久化存储在 localStorage。
 * shadcn-inspired: 12 种高辨识度色彩，取自 Radix Colors 体系。
 */

// 预设调色板 — 12 色（Radix Colors 灵感）
export const PRESET_COLORS = [
    '#3B82F6', // Blue
    '#10B981', // Emerald
    '#F59E0B', // Amber
    '#EF4444', // Red
    '#8B5CF6', // Violet
    '#EC4899', // Pink
    '#06B6D4', // Cyan
    '#F97316', // Orange
    '#84CC16', // Lime
    '#6366F1', // Indigo
    '#14B8A6', // Teal
    '#A855F7', // Purple
];

// 未分配颜色
export const UNASSIGNED_COLOR = '#D4D4D8'; // zinc-300

const STORAGE_KEY = 'graph-studio-assignee-colors';

/** 从 localStorage 读取 */
function loadColorMap(): Map<string, string> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const obj = JSON.parse(raw) as Record<string, string>;
            return new Map(Object.entries(obj));
        }
    } catch { /* ignore */ }
    return new Map();
}

/** 保存到 localStorage */
function saveColorMap(map: Map<string, string>): void {
    const obj = Object.fromEntries(map);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}

// 全局颜色映射
let colorMap = loadColorMap();
let nextColorIndex = colorMap.size % PRESET_COLORS.length;

/**
 * 获取负责人颜色
 * - 已有映射 → 返回映射颜色
 * - 无映射但有名字 → 自动分配下一个预设色并保存
 * - 无名字（null/undefined/空串）→ 返回灰色 UNASSIGNED_COLOR
 */
export function getAssigneeColor(assignee: string | null | undefined): string {
    if (!assignee || assignee.trim() === '') return UNASSIGNED_COLOR;

    const name = assignee.trim();
    if (colorMap.has(name)) return colorMap.get(name)!;

    // 自动分配
    const color = PRESET_COLORS[nextColorIndex % PRESET_COLORS.length];
    nextColorIndex++;
    colorMap.set(name, color);
    saveColorMap(colorMap);
    return color;
}

/** 手动设置负责人颜色 */
export function setAssigneeColor(assignee: string, color: string): void {
    colorMap.set(assignee.trim(), color);
    saveColorMap(colorMap);
}

/** 获取所有已注册的负责人及其颜色 */
export function getAllAssigneeColors(): { name: string; color: string }[] {
    return Array.from(colorMap.entries()).map(([name, color]) => ({ name, color }));
}

/** 重新加载（外部可能更新了 localStorage） */
export function reloadColorMap(): void {
    colorMap = loadColorMap();
}

/**
 * 从后端 Member 列表初始化颜色映射
 * 后端颜色优先，未在后端的负责人保留自动分配逻辑
 */
export function initFromMembers(members: { name: string; color: string }[]): void {
    for (const m of members) {
        const name = m.name.trim();
        if (name) {
            colorMap.set(name, m.color);
        }
    }
    nextColorIndex = colorMap.size % PRESET_COLORS.length;
    saveColorMap(colorMap);
}

/** 检查是否已分配负责人 */
export function isAssigned(assignee: string | null | undefined): boolean {
    return !!assignee && assignee.trim() !== '';
}
