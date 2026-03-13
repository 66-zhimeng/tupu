/**
 * 顶部工具栏 - 显示层级信息 + 工时汇总 + 操作按钮
 */
import { Button, Space, Typography, Tooltip } from 'antd';
import { ReloadOutlined, PlusOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useGraphStore } from '../stores/graphStore';
import './TopBar.css';

const { Title } = Typography;

export default function TopBar() {
  const {
    loadGraphData,
    loading,
    addTask,
    addMilestone,
    graphData,
    currentParentId,
    breadcrumbs,
    goUp,
    getCurrentLevelNodes,
  } = useGraphStore();

  const levelNodes = getCurrentLevelNodes();
  const isTopLevel = currentParentId === null;

  // 当前层级工时汇总
  const totalHours = levelNodes.reduce((sum, n) => sum + (n.computed_hours || 0), 0);
  const avgProgress = levelNodes.length > 0
    ? levelNodes.reduce((sum, n) => sum + (n.computed_progress || 0), 0) / levelNodes.length
    : 0;

  // 当前父任务信息
  const parentTask = !isTopLevel && graphData
    ? graphData.nodes.find(n => n.id === currentParentId)
    : null;

  return (
    <div className="top-bar">
      <div className="top-bar-left">
        {/* 返回上层按钮 */}
        {!isTopLevel && (
          <Tooltip title="返回上一层">
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={goUp}
              style={{ color: '#fff', fontSize: 16 }}
            />
          </Tooltip>
        )}

        <Title level={4} style={{ margin: 0, color: '#fff' }}>
          {isTopLevel ? '📊 研发流程管理系统' : `📂 ${parentTask?.title || '子任务'}`}
        </Title>

        <span className="top-bar-stats">
          {levelNodes.length} 个任务
          {totalHours > 0 && ` · ${totalHours.toFixed(1)}h 工时`}
          {avgProgress > 0 && ` · ${avgProgress.toFixed(0)}% 进度`}
        </span>
      </div>
      <div className="top-bar-right">
        <Space>
          <Tooltip title="在当前层级新建任务">
            <Button
              icon={<PlusOutlined />}
              onClick={() => addTask({ title: '新任务' })}
              size="small"
            >
              新建任务
            </Button>
          </Tooltip>
          {isTopLevel && (
            <Button
              onClick={() => addMilestone({ title: '新里程碑' })}
              size="small"
            >
              🏁 里程碑
            </Button>
          )}
          <Button
            icon={<ReloadOutlined />}
            onClick={loadGraphData}
            loading={loading}
            size="small"
          >
            刷新
          </Button>
        </Space>
      </div>
    </div>
  );
}
