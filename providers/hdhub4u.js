// HDHub4u Nuvio Provider (Promise-only, Kotlin-faithful + defensive fixes)
// Version: 3.0.2 (Nuvio format)
// Uses cheerio-without-node-native. Exposes getStreams(tmdbId, mediaType, season, episode)

const cheerio = require('cheerio-without-node-native');

// ----------------------------- CONFIG ---------------------------------------
const TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c'; // keep as-is or move to config
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
let MAIN_URL = "https://hdhub4u.frl";
const DOMAINS_URL = "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json";

const DOMAIN_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours
let lastDomainUpdate = 0;

const DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Cookie": "xla=s4t",
    "Referer": `${MAIN_URL}/`,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
};

// clone + override helper
function buildHeaders(overrides) {
    const h = Object.assign({}, DEFAULT_HEADERS);
    if (overrides) Object.keys(overrides).forEach(k => h[k] = overrides[k]);
    return h;
}

// ----------------------------- UTILITIES ------------------------------------
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

function atobSafe(input) {
    if (!input) return '';
    try {
        let str = String(input).replace(/=+$/, '');
        if (str.length % 4 === 1) throw new Error('Invalid base64');
        let output = '';
        let bc = 0, bs, buffer, idx = 0;
        while ((buffer = str.charAt(idx++))) {
            buffer = BASE64_CHARS.indexOf(buffer);
            if (buffer === -1) continue;
            bs = bc % 4 ? bs * 64 + buffer : buffer;
            if (bc++ % 4) {
                output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
            }
        }
        return output;
    } catch (e) {
        try { return (typeof global !== 'undefined' && global.atob) ? global.atob(input) : ''; } catch (e2) { return ''; }
    }
}

function btoaSafe(input) {
    if (input == null) return '';
    try {
        let str = String(input);
        let output = '';
        let i = 0;
        while (i < str.length) {
            const chr1 = str.charCodeAt(i++);
            const chr2 = str.charCodeAt(i++);
            const chr3 = str.charCodeAt(i++);
            const enc1 = chr1 >> 2;
            const enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
            let enc3 = ((chr2 & 15) << 2) | (chr3 >> 6) || 64;
            let enc4 = (chr3 & 63) || 64;
            if (isNaN(chr2)) { enc3 = 64; enc4 = 64; } else if (isNaN(chr3)) enc4 = 64;
            output += BASE64_CHARS.charAt(enc1) + BASE64_CHARS.charAt(enc2) +
                BASE64_CHARS.charAt(enc3) + BASE64_CHARS.charAt(enc4);
        }
        return output;
    } catch (e) {
        try { return (typeof global !== 'undefined' && global.btoa) ? global.btoa(input) : ''; } catch (e2) { return ''; }
    }
}

