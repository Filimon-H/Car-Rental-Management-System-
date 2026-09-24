/// <reference types="vite/client" />

/**
 * Declares import.meta.env for TypeScript.
 *
 * Without this the production build fails on `import.meta.env` even though
 * Vite resolves it at bundle time — the dev server type-checks lazily, so the
 * error only surfaced in `tsc -b`.
 */
interface ImportMetaEnv {
  /** Base URL for the API. Defaults to /api so a deployment can proxy. */
  readonly VITE_API_BASE_URL?: string
  /** Base URL of the staff admin app. Defaults to /admin, same-origin. */
  readonly VITE_ADMIN_URL?: string
  /** Telegram bot handle, without the @. */
  readonly VITE_TELEGRAM_BOT_USERNAME?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
