import { createBrowserRouter } from 'react-router';
import { routes } from '@/app/routes.tsx';

/** Every page is a page-builder document (spec §5.1); the table lives in routes.tsx. */
export const router = createBrowserRouter(routes);
