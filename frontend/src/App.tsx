/**
 * 研发流程管理系统 - 主应用入口
 */
import GraphCanvas from './components/GraphCanvas';
import TaskDrawer from './components/TaskDrawer';
import ContextMenu from './components/ContextMenu';
import TopBar from './components/TopBar';
import SidebarTree from './components/SidebarTree';
import './App.css';

function App() {
  return (
    <div className="app-container">
      <TopBar />
      <div className="app-main">
        <SidebarTree />
        <GraphCanvas />
      </div>
      <TaskDrawer />
      <ContextMenu />
    </div>
  );
}

export default App;
