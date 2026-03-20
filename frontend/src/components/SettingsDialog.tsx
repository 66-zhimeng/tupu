/**
 * 通用设置对话框 — Tab 式布局
 * Tab 1: LLM 配置（Provider / API Key / Base URL / Model / 测试）
 * Tab 2: 人员管理（CRUD + 颜色管理）
 */
import { useState, useEffect, useCallback } from 'react';
import {
    Modal, Tabs, Form, Input, Select, Button, Space, Alert, Spin, Slider, Switch,
    message, Popconfirm, Tooltip,
} from 'antd';
import {
    ApiOutlined, CheckCircleOutlined, CloseCircleOutlined,
    SettingOutlined, PlusOutlined, DeleteOutlined, TeamOutlined,
} from '@ant-design/icons';
import {
    getLLMConfig, saveLLMConfig, testLLMConnection,
    type LLMConfig, type LLMConfigCreate, type LLMTestResult,
} from '../services/llmApi';
import {
    fetchMembers, createMember, updateMember, deleteMember,
    type Member,
} from '../services/api';
import { PRESET_COLORS, initFromMembers } from '../utils/assigneeColors';
import './SettingsDialog.css';

interface Props {
    open: boolean;
    onClose: () => void;
}

const PROVIDER_OPTIONS = [
    { value: 'openai', label: 'OpenAI 兼容' },
    { value: 'ollama', label: 'Ollama 本地' },
    { value: 'dify', label: 'Dify 工作流' },
];

const PROVIDER_DEFAULTS: Record<string, { base_url: string; model_name: string }> = {
    openai: { base_url: 'https://api.openai.com/v1', model_name: 'gpt-4o-mini' },
    ollama: { base_url: 'http://localhost:11434', model_name: 'qwen2.5:7b' },
    dify: { base_url: 'https://api.dify.ai', model_name: 'workflow' },
};

