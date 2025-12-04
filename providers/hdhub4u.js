// HDHub4u Scraper for Nuvio
// Ported from Kotlin source (HDhub4uProvider.kt, Extractors.kt, Utils.kt)
// Strict Promise-based implementation (No async/await)
// v2.2.0

const cheerio = require('cheerio-without-node-native');

// Configuration
const TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
let MAIN_URL = "https://hdhub4u.frl"; 
const DOMAINS_URL = "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json";

// Header Management
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
    "Cookie": "xla=s4t",
    "Referer": `${MAIN_URL}/`,
};

// =================================================================================
// POLYFILLS & UTILS (Ported from Utils.kt)
// =================================================================================

// React Native safe Atob/Btoa (No Buffer allowed)
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

function atob(input) {
    let str = String(input).replace(/=+$/, '');
    if (str.length % 4 === 1) throw new Error("'atob' failed: The string to be decoded is not correctly encoded.");
    for (var bc = 0, bs, buffer, idx = 0, output = ''; buffer = str.charAt(idx++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
        buffer = chars.indexOf(buffer);
    }
    return output;
}

function btoa(input) {
    let str = String(input);
    for (var block, charCode, idx = 0, map = chars, output = ''; str.charAt(idx | 0) || (map = '=', idx % 1); output += map.charAt(63 & block >> 8 - idx % 1 * 8)) {
        charCode = str.charCodeAt(idx += 3 / 4);
        if (charCode > 0xFF) throw new Error("'btoa' failed: The string to be encoded contains characters outside of the Latin1 range.");
        block = block << 8 | charCode;
    }
    return output;
}

// Kotlin: pen(value) -> ROT13
function rot13(str) {
    return str.replace(/[a-zA-Z]/g, function(c) {
        return String.fromCharCode((c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26);
    });
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return 'Unknown';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getQualityFromString(str) {
    if (!str) return 'Unknown';
    const match = str.match(/(\d{3,4})[pP]|4[kK]/);
    if (match) {
        if (match[0].toLowerCase() === '4k') return '4K';
        return match[1] + 'p';
    }
    return 'Unknown';
}

function getQualityScore(qualityStr) {
    const map = { '4K': 5, '2160p': 5, '1080p': 4, '720p': 3, '480p': 2, '360p': 1 };
    return map[qualityStr] || 0;
}

// Kotlin: getRedirectLinks(url)
// Decoding Chain from Utils.kt: base64Decode(pen(base64Decode(base64Decode(combinedString))))
function getRedirectLinks(url) {
    return fetch(url, { headers: HEADERS })
        .then(function(res) { return res.text(); })
        .then(function(html) {
            const regex = /s\('o','([A-Za-z0-9+/=]+)'|ck\('_wp_http_\d+','([^']+)'/g;
            let combinedString = "";
            let match;
            
            while ((match = regex.exec(html)) !== null) {
                const val = match[1] || match[2];
                if (val) combinedString += val;
            }

            if (!combinedString) return url;

            try {
                // Strict recreation of Kotlin decoding chain
                const step1 = atob(combinedString); // 1st Decode
                const step2 = atob(step1);          // 2nd Decode
                const step3 = rot13(step2);         // Apply Pen (ROT13)
                const step4 = atob(step3);          // 3rd Decode
                
                const json = JSON.parse(step4);
                
                // Option A: 'o' param
                const oParam = json.o ? atob(json.o).trim() : "";
                if (oParam) return oParam;

                // Option B: 'blog_url' + 'data'
                const dataParam = json.data ? btoa(json.data).trim() : ""; 
                const blogUrl = json.blog_url ? json.blog_url.trim() : "";

                if (blogUrl && dataParam) {
                     return fetch(blogUrl + "?re=" + dataParam, { headers: HEADERS })
                        .then(function(r) { return r.text(); })
                        .then(function(t) {
                            const $ = cheerio.load(t);
                            const bodyText = $('body').text().trim();
                            return bodyText || url;
                        });
                }
                
                return url;

            } catch (e) {
                console.log("[HDHub4u] Redirect decode error:", e.message);
                return url;
            }
        }).catch(function() { return url; });
}

// =================================================================================
// EXTRACTORS (Ported from Extractors.kt)
// =================================================================================

function extractHubCloud(url, referer, quality) {
    let targetUrl = url.replace("hubcloud.ink", "hubcloud.dad");
    
    return fetch(targetUrl, { headers: { ...HEADERS, Referer: referer } })
        .then(function(res) { return res.text(); })
        .then(function(html) {
            let finalUrl = targetUrl;
            
            // Check for JS redirection: var url = '...'
            const jsRedirect = html.match(/var url = '([^']+)'/);
            if (!targetUrl.includes("hubcloud.php") && jsRedirect) {
                finalUrl = jsRedirect[1];
                return fetch(finalUrl, { headers: { ...HEADERS, Referer: targetUrl } })
                    .then(function(r) { return r.text(); })
                    .then(function(t) { return { html: t, url: finalUrl }; });
            }
            return { html: html, url: finalUrl };
        })
        .then(function(result) {
            const $ = cheerio.load(result.html);
            const size = $('i#size').text().trim();
            const title = $('div.card-header').text().trim();
            const links = [];

            const elements = $('div.card-body h2 a.btn').toArray();
            
            const promises = elements.map(function(el) {
                const linkUrl = $(el).attr('href');
                const btnText = $(el).text().trim();
                const server = "HDHub4u " + (btnText || "HubCloud");
                
                const streamBase = {
                    title: title || "Unknown",
                    quality: quality,
                    size: size || "Unknown",
                    headers: HEADERS,
                    provider: 'hdhub4u'
                };

                // 1. Direct Download / FSL / S3
                if (btnText.includes("Download File") || btnText.includes("FSL Server") || btnText.includes("S3 Server") || btnText.includes("Mega Server")) {
                    links.push({ ...streamBase, name: server, url: linkUrl });
                    return Promise.resolve();
                } 
                // 2. BuzzServer (Requires handling hx-redirect header)
                else if (btnText.includes("BuzzServer")) {
                    return fetch(linkUrl + "/download", { method: 'GET', headers: { ...HEADERS, Referer: linkUrl }, redirect: 'manual' })
                        .then(function(res) {
                            const hxRedirect = res.headers.get('hx-redirect') || res.headers.get('location');
                            if (hxRedirect) {
                                links.push({ ...streamBase, name: server, url: hxRedirect });
                            }
                        }).catch(function() {});
                }
                // 3. PixelDrain
                else if (linkUrl.includes("pixeldra")) {
                    const fileId = linkUrl.split('/').pop();
                    const dlUrl = "https://pixeldrain.com/api/file/" + fileId + "?download";
                    links.push({ ...streamBase, name: "HDHub4u PixelDrain", url: dlUrl });
                    return Promise.resolve();
                }
                // 4. 10Gbps (Redirect Loop)
                else if (btnText.includes("10Gbps")) {
                    // Recursive promise to follow redirects manually
                    const follow = function(u, count) {
                        if (count > 3) return Promise.resolve(null);
                        return fetch(u, { method: 'GET', redirect: 'manual' })
                            .then(function(res) {
                                const loc = res.headers.get('location');
                                if (!loc) return null;
                                if (loc.includes('link=')) return loc.split('link=')[1];
                                return follow(loc, count + 1);
                            }).catch(function() { return null; });
                    };
                    return follow(linkUrl, 0).then(function(final) {
                        if (final) links.push({ ...streamBase, name: server, url: final });
                    });
                }
                
                return Promise.resolve();
            });

            return Promise.all(promises).then(function() { return links; });
        }).catch(function(e) {
            console.log("HubCloud Extract Error:", e.message);
            return [];
        });
}

function extractHubCdn(url) {
    return fetch(url, { headers: HEADERS })
        .then(function(res) { return res.text(); })
        .then(function(html) {
            const match = html.match(/r=([A-Za-z0-9+/=]+)/);
            if (match) {
                const decoded = atob(match[1]);
                const finalLink = decoded.split('link=')[1];
                if (finalLink) {
                    return [{
                        name: "HDHub4u HubCDN",
                        url: finalLink,
                        quality: "Unknown",
                        provider: "hdhub4u"
                    }];
                }
            }
            return [];
        }).catch(function() { return []; });
}

function resolveExtractor(url, referer, quality) {
    const u = url.toLowerCase();
    
    if (u.includes("hubcloud") || u.includes("hubdrive")) {
        return extractHubCloud(url, referer, quality);
    }
    if (u.includes("hubcdn")) {
        return extractHubCdn(url);
    }
    if (u.includes("pixeldrain")) {
        const fileId = url.split('/').pop();
        return Promise.resolve([{
            name: "HDHub4u PixelDrain",
            url: "https://pixeldrain.com/api/file/" + fileId + "?download",
            quality: quality,
            provider: "hdhub4u"
        }]);
    }
    
    // Direct Video Fallback
    if (u.match(/\.(mp4|mkv)$/)) {
        return Promise.resolve([{
             name: "HDHub4u Direct",
             url: url,
             quality: quality,
             provider: "hdhub4u"
        }]);
    }
    
    return Promise.resolve([]);
}

// =================================================================================
// MAIN PROVIDER LOGIC
// =================================================================================

function updateDomain() {
    return fetch(DOMAINS_URL)
        .then(function(r) { return r.json(); })
        .then(function(d) {
            if (d && d.HDHUB4u) {
                MAIN_URL = d.HDHUB4u;
                HEADERS.Referer = MAIN_URL + "/";
            }
        })
        .catch(function() {});
}

function search(query) {
    return updateDomain().then(function() {
        const searchUrl = MAIN_URL + "/?s=" + encodeURIComponent(query);
        return fetch(searchUrl, { headers: HEADERS });
    })
    .then(function(res) { return res.text(); })
    .then(function(html) {
        const $ = cheerio.load(html);
        const results = [];
        $('.recent-movies > li.thumb').each(function(i, el) {
            const title = $(el).find('figcaption p').first().text().trim();
            const link = $(el).find('figure a').attr('href');
            results.push({ title: title, link: link });
        });
        return results;
    });
}

function getStreams(tmdbId, mediaType, season, episode) {
    const typePath = mediaType === 'tv' ? 'tv' : 'movie';
    const tmdbUrl = "https://api.themoviedb.org/3/" + typePath + "/" + tmdbId + "?api_key=" + TMDB_API_KEY;
    
    return fetch(tmdbUrl).then(function(r) { return r.json(); }).then(function(meta) {
        const title = mediaType === 'tv' ? meta.name : meta.title;
        
        // Search Strategy
        let query = title;
        if (mediaType === 'tv') query += " Season " + season;

        return search(query).then(function(results) {
            if (!results.length) return [];

            // Simple Fuzzy Match to pick best result
            const targetResult = results.find(function(r) { return r.title.toLowerCase().includes(title.toLowerCase()); });
            const pageUrl = targetResult ? targetResult.link : results[0].link;
            
            if (!pageUrl) return [];

            return fetch(pageUrl, { headers: HEADERS })
                .then(function(r) { return r.text(); })
                .then(function(html) {
                    const $ = cheerio.load(html);
                    const linksToProcess = [];

                    if (mediaType === 'movie') {
                        $('h3 a, h4 a').each(function(i, el) {
                            const txt = $(el).text();
                            const href = $(el).attr('href');
                            if (txt.match(/480|720|1080|2160|4K/i) && href) {
                                linksToProcess.push({ url: href, quality: getQualityFromString(txt) });
                            }
                        });
                    } else {
                        // TV Logic: Ported from HDhub4uProvider.kt
                        
                        // 1. Identify Headers
                        $('h3, h4').each(function(i, el) {
                            const headerText = $(el).text();
                            
                            // Check for Direct Link Blocks (e.g. "1080p 10Bit ...")
                            // These link to a separate page with the episode list
                            const hasQualityLinks = $(el).find('a').toArray().some(function(a) { return $(a).text().match(/1080|720|4K/i); });

                            // Check for Episode Header (e.g. "Episode 1")
                            const epMatch = headerText.match(/(?:Episode|E)\s*(\d+)/i);
                            const epNumFromHeader = epMatch ? parseInt(epMatch[1]) : null;

                            if (hasQualityLinks) {
                                // Add these redirects to be processed
                                const links = $(el).find('a').map(function(j, a) { return $(a).attr('href'); }).get();
                                links.forEach(function(l) {
                                    linksToProcess.push({ 
                                        url: l, 
                                        isRedirectBlock: true, 
                                        targetEpisode: episode 
                                    });
                                });
                            } 
                            else if (epNumFromHeader === episode) {
                                // We found "Episode X" header directly
                                const links = $(el).find('a').map(function(j, a) { return $(a).attr('href'); }).get();
                                links.forEach(function(l) { linksToProcess.push({ url: l, quality: "Unknown" }); });

                                // Check siblings for links until next header
                                let next = $(el).next();
                                while(next.length && !next.is('hr') && !next.is('h3') && !next.is('h4')) {
                                    next.find('a').each(function(k, a) {
                                        linksToProcess.push({ url: $(a).attr('href'), quality: "Unknown" });
                                    });
                                    next = next.next();
                                }
                            }
                        });
                    }

                    // Process Links (Resolve redirects and extract)
                    const streamPromises = linksToProcess.map(function(linkObj) {
                        const url = linkObj.url;
                        const quality = linkObj.quality;
                        const isRedirectBlock = linkObj.isRedirectBlock;
                        const targetEpisode = linkObj.targetEpisode;

                        if (isRedirectBlock) {
                            // Follow redirect -> Find Episode in new page
                            return getRedirectLinks(url).then(function(resolved) {
                                return fetch(resolved, { headers: HEADERS }).then(function(r) { return r.text(); }).then(function(subHtml) {
                                    const $$ = cheerio.load(subHtml);
                                    const subLinks = [];
                                    
                                    $$('h5 a').each(function(i, el) {
                                        const t = $$(el).text();
                                        const match = t.match(/(?:Episode|E)\s*(\d+)/i);
                                        if (match && parseInt(match[1]) === targetEpisode) {
                                            subLinks.push({ 
                                                url: $$(el).attr('href'), 
                                                quality: getQualityFromString(t) || "Unknown" 
                                            });
                                        }
                                    });

                                    const subPromises = subLinks.map(function(sl) {
                                        return getRedirectLinks(sl.url).then(function(finalUrl) {
                                             return resolveExtractor(finalUrl, resolved, sl.quality);
                                        });
                                    });
                                    return Promise.all(subPromises).then(function(res) { return res.flat(); });
                                }).catch(function() { return []; });
                            });
                        } else {
                            // Standard Link
                            return getRedirectLinks(url).then(function(finalUrl) {
                                return resolveExtractor(finalUrl, pageUrl, quality);
                            });
                        }
                    });

                    return Promise.all(streamPromises).then(function(results) {
                        const allStreams = results.flat().filter(function(s) { return s && s.url; });
                        
                        // Deduplicate based on URL
                        const uniqueStreams = [];
                        const seen = new Set();
                        allStreams.forEach(function(s) {
                            if (!seen.has(s.url)) {
                                seen.add(s.url);
                                uniqueStreams.push(s);
                            }
                        });

                        // Sort by Quality
                        return uniqueStreams.sort(function(a, b) { return getQualityScore(b.quality) - getQualityScore(a.quality); });
                    });
                });
        });
    }).catch(function(err) {
        console.error("HDHub4u Global Error:", err.message);
        return [];
    });
}

// Export for Nuvio
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = getStreams;
}
