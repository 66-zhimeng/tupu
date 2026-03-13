/**
 * HSL 均匀分布颜色分配工具
 * 为每个负责人自动分配可区分的颜色
 */

// 预定义高辨识度调色板
const PRESET_COLORS = [
  '#E74C3C', '#3498DB', '#2ECC71', '#F39C12', '#9B59B6',
  '#1ABC9C', '#E67E22', '#2980B9', '#27AE60', '#8E44AD',
  '#16A085', '#D35400', '#2C3E50', '#C0392B', '#7F8C8D',
  '#F1C40F', '#00BCD4', '#FF5722', '#607D8B', '#4CAF50',
];

// 负责人 → 颜色 映射缓存
const assigneeColorMap = new Map<string, string>();

/**
 * 获取负责人对应的颜色
 */
export function getAssigneeColor(assignee: string, allAssignees: string[]): string {
  if (assigneeColorMap.has(assignee)) {
    return assigneeColorMap.get(assignee)!;
  }

  // 初始化所有负责人的颜色映射
  allAssignees.forEach((name, index) => {
    if (!assigneeColorMap.has(name)) {
      if (index < PRESET_COLORS.length) {
        assigneeColorMap.set(name, PRESET_COLORS[index]);
      } else {
        // 超出预定义范围，使用 HSL 均匀分布
        const hue = (index * 137.508) % 360; // 黄金角度确保均匀分布
        assigneeColorMap.set(name, `hsl(${hue}, 70%, 55%)`);
      }
    }
  });

  return assigneeColorMap.get(assignee) || '#7F8C8D';
}

/**
 * 重置颜色映射（当负责人列表变化时调用）
 */
export function resetColorMap(): void {
  assigneeColorMap.clear();
}

/**
 * 将十六进制颜色转为 RGBA（用于透明度调整）
 */
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
