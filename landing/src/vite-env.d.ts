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
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
