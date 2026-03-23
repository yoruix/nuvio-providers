import { MAIN_URL, PROXY_URL, HEADERS } from './constants.js';

export async function fetchText(url, options = {}) {
    const { useProxy = true, ...fetchOptions } = options;
    const finalUrl = url.startsWith('http') ? url : `${MAIN_URL}${url}`;
    
    // Use encodeURIComponent to ensure proper URL format
    const targetUrl = useProxy ? `${PROXY_URL}${encodeURIComponent(finalUrl)}` : finalUrl;
    
    const response = await fetch(targetUrl, {
        headers: HEADERS,
        ...fetchOptions
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} on ${finalUrl}`);
    return await response.text();
}

export async function fetchJson(url, options = {}) {
    const text = await fetchText(url, options);
    return JSON.parse(text);
}

export async function getImdbId(tmdbId, mediaType) {
    try {
        const url = `https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}/external_ids?api_key=1865f43a0549ca50d341dd9ab8b29f49`;
        const res = await fetch(url);
        const data = await res.json();
        return data.imdb_id;
    } catch (e) {
        return null;
    }
}

export async function resolveMapping(imdbId, season, episode) {
    try {
        const url = `https://id-mapping-api-malid.hf.space/api/resolve?id=${imdbId}&s=${season}&e=${episode}`;
        const res = await fetch(url);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
}

export async function getMalTitle(malId) {
    try {
        const res = await fetch(`https://api.jikan.moe/v4/anime/${malId}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data.data.title;
    } catch (e) {
        return null;
    }
}

export async function searchAnime(query) {
    const url = `/api?m=search&l=8&q=${encodeURIComponent(query)}`;
    return await fetchJson(url);
}

export function extractQuality(text) {
    const match = text.match(/(\d{3,4}p)/);
    return match ? match[1] : "720p";
}