function rot13(str) {
    if (!str) return '';
    return str.replace(/[a-zA-Z]/g, function (c) {
        return String.fromCharCode((c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26);
    });
}

function cleanTitle(raw) {
    if (!raw) return "";
    let name = raw.split('(')[0].trim();
    name = name.replace(/\s+/g, " ");
    return name.toLowerCase();
}

function getQualityFromString(str) {
    if (!str) return 'Unknown';
    if (/4\s?k/i.test(str)) return '4K';
    const m = str.match(/(\d{3,4})[pP]/);
    return m ? (m[1] + 'p') : 'Unknown';
}

function getQualityScore(q) {
    const map = { '4K': 5, '2160p': 5, '1080p': 4, '720p': 3, '480p': 2, '360p': 1 };
    return map[q] || 0;
}

// ----------------------------- NETWORK HELPERS -------------------------------

function fetchWithTimeout(url, options, timeoutMs) {
    timeoutMs = timeoutMs || 9000;
    try {
        const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        if (controller) {
            const tid = setTimeout(function () { try { controller.abort(); } catch (e) { } }, timeoutMs);
            const opts = Object.assign({}, options || {});
            opts.signal = controller.signal;
            return fetch(url, opts).then(function (r) { clearTimeout(tid); return r; }).catch(function (e) { clearTimeout(tid); throw e; });
        } else {
            return fetch(url, options);
        }
    } catch (e) {
        return Promise.reject(e);
    }
}

// simple promise pool
function promisePool(tasks, concurrency) {
    concurrency = concurrency || 5;
    let i = 0, active = 0;
    const total = tasks.length;
    const results = new Array(total);
    return new Promise(function (resolve) {
        if (total === 0) return resolve(results);
        function next() {
            while (active < concurrency && i < total) {
                const idx = i++;
                active++;
                Promise.resolve().then(function () { return tasks[idx](); })
                    .then(function (res) { results[idx] = res; })
                    .catch(function () { results[idx] = []; })
                    .finally(function () { active--; if (i >= total && active === 0) resolve(results); else next(); });
            }
        }
        next();
    });
}

// ----------------------------- DOMAIN MANAGEMENT -----------------------------

function updateDomain() {
    const now = Date.now();
    if (now - lastDomainUpdate < DOMAIN_CACHE_TTL) return Promise.resolve();
    return fetchWithTimeout(DOMAINS_URL, { method: 'GET', headers: buildHeaders() }, 9000)
        .then(function (r) {
            if (!r.ok) throw new Error('domains fetch failed: ' + r.status);
            return r.json();
        }).then(function (data) {
            lastDomainUpdate = now;
            if (data && data.HDHUB4u) {
                const newDomain = data.HDHUB4u;
                if (newDomain && newDomain !== MAIN_URL) MAIN_URL = newDomain;
                DEFAULT_HEADERS.Referer = `${MAIN_URL}/`;
            }
            return;
        }).catch(function () {
            lastDomainUpdate = Date.now();
            return;
        });
}

// ----------------------------- REDIRECT DECODING -----------------------------

/**
 * getRedirectLinks(url)
 * Follows the Kotlin chain: base64 -> base64 -> ROT13 -> base64 -> JSON
 * Defensive: fallbacks, returns original url if cannot decode
 */
function getRedirectLinks(url) {
    return fetchWithTimeout(url, { headers: buildHeaders() }, 9000)
        .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.text();
        }).then(function (html) {
            const regex = /s\(['"]o['"],\s*['"]([A-Za-z0-9+/=]+)['"]\)|ck\(['"]_wp_http_\d+['"],\s*['"]([^'"]+)['"]\)/g;
            let combined = '';
            let m;
            while ((m = regex.exec(html)) !== null) combined += m[1] || m[2] || '';

            if (!combined) {
                const fallback = html.match(/['"]([A-Za-z0-9+/=]{40,})['"]/);
                if (fallback) combined = fallback[1];
            }
            if (!combined) return url;

            try {
                const step1 = atobSafe(combined) || '';
                const step2 = atobSafe(step1) || '';
                const step3 = rot13(step2) || '';
                const step4 = atobSafe(step3) || '';

                // try parse JSON
                let parsed = null;
                try { parsed = JSON.parse(step4); } catch (e) {
                    if (step4 && step4.indexOf('http') === 0) return step4;
                    parsed = null;
                }

                if (parsed) {
                    if (parsed.o) {
                        const decO = atobSafe(parsed.o).trim();
                        if (decO) return decO;
                    }
                    if (parsed.blog_url && parsed.data) {
                        const dataParam = btoaSafe(parsed.data).trim();
                        if (parsed.blog_url && dataParam) {
                            return fetchWithTimeout(parsed.blog_url + '?re=' + dataParam, { headers: buildHeaders() }, 9000)
                                .then(function (r2) {
                                    if (!r2.ok) return url;
                                    return r2.text().then(function (t) {
                                        const $ = cheerio.load(t || '');
                                        const bodyText = $('body').text().trim();
                                        return bodyText || url;
                                    }).catch(function () { return url; });
                                }).catch(function () { return url; });
                        }
                    }
                }
                return url;
            } catch (e) {
                return url;
            }
        }).catch(function () {
            return url;
        });
}

// ----------------------------- EXTRACTORS -----------------------------------

function extractHubCloud(url, referer, quality) {
    let target = url || '';
    try { target = url.replace(/hubcloud\.ink/i, 'hubcloud.dad'); } catch (e) { target = url; }
    const headers = buildHeaders({ Referer: referer || target });

    return fetchWithTimeout(target, { headers: headers }, 9000)
        .then(function (r) {
            if (!r.ok) throw new Error('hubcloud page fetch failed');
            return r.text().then(function (html) {
                const jsRedirect = html.match(/var\s+url\s*=\s*'([^']+)'/);
                if (!/hubcloud\.php/i.test(target) && jsRedirect && jsRedirect[1]) {
                    const finalUrl = jsRedirect[1];
                    return fetchWithTimeout(finalUrl, { headers: buildHeaders({ Referer: target }) }, 9000)
                        .then(function (r2) {
                            if (!r2.ok) return { html: html, url: target };
                            return r2.text().then(function (t2) { return { html: t2, url: finalUrl }; }).catch(function () { return { html: html, url: target }; });
                        }).catch(function () { return { html: html, url: target }; });
                }
                return { html: html, url: target };
            });
        }).then(function (res) {
            const $ = cheerio.load(res.html || '');
            const currentUrl = res.url || target;
            const downloadHref = $('#download').attr('href');

            const prePromise = downloadHref ? (function () {
                let nextUrl = downloadHref;
                if (!/^https?:\/\//i.test(nextUrl)) {
                    try { nextUrl = new URL(downloadHref, currentUrl).toString(); } catch (e) { }
                }
                return fetchWithTimeout(nextUrl, { headers: buildHeaders({ Referer: currentUrl }) }, 9000)
                    .then(function (r3) { if (!r3.ok) return { html: res.html, url: currentUrl }; return r3.text().then(function (t3) { return { html: t3, url: nextUrl }; }).catch(function () { return { html: res.html, url: currentUrl }; }); })
                    .catch(function () { return { html: res.html, url: currentUrl }; });
            })() : Promise.resolve({ html: res.html, url: currentUrl });

            return prePromise.then(function (upd) {
                const htmlToParse = (upd && upd.html) ? upd.html : (res.html || '');
                const pageUrl = (upd && upd.url) ? upd.url : currentUrl;
                const $$ = cheerio.load(htmlToParse);

                const size = $$('i#size').text().trim() || '';
                const title = $$('div.card-header').text().trim() || '';
                const headerDetails = title || '';
                const labelExtras = (headerDetails ? '[' + headerDetails + ']' : '') + (size ? '[' + size + ']' : '');
                const elems = $$('div.card-body h2 a.btn').toArray();

                const links = [];
                const tasks = elems.map(function (el) {
                    return function () {
                        try {
                            const linkUrl = $$(el).attr('href');
                            const btnText = ($$(el).text() || '').trim();
                            const serverLabel = "HDHub4u " + (btnText || "HubCloud");
                            const base = { title: title || "Unknown", quality: quality || "Unknown", size: size || "Unknown", headers: buildHeaders(), provider: 'hdhub4u' };

                            if (!linkUrl) return Promise.resolve();

                            if (/Download File|FSL Server|S3 Server|Mega Server|FSLv2/i.test(btnText)) {
                                links.push(Object.assign({}, base, { name: serverLabel, url: linkUrl }));
                                return Promise.resolve();
                            }

                            if (/BuzzServer/i.test(btnText)) {
                                return fetchWithTimeout(linkUrl + '/download', { method: 'GET', headers: buildHeaders({ Referer: linkUrl }), redirect: 'manual' }, 9000)
                                    .then(function (resBuzz) {
                                        const hx = (resBuzz.headers && resBuzz.headers.get && (resBuzz.headers.get('hx-redirect') || resBuzz.headers.get('location')));
                                        if (hx) links.push(Object.assign({}, base, { name: serverLabel, url: hx }));
                                    }).catch(function () { });
                            }

                            if (/pixeldra|pixel/i.test(linkUrl + ' ' + btnText)) {
                                const fileId = linkUrl.split('/').pop();
                                const dl = `https://pixeldrain.com/api/file/${fileId}?download`;
                                links.push(Object.assign({}, base, { name: "HDHub4u PixelDrain", url: dl }));
                                return Promise.resolve();
                            }

                            if (/10Gbps/i.test(btnText)) {
                                const follow = function (u, cnt) {
                                    if (!u || cnt > 5) return Promise.resolve(null);
                                    return fetchWithTimeout(u, { method: 'GET', headers: buildHeaders(), redirect: 'manual' }, 9000)
                                        .then(function (rFollow) {
                                            const loc = (rFollow.headers && rFollow.headers.get && rFollow.headers.get('location')) || '';
                                            if (!loc) return null;
                                            if (loc.indexOf('link=') !== -1) return decodeURIComponent(loc.split('link=')[1]);
                                            try { const resolved = new URL(loc, u).toString(); return follow(resolved, cnt + 1); } catch (e) { return null; }
                                        }).catch(function () { return null; });
                                };
                                return follow(linkUrl, 0).then(function (final) { if (final) links.push(Object.assign({}, base, { name: serverLabel, url: final })); });
                            }

                            // fallback - ignore or you can call generic extractor
                            return Promise.resolve();
                        } catch (err) { return Promise.resolve(); }
                    };
                });

                return promisePool(tasks, 5).then(function () { return links; });
            });
        }).catch(function () { return []; });
}

