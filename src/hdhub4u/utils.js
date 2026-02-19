import { DOMAINS_URL, DOMAIN_CACHE_TTL, MAIN_URL, HEADERS, updateMainUrl, TMDB_BASE_URL, TMDB_API_KEY } from './constants.js';

let domainCacheTimestamp = 0;

export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "Unknown";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function extractServerName(source) {
  if (!source) return "Unknown";
  if (source.startsWith("HubCloud")) {
    const serverMatch = source.match(/HubCloud(?:\s*-\s*([^[\]]+))?/);
    return serverMatch ? serverMatch[1] || "Download" : "HubCloud";
  }
  if (source.startsWith("Pixeldrain")) return "Pixeldrain";
  if (source.startsWith("StreamTape")) return "StreamTape";
  if (source.startsWith("HubCdn")) return "HubCdn";
  if (source.startsWith("HbLinks")) return "HbLinks";
  if (source.startsWith("Hubstream")) return "Hubstream";
  return source.replace(/^www\./, "").split(".")[0];
}

export function rot13(value) {
  return value.replace(/[a-zA-Z]/g, function(c) {
    return String.fromCharCode((c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26);
  });
}

export const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

export function atob(value) {
  if (!value) return "";
  let input = String(value).replace(/=+$/, "");
  let output = "";
  let bc = 0, bs, buffer, idx = 0;
  while (buffer = input.charAt(idx++)) {
    buffer = BASE64_CHARS.indexOf(buffer);
    if (~buffer) {
      bs = bc % 4 ? bs * 64 + buffer : buffer;
      if (bc++ % 4) {
        output += String.fromCharCode(255 & bs >> (-2 * bc & 6));
      }
    }
  }
  return output;
}

export function btoa(value) {
  if (value == null) return "";
  let str = String(value);
  let output = "";
  let i = 0;
  while (i < str.length) {
    const chr1 = str.charCodeAt(i++);
    const chr2 = str.charCodeAt(i++);
    const chr3 = str.charCodeAt(i++);
    const enc1 = chr1 >> 2;
    const enc2 = (chr1 & 3) << 4 | chr2 >> 4;
    let enc3 = (chr2 & 15) << 2 | chr3 >> 6;
    let enc4 = chr3 & 63;
    if (isNaN(chr2)) {
      enc3 = 64; enc4 = 64;
    } else if (isNaN(chr3)) {
      enc4 = 64;
    }
    output += BASE64_CHARS.charAt(enc1) + BASE64_CHARS.charAt(enc2) + BASE64_CHARS.charAt(enc3) + BASE64_CHARS.charAt(enc4);
  }
  return output;
}

export function cleanTitle(title) {
  let name = title.replace(/\.[a-zA-Z0-9]{2,4}$/, "");
  
  const normalized = name
    .replace(/WEB[-_. ]?DL/gi, "WEB-DL")
    .replace(/WEB[-_. ]?RIP/gi, "WEBRIP")
    .replace(/H[ .]?265/gi, "H265")
    .replace(/H[ .]?264/gi, "H264")
    .replace(/DDP[ .]?([0-9]\.[0-9])/gi, "DDP$1");

  const parts = normalized.split(/[\s_.]/);
  
  const sourceTags = new Set(["WEB-DL", "WEBRIP", "BLURAY", "HDRIP", "DVDRIP", "HDTV", "CAM", "TS", "BRRIP", "BDRIP"]);
  const codecTags = new Set(["H264", "H265", "X264", "X265", "HEVC", "AVC"]);
  const audioTags = ["AAC", "AC3", "DTS", "MP3", "FLAC", "DD", "DDP", "EAC3"];
  const audioExtras = new Set(["ATMOS"]);
  const hdrTags = new Set(["SDR", "HDR", "HDR10", "HDR10+", "DV", "DOLBYVISION"]);

  const filtered = parts.map(part => {
    const p = part.toUpperCase();
    if (sourceTags.has(p)) return p;
    if (codecTags.has(p)) return p;
    if (audioTags.some(tag => p.startsWith(tag))) return p;
    if (audioExtras.has(p)) return p;
    if (hdrTags.has(p)) return p === "DOLBYVISION" || p === "DV" ? "DOLBYVISION" : p;
    if (p === "NF" || p === "CR") return p;
    return null;
  }).filter(Boolean);

  return [...new Set(filtered)].join(" ");
}

export function cleanDisplayTitle(raw) {
    if (!raw) return "";
    let name = raw.split("(")[0].trim().replace(/\s+/g, " ");
    name = name.charAt(0).toUpperCase() + name.slice(1);

    const seasonMatch = raw.match(/Season\s*\d+/i);
    const yearMatch = raw.match(/\b(19|20)\d{2}\b/);

    const season = seasonMatch ? seasonMatch[0].charAt(0).toUpperCase() + seasonMatch[0].slice(1).toLowerCase() : null;
    const year = yearMatch ? yearMatch[0] : null;

    let result = name;
    const parts = [];
    if (season) parts.push(season);
    if (year) parts.push(year);

    if (parts.length > 0) {
        result += ` (${parts.join(") (")})`;
    }
    return result;
}

export async function fetchAndUpdateDomain() {
  const now = Date.now();
  if (now - domainCacheTimestamp < DOMAIN_CACHE_TTL) return;
  
  console.log("[HDHub4u] Fetching latest domain...");
  try {
    const response = await fetch(DOMAINS_URL, {
      method: "GET",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    });
    if (response.ok) {
      const data = await response.json();
      if (data && data.HDHUB4u) {
        const newDomain = data.HDHUB4u;
        if (newDomain !== MAIN_URL) {
          console.log(`[HDHub4u] Updating domain from ${MAIN_URL} to ${newDomain}`);
          updateMainUrl(newDomain);
          domainCacheTimestamp = now;
        }
      }
    }
  } catch (error) {
    console.error(`[HDHub4u] Failed to fetch latest domains: ${error.message}`);
  }
}

export async function getCurrentDomain() {
  await fetchAndUpdateDomain();
  return MAIN_URL;
}

export function normalizeTitle(title) {
  if (!title) return "";
  return title.toLowerCase().replace(/\b(the|a|an)\b/g, "").replace(/[:\-_]/g, " ").replace(/\s+/g, " ").replace(/[^\w\s]/g, "").trim();
}

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
  const jaccard = intersection.length / union.size;
  const extraWordsCount = words2.filter(w => !set1.has(w)).length;
  let score = jaccard - (extraWordsCount * 0.05);
  if (words1.length > 0 && words1.every(w => set2.has(w))) {
    score += 0.2;
  }
  return score;
}

