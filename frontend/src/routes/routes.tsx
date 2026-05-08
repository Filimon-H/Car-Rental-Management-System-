import { lazy, Suspense } from 'react'
import { RouteObject } from 'react-router-dom'

// Lazy load pages for code splitting
const LoginPage = lazy(() => import('@/pages/LoginPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))

// Loading fallback
const PageLoader = () => (
  <div className="flex h-screen items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
)

// Wrap lazy components with Suspense
const withSuspense = (Component: React.LazyExoticComponent<() => JSX.Element>) => (
  <Suspense fallback={<PageLoader />}>
    <Component />
  </Suspense>
)

export const publicRoutes: RouteObject[] = [
  {
    path: '/login',
    element: withSuspense(LoginPage),
  },
]

export const protectedRoutes: RouteObject[] = [
  {
    path: '/dashboard',
    element: withSuspense(DashboardPage),
  },
  // More routes will be added as pages are implemented
]

const routes: RouteObject[] = [...publicRoutes, ...protectedRoutes]
export default routes
