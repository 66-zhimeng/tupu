/**
 * 右键菜单组件
 */
import { useEffect, useRef } from 'react';
import { useGraphStore } from '../stores/graphStore';
import './ContextMenu.css';

export default function ContextMenu() {
  const menuRef = useRef<HTMLDivElement>(null);
  const {
    contextMenu,
    hideContextMenu,
    addTask,
    addMilestone,
    removeTask,
    selectNode,
  } = useGraphStore();

  // 点击其他区域关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        hideContextMenu();
      }
    };
    if (contextMenu.visible) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [contextMenu.visible, hideContextMenu]);

  if (!contextMenu.visible) return null;

  const { x, y, nodeId, nodeType, canvasX, canvasY } = contextMenu;

  // 在空白区域右键
  if (!nodeId) {
    return (
      <div ref={menuRef} className="context-menu" style={{ left: x, top: y }}>
        <div
          className="context-menu-item"
          onClick={() => {
            addTask({
              title: '新任务',
              position_x: canvasX,
              position_y: canvasY,
            });
            hideContextMenu();
          }}
        >
          ➕ 新建任务
        </div>
        <div
          className="context-menu-item"
          onClick={() => {
            addMilestone({
              title: '新里程碑',
              position_x: canvasX,
              position_y: canvasY,
            });
            hideContextMenu();
          }}
        >
          🏁 新建里程碑
        </div>
      </div>
    );
  }

  // 在节点上右键
  return (
    <div ref={menuRef} className="context-menu" style={{ left: x, top: y }}>
      <div
        className="context-menu-item"
        onClick={() => {
          selectNode(nodeId, nodeType || 'task');
          hideContextMenu();
        }}
      >
        📝 编辑
      </div>
      {nodeType === 'task' && (
        <>
          <div
            className="context-menu-item"
            onClick={() => {
              addTask({
                title: '新子任务',
                parent_id: nodeId,
                position_x: canvasX + 100,
                position_y: canvasY,
              });
              hideContextMenu();
            }}
          >
            ➕ 新建子任务
          </div>
          <div className="context-menu-divider" />
          <div
            className="context-menu-item context-menu-item--danger"
            onClick={() => {
              if (window.confirm('确定删除此任务及其所有子任务？')) {
                removeTask(nodeId);
              }
              hideContextMenu();
            }}
          >
            🗑️ 删除任务
          </div>
        </>
      )}
    </div>
  );
}
