/**
 * 面包屑导航组件 — 层级路径
 * 显示当前钻入路径，可点击任意层级返回
 */
import { HomeOutlined, RightOutlined } from '@ant-design/icons';
import { useGraphStore } from '../stores/graphStore';
import './Breadcrumb.css';

export default function Breadcrumb() {
    const { breadcrumbs, goToLevel, graphData, currentParentId } = useGraphStore();

    // 当前层级的节点数
    const levelNodeCount = graphData
        ? graphData.nodes.filter(n => {
            if (currentParentId === null) return !n.parent_id;
            return n.parent_id === currentParentId;
        }).length
        : 0;

    // 只在顶层且没有内容时隐藏
    if (breadcrumbs.length <= 1 && levelNodeCount === 0) return null;

    return (
        <div className="breadcrumb-bar">
            {breadcrumbs.map((item, index) => {
                const isLast = index === breadcrumbs.length - 1;
                return (
                    <span key={item.id ?? 'root'} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {index > 0 && (
                            <RightOutlined className="breadcrumb-sep" />
                        )}
                        <button
                            className={`breadcrumb-item ${isLast ? 'active' : ''}`}
                            onClick={() => !isLast && goToLevel(index)}
                        >
                            {index === 0 && <HomeOutlined className="breadcrumb-home-icon" />}
                            {item.title}
                        </button>
                    </span>
                );
            })}
            <span className="breadcrumb-count">
                {levelNodeCount} 项
            </span>
        </div>
    );
}