function extractHubCdn(url) {
    return fetchWithTimeout(url, { headers: buildHeaders() }, 9000)
        .then(function (r) { if (!r.ok) throw new Error('hubcdn fetch failed'); return r.text(); })
        .then(function (html) {
            const m = html.match(/r=([A-Za-z0-9+/=]+)/);
            if (m && m[1]) {
                const dec = atobSafe(m[1]);
                const final = dec && dec.split('link=')[1];
                if (final) return [{ name: "HDHub4u HubCDN", url: final, quality: "Unknown", provider: "hdhub4u", headers: buildHeaders() }];
            }
            return [];
        }).catch(function () { return []; });
}

function extractPixeldrain(url, quality) {
    try {
        const id = url.split('/').pop();
        const dl = `https://pixeldrain.com/api/file/${id}?download`;
        return Promise.resolve([{ name: "HDHub4u PixelDrain", url: dl, quality: quality || "Unknown", provider: "hdhub4u", headers: buildHeaders() }]);
    } catch (e) { return Promise.resolve([]); }
}

function extractDirect(url, quality) {
    return Promise.resolve([{ name: "HDHub4u Direct", url: url, quality: quality || "Unknown", provider: "hdhub4u", headers: buildHeaders() }]);
}

function resolveExtractor(url, referer, quality) {
    const u = (url || '').toLowerCase();
    if (u.indexOf('hubcloud') !== -1 || u.indexOf('hubdrive') !== -1) return extractHubCloud(url, referer, quality);
    if (u.indexOf('hubcdn') !== -1) return extractHubCdn(url);
    if (u.indexOf('pixeldrain') !== -1) return extractPixeldrain(url, quality);
    if (/\.(mp4|mkv|webm)$/i.test(u)) return extractDirect(url, quality);
    return Promise.resolve([]); // unsupported host
}

