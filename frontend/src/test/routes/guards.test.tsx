import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProtectedRoute, PublicRoute, UnauthorizedPage } from '@/routes/guards'
import { useAuthStore } from '@/services/auth'

vi.mock('@/services/apiClient', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
    isAuthenticated: vi.fn(() => false),
  },
}))

const adminUser = {
  id: 1,
  username: 'admin',
  email: 'admin@test.com',
  full_name: 'Admin',
  role: 'admin',
  permissions: ['manage_users', 'view_customers'],
}

const salesUser = {
  id: 2,
  username: 'sales',
  email: 'sales@test.com',
  full_name: 'Sales',
  role: 'sales',
  permissions: ['view_customers'],
}

function renderWithRouter(ui: React.ReactElement, { initialPath = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/dashboard" element={<div>Dashboard</div>} />
        <Route path="/unauthorized" element={<div>Unauthorized</div>} />
        {ui}
      </Routes>
    </MemoryRouter>
  )
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false })
  })

  it('redirects to /login when unauthenticated', () => {
    renderWithRouter(
      <Route path="/" element={<ProtectedRoute><div>Protected</div></ProtectedRoute>} />
    )
    expect(screen.getByText('Login Page')).toBeInTheDocument()
    expect(screen.queryByText('Protected')).not.toBeInTheDocument()
  })

  it('renders children when authenticated', () => {
    useAuthStore.setState({ user: adminUser, isAuthenticated: true })
    renderWithRouter(
      <Route path="/" element={<ProtectedRoute><div>Protected</div></ProtectedRoute>} />
    )
    expect(screen.getByText('Protected')).toBeInTheDocument()
  })

  it('redirects to /unauthorized when missing required permission', () => {
    useAuthStore.setState({ user: salesUser, isAuthenticated: true })
    renderWithRouter(
      <Route
        path="/"
        element={
          <ProtectedRoute requiredPermissions={['manage_users']}>
            <div>Admin Only</div>
          </ProtectedRoute>
        }
      />
    )
    expect(screen.getByText('Unauthorized')).toBeInTheDocument()
    expect(screen.queryByText('Admin Only')).not.toBeInTheDocument()
  })

  it('renders when user has all required permissions', () => {
    useAuthStore.setState({ user: adminUser, isAuthenticated: true })
    renderWithRouter(
      <Route
        path="/"
        element={
          <ProtectedRoute requiredPermissions={['manage_users', 'view_customers']}>
            <div>Admin Panel</div>
          </ProtectedRoute>
        }
      />
    )
    expect(screen.getByText('Admin Panel')).toBeInTheDocument()
  })

  it('redirects when user has only some required permissions', () => {
    useAuthStore.setState({ user: salesUser, isAuthenticated: true })
    renderWithRouter(
      <Route
        path="/"
        element={
          <ProtectedRoute requiredPermissions={['manage_users', 'view_customers']}>
            <div>Needs Both</div>
          </ProtectedRoute>
        }
      />
    )
    expect(screen.getByText('Unauthorized')).toBeInTheDocument()
  })

  it('redirects to /unauthorized when missing required role', () => {
    useAuthStore.setState({ user: salesUser, isAuthenticated: true })
    renderWithRouter(
      <Route
        path="/"
        element={
          <ProtectedRoute requiredRoles={['admin']}>
            <div>Admin Only</div>
          </ProtectedRoute>
        }
      />
    )
    expect(screen.getByText('Unauthorized')).toBeInTheDocument()
  })

  it('renders when user has the required role', () => {
    useAuthStore.setState({ user: adminUser, isAuthenticated: true })
    renderWithRouter(
      <Route
        path="/"
        element={
          <ProtectedRoute requiredRoles={['admin', 'sales']}>
            <div>Admin or Sales</div>
          </ProtectedRoute>
        }
      />
    )
    expect(screen.getByText('Admin or Sales')).toBeInTheDocument()
  })

  it('renders children when no role or permission requirements specified', () => {
    useAuthStore.setState({ user: salesUser, isAuthenticated: true })
    renderWithRouter(
      <Route path="/" element={<ProtectedRoute><div>Open Protected</div></ProtectedRoute>} />
    )
    expect(screen.getByText('Open Protected')).toBeInTheDocument()
  })
})

describe('PublicRoute', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false })
  })

  it('renders children when not authenticated', () => {
    renderWithRouter(
      <Route path="/" element={<PublicRoute><div>Public Content</div></PublicRoute>} />
    )
    expect(screen.getByText('Public Content')).toBeInTheDocument()
  })

  it('renders children even when authenticated and not restricted', () => {
    useAuthStore.setState({ user: adminUser, isAuthenticated: true })
    renderWithRouter(
      <Route
        path="/"
        element={<PublicRoute restricted={false}><div>Public Content</div></PublicRoute>}
      />
    )
    expect(screen.getByText('Public Content')).toBeInTheDocument()
  })

  it('redirects authenticated user away from restricted route', () => {
    useAuthStore.setState({ user: adminUser, isAuthenticated: true })
    renderWithRouter(
      <Route
        path="/"
        element={<PublicRoute restricted><div>Login</div></PublicRoute>}
      />
    )
    // Should redirect to /dashboard (default)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.queryByText('Login')).not.toBeInTheDocument()
  })
})

describe('UnauthorizedPage', () => {
  it('renders 403 heading', () => {
    render(
      <MemoryRouter>
        <UnauthorizedPage />
      </MemoryRouter>
    )
    expect(screen.getByText('403')).toBeInTheDocument()
  })

  it('renders permission denied message', () => {
    render(
      <MemoryRouter>
        <UnauthorizedPage />
      </MemoryRouter>
    )
    expect(screen.getByText(/permission/i)).toBeInTheDocument()
  })

  it('has a link back to dashboard', () => {
    render(
      <MemoryRouter>
        <UnauthorizedPage />
      </MemoryRouter>
    )
    const link = screen.getByRole('link', { name: /dashboard/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/dashboard')
  })
})
