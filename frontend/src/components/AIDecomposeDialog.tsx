/**
 * AI 任务拆解对话框
 * 输入描述 → AI 返回任务树预览 → 确认后批量创建
 */
import { useState } from 'react';
import {
    Modal, Input, Button, Space, Tree, InputNumber,
    Spin, Alert, Typography, Tag, message,
} from 'antd';
import {
    RobotOutlined, ThunderboltOutlined,
    CheckOutlined, EditOutlined,
} from '@ant-design/icons';
import {
    decomposeTask, confirmDecompose,
    type DecomposeTaskNode, type AIDecomposeResponse,
} from '../services/llmApi';
import { useGraphStore } from '../stores/graphStore';
import './AIDecomposeDialog.css';

const { TextArea } = Input;
const { Text } = Typography;

interface Props {
    open: boolean;
    onClose: () => void;
    parentTaskId?: string | null;
    parentTaskTitle?: string;
}

/** 将拆解结果转为 Ant Design Tree 数据 */
function toTreeData(nodes: DecomposeTaskNode[], prefix = '0'): any[] {
    return nodes.map((node, idx) => {
        const key = `${prefix}-${idx}`;
        return {
            key,
            title: (
                <span className="decompose-tree-title">
                    <strong>{node.title}</strong>
                    {node.estimated_hours != null && (
                        <Tag color="blue" style={{ marginLeft: 6, fontSize: 11 }}>
                            {node.estimated_hours}h
                        </Tag>
                    )}
                    {node.dependencies.length > 0 && (
                        <Tag color="orange" style={{ fontSize: 11 }}>
                            依赖 {node.dependencies.map(d => `#${d + 1}`).join(', ')}
                        </Tag>
                    )}
                    {node.description && (
                        <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                            {node.description.slice(0, 60)}
                        </Text>
                    )}
                </span>
            ),
            children: node.children.length > 0 ? toTreeData(node.children, key) : undefined,
        };
    });
}

export default function AIDecomposeDialog({
    open, onClose, parentTaskId, parentTaskTitle,
}: Props) {
    const [description, setDescription] = useState('');
    const [depth, setDepth] = useState(2);
    const [loading, setLoading] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [result, setResult] = useState<AIDecomposeResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { loadGraphData } = useGraphStore();

    const handleDecompose = async () => {
        if (!description.trim()) {
            message.warning('请输入任务描述');
            return;
        }
        setLoading(true);
        setError(null);
        setResult(null);
        try {
            const res = await decomposeTask({
                description: description.trim(),
                parent_task_id: parentTaskId || undefined,
                depth,
                context: parentTaskTitle ? `父任务: ${parentTaskTitle}` : undefined,
            });
            setResult(res);
        } catch (err: any) {
            setError(err?.response?.data?.detail || 'AI 拆解失败，请检查 LLM 配置');
        } finally {
            setLoading(false);
        }
    };

    const handleConfirm = async () => {
        if (!result?.tasks?.length) return;
        setConfirming(true);
        try {
            const res = await confirmDecompose(parentTaskId || null, result.tasks);
            message.success(res.message);
            await loadGraphData();
            onClose();
            setResult(null);
            setDescription('');
        } catch (err: any) {
            message.error(err?.response?.data?.detail || '创建失败');
        } finally {
            setConfirming(false);
        }
    };

    const handleClose = () => {
        setResult(null);
        setError(null);
        onClose();
    };

    // 计算任务总数
    const countTasks = (nodes: DecomposeTaskNode[]): number => {
        return nodes.reduce((sum, n) => sum + 1 + countTasks(n.children), 0);
    };

    return (
        <Modal
            title={
                <Space>
                    <RobotOutlined />
                    <span>AI 任务拆解</span>
                    {parentTaskTitle && (
                        <Tag color="processing">{parentTaskTitle}</Tag>
                    )}
                </Space>
            }
            open={open}
            onCancel={handleClose}
            footer={null}
            width={640}
            destroyOnClose
            className="ai-decompose-dialog"
        >
            {/* 输入区 */}
            <div className="decompose-input-section">
                <TextArea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="描述你想要实现的功能或任务，AI 会自动拆解为可执行的子任务..."
                    rows={3}
                    maxLength={2000}
                    showCount
                    disabled={loading}
                />
                <Space style={{ marginTop: 10 }}>
                    <span style={{ fontSize: 13, color: '#666' }}>拆解层数:</span>
                    <InputNumber
                        min={1} max={4} value={depth}
                        onChange={v => setDepth(v || 2)}
                        size="small"
                        disabled={loading}
                    />
                    <Button
                        type="primary"
                        icon={<ThunderboltOutlined />}
                        onClick={handleDecompose}
                        loading={loading}
                    >
                        {loading ? 'AI 分析中...' : '开始拆解'}
                    </Button>
                </Space>
            </div>

            {/* 错误提示 */}
            {error && (
                <Alert
                    type="error"
                    message={error}
                    closable
                    onClose={() => setError(null)}
                    style={{ marginTop: 12 }}
                />
            )}

            {/* 加载中 */}
            {loading && (
                <div style={{ textAlign: 'center', padding: '30px 0' }}>
                    <Spin size="large" tip="AI 正在分析任务并生成拆解方案..." />
                </div>
            )}

            {/* 预览结果 */}
            {result && result.tasks.length > 0 && (
                <div className="decompose-preview">
                    <div className="decompose-preview-header">
                        <Space>
                            <EditOutlined />
                            <span>拆解预览</span>
                            <Tag color="green">{countTasks(result.tasks)} 个任务</Tag>
                        </Space>
                    </div>

                    <Tree
                        treeData={toTreeData(result.tasks)}
                        defaultExpandAll
                        selectable={false}
                        className="decompose-tree"
                    />

                    <div className="decompose-actions">
                        <Button onClick={handleClose}>取消</Button>
                        <Button
                            type="primary"
                            icon={<CheckOutlined />}
                            onClick={handleConfirm}
                            loading={confirming}
                        >
                            确认创建
                        </Button>
                    </div>
                </div>
            )}
        </Modal>
    );
}
