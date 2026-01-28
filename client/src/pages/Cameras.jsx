/**
 * Cameras section — Section component misoli (Cards + form).
 * Barcha elementlar to‘liq render, lazy emas.
 */
import { useState } from 'react';

export default function Cameras() {
  const [name, setName] = useState('');
  const [ip, setIp] = useState('');

  const cameras = [
    { id: 1, name: 'Asosiy kirish', ip: '192.168.0.59', status: 'online' },
    { id: 2, name: 'Orqa hovli', ip: '192.168.0.60', status: 'offline' },
  ];

  return (
    <div className="page">
      <header className="page-header">
        <h1>Cameras</h1>
        <p className="page-breadcrumb">Admin / Cameras</p>
      </header>

      <div className="page-body">
        {/* Cards */}
        <div className="card-grid">
          {cameras.map((c) => (
            <div key={c.id} className="card card-camera">
              <div className="card-camera-header">
                <span className="card-camera-name">{c.name}</span>
                <span className={`badge badge-${c.status}`}>{c.status}</span>
              </div>
              <p className="card-camera-ip">{c.ip}</p>
              <div className="card-actions">
                <button className="btn btn-sm">Sozlash</button>
                <button className="btn btn-sm btn-delete">O‘chirish</button>
              </div>
            </div>
          ))}
        </div>

        {/* Form — yangi kamera */}
        <div className="section-card">
          <h3>Yangi kamera qo‘shish</h3>
          <form
            className="section-form"
            onSubmit={(e) => e.preventDefault()}
          >
            <input
              type="text"
              placeholder="Kamera nomi"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="form-input"
            />
            <input
              type="text"
              placeholder="IP manzil"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              className="form-input"
            />
            <button type="submit" className="btn btn-success">
              Saqlash
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
