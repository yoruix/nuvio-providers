// src/cinemacity/index.js
import { atobPolyfill, fetchText, extractQuality } from './utils.js';
import { MAIN_URL, HEADERS, TMDB_API_KEY } from './constants.js';

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        // 1. Get Title from TMDB
        const tmdbUrl = `https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=${TMDB_API_KEY}`;
        const tmdbRes = await fetch(tmdbUrl, { skipSizeCheck: true });
        const mediaInfo = await tmdbRes.json();
        const animeTitle = mediaInfo.title || mediaInfo.name;

        if (!animeTitle) return [];

        // 2. Search on CinemaCity
        const searchUrl = `${MAIN_URL}/?do=search&subaction=search&search_start=0&full_search=0&story=${encodeURIComponent(animeTitle)}`;
        const searchHtml = await fetchText(searchUrl);
        
        // Use global cheerio provided by Nuvio
        const $search = cheerio.load(searchHtml);
        let mediaUrl = null;

        $search('div.dar-short_item').each((i, el) => {
            if (mediaUrl) return;
            const anchor = $search(el).find('a').filter((idx, a) => ($search(a).attr('href') || "").includes('.html')).first();
            if (!anchor.length) return;

            const foundTitle = anchor.text().split('(')[0].trim();
            const href = anchor.attr('href');
            
            if (foundTitle.toLowerCase() === animeTitle.toLowerCase() || 
                foundTitle.toLowerCase().includes(animeTitle.toLowerCase()) || 
                animeTitle.toLowerCase().includes(foundTitle.toLowerCase())) {
                mediaUrl = href;
            }
        });

        if (!mediaUrl) {
            const homeHtml = await fetchText(MAIN_URL);
            const $home = cheerio.load(homeHtml);
            $home('div.dar-short_item').each((i, el) => {
                if (mediaUrl) return;
                const anchor = $home(el).find('a').filter((idx, a) => ($home(a).attr('href') || "").includes('.html')).first();
                if (!anchor.length) return;
                const foundTitle = anchor.text().split('(')[0].trim();
                const href = anchor.attr('href');
                if (foundTitle.toLowerCase() === animeTitle.toLowerCase()) mediaUrl = href;
            });
        }

        if (!mediaUrl) return [];

        // 3. Load Media Page
        const pageHtml = await fetchText(mediaUrl);
        const $page = cheerio.load(pageHtml);
        
        // 4. Extract PlayerJS Data (Checking ALL atob scripts)
        let fileData = null;
        $page('script').each((i, el) => {
            if (fileData) return;
            const html = $page(el).html();
            if (html && html.includes('atob')) {
                const regex = /atob\s*\(\s*(['"])(.*?)\1\s*\)/g;
                let match;
                while ((match = regex.exec(html)) !== null) {
                    const decoded = atobPolyfill(match[2]);
                    const fileMatch = decoded.match(/file\s*:\s*(['"])(.*?)\1/s) || decoded.match(/file\s*:\s*(\[.*?\])/s);
                    if (fileMatch) {
                        let rawFile = fileMatch[2] || fileMatch[1];
                        if (rawFile && rawFile.length > 5) {
                            if (rawFile.startsWith('[') || rawFile.startsWith('{')) {
                                try {
                                    const unescaped = rawFile.replace(/\\(.)/g, '$1');
                                    fileData = JSON.parse(unescaped);
                                } catch (e) {
                                    try { fileData = JSON.parse(rawFile); } catch (e2) { fileData = rawFile; }
                                }
                            } else {
                                fileData = rawFile;
                            }
                            if (fileData) break;
                        }
                    }
                }
            }
        });

        if (!fileData) return [];

        const streams = [];
        const addStream = (url, title, quality) => {
            if (!url || !url.startsWith('http') || url.length < 15) return;
            streams.push({
                name: "CinemaCity",
                title: title,
                url: url,
                quality: quality || extractQuality(url),
                headers: { 
                    ...HEADERS, // Re-include cookies as they may be required for the CDN
                    Referer: "https://cinemacity.cc/" 
                }
            });
        };

        const processStr = (str, title) => {
            if (str.includes('.urlset/master.m3u8')) {
                // Only provide the Auto (HLS) link as individual MP4s are restricted
                addStream(str, title, "Auto");
            } else {
                // Fallback for cases where it's a single direct link without a urlset
                const urls = str.includes('[') ? str.split(',') : [str];
                urls.forEach(u => {
                    const m = u.match(/\[(.*?)\](.*)/);
                    if (m) addStream(m[2], title, m[1]);
                    else addStream(u, title, extractQuality(u));
                });
            }
        };

        if (mediaType === 'movie') {
            if (Array.isArray(fileData)) {
                const obj = fileData.find(f => !f.folder && f.file) || fileData[0];
                if (obj && obj.file) processStr(obj.file, animeTitle);
            } else if (typeof fileData === 'string') {
                processStr(fileData, animeTitle);
            }
        } else {
            if (Array.isArray(fileData)) {
                const sLabel = `Season ${season}`;
                const sObj = fileData.find(s => (s.title || "").includes(sLabel) || (s.title || "").includes(`S${season}`));
                if (sObj && sObj.folder) {
                    const eLabel = `Episode ${episode}`;
                    const eObj = sObj.folder.find(e => (e.title || "").includes(eLabel) || (e.title || "").includes(`E${episode}`));
                    if (eObj && eObj.file) processStr(eObj.file, `${animeTitle} S${season}E${episode}`);
                }
            }
        }

        return streams;
    } catch (error) {
        return [];
    }
}

module.exports = { getStreams };