// ----------------------------- SEARCH + MAIN --------------------------------

function search(query) {
    return updateDomain().then(function () {
        const url = `${MAIN_URL}/?s=${encodeURIComponent(query)}`;
        return fetchWithTimeout(url, { headers: buildHeaders() }, 9000)
            .then(function (r) { if (!r.ok) return []; return r.text(); })
            .then(function (html) {
                const $ = cheerio.load(html || '');
                const results = [];
                $('.recent-movies > li.thumb').each(function (i, el) {
                    try {
                        const title = $(el).find('figcaption p').first().text().trim();
                        const link = $(el).find('figure a').attr('href');
                        if (link) results.push({ title: title || '', link: link });
                    } catch (e) { }
                });
                return results;
            }).catch(function () { return []; });
    });
}

/**
 * getStreams(tmdbId, mediaType='movie'|'tv', season, episode)
 * Returns Promise -> [ { name, title, url, quality, size, headers, provider } ]
 */
function getStreams(tmdbId, mediaType, season, episode) {
    mediaType = mediaType || 'movie';
    season = season || null;
    episode = (typeof episode !== 'undefined') ? episode : null;

    const typePath = mediaType === 'tv' ? 'tv' : 'movie';
    const tmdbUrl = `${TMDB_BASE_URL}/${typePath}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;

    return fetchWithTimeout(tmdbUrl, { headers: buildHeaders() }, 9000)
        .then(function (r) { if (!r.ok) throw new Error('tmdb fetch failed ' + r.status); return r.json(); })
        .then(function (meta) {
            const title = mediaType === 'tv' ? (meta && meta.name) : (meta && meta.title);
            if (!title) throw new Error('No title from TMDB');
            const cleaned = cleanTitle(title);
            let query = title;
            if (mediaType === 'tv' && season) query += ' Season ' + season;

            return search(query).then(function (results) {
                if (!results || results.length === 0) return [];
                let target = null;
                for (let i = 0; i < results.length; i++) {
                    if (cleanTitle(results[i].title).indexOf(cleaned) !== -1) { target = results[i]; break; }
                }
                if (!target) target = results[0];
                if (!target || !target.link) return [];

                // fetch target page
                return fetchWithTimeout(target.link, { headers: buildHeaders() }, 9000)
                    .then(function (r2) { if (!r2.ok) return []; return r2.text(); })
                    .then(function (html) {
                        const $ = cheerio.load(html || '');
                        const linksToProcess = [];

                        if (mediaType === 'movie') {
                            $('h3 a, h4 a').each(function (i, el) {
                                try {
                                    const txt = $(el).text() || '';
                                    const href = $(el).attr('href');
                                    if (txt && href && txt.match(/480|720|1080|2160|4K/i)) linksToProcess.push({ url: href, quality: getQualityFromString(txt) });
                                } catch (e) { }
                            });
                        } else {
                            $('h3, h4').each(function (i, el) {
                                try {
                                    const headerText = $(el).text() || '';
                                    const hasQualityLinks = $(el).find('a').toArray().some(function (a) { try { return ($(a).text() || '').match(/1080|720|4K|2160/i); } catch (e) { return false; } });
                                    const epMatch = headerText.match(/(?:Episode|E)\s*(\d+)/i);
                                    const epNum = epMatch ? parseInt(epMatch[1]) : null;

                                    if (hasQualityLinks) {
                                        $(el).find('a').each(function (j, a) { const hh = $(a).attr('href'); if (hh) linksToProcess.push({ url: hh, isRedirectBlock: true, targetEpisode: episode }); });
                                    } else if (epNum && episode !== null && epNum === episode) {
                                        $(el).find('a').each(function (j, a) { const hh = $(a).attr('href'); if (hh) linksToProcess.push({ url: hh, quality: "Unknown" }); });
                                        let next = $(el).next();
                                        while (next && next.length && !next.is('hr') && !next.is('h3') && !next.is('h4')) {
                                            next.find('a').each(function (k, a) { const hh = $(a).attr('href'); if (hh) linksToProcess.push({ url: hh, quality: "Unknown" }); });
                                            next = next.next();
                                        }
                                    }
                                } catch (e) { }
                            });
                        }

                        // Create tasks
                        const tasks = linksToProcess.map(function (linkObj) {
                            return function () {
                                const url = linkObj.url;
                                const quality = linkObj.quality || "Unknown";
                                const isRedirectBlock = !!linkObj.isRedirectBlock;
                                const targetEpisode = linkObj.targetEpisode;

                                if (isRedirectBlock) {
                                    return getRedirectLinks(url).then(function (resolved) {
                                        if (!resolved) return [];
                                        return fetchWithTimeout(resolved, { headers: buildHeaders() }, 9000)
                                            .then(function (r3) { if (!r3.ok) return []; return r3.text(); })
                                            .then(function (subHtml) {
                                                const $$ = cheerio.load(subHtml || '');
                                                const subLinks = [];
                                                $$('h5 a').each(function (i, el) {
                                                    try {
                                                        const t = $$(el).text() || '';
                                                        const match = t.match(/(?:Episode|E)\s*(\d+)/i);
                                                        if (match && parseInt(match[1]) === targetEpisode) {
                                                            const href = $$(el).attr('href');
                                                            if (href) subLinks.push({ url: href, quality: getQualityFromString(t) || "Unknown" });
                                                        }
                                                    } catch (e) { }
                                                });

                                                const subTasks = subLinks.map(function (sl) {
                                                    return function () { return getRedirectLinks(sl.url).then(function (finalUrl) { if (!finalUrl) return []; return resolveExtractor(finalUrl, resolved, sl.quality); }).catch(function () { return []; }); };
                                                });

                                                return promisePool(subTasks, 4).then(function (res) { return res.flat(); });
                                            }).catch(function () { return []; });
                                    }).catch(function () { return []; });
                                } else {
                                    return getRedirectLinks(url).then(function (finalUrl) {
                                        if (!finalUrl) return [];
                                        return resolveExtractor(finalUrl, target.link || MAIN_URL, quality).then(function (s) { return s || []; }).catch(function () { return []; });
                                    }).catch(function () { return []; });
                                }
                            };
                        });

                        return promisePool(tasks, 5).then(function (results) {
                            const flat = results.flat();
                            const unique = [];
                            const seen = new Set();
                            for (let i = 0; i < flat.length; i++) {
                                const s = flat[i];
                                if (!s || !s.url) continue;
                                if (seen.has(s.url)) continue;
                                seen.add(s.url);
                                s.quality = s.quality || "Unknown";
                                s.size = s.size || "Unknown";
                                s.headers = s.headers || buildHeaders();
                                s.provider = s.provider || 'hdhub4u';
                                unique.push(s);
                            }
                            unique.sort(function (a, b) { return getQualityScore(b.quality) - getQualityScore(a.quality); });
                            return unique;
                        });
                    }).catch(function () { return []; });
            }).catch(function () { return []; });
        }).catch(function () { return []; });
}

// Export for Nuvio
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.HDHub4uScraper = { getStreams: getStreams };
}
