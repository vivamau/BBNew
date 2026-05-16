import { NavLink, Routes, Route, Navigate } from 'react-router-dom';
import SimulationPage from './pages/SimulationPage.tsx';
import WalletPage from './pages/WalletPage.tsx';
import MembersPage from './pages/MembersPage.tsx';

export default function App() {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>BBNew</h1>
          <p>Cross-member dedup portal</p>
        </div>
        <nav className="sidebar-nav">
          <NavLink
            to="/simulation"
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            ◎ Simulation
          </NavLink>
          <NavLink
            to="/wallets"
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            ◈ Wallets
          </NavLink>
          <NavLink
            to="/members"
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            ⬡ Members
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          WFP Building Blocks<br />
          Gap Prototype — RFC 9497 VOPRF
        </div>
      </aside>
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/simulation" replace />} />
          <Route path="/simulation" element={<SimulationPage />} />
          <Route path="/wallets" element={<WalletPage />} />
          <Route path="/members" element={<MembersPage />} />
        </Routes>
      </main>
    </div>
  );
}
