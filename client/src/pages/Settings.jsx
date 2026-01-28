/**
 * Settings section — to‘liq render, toza sahifa.
 */
export default function Settings() {
  return (
    <div className="page">
      <header className="page-header">
        <h1>Settings</h1>
        <p className="page-breadcrumb">Admin / Settings</p>
      </header>
      <div className="page-body">
        <div className="section-card">
          <h3>Sozlamalar</h3>
          <p className="section-desc">Tizim parametrlari, til, vaqt va hokazo.</p>
          <form className="section-form" onSubmit={(e) => e.preventDefault()}>
            <label>
              <span>Til</span>
              <select className="form-input">
                <option>O‘zbek</option>
                <option>Русский</option>
                <option>English</option>
              </select>
            </label>
            <button type="submit" className="btn btn-primary">
              Saqlash
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
