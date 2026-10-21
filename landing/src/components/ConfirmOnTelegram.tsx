import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Send } from 'lucide-react'
import { contactInfo, telHref } from '../data/cars'
import { accountClaims } from '../services/accountClaims'
import type { AccountClaim } from '../services/auth'

const POLL_MS = 3000

/**
 * Shown when a signup's phone belongs to a customer we already have.
 *
 * That used to be "Phone number already registered" and nothing else, though
 * the person had never had a login. Now they confirm the phone is theirs on
 * Telegram; this page waits, and signs them in when the bot confirms.
 */
export default function ConfirmOnTelegram({
  claim,
  onSignedIn,
  onStartAgain,
}: {
  claim: AccountClaim
  onSignedIn: (token: string) => void
  onStartAgain: () => void
}) {
  const [state, setState] = useState<'pending' | 'linked' | 'expired'>('pending')
  const signedIn = useRef(false)

  useEffect(() => {
    let stopped = false
    async function check() {
      try {
        const result = await accountClaims.status(claim.claim_token)
        if (stopped) return
        setState(result.status)
        if (result.status === 'linked' && result.access_token && !signedIn.current) {
          signedIn.current = true
          onSignedIn(result.access_token)
        }
        if (result.status !== 'pending') stopped = true
      } catch {
        // A dropped request is retried on the next tick.
      }
    }
    const timer = setInterval(() => !stopped && check(), POLL_MS)
    check()
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [claim.claim_token, onSignedIn])

  const phone = contactInfo.phones[0]

  if (state === 'expired') {
    return (
      <div role="alert" className="space-y-4">
        <h2 className="text-xl font-bold text-white">That confirmation has expired</h2>
        <p className="text-gray-400 text-sm">
          It lasts 30 minutes and ends after three numbers that don't match. Start again, or ask us
          for an invite link on <a href={telHref(phone)} className="text-gold">{phone}</a>.
        </p>
        <button onClick={onStartAgain} className="w-full bg-gold hover:bg-gold-light text-white font-semibold py-2.5 rounded-lg">
          Start again
        </button>
      </div>
    )
  }

  if (state === 'linked') {
    return (
      <div role="status" className="space-y-4">
        <h2 className="text-xl font-bold text-white">Your account is ready</h2>
        <p className="text-gray-400 text-sm">Signing you in…</p>
        <Link to="/login" className="text-gold text-sm">Sign in yourself</Link>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">You're already one of our customers</h2>
        <p className="text-gray-400 text-sm">
          We have a record for this phone number from a past rental. Confirm it's yours and your
          online account will show those rentals too.
        </p>
      </div>

      {claim.telegram_url ? (
        <>
          <a
            href={claim.telegram_url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 bg-[#229ED9] hover:bg-[#1c8bc0] text-white font-semibold py-3 rounded-lg transition-colors"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            Confirm on Telegram
          </a>
          <ol className="text-gray-400 text-sm list-decimal list-inside space-y-1">
            <li>Telegram opens our bot. Tap <span className="text-white">Start</span>.</li>
            <li>Tap <span className="text-white">Share my phone number to confirm</span>.</li>
            <li>Come back here: you'll be signed in.</li>
          </ol>
          <p role="status" className="text-gray-500 text-xs flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-gold animate-pulse" aria-hidden="true" />
            Waiting for Telegram…
          </p>
        </>
      ) : null}

      <p className="text-gray-500 text-sm border-t border-gray-700 pt-4">
        {claim.telegram_url ? 'No Telegram? ' : ''}
        Ask us for an invite link at the counter or on{' '}
        <a href={telHref(phone)} className="text-gold">{phone}</a>, and we'll set it up with you.
      </p>
    </div>
  )
}
