const MAX_BODY = 2048;
const CACHE_TTL = 5 * 60_000;

async function readBody(request) {
    const reader = request.body?.getReader();
    if (!reader) throw new Error('BODY');
    const chunks = [];
    let size = 0;
    while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY) { await reader.cancel(); throw new Error('BODY'); }
        chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes));
}

function publicResult(row) {
    try {
        const url = new URL(row.url);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.href.length > 2000) return null;
        return {url: url.href, title: String(row.title || url.hostname).slice(0, 180), content: String(row.content || '').slice(0, 420)};
    } catch { return null; }
}

export function createProductSearchHandler({createClient, env, fetchImpl = fetch, now = Date.now}) {
    // Caché de fuentes públicas y protección por instancia. La API gratuita
    // aplica además sus propios límites; nunca se activa un plan de pago.
    const cache = new Map(), inFlight = new Map(), requests = new Map();
    const headers = {
        'Access-Control-Allow-Origin': env('APP_ORIGIN') || 'https://amadorjara-alt.github.io',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin',
        'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8'
    };
    const reply = (body, status = 200) => new Response(JSON.stringify(body), {status, headers});
    const failure = (code, status) => reply({success: false, code}, status);

    async function search(term) {
        const key = env('TAVILY_API_KEY')?.trim();
        const providerHeaders = {'Content-Type': 'application/json'};
        if (key) providerHeaders.Authorization = `Bearer ${key}`;
        else providerHeaders['X-Tavily-Access-Mode'] = 'keyless';
        let response;
        try {
            response = await fetchImpl('https://api.tavily.com/search', {
                method: 'POST', headers: providerHeaders, signal: AbortSignal.timeout(12_000),
                body: JSON.stringify({query: `${term} precio proveedor mayorista Perú`, search_depth: 'basic',
                    max_results: 5, include_answer: false, include_raw_content: false, include_images: false, auto_parameters: false})
            });
        } catch (error) {
            throw {code: ['AbortError', 'TimeoutError'].includes(error?.name) ? 'SEARCH_TIMEOUT' : 'SEARCH_UNAVAILABLE', status: 504};
        }
        if ([429, 432, 433].includes(response.status)) throw {code: 'SEARCH_RATE_LIMIT', status: 429};
        if (!response.ok) throw {code: 'SEARCH_UNAVAILABLE', status: 502};
        let body;
        try { body = await response.json(); } catch { throw {code: 'SEARCH_UNAVAILABLE', status: 502}; }
        if (!Array.isArray(body.results)) throw {code: 'SEARCH_UNAVAILABLE', status: 502};
        return {success: true, provider: 'tavily', query: term, fetched_at: new Date(now()).toISOString(),
            results: body.results.slice(0, 5).map(publicResult).filter(Boolean)};
    }

    return async request => {
        if (request.method === 'OPTIONS') return new Response('ok', {headers});
        if (request.method !== 'POST') return failure('SEARCH_METHOD', 405);
        try {
            const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('Authorization') || '');
            if (!match) return failure('SEARCH_AUTH', 401);
            const url = env('SUPABASE_URL'), anon = env('SUPABASE_ANON_KEY');
            if (!url || !anon) return failure('SEARCH_UNAVAILABLE', 503);
            const caller = createClient(url, anon, {auth: {persistSession: false, autoRefreshToken: false},
                global: {headers: {Authorization: `Bearer ${match[1]}`}}});
            const {data, error} = await caller.auth.getUser(match[1]);
            if (error || !data?.user?.id) return failure('SEARCH_AUTH', 401);
            let body;
            try { body = await readBody(request); } catch { return failure('SEARCH_QUERY', 400); }
            const term = typeof body?.query === 'string' ? body.query.trim().replace(/\s+/g, ' ') : '';
            if (term.length < 2 || term.length > 120 || /[\u0000-\u001f\u007f]/.test(term)) return failure('SEARCH_QUERY', 400);
            const cacheKey = term.toLocaleLowerCase('es-PE');
            const cached = cache.get(cacheKey);
            if (cached && now() - cached.at < CACHE_TTL) return reply({...cached.value, query: term, cached: true});
            if (inFlight.has(cacheKey)) return reply(await inFlight.get(cacheKey));
            const recent = (requests.get(data.user.id) || []).filter(at => now() - at < 60_000);
            if (recent.length >= 5) return failure('SEARCH_RATE_LIMIT', 429);
            if (requests.size >= 500) requests.delete(requests.keys().next().value);
            requests.set(data.user.id, [...recent, now()]);
            const task = search(term);
            inFlight.set(cacheKey, task);
            try {
                const value = await task;
                if (cache.size >= 100) cache.delete(cache.keys().next().value);
                cache.set(cacheKey, {at: now(), value});
                return reply(value);
            } finally { inFlight.delete(cacheKey); }
        } catch (error) {
            const code = ['SEARCH_TIMEOUT', 'SEARCH_RATE_LIMIT', 'SEARCH_UNAVAILABLE'].includes(error?.code) ? error.code : 'SEARCH_UNAVAILABLE';
            return failure(code, error?.status || 503);
        }
    };
}
