/**
 * LLM 相关 API 封装
 */
import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:8000',
    timeout: 120000, // LLM 调用可能较慢
});

// ==================== 类型 ====================

export interface LLMConfig {
    id: string;
    provider: string;
    api_key_masked: string;
    base_url: string;
    model_name: string;
    is_active: boolean;
    temperature: number;
    enable_thinking: boolean;
}

export interface LLMConfigCreate {
    provider: string;
    api_key?: string;
    base_url: string;
    model_name: string;
    temperature: number;
    enable_thinking: boolean;
}

export interface DecomposeTaskNode {
    title: string;
    description?: string;
    estimated_hours?: number;
    assignee?: string;
    children: DecomposeTaskNode[];
    dependencies: number[];
}

export interface AIDecomposeRequest {
    description: string;
    parent_task_id?: string;
    depth: number;
    context?: string;
}

export interface AIDecomposeResponse {
    root_title: string;
    tasks: DecomposeTaskNode[];
    raw_response?: string;
}

export interface LLMTestResult {
    success: boolean;
    message: string;
    model?: string;
    response_time_ms?: number;
}

// ==================== API 调用 ====================

/** 获取当前 LLM 配置 */
export async function getLLMConfig(): Promise<LLMConfig | null> {
    const { data } = await api.get('/api/llm/config');
    return data;
}

/** 保存 LLM 配置 */
export async function saveLLMConfig(config: LLMConfigCreate): Promise<LLMConfig> {
    const { data } = await api.post('/api/llm/config', config);
    return data;
}

/** 测试 LLM 连接 */
export async function testLLMConnection(): Promise<LLMTestResult> {
    const { data } = await api.post('/api/llm/test');
    return data;
}

/** AI 任务拆解（返回预览） */
export async function decomposeTask(req: AIDecomposeRequest): Promise<AIDecomposeResponse> {
    const { data } = await api.post('/api/llm/decompose', req);
    return data;
}

/** 确认拆解结果，批量创建任务 */
export async function confirmDecompose(
    parentTaskId: string | null,
    tasks: DecomposeTaskNode[],
): Promise<{ message: string; tasks: any[] }> {
    const { data } = await api.post('/api/llm/decompose/confirm', {
        parent_task_id: parentTaskId,
        tasks,
    });
    return data;
}
