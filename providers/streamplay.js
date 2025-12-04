// Streamplay Direct Scraper for Nuvio
// VERSION: 1.0 (Direct HTTP APIs)
// Sources: MappleTV, VidRock, Nepu, XDMovies

const TMDB_API = 'https://api.themoviedb.org/3';
const TMDB_KEY = '439c478a771f35c05022f9feabcca01c';

// --- Configuration ---
const MAPPLE_API = "https://mapple.uk";
const VIDROCK_API = "https://vidrock.net";
const NEPU_API = "https://nepu.to";
const XDMOVIES_API = "https://xdmovies.site";
const ENC_DEC_API = "https://enc-dec.app/api"; // Middleware for Mapple

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36',
    'Referer': 'https://google.com/'
};

// --- Helpers ---

function fetchRequest(url, opts) {
    var options = opts || {};
    options.headers = Object.assign({}, HEADERS, options.headers || {});
    return fetch(url, options).then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res;
    });
}

function fetchJson(url, opts) {
    return fetchRequest(url, opts).then(function(res) { return res.json(); });
}

function fetchText(url, opts) {
    return fetchRequest(url, opts).then(function(res) { return res.text(); });
}

function getQuality(str) {
    str = (str || '').toLowerCase();
    if (str.includes('2160p') || str.includes('4k')) return '4K';
    if (str.includes('1080p')) return '1080p';
    if (str.includes('720p')) return '720p';
    if (str.includes('480p')) return '480p';
    return 'Unknown';
}

function base64Encode(str) {
    return btoa(str); // Standard JS Base64
}

function cleanTitle(str) {
    return str.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
}

// --- ID Mapping ---

function getTmdbInfo(tmdbId, type) {
    var url = TMDB_API + '/' + type + '/' + tmdbId + '?api_key=' + TMDB_KEY;
    return fetchJson(url).then(function(data) {
        return {
            title: type === 'movie' ? data.title : data.name,
            year: (type === 'movie' ? data.release_date : data.first_air_date || '').split('-')[0],
            original_title: type === 'movie' ? data.original_title : data.original_name
        };
    });
}

// --- SOURCE 1: MappleTV (API) ---
// Ported from: invokeMappleTv
function invokeMappleTV(tmdbId, season, episode) {
    // 1. Get Session ID from Middleware
    return fetchJson(ENC_DEC_API + "/enc-mapple")
        .then(function(res) {
            var sessionId = res.result ? res.result.sessionId : null;
            if (!sessionId) return [];

            var type = season ? "tv" : "movie";
            var url = season 
                ? MAPPLE_API + "/watch/tv/" + tmdbId + "/" + season + "-" + episode
                : MAPPLE_API + "/watch/movie/" + tmdbId;

            var headers = {
                "Next-Action": "40770771b1e06bb7435ca5d311ed845d4fd406dca2",
                "Referer": MAPPLE_API + "/",
                "Content-Type": "text/plain;charset=UTF-8"
            };

            var sources = ["mapple", "alfa", "sakura", "wiggles"];
            var promises = sources.map(function(source) {
                var payload = [{
                    "mediaId": parseInt(tmdbId),
                    "mediaType": type,
                    "tv_slug": season ? season + "-" + episode : "",
                    "source": source,
                    "useFallbackVideo": false,
                    "sessionId": sessionId
                }];

                return fetch(url, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(payload)
                }).then(function(res) { return res.text(); }).then(function(text) {
                    // Response format: 1:{"data":{...}}
                    var parts = text.split("\n");
                    for (var i = 0; i < parts.length; i++) {
                        if (parts[i].includes('{"data":')) {
                            var jsonStr = parts[i].substring(parts[i].indexOf('{'));
                            var json = JSON.parse(jsonStr);
                            if (json.data && json.data.stream_url) {
                                return {
                                    name: "MappleTV | " + source.charAt(0).toUpperCase() + source.slice(1),
                                    title: "Stream",
                                    url: json.data.stream_url,
                                    quality: "1080p", // Mapple is usually high quality
                                    provider: "MappleTV",
                                    type: 'hls',
                                    headers: { "Referer": MAPPLE_API + "/" }
                                };
                            }
                        }
                    }
                    return null;
                }).catch(function() { return null; });
            });

            return Promise.all(promises);
        })
        .then(function(results) {
            return results.filter(function(r) { return r !== null; });
        })
        .catch(function() { return []; });
}

