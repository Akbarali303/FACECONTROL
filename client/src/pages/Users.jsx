/**
 * Users section — Section component misoli.
 * Table, card, button, form barchasi to‘liq render, hech narsa yashirin qolmasin.
 */
import { useState } from 'react';

export default function Users() {
  const [query, setQuery] = useState('');

  const users = [
    { id: 1, name: 'Ali Valiyev', email: 'ali@example.com', role: 'Admin' },
    { id: 2, name: 'Sardor Nodirov', email: 'sardor@example.com', role: 'Kadr' },
    { id: 3, name: 'Dilnoza Erkinova', email: 'dilnoza@example.com', role: 'Foydalanuvchi' },
  ];

  return (
    <div className="page">
      <header className="page-header">
        <h1>Users</h1>
        <p className="page-breadcrumb">Admin / Users</p>
      </header>

      <div className="page-body">
        {/* Card */}
        <div className="section-card">
          <h3>Foydalanuvchilar ro‘yxati</h3>
          <p className="section-desc">Barcha elementlar to‘liq render — table, form, tugmalar.</p>
        </div>

        {/* Form: qidiruv */}
        <form
          className="section-form"
          onSubmit={(e) => e.preventDefault()}
        >
          <input
            type="search"
            placeholder="Qidirish..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="form-input"
          />
          <button type="submit" className="btn btn-primary">
            Qidirish
          </button>
          <button type="button" className="btn btn-success">
            + Yangi user
          </button>
        </form>

        {/* Table — to‘liq */}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>№</th>
                <th>Ism</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Amallar</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id}>
                  <td>{i + 1}</td>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td>
                    <button className="btn btn-sm btn-edit">Tahrirlash</button>
                    <button className="btn btn-sm btn-delete">O‘chirish</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
