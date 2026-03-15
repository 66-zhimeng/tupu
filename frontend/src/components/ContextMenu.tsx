/**
 * 右键菜单组件 — 升级版
 * 毛玻璃背景 + Ant Design 图标
 */
import { useEffect, useRef } from 'react';
import { Modal, message } from 'antd';
import {
  EditOutlined,
  PlusOutlined,
  DeleteOutlined,
  FlagOutlined,
  ZoomInOutlined,
} from '@ant-design/icons';
import { useGraphStore } from '../stores/graphStore';
import { deleteMilestone } from '../services/api';
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
    graphData,
    loadGraphData,
  } = useGraphStore();

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

  const hasChildren = nodeId && nodeType === 'task' && graphData
    ? graphData.nodes.some(n => n.parent_id === nodeId)
    : false;

  // 空白区域右键
  if (!nodeId) {
    return (
      <div ref={menuRef} className="ctx-menu glass" style={{ left: x, top: y }}>
        <div className="ctx-menu-group-label">创建</div>
        <div
          className="ctx-menu-item"
          onClick={() => {
            addTask({ title: '新任务', position_x: canvasX, position_y: canvasY });
            hideContextMenu();
          }}
        >
          <PlusOutlined className="ctx-icon" />
          <span>新建任务</span>
        </div>
        <div
          className="ctx-menu-item"
          onClick={() => {
            addMilestone({ title: '新里程碑', position_x: canvasX, position_y: canvasY });
            hideContextMenu();
          }}
        >
          <FlagOutlined className="ctx-icon" />
          <span>新建里程碑</span>
        </div>
      </div>
    );
  }

  // 节点上右键
  return (
    <div ref={menuRef} className="ctx-menu glass" style={{ left: x, top: y }}>
      <div
        className="ctx-menu-item"
        onClick={() => {
          selectNode(nodeId, nodeType || 'task');
          hideContextMenu();
        }}
      >
        <EditOutlined className="ctx-icon" />
        <span>编辑</span>
      </div>

      {nodeType === 'task' && (
        <>
          <div
            className="ctx-menu-item"
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
            <PlusOutlined className="ctx-icon" />
            <span>新建子任务</span>
          </div>

          {hasChildren && (
            <div
              className="ctx-menu-item"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('drillInto', { detail: nodeId }));
                hideContextMenu();
              }}
            >
              <ZoomInOutlined className="ctx-icon" />
              <span>进入子任务</span>
            </div>
          )}

          <div className="ctx-menu-divider" />
          <div
            className="ctx-menu-item ctx-menu-item--danger"
            onClick={() => {
              Modal.confirm({
                title: '确定删除此任务？',
                content: '将同时删除所有子任务，此操作不可撤回。',
                okText: '删除',
                okType: 'danger',
                cancelText: '取消',
                onOk: async () => {
                  await removeTask(nodeId);
                  message.success('任务已删除');
                },
              });
              hideContextMenu();
            }}
          >
            <DeleteOutlined className="ctx-icon" />
            <span>删除任务</span>
          </div>
        </>
      )}

      {nodeType === 'milestone' && (
        <>
          <div className="ctx-menu-divider" />
          <div
            className="ctx-menu-item ctx-menu-item--danger"
            onClick={async () => {
              if (window.confirm('确定删除此里程碑？')) {
                try {
                  await deleteMilestone(nodeId);
                  await loadGraphData();
                } catch {
                  // ignore
                }
              }
              hideContextMenu();
            }}
          >
            <DeleteOutlined className="ctx-icon" />
            <span>删除里程碑</span>
          </div>
        </>
      )}
    </div>
  );
}
