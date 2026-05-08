import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Pencil, Plus, Search, UserCheck, UserX } from 'lucide-react'
import {
  CreateUserData,
  ResetPasswordData,
  StaffUser,
  UpdateUserData,
  UserRole,
  usersService,
} from '@/services/users'

const ROLES: UserRole[] = ['admin', 'sales', 'fleet', 'inspector', 'accountant']

const roleColors: Record<UserRole, string> = {
  admin: 'bg-red-100 text-red-700',
  sales: 'bg-blue-100 text-blue-700',
  fleet: 'bg-amber-100 text-amber-700',
  inspector: 'bg-purple-100 text-purple-700',
  accountant: 'bg-green-100 text-green-700',
}

// ---------------------------------------------------------------------------
// Create / Edit modal
// ---------------------------------------------------------------------------

interface UserFormModalProps {
  mode: 'create' | 'edit'
  user?: StaffUser
  onClose: () => void
  onSave: (data: CreateUserData | UpdateUserData) => void
  saving: boolean
  error?: string
}

function UserFormModal({ mode, user, onClose, onSave, saving, error }: UserFormModalProps) {
  const [form, setForm] = useState({
    username: user?.username ?? '',
    email: user?.email ?? '',
    full_name: user?.full_name ?? '',
    role: (user?.role ?? 'sales') as UserRole,
    password: '',
    is_active: user?.is_active ?? true,
  })

  const handle = (field: string, value: string | boolean) =>
    setForm((f) => ({ ...f, [field]: value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === 'create') {
      onSave({
        username: form.username,
        email: form.email,
        full_name: form.full_name,
        role: form.role,
        password: form.password,
      } as CreateUserData)
    } else {
      const patch: UpdateUserData = {}
      if (form.email !== user?.email) patch.email = form.email
      if (form.full_name !== user?.full_name) patch.full_name = form.full_name
      if (form.role !== user?.role) patch.role = form.role
      if (form.is_active !== user?.is_active) patch.is_active = form.is_active
      onSave(patch)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {mode === 'create' ? 'Create Staff User' : 'Edit Staff User'}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {mode === 'create' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Username</label>
              <input
                required
                minLength={3}
                maxLength={50}
                value={form.username}
                onChange={(e) => handle('username', e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Full Name</label>
            <input
              required
              maxLength={100}
              value={form.full_name}
              onChange={(e) => handle('full_name', e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => handle('email', e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          {mode === 'create' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
              <input
                required
                type="password"
                minLength={8}
                value={form.password}
                onChange={(e) => handle('password', e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Role</label>
            <select
              value={form.role}
              onChange={(e) => handle('role', e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
          </div>
          {mode === 'edit' && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => handle('is_active', e.target.checked)}
                className="rounded border-slate-300"
              />
              Active account
            </label>
          )}
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reset password modal
// ---------------------------------------------------------------------------

interface ResetPasswordModalProps {
  user: StaffUser
  onClose: () => void
  onSave: (data: ResetPasswordData) => void
  saving: boolean
  error?: string
}

function ResetPasswordModal({ user, onClose, onSave, saving, error }: ResetPasswordModalProps) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) return
    onSave({ new_password: password })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Reset Password</h2>
          <p className="text-sm text-slate-500">{user.full_name}</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">New Password</label>
            <input
              required
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Confirm Password</label>
            <input
              required
              type="password"
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            {confirm && password !== confirm && (
              <p className="mt-1 text-xs text-red-500">Passwords do not match</p>
            )}
          </div>
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || password !== confirm}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Reset Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function UsersPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null)
  const [resetUser, setResetUser] = useState<StaffUser | null>(null)
  const [formError, setFormError] = useState<string | undefined>()
  const [resetError, setResetError] = useState<string | undefined>()

  const { data, isLoading } = useQuery({
    queryKey: ['users', page, search],
    queryFn: () => usersService.list({ page, page_size: 20, search: search || undefined }),
  })

  const createMutation = useMutation({
    mutationFn: (d: CreateUserData) => usersService.create(d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setFormMode(null)
      setFormError(undefined)
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { detail?: string } } }
      setFormError(e?.response?.data?.detail || 'Failed to create user')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateUserData }) =>
      usersService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setFormMode(null)
      setEditingUser(null)
      setFormError(undefined)
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { detail?: string } } }
      setFormError(e?.response?.data?.detail || 'Failed to update user')
    },
  })

  const resetMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: ResetPasswordData }) =>
      usersService.resetPassword(id, data),
    onSuccess: () => {
      setResetUser(null)
      setResetError(undefined)
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { detail?: string } } }
      setResetError(e?.response?.data?.detail || 'Failed to reset password')
    },
  })

  const handleSave = (data: CreateUserData | UpdateUserData) => {
    setFormError(undefined)
    if (formMode === 'create') {
      createMutation.mutate(data as CreateUserData)
    } else if (editingUser) {
      updateMutation.mutate({ id: editingUser.id, data: data as UpdateUserData })
    }
  }

  const handleResetSave = (data: ResetPasswordData) => {
    if (resetUser) {
      setResetError(undefined)
      resetMutation.mutate({ id: resetUser.id, data })
    }
  }

  const totalPages = data ? Math.ceil(data.total / data.page_size) : 1

  return (
    <div className="p-6 page-fade">
      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search users…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="w-64 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <button
          onClick={() => {
            setEditingUser(null)
            setFormError(undefined)
            setFormMode('create')
          }}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New User
        </button>
      </div>

      {/* Table */}
      <div className="app-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last Login</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && !data?.items.length && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No users found
                  </td>
                </tr>
              )}
              {data?.items.map((user) => (
                <tr key={user.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium text-slate-900">{user.full_name}</td>
                  <td className="px-4 py-3 text-slate-600">@{user.username}</td>
                  <td className="px-4 py-3 text-slate-600">{user.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${roleColors[user.role]}`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {user.is_active ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
                        <UserCheck className="h-3.5 w-3.5" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
                        <UserX className="h-3.5 w-3.5" />
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {user.last_login_at
                      ? new Date(user.last_login_at).toLocaleDateString()
                      : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => {
                          setEditingUser(user)
                          setFormError(undefined)
                          setFormMode('edit')
                        }}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        title="Edit user"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setResetUser(user)
                          setResetError(undefined)
                        }}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-amber-600"
                        title="Reset password"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
            <span>
              {data?.total} users · page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {formMode && (
        <UserFormModal
          mode={formMode}
          user={editingUser ?? undefined}
          onClose={() => {
            setFormMode(null)
            setEditingUser(null)
            setFormError(undefined)
          }}
          onSave={handleSave}
          saving={createMutation.isPending || updateMutation.isPending}
          error={formError}
        />
      )}
      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => {
            setResetUser(null)
            setResetError(undefined)
          }}
          onSave={handleResetSave}
          saving={resetMutation.isPending}
          error={resetError}
        />
      )}
    </div>
  )
}
