/**
 * The sign-in error says what actually went wrong.
 *
 * Its title was always "Incorrect username or password": with the server
 * down, staff were told their password was wrong.
 *
 * i18n is loaded explicitly so strings render in English rather than as keys.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import '@/i18n'
import LoginPage from '@/pages/LoginPage'
import { useAuthStore } from '@/services/auth'

async function signInFailingWith(err: unknown) {
  useAuthStore.setState({ login: () => Promise.reject(err) } as never)
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  )
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'admin' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-pass' } })
  fireEvent.submit(screen.getByLabelText('Username').closest('form')!)
}

describe('LoginPage failure title', () => {
  it('blames the credentials only on a 401', async () => {
    await signInFailingWith({ response: { status: 401, data: { detail: 'Invalid username or password' } } })
    expect(await screen.findByText('Incorrect username or password')).toBeInTheDocument()
  })

  it('says the server is unreachable when there was no response', async () => {
    await signInFailingWith({ message: 'Network Error' })
    expect(await screen.findByText("Can't reach the server")).toBeInTheDocument()
    expect(screen.queryByText('Incorrect username or password')).not.toBeInTheDocument()
  })

  it('says so when sign-in is rate limited', async () => {
    await signInFailingWith({ response: { status: 429, data: { detail: 'Rate limit exceeded' } } })
    expect(await screen.findByText('Too many sign-in attempts')).toBeInTheDocument()
  })

  it('calls a server error a failed sign-in', async () => {
    await signInFailingWith({ response: { status: 500, data: { detail: 'Internal server error' } } })
    expect(await screen.findByText('Sign-in failed')).toBeInTheDocument()
  })
})
