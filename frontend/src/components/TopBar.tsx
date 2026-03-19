/**
 * 顶部工具栏 — MiroFish 风格
 * 简约白底 + Monospace 品牌标识 + 居中工具组 + 状态指示器
 */
import { useState, useEffect, useCallback } from 'react';
import { Button, Space, Typography, Tooltip, Divider, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import {
  ReloadOutlined,
  PlusOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  ExpandOutlined,
  ApiOutlined,
  FlagOutlined,
  SettingOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { useGraphStore } from '../stores/graphStore';
import { LAYOUT_OPTIONS } from '../utils/layoutEngine';
import SettingsDialog from './SettingsDialog';
import AIDecomposeDialog from './AIDecomposeDialog';
import './TopBar.css';

const { Text } = Typography;

export default function TopBar() {
  const {
    loadGraphData,
    loading,
    addTask,
    addMilestone,
    graphData,
    enableConnect,
    toggleConnect,
    zoomIn,
    zoomOut,
    fitView,
  } = useGraphStore();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [decomposeOpen, setDecomposeOpen] = useState(false);
  const [decomposeParent, setDecomposeParent] = useState<{
    id?: string; title?: string;
  }>({});

  // 监听 ContextMenu 发出的 AI 拆解事件
  const handleAIDecompose = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail || {};
    setDecomposeParent({
      id: detail.parentTaskId,
      title: detail.parentTaskTitle,
    });
    setDecomposeOpen(true);
  }, []);

  useEffect(() => {
    window.addEventListener('open-ai-decompose', handleAIDecompose);
    return () => window.removeEventListener('open-ai-decompose', handleAIDecompose);
  }, [handleAIDecompose]);

  const nodeCount = graphData?.nodes.length || 0;
  const milestoneCount = graphData?.milestones.length || 0;
  const totalHours = graphData?.nodes
    .filter(n => !n.parent_id)
    .reduce((s, n) => s + (n.computed_hours || 0), 0) || 0;

  // 布局菜单
  const layoutMenuItems: MenuProps['items'] = [
    ...LAYOUT_OPTIONS.map(opt => ({
      key: opt.key,
      label: `${opt.icon} ${opt.label}`,
      onClick: () => window.dispatchEvent(new CustomEvent('apply-layout', { detail: { layout: opt.key, label: opt.label } })),
    })),
    { type: 'divider' as const },
    {
      key: 'export',
      label: '📤 导出布局',
      onClick: () => window.dispatchEvent(new CustomEvent('export-layout')),
    },
    {
      key: 'import',
      label: '📥 导入布局',
      onClick: () => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.json';
        input.onchange = (e: any) => {
          const file = e.target?.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            window.dispatchEvent(new CustomEvent('import-layout', { detail: { json: reader.result as string } }));
          };
          reader.readAsText(file);
        };
        input.click();
      },
    },
  ];

  return (
    <div className="top-bar">
      {/* 左侧：品牌标识 + 统计 */}
      <div className="top-bar-left">
        <div className="top-bar-brand">
          <span className="brand-icon">◈</span>
          <Text className="brand-title">Graph Studio</Text>
        </div>
        <div className="top-bar-stats">
          <span className="stat-item">
            <span className="stat-dot" style={{ background: 'var(--color-primary)' }} />
            <span className="stat-value">{nodeCount}</span> 任务
          </span>
          <span className="stat-item">
            <span className="stat-dot" style={{ background: 'var(--color-info)' }} />
            <span className="stat-value">{milestoneCount}</span> 里程碑
          </span>
          {totalHours > 0 && (
            <span className="stat-item">
              <span className="stat-dot" style={{ background: 'var(--color-success)' }} />
              <span className="stat-value">{totalHours.toFixed(0)}</span>人天
            </span>
          )}
        </div>
      </div>

      {/* 中间：核心操作 */}
      <div className="top-bar-center">
        <Space.Compact className="toolbar-group">
          <Tooltip title="新建任务">
            <Button
              icon={<PlusOutlined />}
              onClick={() => addTask({ title: '新任务' })}
              className="toolbar-btn"
            />
          </Tooltip>
          <Tooltip title="新建里程碑">
            <Button
              icon={<FlagOutlined />}
              onClick={() => addMilestone({ title: '新里程碑' })}
              className="toolbar-btn"
            />
          </Tooltip>
        </Space.Compact>

        <Divider type="vertical" className="toolbar-divider" />

        <Tooltip title={enableConnect ? '关闭连线模式' : '开启连线模式 — 从节点拖出创建依赖'}>
          <Button
            icon={<ApiOutlined />}
            onClick={toggleConnect}
            className={`toolbar-btn connect-btn ${enableConnect ? 'active' : ''}`}
            type={enableConnect ? 'primary' : 'default'}
          >
            连线
          </Button>
        </Tooltip>

        <Divider type="vertical" className="toolbar-divider" />

        <Space.Compact className="toolbar-group">
          <Tooltip title="放大">
            <Button icon={<ZoomInOutlined />} onClick={zoomIn} className="toolbar-btn" />
          </Tooltip>
          <Tooltip title="缩小">
            <Button icon={<ZoomOutOutlined />} onClick={zoomOut} className="toolbar-btn" />
          </Tooltip>
          <Tooltip title="适应画布">
            <Button icon={<ExpandOutlined />} onClick={fitView} className="toolbar-btn" />
          </Tooltip>
        </Space.Compact>

        <Divider type="vertical" className="toolbar-divider" />

        <Dropdown menu={{ items: layoutMenuItems }} trigger={['click']}>
          <Button className="toolbar-btn">📐 布局</Button>
        </Dropdown>
      </div>

      {/* 右侧：AI + 设置 + 状态 + 刷新 */}
      <div className="top-bar-right">
        <Tooltip title="AI 任务拆解">
          <Button
            icon={<RobotOutlined />}
            onClick={() => { setDecomposeParent({}); setDecomposeOpen(true); }}
            className="toolbar-btn ai-btn"
          />
        </Tooltip>
        <Tooltip title="设置">
          <Button
            icon={<SettingOutlined />}
            onClick={() => setSettingsOpen(true)}
            className="toolbar-btn"
          />
        </Tooltip>
        <div className="top-bar-separator" />
        <div className={`status-indicator ${loading ? 'loading' : ''}`}>
          <span className="status-dot" />
          <span>{loading ? '加载中' : '就绪'}</span>
        </div>
        <Tooltip title="刷新数据">
          <Button
            icon={<ReloadOutlined />}
            onClick={loadGraphData}
            loading={loading}
            className="toolbar-btn"
          />
        </Tooltip>
      </div>

      {/* 对话框 */}
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <AIDecomposeDialog
        open={decomposeOpen}
        onClose={() => setDecomposeOpen(false)}
        parentTaskId={decomposeParent.id}
        parentTaskTitle={decomposeParent.title}
      />
    </div>
  );
}