/* ===== 人员管理子组件 ===== */
function MemberManagementTab() {
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(false);
    const [newName, setNewName] = useState('');
    const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
    const [adding, setAdding] = useState(false);
    // 编辑中的成员颜色（id → color）
    const [editingColor, setEditingColor] = useState<Record<string, string>>({});

    const loadMembers = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchMembers();
            setMembers(data);
            initFromMembers(data);
        } catch {
            message.error('加载人员列表失败');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadMembers(); }, [loadMembers]);

    const handleAdd = async () => {
        const name = newName.trim();
        if (!name) { message.warning('请输入成员名称'); return; }
        setAdding(true);
        try {
            await createMember({ name, color: newColor });
            setNewName('');
            setNewColor(PRESET_COLORS[(members.length + 1) % PRESET_COLORS.length]);
            await loadMembers();
            message.success(`已添加成员「${name}」`);
        } catch (err: any) {
            message.error(err?.response?.data?.detail || '添加失败');
        } finally {
            setAdding(false);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        try {
            await deleteMember(id);
            await loadMembers();
            message.success(`已删除成员「${name}」`);
        } catch {
            message.error('删除失败');
        }
    };

    const handleColorChange = async (id: string, color: string) => {
        setEditingColor(prev => ({ ...prev, [id]: color }));
        try {
            await updateMember(id, { color });
            await loadMembers();
        } catch {
            message.error('更新颜色失败');
        }
    };

    return (
        <Spin spinning={loading}>
            <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
                    管理团队成员及其专属颜色。颜色用于图谱节点和饼图着色。
                </div>

                {/* 添加新成员 */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    <Input
                        placeholder="输入成员名称"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onPressEnter={handleAdd}
                        style={{ flex: 1 }}
                    />
                    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                        {PRESET_COLORS.slice(0, 6).map(c => (
                            <Tooltip key={c} title={c}>
                                <div
                                    onClick={() => setNewColor(c)}
                                    style={{
                                        width: 20, height: 20, borderRadius: '50%',
                                        background: c, cursor: 'pointer',
                                        border: newColor === c ? '2px solid #09090B' : '2px solid transparent',
                                        transition: 'border 0.15s',
                                    }}
                                />
                            </Tooltip>
                        ))}
                    </div>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={handleAdd}
                        loading={adding}
                    >
                        添加
                    </Button>
                </div>

                {/* 成员列表 */}
                {members.length === 0 && !loading ? (
                    <div style={{ textAlign: 'center', color: '#999', padding: '20px 0' }}>
                        暂无成员，请先添加
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {members.map(m => (
                            <div
                                key={m.id}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '8px 12px', borderRadius: 8,
                                    background: '#FAFAFA', border: '1px solid #F0F0F0',
                                    transition: 'background 0.15s',
                                }}
                            >
                                {/* 颜色圆点 */}
                                <div
                                    style={{
                                        width: 28, height: 28, borderRadius: '50%',
                                        background: editingColor[m.id] || m.color,
                                        flexShrink: 0,
                                        boxShadow: `0 2px 6px ${(editingColor[m.id] || m.color)}40`,
                                    }}
                                />
                                {/* 名称 */}
                                <span style={{ flex: 1, fontWeight: 500, fontSize: 14 }}>
                                    {m.name}
                                </span>
                                {/* 颜色调色板 */}
                                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                                    {PRESET_COLORS.map(c => (
                                        <Tooltip key={c} title={c}>
                                            <div
                                                onClick={() => handleColorChange(m.id, c)}
                                                style={{
                                                    width: 16, height: 16, borderRadius: '50%',
                                                    background: c, cursor: 'pointer',
                                                    border: (editingColor[m.id] || m.color) === c
                                                        ? '2px solid #09090B' : '1px solid #E4E4E7',
                                                    transition: 'border 0.15s',
                                                }}
                                            />
                                        </Tooltip>
                                    ))}
                                </div>
                                {/* 删除 */}
                                <Popconfirm
                                    title={`确定删除「${m.name}」？`}
                                    onConfirm={() => handleDelete(m.id, m.name)}
                                    okText="删除"
                                    cancelText="取消"
                                    okButtonProps={{ danger: true }}
                                >
                                    <Button
                                        type="text"
                                        size="small"
                                        danger
                                        icon={<DeleteOutlined />}
                                    />
                                </Popconfirm>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Spin>
    );
}

/* ===== 主组件 ===== */
export default function SettingsDialog({ open, onClose }: Props) {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<LLMTestResult | null>(null);
    const [currentConfig, setCurrentConfig] = useState<LLMConfig | null>(null);

    // 加载当前配置
    useEffect(() => {
        if (open) {
            setLoading(true);
            setTestResult(null);
            getLLMConfig()
                .then(config => {
                    setCurrentConfig(config);
                    if (config) {
                        form.setFieldsValue({
                            provider: config.provider,
                            api_key: '',
                            base_url: config.base_url,
                            model_name: config.model_name,
                            temperature: config.temperature ?? 0.7,
                            enable_thinking: config.enable_thinking ?? false,
                        });
                    } else {
                        form.setFieldsValue({
                            provider: 'openai',
                            api_key: '',
                            base_url: PROVIDER_DEFAULTS.openai.base_url,
                            model_name: PROVIDER_DEFAULTS.openai.model_name,
                            temperature: 0.7,
                            enable_thinking: false,
                        });
                    }
                })
                .catch(() => { })
                .finally(() => setLoading(false));
        }
    }, [open, form]);

    // Provider 切换时更新默认值
    const onProviderChange = (provider: string) => {
        const defaults = PROVIDER_DEFAULTS[provider];
        if (defaults) {
            form.setFieldsValue({
                base_url: defaults.base_url,
                model_name: defaults.model_name,
            });
        }
        setTestResult(null);
    };

    // 保存
    const handleSave = async () => {
        try {
            const values = await form.validateFields();
            setSaving(true);
            const payload: LLMConfigCreate = {
                provider: values.provider,
                base_url: values.base_url,
                model_name: values.model_name,
                temperature: values.temperature ?? 0.7,
                enable_thinking: values.enable_thinking ?? false,
            };
            // 只有填写了新 key 才传，否则保留旧 key
            if (values.api_key) {
                payload.api_key = values.api_key;
            } else if (currentConfig?.api_key_masked) {
                // 如果没有新 key 但有旧 key，保留旧配置
                // 由于 API 不支持保留旧 key，需要用户重新输入
            }
            if (values.api_key) payload.api_key = values.api_key;

            const saved = await saveLLMConfig(payload);
            setCurrentConfig(saved);
            setTestResult(null);
        } catch {
            // form validation error
        } finally {
            setSaving(false);
        }
    };

    // 测试连接
    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const result = await testLLMConnection();
            setTestResult(result);
        } catch (err: any) {
            setTestResult({
                success: false,
                message: err?.response?.data?.detail || '连接失败',
            });
        } finally {
            setTesting(false);
        }
    };

    const llmTab = (
        <Spin spinning={loading}>
            <Form form={form} layout="vertical" size="middle">
                <Form.Item
                    name="provider" label="接口类型"
                    rules={[{ required: true }]}
                >
                    <Select
                        options={PROVIDER_OPTIONS}
                        onChange={onProviderChange}
                    />
                </Form.Item>

                <Form.Item name="base_url" label="API 地址" rules={[{ required: true }]}>
                    <Input placeholder="https://api.openai.com/v1" />
                </Form.Item>

                <Form.Item
                    name="api_key"
                    label={
                        <Space>
                            API Key
                            {currentConfig?.api_key_masked && (
                                <span style={{ fontSize: 11, color: '#999' }}>
                                    当前: {currentConfig.api_key_masked}
                                </span>
                            )}
                        </Space>
                    }
                >
                    <Input.Password placeholder="留空则使用已保存的 Key" />
                </Form.Item>

                <Form.Item name="model_name" label="模型名称" rules={[{ required: true }]}>
                    <Input placeholder="gpt-4o-mini" />
                </Form.Item>

                <Form.Item name="temperature" label="温度 (Temperature)">
                    <Slider min={0} max={2} step={0.1} marks={{ 0: '0', 0.7: '0.7', 1: '1', 2: '2' }} />
                </Form.Item>

                <Form.Item name="enable_thinking" label="思考模式 (Thinking)" valuePropName="checked">
                    <Switch checkedChildren="开" unCheckedChildren="关" />
                </Form.Item>

                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Button
                        type="primary"
                        onClick={handleSave}
                        loading={saving}
                        icon={<SettingOutlined />}
                    >
                        保存配置
                    </Button>

                    <Button
                        onClick={handleTest}
                        loading={testing}
                        icon={<ApiOutlined />}
                    >
                        测试连接
                    </Button>
                </Space>

                {testResult && (
                    <Alert
                        style={{ marginTop: 12 }}
                        type={testResult.success ? 'success' : 'error'}
                        showIcon
                        icon={testResult.success ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                        message={testResult.message}
                        description={testResult.response_time_ms
                            ? `响应时间: ${testResult.response_time_ms}ms`
                            : undefined
                        }
                    />
                )}
            </Form>
        </Spin>
    );

    return (
        <Modal
            title="设置"
            open={open}
            onCancel={onClose}
            footer={null}
            width={600}
            destroyOnClose
            className="settings-dialog"
        >
            <Tabs
                items={[
                    {
                        key: 'llm',
                        label: '🤖 AI 模型',
                        children: llmTab,
                    },
                    {
                        key: 'members',
                        label: (
                            <span><TeamOutlined style={{ marginRight: 4 }} />人员管理</span>
                        ),
                        children: <MemberManagementTab />,
                    },
                ]}
            />
        </Modal>
    );
}
