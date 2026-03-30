import CryptoJS from 'crypto-js';
import { SIGN_SECRET, TMDB_BASE_URL, TMDB_API_KEY } from './constants.js';

/**
 * Generates a signed URL with HMAC-SHA256 signature
 * Ported from Kotlin version in MovieBlastParser.kt
 */
export function generateSignedUrl(urlStr) {
    try {
        const url = new URL(urlStr);
        const path = url.pathname;
        const timestamp = Math.floor(Date.now() / 1000).toString();
        
        // HMAC SHA256
        const hash = CryptoJS.HmacSHA256(path + timestamp, SIGN_SECRET);
        const signature = CryptoJS.enc.Base64.stringify(hash);
        const encodedSignature = encodeURIComponent(signature);
        
        return `${urlStr}?verify=${timestamp}-${encodedSignature}`;
    } catch (e) {
        console.error("[MovieBlast] Error generating signed URL:", e.message);
        return urlStr;
    }
}

/**
 * Matches quality string to a standard label
 */
export function matchQuality(s) {
    if (!s) return "Unknown";
    const v = s.toLowerCase();
    if (v.includes("2160") || v.includes("4k")) return "4K";
    if (v.includes("1440")) return "2K";
    if (v.includes("1080")) return "1080p";
    if (v.includes("720")) return "720p";
    if (v.includes("480")) return "480p";
    if (v.includes("360")) return "360p";
    return "Unknown";
}

/**
 * Normalizes title for searching
 */
export function normalizeTitle(title) {
    if (!title) return "";
    return title.toLowerCase().replace(/\b(the|a|an)\b/g, "").replace(/[:\-_]/g, " ").replace(/\s+/g, " ").replace(/[^\w\s]/g, "").trim();
}

/**
 * Fetches media details from TMDB
 */
export async function getTMDBDetails(tmdbId, mediaType) {
    const endpoint = mediaType === "tv" ? "tv" : "movie";
    const url = `${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    const response = await fetch(url, {
        method: "GET",
        headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" }
    });
    if (!response.ok) throw new Error(`TMDB API error: ${response.status}`);
    const data = await response.json();
    const title = mediaType === "tv" ? data.name : data.title;
    const releaseDate = mediaType === "tv" ? data.first_air_date : data.release_date;
    const year = releaseDate ? parseInt(releaseDate.split("-")[0]) : null;
    return { title, year };
}

/**
 * Calculates title similarity score
 */
export function calculateTitleSimilarity(title1, title2) {
    const norm1 = normalizeTitle(title1);
    const norm2 = normalizeTitle(title2);
    if (norm1 === norm2) return 1;
    const words1 = norm1.split(/\s+/).filter(w => w.length > 0);
    const words2 = norm2.split(/\s+/).filter(w => w.length > 0);
    if (words1.length === 0 || words2.length === 0) return 0;
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    const intersection = words1.filter(w => set2.has(w));
    const union = new Set([...words1, ...words2]);
    return intersection.length / union.size;
}

/**
 * Finds the best matching result from search results
 */
export function findBestMatch(mediaInfo, searchResults) {
    if (!searchResults || searchResults.length === 0) return null;
    let bestMatch = null;
    let bestScore = 0;
    for (const result of searchResults) {
        let score = calculateTitleSimilarity(mediaInfo.title, result.name);
        if (mediaInfo.year && result.release_date) {
            const resultYear = parseInt(result.release_date.split("-")[0]);
            if (mediaInfo.year === resultYear) score += 0.2;
        }
        if (score > bestScore && score > 0.4) {
            bestScore = score;
            bestMatch = result;
        }
    }
    return bestMatch;
}
