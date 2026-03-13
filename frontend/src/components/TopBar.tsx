/**
 * 顶部工具栏
 */
import { Button, Space, Typography } from 'antd';
import { ReloadOutlined, PlusOutlined } from '@ant-design/icons';
import { useGraphStore } from '../stores/graphStore';
import './TopBar.css';

const { Title } = Typography;

export default function TopBar() {
  const { loadGraphData, loading, addTask, addMilestone, graphData } = useGraphStore();

  return (
    <div className="top-bar">
      <div className="top-bar-left">
        <Title level={4} style={{ margin: 0, color: '#fff' }}>
          📊 研发流程管理系统
        </Title>
        {graphData && (
          <span className="top-bar-stats">
            {graphData.nodes.length} 个任务 · {graphData.milestones.length} 个里程碑 · {graphData.edges.length} 条依赖
          </span>
        )}
      </div>
      <div className="top-bar-right">
        <Space>
          <Button
            icon={<PlusOutlined />}
            onClick={() => addTask({ title: '新任务' })}
            size="small"
          >
            新建任务
          </Button>
          <Button
            onClick={() => addMilestone({ title: '新里程碑' })}
            size="small"
          >
            🏁 新建里程碑
          </Button>
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
