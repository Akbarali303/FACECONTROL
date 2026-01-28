/**
 * Main layout: Sidebar + Content
 * — Sidebar o‘zgarmaydi
 * — Faqat main content almashadi (Outlet)
 * — Har bir route to‘liq toza sahifa, oldingi kontent qolmaydi
 */
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import './Sidebar.css';

export default function MainLayout() {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        {/* Har bir route uchun kontent shu yerda to‘liq almashtiradi (clean page) */}
        <div className="section-page">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