// --- SOURCE 2: VidRock (API) ---
// Ported from: invokevidrock
function invokeVidRock(tmdbId, season, episode) {
    var type = season ? "tv" : "movie";
    
    // Logic: Encode ID (Double Base64 of Reversed String)
    // Kotlin: base = "$tmdb-$season-$episode" or mapped ID. 
    // Simplified port: direct ID usage is robust.
    var base = season ? tmdbId + "-" + season + "-" + episode : tmdbId.toString();
    
    // Reverse string
    var reversed = base.split("").reverse().join("");
    // Double Base64 Encode
    var encoded = btoa(btoa(reversed));

    var url = VIDROCK_API + "/api/" + type + "/" + encoded;

    return fetchJson(url)
        .then(function(json) {
            var streams = [];
            Object.keys(json).forEach(function(key) {
                var source = json[key];
                var rawUrl = source.url;
                if (!rawUrl || rawUrl === "null") return;

                // Decode if percent-encoded
                if (rawUrl.includes("%")) {
                    try { rawUrl = decodeURIComponent(rawUrl); } catch(e) {}
                }

                var quality = source.resolution || "Unknown";
                
                streams.push({
                    name: "VidRock | " + quality,
                    title: "VidRock Stream",
                    url: rawUrl,
                    quality: quality.toString() + "p",
                    provider: "VidRock",
                    type: rawUrl.includes('.m3u8') ? 'hls' : 'video',
                    headers: { "Origin": VIDROCK_API }
                });
            });
            return streams;
        })
        .catch(function() { return []; });
}

// --- SOURCE 3: Nepu (AJAX) ---
// Ported from: invokeNepu
function invokeNepu(title, year, season, episode) {
    if (!title) return Promise.resolve([]);
    
    // 1. Search
    var searchUrl = NEPU_API + "/ajax/posts?q=" + encodeURIComponent(title);
    var headers = { "X-Requested-With": "XMLHttpRequest", "Referer": NEPU_API + "/" };

    return fetchJson(searchUrl, { headers: headers })
        .then(function(json) {
            var data = json.data;
            if (!data) return [];

            // Find matching item
            var slug = cleanTitle(title).replace(/ /g, '-');
            var prefix = season ? "/serie/" : "/movie/";
            
            var match = data.find(function(item) {
                return item.url && item.url.includes(prefix + slug);
            });

            if (!match) return [];

            var mediaUrl = match.url; // Relative path e.g. /movie/title-year...
            var fullUrl = NEPU_API + mediaUrl;
            
            if (season) {
                fullUrl += "/season/" + season + "/episode/" + episode;
            }

            // 2. Get Page to find Data ID
            return fetchText(fullUrl).then(function(html) {
                var idMatch = /data-embed="([^"]+)"/.exec(html);
                if (!idMatch) return [];
                var dataId = idMatch[1];

                // 3. Post to get Embed
                return fetch(NEPU_API + "/ajax/embed", {
                    method: 'POST',
                    headers: Object.assign({}, headers, { "Content-Type": "application/x-www-form-urlencoded" }),
                    body: "id=" + dataId
                }).then(function(res) { return res.text(); }).then(function(embedHtml) {
                    // Extract M3U8 from response text
                    var m3u8Match = /(https?:\/\/[^"]+\.m3u8)/.exec(embedHtml);
                    if (m3u8Match) {
                        return [{
                            name: "Nepu | Auto",
                            title: title,
                            url: m3u8Match[1],
                            quality: "1080p",
                            provider: "Nepu",
                            type: 'hls',
                            headers: { "Referer": NEPU_API + "/" }
                        }];
                    }
                    return [];
                });
            });
        })
        .catch(function() { return []; });
}

