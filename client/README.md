# FOREST HR — React Client (SPA)

React + Vite + React Router. Sidebar + route-based content, toza sahifa, active section.

## Ishga tushirish

```bash
cd client
npm install
npm run dev
```

`http://localhost:5173` — Vite dev server. API `/api` va `/uploads` proxy orqali `http://localhost:3001` ga yuboriladi (backend ishlashi kerak).

## Build

```bash
npm run build
```

`dist/` dan static fayllarni Express yoki boshqa serverga serve qilishingiz mumkin.

## Struktura

- **Sidebar** — `src/components/Sidebar.jsx`
- **Main layout** — `src/components/MainLayout.jsx` (Sidebar + Outlet)
- **Route config** — `src/routes.jsx`
- **Section misollar** — `src/pages/Users.jsx`, `Cameras.jsx`, `Dashboard.jsx`, `Logs.jsx`, `Settings.jsx`

## Route’lar

| Route       | Sahifa   |
|------------|----------|
| `/`        | → `/dashboard` |
| `/dashboard` | Dashboard |
| `/users`   | Users (table, form, button) |
| `/cameras` | Cameras (cards, form) |
| `/logs`    | Logs (table) |
| `/settings`| Settings (form) |

Har bir section bosilganda to‘liq toza sahifa, faqat o‘sha route kontenti. Active section sidebar’da ajralib turadi.
