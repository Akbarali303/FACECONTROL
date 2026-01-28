/**
 * App — RouterProvider orqali route konfiguratsiyasini ulaydi.
 * Barcha navigatsiya React Router orqali, SPA.
 */
import { RouterProvider } from 'react-router-dom';
import { router } from './routes';

export default function App() {
  return <RouterProvider router={router} />;
}
