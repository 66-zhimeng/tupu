/**
 * 任务/里程碑详情抽屉面板
 * - 任务：编辑信息、关联里程碑、批量创建子任务
 * - 里程碑：编辑标题描述、查看关联任务
 */
import { useEffect, useState } from 'react';
import {
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Button,
  DatePicker,
  Space,
  Tag,
  Divider,
  message,
} from 'antd';
import { useGraphStore } from '../stores/graphStore';
import { updateMilestone } from '../services/api';
import type { GraphNode, GraphMilestone } from '../services/api';
import dayjs from 'dayjs';

const { TextArea } = Input;

export default function TaskDrawer() {
  const {
    drawerVisible,
    clearSelection,
    getSelectedNode,
    editTask,
    removeTask,
    addChildrenBatch,
    selectedNodeType,
    selectedNodeId,
    graphData,
    loadGraphData,
  } = useGraphStore();

  const [form] = Form.useForm();
  const [msForm] = Form.useForm();
  const [batchText, setBatchText] = useState('');
  const [loading, setLoading] = useState(false);

  const nodeData = getSelectedNode();

  // 填充表单
  useEffect(() => {
    if (!nodeData) return;

    if (selectedNodeType === 'task') {
      const task = nodeData as GraphNode;
      form.setFieldsValue({
        title: task.title,
        description: task.description,
        assignee: task.assignee,
        estimated_hours: task.estimated_hours,
        status: task.status,
        milestone_id: task.milestone_id || undefined,
        start_date: task.start_date ? dayjs(task.start_date) : null,
        due_date: task.due_date ? dayjs(task.due_date) : null,
      });
    } else if (selectedNodeType === 'milestone') {
      const ms = nodeData as GraphMilestone;
      msForm.setFieldsValue({
        title: ms.title,
        description: ms.description,
      });
    }
  }, [nodeData, selectedNodeType, form, msForm]);

  // 保存任务
  const handleSaveTask = async () => {
    if (!selectedNodeId || selectedNodeType !== 'task') return;
    const task = nodeData as GraphNode;
    if (!task) return;

    setLoading(true);
    try {
      const values = await form.validateFields();
      await editTask(selectedNodeId, {
        title: values.title,
        description: values.description,
        assignee: values.assignee,
        estimated_hours: values.estimated_hours,
        status: values.status,
        milestone_id: values.milestone_id || null,
        start_date: values.start_date?.format('YYYY-MM-DD'),
        due_date: values.due_date?.format('YYYY-MM-DD'),
        version: task.version,
      });
      message.success('保存成功');
    } catch (err: any) {
      if (err?.response?.status === 409) {
        message.error('数据已被修改，请刷新后重试');
      } else {
        message.error('保存失败');
      }
    } finally {
      setLoading(false);
    }
  };

  // 保存里程碑
  const handleSaveMilestone = async () => {
    if (!selectedNodeId || selectedNodeType !== 'milestone') {
      console.error('handleSaveMilestone: invalid state', { selectedNodeId, selectedNodeType });
      message.error('未选中里程碑');
      return;
    }
    setLoading(true);
    try {
      const values = msForm.getFieldsValue();
      console.log('saving milestone:', selectedNodeId, values);
      if (!values.title) {
        message.warning('标题不能为空');
        setLoading(false);
        return;
      }
      await updateMilestone(selectedNodeId, {
        title: values.title,
        description: values.description || '',
      });
      await loadGraphData();
      message.success('里程碑已保存');
    } catch (err: any) {
      console.error('milestone save error:', err);
      message.error(`保存失败: ${err?.response?.data?.detail || err.message || '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  // 批量创建子任务
  const handleBatchCreate = async () => {
    if (!selectedNodeId || !batchText.trim()) return;
    const titles = batchText.split('\n').map(s => s.trim()).filter(Boolean);
    if (titles.length === 0) return;

    setLoading(true);
    try {
      await addChildrenBatch(selectedNodeId, titles);
      message.success(`成功创建 ${titles.length} 个子任务`);
      setBatchText('');
    } catch {
      message.error('批量创建失败');
    } finally {
      setLoading(false);
    }
  };

  // 当前节点的依赖关系
  const taskDeps = graphData?.edges.filter(
    e => e.source === selectedNodeId || e.target === selectedNodeId,
  ) || [];

  // 当前节点的子任务数
  const childCount = graphData?.nodes.filter(n => n.parent_id === selectedNodeId).length || 0;

  // 关联到此里程碑的任务
  const milestoneTasks = selectedNodeType === 'milestone'
    ? graphData?.nodes.filter(n => n.milestone_id === selectedNodeId) || []
    : [];

  return (
    <Drawer
      title={
        <Space>
          {selectedNodeType === 'milestone' ? '🏁' : '📋'}
          {nodeData ? (nodeData as any).title : '详情'}
        </Space>
      }
      open={drawerVisible}
      onClose={clearSelection}
      width={400}
      styles={{ body: { paddingTop: 12 } }}
    >
      {/* ========== 任务编辑 ========== */}
      {nodeData && selectedNodeType === 'task' && (
        <>
          {/* 汇总标签 */}
          <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Tag color="blue">
              工时: {(nodeData as GraphNode).computed_hours?.toFixed(1) || 0}h
            </Tag>
            <Tag color="green">
              进度: {(nodeData as GraphNode).computed_progress?.toFixed(1) || 0}%
            </Tag>
            {childCount > 0 && (
              <Tag color="purple">{childCount} 个子任务</Tag>
            )}
            {(nodeData as GraphNode).is_leaf && (
              <Tag color="orange">叶子节点</Tag>
            )}
          </div>

          {!((nodeData as GraphNode).is_leaf) && childCount > 0 && (
            <div style={{ marginBottom: 12, padding: '8px 12px', background: '#F6F8FA', borderRadius: 6, fontSize: 12, color: '#666' }}>
              💡 工时 = 所有子任务工时之和 ({(nodeData as GraphNode).computed_hours?.toFixed(1)}h)
              <br />
              💡 进度 = 已完成子任务工时占比 ({(nodeData as GraphNode).computed_progress?.toFixed(1)}%)
            </div>
          )}

          <Form form={form} layout="vertical" size="small">
            <Form.Item name="title" label="标题" rules={[{ required: true }]}>
              <Input />
            </Form.Item>

            <Form.Item name="description" label="描述">
              <TextArea rows={3} />
            </Form.Item>

            <Form.Item name="assignee" label="负责人">
              <Input placeholder="输入负责人名称" />
            </Form.Item>

            <Form.Item name="status" label="状态">
              <Select>
                <Select.Option value="未完成">未完成</Select.Option>
                <Select.Option value="已完成">已完成</Select.Option>
                <Select.Option value="已取消">已取消</Select.Option>
              </Select>
            </Form.Item>

            {/* 里程碑关联 */}
            <Form.Item name="milestone_id" label="所属里程碑">
              <Select allowClear placeholder="选择里程碑">
                {graphData?.milestones.map(ms => (
                  <Select.Option key={ms.id} value={ms.id}>
                    ◆ {ms.title}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            {(nodeData as GraphNode).is_leaf && (
              <Form.Item name="estimated_hours" label="预估工时（小时）">
                <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
              </Form.Item>
            )}

            <Space>
              <Form.Item name="start_date" label="开始日期">
                <DatePicker />
              </Form.Item>
              <Form.Item name="due_date" label="截止日期">
                <DatePicker />
              </Form.Item>
            </Space>

            <Form.Item>
              <Button type="primary" onClick={handleSaveTask} loading={loading} block>
                保存修改
              </Button>
            </Form.Item>
          </Form>

          {/* 依赖关系 */}
          {taskDeps.length > 0 && (
            <>
              <Divider>依赖关系</Divider>
              {taskDeps.map(dep => {
                const isSource = dep.source === selectedNodeId;
                const other = graphData?.nodes.find(
                  n => n.id === (isSource ? dep.target : dep.source),
                );
                return (
                  <div key={dep.id} style={{ marginBottom: 6, fontSize: 13 }}>
                    {isSource ? '→ 依赖' : '← 被依赖'}{' '}
                    <Tag>{other?.title || '未知'}</Tag>
                    {dep.is_iterative && (
                      <Tag color="orange">迭代×{dep.iteration_count}</Tag>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {/* 批量创建子任务 */}
          <Divider>快速添加子任务</Divider>
          <TextArea
            rows={4}
            placeholder="每行一个子任务标题"
            value={batchText}
            onChange={e => setBatchText(e.target.value)}
          />
          <Button
            style={{ marginTop: 8 }}
            onClick={handleBatchCreate}
            loading={loading}
            block
            disabled={!batchText.trim()}
          >
            批量创建
          </Button>

          <Divider />
          <Button
            danger
            block
            onClick={() => {
              if (window.confirm('确定删除此任务及其所有子任务？')) {
                removeTask(selectedNodeId!);
              }
            }}
          >
            删除任务
          </Button>
        </>
      )}

      {/* ========== 里程碑编辑 ========== */}
      {nodeData && selectedNodeType === 'milestone' && (
        <>
          <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
            <Tag color="blue">
              总工时: {(nodeData as GraphMilestone).computed_hours?.toFixed(1) || 0}h
            </Tag>
            <Tag color="green">
              总进度: {(nodeData as GraphMilestone).computed_progress?.toFixed(1) || 0}%
            </Tag>
            <Tag color="purple">{milestoneTasks.length} 个关联任务</Tag>
          </div>

          <Form form={msForm} layout="vertical" size="small">
            <Form.Item name="title" label="标题" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="description" label="描述">
              <TextArea rows={3} />
            </Form.Item>
            <Form.Item>
              <Button type="primary" onClick={handleSaveMilestone} loading={loading} block>
                保存里程碑
              </Button>
            </Form.Item>
          </Form>

          {/* 关联任务列表 */}
          {milestoneTasks.length > 0 && (
            <>
              <Divider>关联的任务</Divider>
              {milestoneTasks.map(t => (
                <div key={t.id} style={{ marginBottom: 6, fontSize: 13 }}>
                  <Tag color={
                    t.status === '已完成' ? 'green' :
                    t.status === '已取消' ? 'default' : 'blue'
                  }>
                    {t.status}
                  </Tag>
                  {t.title}
                  {t.computed_hours > 0 && (
                    <span style={{ color: '#999', marginLeft: 4 }}>
                      ({t.computed_hours.toFixed(1)}h)
                    </span>
                  )}
                </div>
              ))}
            </>
          )}

          <Divider />
          <div style={{ fontSize: 12, color: '#999' }}>
            💡 在任务编辑面板中选择「所属里程碑」可将任务关联到此里程碑
          </div>
        </>
      )}
    </Drawer>
  );
}
