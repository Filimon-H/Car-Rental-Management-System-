import type { Location } from 'react-router-dom'

/**
 * Where to send a customer once they have signed in or signed up.
 *
 * RequireAuth passes the page they were trying to open as `from`, and the
 * booking page carries the dates they searched in that location's state.
 * Login kept only the pathname, so the dates were lost; signup ignored `from`
 * entirely and went to the home page, losing the car as well; and My Bookings
 * passed a bare string, which login did not read, so it went home too.
 */
export interface ReturnTo {
  pathname: string
  state?: unknown
}

export function returnToFrom(location: Location): ReturnTo | null {
  const from = (location.state as { from?: unknown } | null)?.from
  if (typeof from === 'string') return from.startsWith('/') ? { pathname: from } : null
  if (from && typeof from === 'object' && typeof (from as ReturnTo).pathname === 'string') {
    const { pathname, state } = from as ReturnTo
    // Never bounce back to the auth pages themselves.
    if (pathname === '/login' || pathname === '/signup') return null
    return { pathname, state }
  }
  return null
}

/** navigate() arguments for going back, or to the home page. */
export function returnTarget(location: Location): [string, { replace: true; state?: unknown }] {
  const to = returnToFrom(location)
  return to ? [to.pathname, { replace: true, state: to.state }] : ['/', { replace: true }]
}
