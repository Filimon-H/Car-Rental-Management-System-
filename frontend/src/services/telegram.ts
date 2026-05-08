import apiClient from './apiClient'

export interface TelegramLinkStatus {
  linked: boolean
  bot_username: string | null
  telegram_username: string | null
  linked_at: string | null
}

export interface TelegramLinkCode {
  code: string
  expires_at: string
  bot_username: string | null
}

export const telegramService = {
  async getStatus(): Promise<TelegramLinkStatus> {
    return apiClient.get('/me/telegram')
  },

  async createLinkCode(): Promise<TelegramLinkCode> {
    return apiClient.post('/me/telegram/link-code')
  },

  async unlink(): Promise<{ message: string }> {
    return apiClient.delete('/me/telegram')
  },
}

export default telegramService