// --- SOURCE 4: XDMovies (Search API) ---
// Ported from: invokeXDmovies
function invokeXDMovies(title, tmdbId, season, episode) {
    if (!title) return Promise.resolve([]);

    var headers = {
        "Referer": XDMOVIES_API + "/",
        "x-requested-with": "XMLHttpRequest",
        "x-auth-token": atob("NzI5N3Nra2loa2Fqd25zZ2FrbGFrc2h1d2Q=") // From Kotlin code
    };

    var searchUrl = XDMOVIES_API + "/php/search_api.php?query=" + encodeURIComponent(title) + "&fuzzy=true";

    return fetchJson(searchUrl, { headers: headers })
        .then(function(results) {
            // Find match by TMDB ID
            var match = results.find(function(item) { return item.tmdb_id == tmdbId; });
            if (!match) return [];

            var pageUrl = XDMOVIES_API + match.path;

            return fetchText(pageUrl).then(function(html) {
                var streams = [];
                
                if (!season) {
                    // Movie: Look for download button
                    var linkMatch = /<div class="download-item[^>]*>[\s\S]*?<a href="([^"]+)"/.exec(html);
                    if (linkMatch) {
                        streams.push({
                            name: "XDMovies | Direct",
                            title: title,
                            url: linkMatch[1],
                            quality: "1080p",
                            provider: "XDMovies",
                            type: 'url'
                        });
                    }
                } else {
                    // TV: Look for Episode card
                    // Simplified regex for episode
                    var epRegex = new RegExp("S" + String(season).padStart(2, '0') + "E" + String(episode).padStart(2, '0'), "i");
                    // Split by episode cards
                    var cards = html.split('class="episode-card"');
                    for (var i = 1; i < cards.length; i++) {
                        var card = cards[i];
                        if (epRegex.test(card)) {
                            var link = /href="([^"]+)"/.exec(card);
                            if (link) {
                                streams.push({
                                    name: "XDMovies | Direct",
                                    title: title,
                                    url: link[1],
                                    quality: "1080p",
                                    provider: "XDMovies",
                                    type: 'url'
                                });
                            }
                        }
                    }
                }
                return streams;
            });
        })
        .catch(function() { return []; });
}

// --- MAIN ENTRY ---

function getStreams(tmdbId, mediaType, season, episode) {
    if (mediaType !== 'movie' && mediaType !== 'tv') return Promise.resolve([]);

    return getTmdbInfo(tmdbId, mediaType).then(function(info) {
        var promises = [];
        var title = info.title;
        var year = info.year;

        // 1. MappleTV (Best Quality)
        promises.push(invokeMappleTV(tmdbId, season, episode));

        // 2. VidRock (Reliable)
        promises.push(invokeVidRock(tmdbId, season, episode));

        // 3. Nepu & XDMovies
        promises.push(invokeNepu(title, year, season, episode));
        promises.push(invokeXDMovies(title, tmdbId, season, episode));

        return Promise.allSettled(promises).then(function(results) {
            var streams = [];
            results.forEach(function(r) {
                if (r.status === 'fulfilled' && Array.isArray(r.value)) {
                    streams = streams.concat(r.value);
                }
            });

            // Sort: 1080p > 720p > Unknown
            var order = { '4K': 4, '1080p': 3, '720p': 2, 'Unknown': 0 };
            streams.sort(function(a, b) {
                var qualA = getQuality(a.quality || a.name);
                var qualB = getQuality(b.quality || b.name);
                return (order[qualB] || 0) - (order[qualA] || 0);
            });

            return streams;
        });
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.StreamPlayDirectModule = { getStreams };
}
