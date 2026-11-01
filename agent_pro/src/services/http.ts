// Single place that talks HTTP to the FastAPI backend. Every service function goes through apiRequest
// so that connection problems and backend errors become one simple, readable Error.

/** Backend base URL. Override with VITE_API_URL in agent_pro/.env (see .env.example). */
export const API_BASE: string = (import.meta.env?.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') || 'http://localhost:8000'

/** Error raised for every failed request. `code` is the backend error code (or a client-side one). */
export class ApiRequestError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  /** Milliseconds before giving up. AI calls can take minutes on a local model. */
  timeoutMs?: number
}

/** Milliseconds for requests that wait on a language model (chat, investigations, documentation). */
export const AI_TIMEOUT_MS = 5 * 60 * 1000

export const apiUrl = (path: string) => `${API_BASE}/api${path}`

function describeFailure(status: number, payload: unknown): { code: string; message: string } {
  const detail = (payload as { detail?: unknown } | null)?.detail
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const { code, message } = detail as { code?: string; message?: string }
    if (message) return { code: code ?? `http_${status}`, message }
  }
  if (Array.isArray(detail) && detail.length > 0) {
    // FastAPI validation errors: [{ loc: ['body', 'path'], msg: '...' }]
    const first = detail[0] as { loc?: unknown[]; msg?: string }
    const field = Array.isArray(first.loc) ? first.loc.filter((part) => part !== 'body').join('.') : ''
    return { code: 'invalid_input', message: `Invalid input${field ? ` (${field})` : ''}: ${first.msg ?? 'please check the value'}.` }
  }
  if (typeof detail === 'string') return { code: `http_${status}`, message: detail }
  return { code: `http_${status}`, message: `The backend returned an error (HTTP ${status}).` }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, timeoutMs = 30_000 } = options
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  signal?.addEventListener('abort', () => controller.abort())

  let response: Response
  try {
    response = await fetch(apiUrl(path), {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    if (controller.signal.aborted) {
      throw new ApiRequestError(0, 'timeout', 'The backend took too long to respond. Check that it is running and try again.')
    }
    throw new ApiRequestError(
      0,
      'backend_unreachable',
      `Cannot reach the CODEMIND backend at ${API_BASE}. Start it (see README.md) and try again.`,
    )
  } finally {
    window.clearTimeout(timer)
  }

  if (response.status === 204) return undefined as T
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    // non-JSON body: handled below
  }
  if (!response.ok) {
    const { code, message } = describeFailure(response.status, payload)
    throw new ApiRequestError(response.status, code, message)
  }
  return payload as T
}

/** Text for an unknown thrown value, for inline error messages. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  return error instanceof Error && error.message ? error.message : fallback
}