export function findBestTitleMatch(mediaInfo, searchResults, mediaType, season) {
  if (!searchResults || searchResults.length === 0) return null;
  let bestMatch = null;
  let bestScore = 0;
  for (const result of searchResults) {
    let score = calculateTitleSimilarity(mediaInfo.title, result.title);
    if (mediaInfo.year && result.year) {
      const yearDiff = Math.abs(mediaInfo.year - result.year);
      if (yearDiff === 0) score += 0.2;
      else if (yearDiff <= 1) score += 0.1;
      else if (yearDiff > 5) score -= 0.3;
    }
    if (mediaType === "tv" && season) {
      const titleLower = result.title.toLowerCase();
      const seasonPatterns = [
          `season ${season}`, 
          `s${season}`, 
          `season ${season.toString().padStart(2, '0')}`,
          `s${season.toString().padStart(2, '0')}`
      ];
      const hasSeason = seasonPatterns.some(p => titleLower.includes(p));
      
      // If we found a season but it's the WRONG one, penalize heavily
      const otherSeasonMatch = titleLower.match(/season\s*(\d+)|s(\d+)/i);
      if (otherSeasonMatch) {
          const foundSeason = parseInt(otherSeasonMatch[1] || otherSeasonMatch[2]);
          if (foundSeason !== season) {
              score -= 0.8;
          }
      }

      if (hasSeason) score += 0.5;
      else score -= 0.3;
    }
    if (result.title.toLowerCase().includes("2160p") || result.title.toLowerCase().includes("4k")) {
      score += 0.05;
    }
    if (score > bestScore && score > 0.3) {
      bestScore = score;
      bestMatch = result;
    }
  }
  if (bestMatch) console.log(`[HDHub4u] Best title match: "${bestMatch.title}" (score: ${bestScore.toFixed(2)})`);
  return bestMatch;
}

export async function getTMDBDetails(tmdbId, mediaType) {
  const endpoint = mediaType === "tv" ? "tv" : "movie";
  const url = `${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
  const response = await fetch(url, {
    method: "GET",
    headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" }
  });
  if (!response.ok) throw new Error(`TMDB API error: ${response.status}`);
  const data = await response.json();
  const title = mediaType === "tv" ? data.name : data.title;
  const releaseDate = mediaType === "tv" ? data.first_air_date : data.release_date;
  const year = releaseDate ? parseInt(releaseDate.split("-")[0]) : null;
  return { title, year, imdbId: data.external_ids?.imdb_id || null };
}
