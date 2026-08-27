const API_PREFIX = '/api/'
const ORIGIN_TIMEOUT_MS = 10_000

type AssetBinding = {
  fetch(request: Request): Promise<Response>
}

export type WorkerEnv = {
  ASSETS: AssetBinding
  ORIGIN_BASE_URL: string
  ORIGIN_PROXY_TOKEN: string
}

type FetchUpstream = (request: Request) => Promise<Response>

function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith(API_PREFIX)
}

function errorResponse(status: 502 | 503 | 504, error: string): Response {
  return Response.json(
    { error },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
      },
    },
  )
}

function createOriginRequest(request: Request, env: WorkerEnv): Request | Response {
  if (!env.ORIGIN_PROXY_TOKEN) {
    return errorResponse(503, 'api_proxy_unavailable')
  }

  const incomingUrl = new URL(request.url)
  const originUrl = new URL(incomingUrl.pathname + incomingUrl.search, env.ORIGIN_BASE_URL)
  const clientIp = request.headers.get('CF-Connecting-IP')?.trim() ?? ''
  if (!clientIp || clientIp.length > 64) {
    return errorResponse(502, 'client_ip_unavailable')
  }

  const headers = new Headers(request.headers)
  for (const name of [
    'cf-connecting-ip',
    'host',
    'origin',
    'x-forwarded-for',
    'x-forwarded-host',
    'x-forwarded-proto',
    'x-musiczh-client-ip',
    'x-musiczh-origin-token',
    'x-real-ip',
  ]) {
    headers.delete(name)
  }
  headers.set('X-Musiczh-Origin-Token', env.ORIGIN_PROXY_TOKEN)
  headers.set('X-Musiczh-Client-IP', clientIp)
  headers.set('X-Forwarded-Host', incomingUrl.host)
  headers.set('X-Forwarded-Proto', 'https')

  const method = request.method.toUpperCase()
  const init: RequestInit & { duplex?: 'half' } = {
    method,
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(ORIGIN_TIMEOUT_MS),
  }
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = request.body
    init.duplex = 'half'
  }
  return new Request(originUrl, init)
}

function proxyResponse(upstream: Response): Response {
  const headers = new Headers(upstream.headers)
  headers.set('Cache-Control', 'no-store')
  headers.set('Pragma', 'no-cache')
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
  headers.delete('Expires')
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  })
}

export async function handleRequest(
  request: Request,
  env: WorkerEnv,
  fetchUpstream: FetchUpstream = fetch,
): Promise<Response> {
  const url = new URL(request.url)
  if (!isApiPath(url.pathname)) return env.ASSETS.fetch(request)

  const originRequest = createOriginRequest(request, env)
  if (originRequest instanceof Response) return originRequest

  try {
    return proxyResponse(await fetchUpstream(originRequest))
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError'
    return errorResponse(timedOut ? 504 : 502, timedOut ? 'api_timeout' : 'api_unavailable')
  }
}

export default {
  fetch(request: Request, env: WorkerEnv) {
    return handleRequest(request, env)
  },
}
