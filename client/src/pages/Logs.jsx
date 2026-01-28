/**
 * Logs section — to‘liq render, toza sahifa.
 */
export default function Logs() {
  const logs = [
    { id: 1, time: '2026-01-28 10:00', user: 'Ali Valiyev', action: 'Kirish', detail: 'Asosiy eshik' },
    { id: 2, time: '2026-01-28 09:55', user: 'Sardor Nodirov', action: 'Chiqish', detail: '-' },
  ];

  return (
    <div className="page">
      <header className="page-header">
        <h1>Logs</h1>
        <p className="page-breadcrumb">Admin / Logs</p>
      </header>
      <div className="page-body">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Vaqt</th>
                <th>Foydalanuvchi</th>
                <th>Amal</th>
                <th>Tafsilot</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td>{l.time}</td>
                  <td>{l.user}</td>
                  <td>{l.action}</td>
                  <td>{l.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
