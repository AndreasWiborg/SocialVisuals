export async function fetchUrl(url, timeoutMs = 12000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, { redirect: 'follow', signal: ctrl.signal });
        const html = await res.text();
        return { html, finalUrl: res.url || url, status: res.status };
    }
    finally {
        clearTimeout(t);
    }
}
