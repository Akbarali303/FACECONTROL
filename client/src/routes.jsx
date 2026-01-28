/**
 * Route konfiguratsiyasi
 * Har bir section uchun alohida route. Almashganda sahifa tozalanib,
 * faqat yangi route kontenti chiqadi (to‘liq render, lazy emas).
 */
import { createBrowserRouter, Navigate } from 'react-router-dom';
import MainLayout from './components/MainLayout';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Cameras from './pages/Cameras';
import Logs from './pages/Logs';
import Settings from './pages/Settings';

export const ROUTES = {
  DASHBOARD: '/dashboard',
  USERS: '/users',
  CAMERAS: '/cameras',
  LOGS: '/logs',
  SETTINGS: '/settings',
};

export const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <Navigate to={ROUTES.DASHBOARD} replace /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'users', element: <Users /> },
      { path: 'cameras', element: <Cameras /> },
      { path: 'logs', element: <Logs /> },
      { path: 'settings', element: <Settings /> },
    ],
  },
  { path: '*', element: <Navigate to={ROUTES.DASHBOARD} replace /> },
]);
