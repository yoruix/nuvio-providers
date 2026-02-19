export const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
export const TMDB_BASE_URL = "https://api.themoviedb.org/3";
export let MAIN_URL = "https://new3.hdhub4u.fo";
export const DOMAINS_URL = "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json";
export const DOMAIN_CACHE_TTL = 4 * 60 * 60 * 1e3;

export const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
  "Cookie": "xla=s4t",
  "Referer": `${MAIN_URL}/`
};

export function updateMainUrl(url) {
    MAIN_URL = url;
    HEADERS.Referer = `${url}/`;
}
