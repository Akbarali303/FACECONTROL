/**
 * Dashboard section — to‘liq render, toza sahifa.
 * Boshqa section kontenti qolmaydi.
 */
import { useLocation } from 'react-router-dom';

export default function Dashboard() {
  const { pathname } = useLocation();

  return (
    <div className="page">
      <header className="page-header">
        <h1>Dashboard</h1>
        <p className="page-breadcrumb">Admin / Dashboard</p>
      </header>
      <div className="page-body">
        <div className="card-grid">
          <div className="card">
            <h3>Umumiy statistika</h3>
            <p className="card-value">0</p>
            <p className="card-label">Jami xodimlar</p>
          </div>
          <div className="card">
            <h3>Vaqtida keldi</h3>
            <p className="card-value">0%</p>
          </div>
          <div className="card">
            <h3>Kechikdi</h3>
            <p className="card-value">0%</p>
          </div>
        </div>
        <p style={{ marginTop: 24, color: '#6b7280' }}>
          Route: <code>{pathname}</code> — toza sahifa, faqat shu section kontenti.
        </p>
      </div>
    </div>
  );
}
