import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/services/auth'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredPermissions?: string[]
  requiredRoles?: string[]
}

export function ProtectedRoute({
  children,
  requiredPermissions = [],
  requiredRoles = [],
}: ProtectedRouteProps) {
  const location = useLocation()
  const { isAuthenticated, user, hasPermission, hasRole } = useAuthStore()

  // Not authenticated - redirect to login
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Check required permissions
  if (requiredPermissions.length > 0) {
    const hasAllPermissions = requiredPermissions.every((p) => hasPermission(p))
    if (!hasAllPermissions) {
      return <Navigate to="/unauthorized" replace />
    }
  }

  // Check required roles
  if (requiredRoles.length > 0) {
    if (!hasRole(...requiredRoles)) {
      return <Navigate to="/unauthorized" replace />
    }
  }

  return <>{children}</>
}

interface PublicRouteProps {
  children: React.ReactNode
  restricted?: boolean
}

export function PublicRoute({ children, restricted = false }: PublicRouteProps) {
  const { isAuthenticated } = useAuthStore()
  const location = useLocation()

  // If restricted and authenticated, redirect to dashboard
  if (restricted && isAuthenticated) {
    const from = (location.state as { from?: Location })?.from?.pathname || '/dashboard'
    return <Navigate to={from} replace />
  }

  return <>{children}</>
}

export function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-800">403</h1>
        <p className="mt-2 text-gray-600">You don't have permission to access this page.</p>
        <a href="/dashboard" className="mt-4 inline-block text-primary hover:underline">
          Go to Dashboard
        </a>
      </div>
    </div>
  )
}
