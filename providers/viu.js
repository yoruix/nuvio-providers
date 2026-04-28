/**
 * Viu Provider for Nuvio Streaming App
 * Single-file implementation following Nuvio Provider pattern
 * Based on Cloudstream3 VIUPlugin by Abodabodd
 */

// Provider metadata
const providerInfo = {
    name: 'Viu',
    version: '1.0.0',
    description: 'Arabic & Asian Drama streaming provider',
    author: 'Adapted from Cloudstream3 VIUPlugin'
};

// API Configuration
const CONFIG = {
    BASE_URL: 'https://www.viu.com',
    MOBILE_API: 'https://api-gateway-global.viu.com/api/mobile',
    TOKEN_URL: 'https://api-gateway-global.viu.com/api/auth/token',
    PLAYBACK_URL: 'https://api-gateway-global.viu.com/api/playback/distribute',
    AREA_ID: '1004',
    COUNTRY_CODE: 'IQ',
    LANGUAGE_ID: '6'
};

// State
let deviceId = null;
let cachedToken = null;
let tokenExpiry = 0;

// UUID generator
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Initialize device ID
function initDeviceId() {
    if (!deviceId) {
        deviceId = generateUUID();
    }
    return deviceId;
}

// HTTP request helper
async function request(url, options = {}) {
    const headers = options.headers || {};
    const response = await fetch(url, {
        ...options,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 12)',
            'Accept': 'application/json',
            'Referer': 'https://www.viu.com/',
            ...headers
        }
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
}

// Get auth token
async function getAuthToken() {
    initDeviceId();

    const currentTime = Math.floor(Date.now() / 1000);

    // Return cached token if valid
    if (cachedToken && currentTime < tokenExpiry) {
        return cachedToken;
    }

    const body = new URLSearchParams();
    body.append('countryCode', CONFIG.COUNTRY_CODE);
    body.append('platform', 'android');
    body.append('platformFlagLabel', 'phone');
    body.append('language', CONFIG.LANGUAGE_ID);
    body.append('deviceId', deviceId);
    body.append('dataTrackingDeviceId', generateUUID());
    body.append('osVersion', '33');
    body.append('appVersion', '2.23.0');
    body.append('buildVersion', '790');
    body.append('carrierId', '0');
    body.append('carrierName', 'null');
    body.append('appBundleId', 'com.vuclip.viu');
    body.append('flavour', 'all');

    const data = await request(CONFIG.TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
    });

    const token = data.token || (data.data && data.data.token);
    if (!token) {
        throw new Error('Failed to obtain auth token');
    }

    const expiresIn = data.expires_in || (data.data && data.data.expires_in) || 3600;
    cachedToken = token;
    tokenExpiry = currentTime + expiresIn;

    return token;
}

// Get authenticated headers
async function getAuthHeaders() {
    const token = await getAuthToken();
    return {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Mozilla/5.0 (Linux; Android 12)',
        'Accept': 'application/json',
        'Referer': 'https://www.viu.com/'
    };
}

// Build API URL with parameters
function buildApiUrl(endpoint, params = {}) {
    const url = new URL(CONFIG.MOBILE_API);
    url.searchParams.set('r', endpoint);
    url.searchParams.set('platform_flag_label', 'phone');
    url.searchParams.set('language_flag_id', CONFIG.LANGUAGE_ID);
    url.searchParams.set('area_id', CONFIG.AREA_ID);
    url.searchParams.set('countryCode', CONFIG.COUNTRY_CODE);
    url.searchParams.set('os_flag_id', '2');

    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }

    return url.toString();
}

// Parse quality string
function parseQuality(q) {
    if (q.includes('1080')) return '1080p';
    if (q.includes('720')) return '720p';
    if (q.includes('480')) return '480p';
    if (q.includes('240')) return '240p';
    return 'Unknown';
}

/**
 * Get home page content with featured and categorized content
 * @returns {Promise<Array>} Home page sections
 */
async function getHomePage() {
    const headers = await getAuthHeaders();
    const url = buildApiUrl('/home/index', { ut: '0' });

    const data = await request(url, { headers });

    if (!data.data) {
        return [];
    }

    const sections = [];

    // Featured banners
    if (data.data.banner && data.data.banner.length > 0) {
        const featured = data.data.banner.map(item => ({
            name: item.series_name || item.title || 'Unknown',
            image: item.cover_landscape_image_url || item.image_url || item.cover_image_url,
            id: item.is_movie === 1 ? item.product_id : item.series_id,
            type: item.is_movie === 1 ? 'movie' : 'series'
        }));
        sections.push({ name: 'Featured', items: featured });
    }

    // Category grids
    if (data.data.grid) {
        data.data.grid.forEach(grid => {
            const items = (grid.product || []).map(item => ({
                name: item.series_name || item.title || 'Unknown',
                image: item.cover_landscape_image_url || item.image_url || item.cover_image_url,
                id: item.is_movie === 1 ? item.product_id : item.series_id,
                type: item.is_movie === 1 ? 'movie' : 'series'
            }));

            if (items.length > 0) {
                sections.push({
                    name: grid.name || 'Category',
                    items: items
                });
            }
        });
    }

    return sections;
}

