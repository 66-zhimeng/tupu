/**
 * 顶部工具栏
 */
import { Button, Space, Typography, Tooltip } from 'antd';
import { ReloadOutlined, PlusOutlined } from '@ant-design/icons';
import { useGraphStore } from '../stores/graphStore';
import './TopBar.css';

const { Title } = Typography;

export default function TopBar() {
  const { loadGraphData, loading, addTask, addMilestone, graphData } = useGraphStore();

  const nodeCount = graphData?.nodes.length || 0;
  const totalHours = graphData?.nodes
    .filter(n => !n.parent_id) // 只统计顶层
    .reduce((s, n) => s + (n.computed_hours || 0), 0) || 0;

  return (
    <div className="top-bar">
      <div className="top-bar-left">
        <Title level={4} style={{ margin: 0, color: '#fff' }}>
          📊 研发流程管理系统
        </Title>
        <span className="top-bar-stats">
          {nodeCount} 个任务
          {graphData && ` · ${graphData.milestones.length} 个里程碑`}
          {totalHours > 0 && ` · ${totalHours.toFixed(0)}h 总工时`}
        </span>
      </div>
      <div className="top-bar-right">
        <Space>
          <Button icon={<PlusOutlined />} onClick={() => addTask({ title: '新任务' })} size="small">
            新建任务
          </Button>
          <Button onClick={() => addMilestone({ title: '新里程碑' })} size="small">
            🏁 里程碑
          </Button>
          <Button icon={<ReloadOutlined />} onClick={loadGraphData} loading={loading} size="small">
            刷新
          </Button>
        </Space>
      </div>
    </div>
  );
}
