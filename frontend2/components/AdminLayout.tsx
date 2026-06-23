import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Settings as SettingsIcon, ShieldCheck, LogOut,
  Bell, Menu, X, Search, Activity,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { initials } from '../lib/format';

type NavItem = { path: string; label: string; icon: React.ReactNode; end?: boolean };

export default function AdminLayout({ user }: { user?: any }) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems: NavItem[] = [
    { path: '/dashboard', label: 'Dashboard',         icon: <LayoutDashboard size={18} />, end: true },
    { path: '/users',     label: 'User Management',   icon: <Users size={18} /> },
    { path: '/settings',  label: 'Security & Network', icon: <SettingsIcon size={18} /> },
    { path: '/logs',      label: 'System Logs',       icon: <ShieldCheck size={18} /> },
  ];

  const activePath = (item: NavItem) =>
    item.end ? location.pathname === item.path : location.pathname.startsWith(item.path);

  const pageTitle = (() => {
    const match = navItems.find(n => activePath(n));
    return match?.label ?? 'VANBA Admin';
  })();

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="shell">
      {mobileOpen && <div className="scrim" onClick={() => setMobileOpen(false)} />}

      <aside className={`sidebar${mobileOpen ? ' open' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-mark"><ShieldCheck size={18} color="white" /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sidebar-name">VANBA Admin</div>
            <div className="sidebar-sub">Control center</div>
          </div>
          <button
            className="btn-icon"
            style={{ display: 'none', background: 'transparent', border: '1px solid var(--sidebar-border)', color: 'var(--sidebar-text)' }}
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X size={16} />
          </button>
        </div>

        <div className="sidebar-section">Overview</div>
        <nav className="sidebar-nav">
          {navItems.map(item => {
            const isActive = activePath(item);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-item${isActive ? ' active' : ''}`}
                onClick={() => setMobileOpen(false)}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center' }}>{item.icon}</span>
                <span>{item.label}</span>
                {isActive && <span className="nav-badge">•</span>}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-section">System</div>
        <div className="sidebar-nav">
          <div className="nav-item" style={{ cursor: 'default' }}>
            <span className="pulse-dot" />
            <span>API online</span>
            <span className="nav-badge" style={{ background: 'rgba(16,185,129,0.18)', color: 'var(--success-500)' }}>OK</span>
          </div>
          <div className="nav-item" style={{ cursor: 'default' }}>
            <Activity size={18} />
            <span>Build</span>
            <span className="nav-badge" style={{ background: 'transparent', color: 'var(--sidebar-text-mute)' }}>v2.0</span>
          </div>
        </div>

        <div className="sidebar-foot">
          <div className="avatar">{initials(user?.email ?? 'Admin')}</div>
          <div className="sidebar-user">
            <div className="sidebar-user-name">{user?.email ?? 'Admin'}</div>
            <div className="sidebar-user-mail">Administrator</div>
          </div>
          <button className="btn-icon" title="Sign out" onClick={handleLogout}
            style={{ background: 'transparent', border: '1px solid var(--sidebar-border)', color: 'var(--sidebar-text)' }}>
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <div>
        <div className="topbar">
          <button
            className="btn-icon topbar-menu-btn"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
          <div>
            <div className="topbar-title">{pageTitle}</div>
            <div className="topbar-sub">Manage your VANBA Job Hunter platform</div>
          </div>
          <div className="topbar-spacer" />
          <div className="topbar-actions">
            <div className="pill pill-success" title="All systems operational">
              <span className="dot" /> Operational
            </div>
            <button className="btn-icon" title="Notifications" aria-label="Notifications">
              <Bell size={16} />
            </button>
            <button className="btn-icon" title="Search" aria-label="Search">
              <Search size={16} />
            </button>
          </div>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
