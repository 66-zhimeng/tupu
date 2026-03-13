/**
 * 任务/里程碑详情抽屉面板
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
import type { GraphNode, GraphMilestone, TaskStatus } from '../services/api';
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
  } = useGraphStore();

  const [form] = Form.useForm();
  const [batchText, setBatchText] = useState('');
  const [loading, setLoading] = useState(false);

  const nodeData = getSelectedNode();

  // 当选中节点变化时，填充表单
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
        start_date: task.start_date ? dayjs(task.start_date) : null,
        due_date: task.due_date ? dayjs(task.due_date) : null,
      });
    } else {
      const ms = nodeData as GraphMilestone;
      form.setFieldsValue({
        title: ms.title,
        description: ms.description,
      });
    }
  }, [nodeData, selectedNodeType, form]);

  const handleSave = async () => {
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

  // 依赖关系列表
  const taskDeps = graphData?.edges.filter(
    e => e.source === selectedNodeId || e.target === selectedNodeId,
  ) || [];

  return (
    <Drawer
      title={
        <Space>
          {selectedNodeType === 'milestone' ? '🏁' : '📋'}
          {nodeData
            ? (nodeData as any).title
            : '详情'}
        </Space>
      }
      open={drawerVisible}
      onClose={clearSelection}
      width={400}
      styles={{ body: { paddingTop: 12 } }}
    >
      {nodeData && selectedNodeType === 'task' && (
        <>
          {/* 汇总信息 */}
          <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
            <Tag color="blue">
              工时: {(nodeData as GraphNode).computed_hours?.toFixed(1) || 0}h
            </Tag>
            <Tag color="green">
              进度: {(nodeData as GraphNode).computed_progress?.toFixed(1) || 0}%
            </Tag>
            <Tag color={
              (nodeData as GraphNode).is_leaf ? 'orange' : 'purple'
            }>
              {(nodeData as GraphNode).is_leaf ? '叶子节点' : '父节点'}
            </Tag>
          </div>

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
              <Button type="primary" onClick={handleSave} loading={loading} block>
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
                const otherNode = graphData?.nodes.find(
                  n => n.id === (isSource ? dep.target : dep.source),
                );
                return (
                  <div key={dep.id} style={{ marginBottom: 6, fontSize: 13 }}>
                    {isSource ? '→' : '←'}{' '}
                    <Tag>{otherNode?.title || '未知'}</Tag>
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

          {/* 删除按钮 */}
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

      {nodeData && selectedNodeType === 'milestone' && (
        <Form form={form} layout="vertical" size="small">
          <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
            <Tag color="blue">
              总工时: {(nodeData as GraphMilestone).computed_hours?.toFixed(1) || 0}h
            </Tag>
            <Tag color="green">
              总进度: {(nodeData as GraphMilestone).computed_progress?.toFixed(1) || 0}%
            </Tag>
          </div>

          <Form.Item name="title" label="标题" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <TextArea rows={3} />
          </Form.Item>
        </Form>
      )}
    </Drawer>
  );
}