/**
 * Search for content by query
 * @param {string} query - Search query
 * @returns {Promise<Array>} Search results
 */
async function search(query) {
    const headers = await getAuthHeaders();

    const url = `${CONFIG.MOBILE_API}?platform_flag_label=web&r=/search/video&keyword=${encodeURIComponent(query)}&page=1&limit=20&area_id=${CONFIG.AREA_ID}&language_flag_id=${CONFIG.LANGUAGE_ID}`;

    const data = await request(url, { headers });

    const results = [];

    if (data.data && data.data.series) {
        data.data.series.forEach(item => {
            results.push({
                id: item.series_id || item.id,
                name: item.series_name || item.name,
                type: 'series',
                poster: item.coverImage || item.posterUrl
            });
        });
    }

    if (data.data && data.data.movies) {
        data.data.movies.forEach(item => {
            results.push({
                id: item.product_id,
                name: item.name || item.title,
                type: 'movie',
                poster: item.coverImage || item.posterUrl
            });
        });
    }

    return results;
}

/**
 * Get episode list for a series
 * @param {string} seriesId - Viu series ID
 * @returns {Promise<Array>} Episode list
 */
async function getEpisodes(seriesId) {
    const headers = await getAuthHeaders();

    const url = buildApiUrl('/vod/product-list', {
        series_id: seriesId,
        size: '1000'
    });

    const data = await request(url, { headers });

    if (!data.data || !data.data.product_list) {
        return [];
    }

    return data.data.product_list.map(ep => ({
        ccsId: ep.ccs_product_id,
        productId: ep.product_id,
        number: ep.number,
        synopsis: ep.synopsis,
        description: ep.description,
        poster: ep.cover_image_url
    }));
}

/**
 * Get stream links for an episode
 * @param {string} ccsId - CCS Product ID
 * @param {string} productId - Product ID
 * @returns {Promise<Array>} Stream links with subtitles
 */
async function getStreamLinks(ccsId, productId) {
    const headers = await getAuthHeaders();

    let subtitles = [];

    // Fetch subtitles
    try {
        const detailUrl = buildApiUrl('/vod/detail', { product_id: productId });
        const detailData = await request(detailUrl, { headers });

        if (detailData.data && detailData.data.current_product && detailData.data.current_product.subtitle) {
            subtitles = detailData.data.current_product.subtitle
                .filter(sub => sub.url || sub.subtitle_url)
                .map(sub => ({
                    lang: sub.iso_code || sub.code || 'und',
                    url: sub.url || sub.subtitle_url,
                    name: sub.name || 'Subtitle'
                }));
        }
    } catch (e) {
        console.log('[Viu] Could not fetch subtitles');
    }

    // Fetch playback stream
    const playUrl = `${CONFIG.PLAYBACK_URL}?ccs_product_id=${ccsId}&platform_flag_label=phone&language_flag_id=${CONFIG.LANGUAGE_ID}&area_id=${CONFIG.AREA_ID}`;

    const playData = await request(playUrl, { headers });

    if (!playData.data || !playData.data.stream || !playData.data.stream.url) {
        return [];
    }

    const streams = [];
    const streamUrls = playData.data.stream.url;

    for (const [quality, url] of Object.entries(streamUrls)) {
        streams.push({
            name: `Viu ${quality.toUpperCase()}`,
            title: `${quality.toUpperCase()} Stream`,
            url: url,
            quality: parseQuality(quality),
            headers: {
                'Referer': 'https://www.viu.com/'
            },
            subtitles: subtitles
        });
    }

    return streams;
}

/**
 * Main function - called by Nuvio when searching for streams
 * @param {string} tmdbId - TMDB ID
 * @param {string} mediaType - 'movie' or 'tv'
 * @param {number} season - Season number (null for movies)
 * @param {number} episode - Episode number (null for movies)
 * @returns {Promise<Array>} Stream links
 */
async function getStreams(tmdbId, mediaType, season, episode) {
    // Since Viu uses its own IDs, this provider works differently
    // The app should pass the Viu internal ID, not TMDB
    // For now, return empty - the search method should be used first
    console.log(`[Viu] getStreams called with tmdbId: ${tmdbId}, mediaType: ${mediaType}`);

    // This would need integration with TMDB to Viu ID mapping
    // For a complete solution, you'd need to:
    // 1. Search TMDB for the content
    // 2. Match it to Viu content
    // 3. Get the stream

    return [];
}

// Export for Nuvio
module.exports = {
    getStreams,
    getHomePage,
    search,
    getEpisodes,
    getStreamLinks,
    providerInfo
};