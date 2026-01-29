/**
 * Sidebar component
 * — Har bir section uchun alohida NavLink
 * — Active section ajralib turadi (active class)
 * — Qayta bosilganda sahifa yangilanmaydi (SPA), faqat kontent almashadi
 */
import { NavLink } from 'react-router-dom';
import { ROUTES } from '../routes';

const menuItems = [
  { to: ROUTES.DASHBOARD, label: 'Dashboard', icon: '▦' },
  { to: ROUTES.USERS, label: 'Users', icon: '👥' },
  { to: ROUTES.CAMERAS, label: 'Cameras', icon: '📷' },
  { to: ROUTES.LOGS, label: 'Logs', icon: '📋' },
  { to: ROUTES.SETTINGS, label: 'Settings', icon: '⚙' },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">🛡</div>
        </div>
        <h2 className="sidebar-title">FOREST HR</h2>
        <p className="sidebar-subtitle">Xo'jaliklar aro nazorat tizimi</p>
      </div>

      <div className="sidebar-menu-label">ASOSIY MENYU</div>
      <nav className="sidebar-nav">
        {menuItems.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
            }
            end={to === ROUTES.DASHBOARD}
          >
            <span className="sidebar-link-icon">{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <a href="tel:+998915855533" className="sidebar-phone">
          +998 91 585-55-33
        </a>
        <p className="sidebar-copyright">
          FORESTDIGITAL © 2026.
          <br />
          Designed & Developed By Akbarali
        </p>
      </div>
    </aside>
  );
}
