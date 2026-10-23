import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Globe, Link2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { customersService, type OnlineAccountInvite } from '@/services/customers'
import { getErrorMessage } from '@/services/apiClient'
import { useAuthStore } from '@/services/auth'
import { formatDateTime } from '@/lib/utils'

/**
 * Whether the customer can sign in on the website, and an invite if not.
 *
 * Customers entered at the counter had no way online: signup refused their
 * phone as already registered. Staff, who have seen their ID, can now send a
 * one-time link that sets up the login on their existing record.
 */
export function OnlineAccountCard({ customerId }: { customerId: number }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const canInvite = useAuthStore((s) => s.hasRole('admin', 'sales'))
  const [invite, setInvite] = useState<OnlineAccountInvite | null>(null)
  const [copied, setCopied] = useState<'url' | 'msg' | null>(null)

  const { data: account, isLoading } = useQuery({
    queryKey: ['customer-online-account', customerId],
    queryFn: () => customersService.getOnlineAccount(customerId),
  })

  const createInvite = useMutation({
    mutationFn: () => customersService.createOnlineAccountInvite(customerId),
    onSuccess: (result) => {
      setInvite(result)
      queryClient.invalidateQueries({ queryKey: ['customer-online-account', customerId] })
    },
  })

  function copy(text: string, which: 'url' | 'msg') {
    navigator.clipboard.writeText(text)
    setCopied(which)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <section aria-labelledby="online-account-title" className="rounded-lg border bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-gray-700">
        <Globe className="h-5 w-5 text-blue-600" aria-hidden="true" />
        <h2 id="online-account-title" className="text-lg font-semibold">{t('onlineAccount.title')}</h2>
      </div>

      {isLoading || !account ? (
        <p className="text-sm text-gray-500">{t('common.loading')}</p>
      ) : account.has_account ? (
        <div className="space-y-1 text-sm">
          <p className="text-gray-700">
            {t('onlineAccount.signsInAs')} <span className="font-medium">{account.email}</span>
          </p>
          <p className="text-gray-500">
            {account.telegram_linked ? t('onlineAccount.telegramLinked') : t('onlineAccount.telegramNotLinked')}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">{t('onlineAccount.none')}</p>
          {account.invite_expires_at && !invite && (
            <p className="text-sm text-amber-700">
              {t('onlineAccount.openInvite', { time: formatDateTime(account.invite_expires_at) })}
            </p>
          )}

          {invite ? (
            <div className="space-y-3">
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">{t('onlineAccount.link')}</p>
                <div className="flex items-center gap-2 rounded-lg border bg-gray-50 px-3 py-2">
                  <code className="flex-1 break-all text-sm text-gray-900">{invite.url}</code>
                  <button onClick={() => copy(invite.url, 'url')}
                          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900">
                    {copied === 'url' ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                    {copied === 'url' ? t('common.copied') : t('common.copy')}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {t('onlineAccount.expires', { time: formatDateTime(invite.expires_at) })}
                </p>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">{t('customerDetail.readyToSendMessage')}</p>
                <div className="whitespace-pre-wrap rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-gray-700">
                  {invite.message}
                </div>
                <button onClick={() => copy(invite.message, 'msg')}
                        className="mt-2 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800">
                  {copied === 'msg' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied === 'msg' ? t('common.copied') : t('customerDetail.copyFullMessage')}
                </button>
              </div>
            </div>
          ) : null}

          {canInvite && (
            <div>
              {createInvite.isError && (
                <p role="alert" className="mb-2 text-sm text-red-600">
                  {getErrorMessage(createInvite.error, t('onlineAccount.inviteFailed'))}
                </p>
              )}
              <button
                onClick={() => createInvite.mutate()}
                disabled={createInvite.isPending}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                <Link2 className="h-4 w-4" aria-hidden="true" />
                {createInvite.isPending
                  ? t('onlineAccount.creating')
                  : invite || account.invite_expires_at
                    ? t('onlineAccount.newInvite')
                    : t('onlineAccount.createInvite')}
              </button>
              <p className="mt-2 text-xs text-gray-500">{t('onlineAccount.hint')}</p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
