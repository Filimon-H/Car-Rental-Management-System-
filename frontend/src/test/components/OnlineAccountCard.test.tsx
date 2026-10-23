/**
 * The customer page's online-account card.
 *
 * Customers entered at the counter could never sign in on the website. Staff
 * can now send them a one-time invite link from here.
 *
 * i18n is loaded explicitly so strings render in English rather than as keys.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import '@/i18n'
import { OnlineAccountCard } from '@/components/customers/OnlineAccountCard'
import { useAuthStore } from '@/services/auth'
import { customersService } from '@/services/customers'

function renderCard(role: string) {
  useAuthStore.setState({
    user: { id: 1, username: 'u', full_name: 'U', email: 'u@x', role, is_active: true },
    isAuthenticated: true,
  } as never)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <OnlineAccountCard customerId={7} />
    </QueryClientProvider>
  )
}

const NONE = { has_account: false, email: null, telegram_linked: false, invite_expires_at: null }

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('OnlineAccountCard', () => {
  it('shows how a customer with an account signs in', async () => {
    vi.spyOn(customersService, 'getOnlineAccount').mockResolvedValue({
      has_account: true, email: 'almaz@example.com', telegram_linked: true, invite_expires_at: null,
    })
    renderCard('sales')
    expect(await screen.findByText('almaz@example.com')).toBeInTheDocument()
    expect(screen.getByText('Telegram bot linked')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /invite link/ })).toBeNull()
  })

  it('creates an invite and offers the link and a message to send', async () => {
    vi.spyOn(customersService, 'getOnlineAccount').mockResolvedValue(NONE)
    const create = vi.spyOn(customersService, 'createOnlineAccountInvite').mockResolvedValue({
      url: 'https://nod.example/claim/abc', expires_at: '2026-10-24T10:00:00Z',
      message: 'Hi Almaz! Set up your account: https://nod.example/claim/abc',
    })
    renderCard('sales')

    fireEvent.click(await screen.findByRole('button', { name: 'Create invite link' }))
    expect(await screen.findByText('https://nod.example/claim/abc')).toBeInTheDocument()
    expect(screen.getByText(/Hi Almaz! Set up your account/)).toBeInTheDocument()
    expect(create).toHaveBeenCalledWith(7)
    expect(screen.getByRole('button', { name: 'Create a new invite link' })).toBeInTheDocument()
  })

  it('says when an invite is already out', async () => {
    vi.spyOn(customersService, 'getOnlineAccount').mockResolvedValue({
      ...NONE, invite_expires_at: '2026-10-24T10:00:00Z',
    })
    renderCard('admin')
    expect(await screen.findByText(/An invite was sent and works until/)).toBeInTheDocument()
  })

  it('does not offer invites to a role the server will refuse', async () => {
    // MANAGE_CUSTOMERS is admin and sales only.
    vi.spyOn(customersService, 'getOnlineAccount').mockResolvedValue(NONE)
    renderCard('fleet')
    await screen.findByText(/cannot sign in on the website yet/)
    expect(screen.queryByRole('button', { name: 'Create invite link' })).toBeNull()
  })
})
