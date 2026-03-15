/**
 * 任务/里程碑详情抽屉面板 — 升级版
 * 卡片式汇总信息 + 依赖管理 + 批量创建
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
  Progress,
} from 'antd';
import {
  SaveOutlined,
  DeleteOutlined,
  PlusOutlined,
  ArrowRightOutlined,
  ArrowLeftOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
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
    removeDependency,
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

  const handleSaveMilestone = async () => {
    if (!selectedNodeId || selectedNodeType !== 'milestone') {
      message.error('未选中里程碑');
      return;
    }
    setLoading(true);
    try {
      const values = msForm.getFieldsValue();
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
      message.error(`保存失败: ${err?.response?.data?.detail || err.message || '未知错误'}`);
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

  const taskDeps = graphData?.edges.filter(
    e => e.source === selectedNodeId || e.target === selectedNodeId,
  ) || [];

  const childCount = graphData?.nodes.filter(n => n.parent_id === selectedNodeId).length || 0;

  const milestoneTasks = selectedNodeType === 'milestone'
    ? graphData?.nodes.filter(n => n.milestone_id === selectedNodeId) || []
    : [];

  return (
    <Drawer
      title={null}
      open={drawerVisible}
      onClose={clearSelection}
      width={420}
      styles={{
        body: { padding: 0 },
        header: { display: 'none' },
      }}
    >
      {/* ========== 任务编辑 ========== */}
      {nodeData && selectedNodeType === 'task' && (() => {
        const task = nodeData as GraphNode;
        return (
          <div className="drawer-content">
            {/* 顶部卡片区 */}
            <div style={{
              padding: '20px 20px 16px',
              background: 'linear-gradient(135deg, #F8FAFC 0%, #EEF2FF 100%)',
              borderBottom: '1px solid var(--color-border-light)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 18 }}>📋</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#1E293B' }}>
                  {task.title}
                </span>
              </div>

              {/* 进度 + 工时 + 状态 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
                <Progress
                  type="circle"
                  percent={Math.round(task.computed_progress || 0)}
                  size={52}
                  strokeColor="#3B82F6"
                  trailColor="#E2E8F0"
                  strokeWidth={8}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                    <Tag color="blue" icon={<ClockCircleOutlined />}>
                      {task.computed_hours?.toFixed(1) || 0}人天
                    </Tag>
                    {childCount > 0 && <Tag color="purple">{childCount} 子任务</Tag>}
                    {task.is_leaf && <Tag color="orange">叶子节点</Tag>}
                  </div>
                  <Tag color={
                    task.status === '已完成' ? 'green' :
                    task.status === '已取消' ? 'default' : 'processing'
                  }>
                    {task.status}
                  </Tag>
                </div>
              </div>

              {!task.is_leaf && childCount > 0 && (
                <div style={{
                  padding: '6px 10px',
                  background: 'rgba(59, 130, 246, 0.06)',
                  borderRadius: 8,
                  fontSize: 11,
                  color: '#64748B',
                }}>
                  工时 = 子任务之和 ({task.computed_hours?.toFixed(1)}人天)  ·  进度 = 已完成占比 ({task.computed_progress?.toFixed(1)}%)
                </div>
              )}
            </div>

            {/* 表单区 */}
            <div style={{ padding: '16px 20px' }}>
              <Form form={form} layout="vertical" size="small" requiredMark={false}>
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
                <Form.Item name="milestone_id" label="所属里程碑">
                  <Select allowClear placeholder="选择里程碑">
                    {graphData?.milestones.map(ms => (
                      <Select.Option key={ms.id} value={ms.id}>
                        ◆ {ms.title}
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
                {task.is_leaf && (
                  <Form.Item name="estimated_hours" label="预估工时（人天）">
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
                  <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    onClick={handleSaveTask}
                    loading={loading}
                    block
                    style={{ borderRadius: 8, height: 36 }}
                  >
                    保存修改
                  </Button>
                </Form.Item>
              </Form>

              {/* 依赖关系 */}
              {taskDeps.length > 0 && (
                <>
                  <Divider style={{ fontSize: 13 }}>依赖关系</Divider>
                  {taskDeps.map(dep => {
                    const isSource = dep.source === selectedNodeId;
                    const other = graphData?.nodes.find(
                      n => n.id === (isSource ? dep.target : dep.source),
                    );
                    return (
                      <div key={dep.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 8,
                        padding: '6px 10px',
                        background: '#F8FAFC',
                        borderRadius: 8,
                        fontSize: 13,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {isSource
                            ? <ArrowRightOutlined style={{ color: '#3B82F6' }} />
                            : <ArrowLeftOutlined style={{ color: '#10B981' }} />}
                          <span>{isSource ? '依赖' : '被依赖'}</span>
                          <Tag>{other?.title || '未知'}</Tag>
                          {dep.is_iterative && (
                            <Tag color="orange">迭代×{dep.iteration_count}</Tag>
                          )}
                        </div>
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => removeDependency(dep.id)}
                        />
                      </div>
                    );
                  })}
                </>
              )}

              {/* 批量创建子任务 */}
              <Divider style={{ fontSize: 13 }}>快速添加子任务</Divider>
              <TextArea
                rows={4}
                placeholder="每行一个子任务标题"
                value={batchText}
                onChange={e => setBatchText(e.target.value)}
              />
              <Button
                icon={<PlusOutlined />}
                style={{ marginTop: 8, borderRadius: 8 }}
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
                icon={<DeleteOutlined />}
                style={{ borderRadius: 8 }}
                onClick={() => {
                  if (window.confirm('确定删除此任务及其所有子任务？')) {
                    removeTask(selectedNodeId!);
                  }
                }}
              >
                删除任务
              </Button>
            </div>
          </div>
        );
      })()}

      {/* ========== 里程碑编辑 ========== */}
      {nodeData && selectedNodeType === 'milestone' && (() => {
        const ms = nodeData as GraphMilestone;
        return (
          <div className="drawer-content">
            <div style={{
              padding: '20px 20px 16px',
              background: 'linear-gradient(135deg, #F8FAFC 0%, #FEF3C7 100%)',
              borderBottom: '1px solid var(--color-border-light)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 18 }}>🏁</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#1E293B' }}>
                  {ms.title}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <Progress
                  type="circle"
                  percent={Math.round(ms.computed_progress || 0)}
                  size={52}
                  strokeColor="#F59E0B"
                  trailColor="#E2E8F0"
                  strokeWidth={8}
                />
                <div>
                  <Tag color="blue">{ms.computed_hours?.toFixed(1) || 0}人天 总工时</Tag>
                  <Tag color="purple">{milestoneTasks.length} 个关联任务</Tag>
                </div>
              </div>
            </div>

            <div style={{ padding: '16px 20px' }}>
              <Form form={msForm} layout="vertical" size="small" requiredMark={false}>
                <Form.Item name="title" label="标题" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="description" label="描述">
                  <TextArea rows={3} />
                </Form.Item>
                <Form.Item>
                  <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    onClick={handleSaveMilestone}
                    loading={loading}
                    block
                    style={{ borderRadius: 8, height: 36 }}
                  >
                    保存里程碑
                  </Button>
                </Form.Item>
              </Form>

              {milestoneTasks.length > 0 && (
                <>
                  <Divider style={{ fontSize: 13 }}>关联的任务</Divider>
                  {milestoneTasks.map(t => (
                    <div key={t.id} style={{
                      marginBottom: 6,
                      padding: '6px 10px',
                      background: '#F8FAFC',
                      borderRadius: 8,
                      fontSize: 13,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}>
                      <Tag color={
                        t.status === '已完成' ? 'green' :
                        t.status === '已取消' ? 'default' : 'blue'
                      } style={{ margin: 0 }}>
                        {t.status}
                      </Tag>
                      <span>{t.title}</span>
                      {t.computed_hours > 0 && (
                        <span style={{ color: '#94A3B8', fontSize: 12 }}>
                          {t.computed_hours.toFixed(1)}人天
                        </span>
                      )}
                    </div>
                  ))}
                </>
              )}

              <Divider />
              <div style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center' }}>
                在任务编辑面板中选择「所属里程碑」可将任务关联到此里程碑
              </div>
            </div>
          </div>
        );
      })()}
    </Drawer>
  );
}
