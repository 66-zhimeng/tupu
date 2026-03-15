/**
 * 顶部工具栏 — FlowEditor 风格
 * 毛玻璃背景 + 按钮组（连线模式、缩放控制、刷新）
 */
import { Button, Space, Typography, Tooltip, Divider } from 'antd';
import {
  ReloadOutlined,
  PlusOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  ExpandOutlined,
  ApiOutlined,
  FlagOutlined,
} from '@ant-design/icons';
import { useGraphStore } from '../stores/graphStore';
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

  const nodeCount = graphData?.nodes.length || 0;
  const milestoneCount = graphData?.milestones.length || 0;
  const totalHours = graphData?.nodes
    .filter(n => !n.parent_id)
    .reduce((s, n) => s + (n.computed_hours || 0), 0) || 0;

  return (
    <div className="top-bar glass">
      {/* 左侧：品牌标识 + 统计 */}
      <div className="top-bar-left">
        <div className="top-bar-brand">
          <span className="brand-icon">◈</span>
          <Text strong className="brand-title">Graph Studio</Text>
        </div>
        <div className="top-bar-stats">
          <span className="stat-item">
            <span className="stat-dot" style={{ background: 'var(--color-primary)' }} />
            {nodeCount} 任务
          </span>
          <span className="stat-item">
            <span className="stat-dot" style={{ background: 'var(--color-info)' }} />
            {milestoneCount} 里程碑
          </span>
          {totalHours > 0 && (
            <span className="stat-item">
              <span className="stat-dot" style={{ background: 'var(--color-success)' }} />
              {totalHours.toFixed(0)}人天
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
      </div>

      {/* 右侧：刷新 */}
      <div className="top-bar-right">
        <Tooltip title="刷新数据">
          <Button
            icon={<ReloadOutlined />}
            onClick={loadGraphData}
            loading={loading}
            className="toolbar-btn"
          />
        </Tooltip>
      </div>
    </div>
  );
}
