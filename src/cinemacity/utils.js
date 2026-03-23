// src/cinemacity/utils.js
import { MAIN_URL, HEADERS } from './constants.js';

// Robust atob polyfill for environments where it is missing
export const atobPolyfill = (str) => {
    try {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
        let output = '';
        str = String(str).replace(/[=]+$/, '');
        if (str.length % 4 === 1) return '';
        for (let bc = 0, bs = 0, buffer, i = 0; buffer = str.charAt(i++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
            buffer = chars.indexOf(buffer);
        }
        return output;
    } catch (e) {
        return '';
    }
};

export async function fetchText(url, options = {}) {
    // Note: fetch is a global provided by the Nuvio sandbox
    const response = await fetch(url, {
        headers: options.headers || HEADERS,
        skipSizeCheck: true, // Critical for Nuvio not to block HTML/Metadata
        ...options
    });
    return await response.text();
}

export function extractQuality(url) {
    const low = (url || "").toLowerCase();
    if (low.includes("2160p") || low.includes("4k")) return "4K";
    if (low.includes("1080p")) return "1080p";
    if (low.includes("720p")) return "720p";
    if (low.includes("480p")) return "480p";
    if (low.includes("360p")) return "360p";
    return "HD";
}
