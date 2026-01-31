// AnimeKai Scraper for Nuvio Local Scrapers
// React Native compatible - Uses enc-dec.app database for accurate matching

const TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const ANILIST_URL = 'https://graphql.anilist.co';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
    'Connection': 'keep-alive'
};

const API = 'https://enc-dec.app/api';
const DB_API = 'https://enc-dec.app/db/kai';
const KAI_AJAX = 'https://animekai.to/ajax';

// Debug helpers
function createRequestId() {
    try {
        var rand = Math.random().toString(36).slice(2, 8);
        var ts = Date.now().toString(36).slice(-6);
        return rand + ts;
    } catch (e) { return String(Date.now()); }
}

function logRid(rid, msg, extra) {
    try {
        if (typeof extra !== 'undefined') console.log('[AnimeKai][rid:' + rid + '] ' + msg, extra);
        else console.log('[AnimeKai][rid:' + rid + '] ' + msg);
    } catch (e) { }
}

// Generic fetch helper
function fetchRequest(url, options) {
    var merged = Object.assign({ method: 'GET', headers: HEADERS }, options || {});
    return fetch(url, merged).then(function (response) {
        if (!response.ok) {
            throw new Error('HTTP ' + response.status + ': ' + response.statusText);
        }
        return response;
    });
}

function encryptKai(text) {
    return fetchRequest(API + '/enc-kai?text=' + encodeURIComponent(text))
        .then(function (res) { return res.json(); })
        .then(function (json) { return json.result; });
}

function decryptKai(text) {
    return fetchRequest(API + '/dec-kai', {
        method: 'POST',
        headers: Object.assign({}, HEADERS, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ text: text })
    })
        .then(function (res) { return res.json(); })
        .then(function (json) { return json.result; });
}

function parseHtmlViaApi(html) {
    return fetchRequest(API + '/parse-html', {
        method: 'POST',
        headers: Object.assign({}, HEADERS, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ text: html })
    }).then(function (res) { return res.json(); })
        .then(function (json) { return json.result; });
}

function decryptMegaMedia(embedUrl) {
    var mediaUrl = embedUrl.replace('/e/', '/media/');
    return fetchRequest(mediaUrl)
        .then(function (res) { return res.json(); })
        .then(function (mediaResp) { return mediaResp.result; })
        .then(function (encrypted) {
            return fetchRequest(API + '/dec-mega', {
                method: 'POST',
                headers: Object.assign({}, HEADERS, { 'Content-Type': 'application/json' }),
                body: JSON.stringify({ text: encrypted, agent: HEADERS['User-Agent'] })
            }).then(function (res) { return res.json(); });
        })
        .then(function (json) { return json.result; });
}

// Get TMDB details to get the anime title
function getTMDBDetails(tmdbId, mediaType) {
    var endpoint = (mediaType === 'movie') ? 'movie' : 'tv';
    var url = TMDB_BASE_URL + '/' + endpoint + '/' + tmdbId + '?api_key=' + TMDB_API_KEY;
    return fetchRequest(url)
        .then(function (res) { return res.json(); })
        .then(function (data) {
            var date = data.first_air_date || data.release_date || '';
            return {
                title: data.name || data.title || data.original_name,
                originalTitle: data.original_name || data.original_title,
                year: date ? parseInt(date.split('-')[0]) : null
            };
        })
        .catch(function () { return { title: null, originalTitle: null, year: null }; });
}

// Search AniList to get MAL ID from anime title (with optional year filter)
function searchAniList(animeTitle, year) {
    // Use year filter when available to get the correct season/version
    var query = year
        ? 'query ($search: String, $year: Int) { Media(search: $search, type: ANIME, seasonYear: $year) { id idMal title { english romaji native } startDate { year } } }'
        : 'query ($search: String) { Media(search: $search, type: ANIME) { id idMal title { english romaji native } startDate { year } } }';

    var variables = year ? { search: animeTitle, year: year } : { search: animeTitle };

    return fetchRequest(ANILIST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query: query, variables: variables })
    })
        .then(function (res) { return res.json(); })
        .then(function (response) {
            if (response.data && response.data.Media) {
                return {
                    anilistId: response.data.Media.id,
                    malId: response.data.Media.idMal,
                    title: response.data.Media.title,
                    year: response.data.Media.startDate ? response.data.Media.startDate.year : null
                };
            }
            return null;
        })
        .catch(function () { return null; });
}

// Database lookup by MAL ID
function findInDatabase(malId) {
    var url = DB_API + '/find?mal_id=' + malId;
    return fetchRequest(url)
        .then(function (res) { return res.json(); })
        .then(function (results) {
            if (Array.isArray(results) && results.length > 0) {
                return results[0];
            }
            return null;
        })
        .catch(function () { return null; });
}

// Quality helpers
function extractQualityFromUrl(url) {
    var patterns = [
        /(\d{3,4})p/i,
        /(\d{3,4})k/i,
        /quality[_-]?(\d{3,4})/i,
        /res[_-]?(\d{3,4})/i,
        /(\d{3,4})x\d{3,4}/i
    ];
    for (var i = 0; i < patterns.length; i++) {
        var m = url.match(patterns[i]);
        if (m) {
            var q = parseInt(m[1]);
            if (q >= 240 && q <= 4320) return q + 'p';
        }
    }
    return 'Unknown';
}

// M3U8 utilities
function parseM3U8Master(content, baseUrl) {
    var lines = content.split('\n');
    var streams = [];
    var current = null;
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;
        if (line.indexOf('#EXT-X-STREAM-INF:') === 0) {
            current = { bandwidth: null, resolution: null, url: null };
            var bw = line.match(/BANDWIDTH=(\d+)/);
            if (bw) current.bandwidth = parseInt(bw[1]);
            var res = line.match(/RESOLUTION=(\d+x\d+)/);
            if (res) current.resolution = res[1];
        } else if (current && line[0] !== '#') {
            current.url = resolveUrlRelative(line, baseUrl);
            streams.push(current);
            current = null;
        }
    }
    return streams;
}

function resolveUrlRelative(url, baseUrl) {
    if (url.indexOf('http') === 0) return url;
    try { return new URL(url, baseUrl).toString(); } catch (e) { return url; }
}

function qualityFromResolutionOrBandwidth(stream) {
    if (stream && stream.resolution) {
        var h = parseInt(String(stream.resolution).split('x')[1]);
        if (h >= 2160) return '4K';
        if (h >= 1440) return '1440p';
        if (h >= 1080) return '1080p';
        if (h >= 720) return '720p';
        if (h >= 480) return '480p';
        if (h >= 360) return '360p';
        return '240p';
    }
    if (stream && stream.bandwidth) {
        var mbps = stream.bandwidth / 1000000;
        if (mbps >= 15) return '4K';
        if (mbps >= 8) return '1440p';
        if (mbps >= 5) return '1080p';
        if (mbps >= 3) return '720p';
        if (mbps >= 1.5) return '480p';
        if (mbps >= 0.8) return '360p';
        return '240p';
    }
    return 'Unknown';
}

function resolveM3U8(url, serverType) {
    return fetchRequest(url, { headers: Object.assign({}, HEADERS, { 'Accept': 'application/vnd.apple.mpegurl,application/x-mpegURL,application/octet-stream,*/*' }) })
        .then(function (res) { return res.text(); })
        .then(function (content) {
            if (content.indexOf('#EXT-X-STREAM-INF') !== -1) {
                var variants = parseM3U8Master(content, url);
                var out = [];
                for (var i = 0; i < variants.length; i++) {
                    var q = qualityFromResolutionOrBandwidth(variants[i]);
                    out.push({ url: variants[i].url, quality: q, serverType: serverType });
                }
                var order = { '4K': 7, '2160p': 7, '1440p': 6, '1080p': 5, '720p': 4, '480p': 3, '360p': 2, '240p': 1, 'Unknown': 0 };
                out.sort(function (a, b) { return (order[b.quality] || 0) - (order[a.quality] || 0); });
                return { success: true, streams: out };
            }
            if (content.indexOf('#EXTINF:') !== -1) {
                return { success: true, streams: [{ url: url, quality: 'Unknown', serverType: serverType }] };
            }
            throw new Error('Invalid M3U8');
        })
        .catch(function () { return { success: false, streams: [{ url: url, quality: 'Unknown', serverType: serverType }] }; });
}

function resolveMultipleM3U8(m3u8Links) {
    var promises = m3u8Links.map(function (link) { return resolveM3U8(link.url, link.serverType); });
    return Promise.allSettled(promises).then(function (results) {
        var out = [];
        for (var i = 0; i < results.length; i++) {
            if (results[i].status === 'fulfilled' && results[i].value && results[i].value.streams) {
                out = out.concat(results[i].value.streams);
            }
        }
        return out;
    });
}

function formatToNuvioStreams(formattedData, mediaTitle) {
    var links = [];
    var streams = formattedData && formattedData.streams ? formattedData.streams : [];
    var headers = {
        'User-Agent': HEADERS['User-Agent'],
        'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity'
    };
    for (var i = 0; i < streams.length; i++) {
        var s = streams[i];
        var quality = s.quality || extractQualityFromUrl(s.url) || 'Unknown';
        var server = (s.serverType || 'server').toUpperCase();
        links.push({
            name: 'ANIMEKAI ' + server + ' - ' + quality,
            title: mediaTitle || '',
            url: s.url,
            quality: quality,
            size: 'Unknown',
            headers: headers,
            subtitles: [],
            provider: 'animekai'
        });
    }
    return links;
}

function runStreamFetch(token, rid) {
    logRid(rid, 'runStreamFetch: start token=' + token);

    return encryptKai(token)
        .then(function (encToken) {
            logRid(rid, 'links/list: enc(token) ready');
            return fetchRequest(KAI_AJAX + '/links/list?token=' + token + '&_=' + encToken)
                .then(function (res) { return res.json(); });
        })
        .then(function (serversResp) { return parseHtmlViaApi(serversResp.result); })
        .then(function (servers) {
            var serverTypes = Object.keys(servers || {});
            var byTypeCounts = serverTypes.map(function (st) { return { type: st, count: Object.keys(servers[st] || {}).length }; });
            logRid(rid, 'servers available', byTypeCounts);

            var serverPromises = [];
            var lids = [];
            Object.keys(servers || {}).forEach(function (serverType) {
                Object.keys(servers[serverType] || {}).forEach(function (serverKey) {
                    var lid = servers[serverType][serverKey].lid;
                    lids.push(lid);
                    var p = encryptKai(lid)
                        .then(function (encLid) {
                            logRid(rid, 'links/view: enc(lid) ready', { serverType: serverType, serverKey: serverKey, lid: lid });
                            return fetchRequest(KAI_AJAX + '/links/view?id=' + lid + '&_=' + encLid)
                                .then(function (res) { return res.json(); });
                        })
                        .then(function (embedResp) {
                            logRid(rid, 'decrypt(embed)', { lid: lid, serverType: serverType });
                            return decryptKai(embedResp.result);
                        })
                        .then(function (decrypted) {
                            if (decrypted && decrypted.url) {
                                logRid(rid, 'mega.media → dec-mega', { lid: lid });
                                return decryptMegaMedia(decrypted.url)
                                    .then(function (mediaData) {
                                        var srcs = [];
                                        if (mediaData && mediaData.sources) {
                                            for (var i = 0; i < mediaData.sources.length; i++) {
                                                var src = mediaData.sources[i];
                                                if (src && src.file) {
                                                    srcs.push({
                                                        url: src.file,
                                                        quality: extractQualityFromUrl(src.file),
                                                        serverType: serverType
                                                    });
                                                }
                                            }
                                        }
                                        return {
                                            streams: srcs,
                                            subtitles: (mediaData && mediaData.tracks) ? mediaData.tracks.filter(function (t) { return t.kind === 'captions'; }).map(function (t) { return { language: t.label || 'Unknown', url: t.file, default: !!t.default }; }) : []
                                        };
                                    });
                            }
                            return { streams: [], subtitles: [] };
                        })
                        .catch(function () { return { streams: [], subtitles: [] }; });
                    serverPromises.push(p);
                });
            });
            var uniqueLids = Array.from(new Set(lids));
            logRid(rid, 'fan-out lids', { total: lids.length, unique: uniqueLids.length });

            return Promise.allSettled(serverPromises).then(function (results) {
                var allStreams = [];
                var allSubs = [];
                for (var i = 0; i < results.length; i++) {
                    if (results[i].status === 'fulfilled') {
                        var val = results[i].value || { streams: [], subtitles: [] };
                        allStreams = allStreams.concat(val.streams || []);
                        allSubs = allSubs.concat(val.subtitles || []);
                    }
                }

                // Resolve M3U8 masters to quality variants
                var m3u8Links = allStreams.filter(function (s) { return s && s.url && s.url.indexOf('.m3u8') !== -1; });
                var directLinks = allStreams.filter(function (s) { return !(s && s.url && s.url.indexOf('.m3u8') !== -1); });

                return resolveMultipleM3U8(m3u8Links).then(function (resolved) {
                    var combined = directLinks.concat(resolved);
                    logRid(rid, 'streams resolved', { direct: directLinks.length, m3u8: m3u8Links.length, combined: combined.length });
                    return { streams: combined, subtitles: allSubs };
                });
            });
        });
}

// Main Nuvio entry
function getStreams(tmdbId, mediaType, season, episode) {
    // Both TV and Movie are supported for anime
    if (mediaType !== 'tv' && mediaType !== 'movie') {
        return Promise.resolve([]);
    }

    var rid = createRequestId();
    logRid(rid, 'getStreams start', { tmdbId: tmdbId, mediaType: mediaType, season: season, episode: episode });

    var mediaInfo = null;
    var dbResult = null;

    // Step 1: Get anime title from TMDB
    return getTMDBDetails(tmdbId, mediaType)
        .then(function (tmdbData) {
            if (!tmdbData || !tmdbData.title) {
                throw new Error('Could not get TMDB details');
            }
            mediaInfo = tmdbData;
            logRid(rid, 'TMDB details', { title: tmdbData.title, year: tmdbData.year });

            // Step 2: Search AniList to get MAL ID
            // Perfect Matching Strategy for Seasons > 1
            var searchTitle = tmdbData.originalTitle || tmdbData.title;
            var searchYear = tmdbData.year;

            if (season > 1) {
                logRid(rid, 'Seasonal search for S' + season);
                return searchAniList(searchTitle + ' Season ' + season, null)
                    .then(function (result) {
                        if (result && result.malId) return result;
                        if (searchTitle !== tmdbData.title) {
                            return searchAniList(tmdbData.title + ' Season ' + season, null);
                        }
                        return null;
                    })
                    .then(function (seasonalResult) {
                        if (seasonalResult) {
                            logRid(rid, 'Seasonal match found', { malId: seasonalResult.malId });
                            return seasonalResult;
                        }
                        // Fallback to standard search if seasonal search failed
                        logRid(rid, 'Seasonal search failed, falling back to standard search');
                        return searchAniList(searchTitle, searchYear).then(function (result) {
                            if (result && result.malId) return result;
                            if (searchTitle !== tmdbData.title) return searchAniList(tmdbData.title, searchYear);
                            return searchAniList(searchTitle, null);
                        });
                    });
            }

            // Standard logic for Season 1 or fallback
            return searchAniList(searchTitle, searchYear).then(function (result) {
                if (result && result.malId) {
                    return result;
                }
                // Fallback to main title if original didn't work
                if (searchTitle !== tmdbData.title) {
                    return searchAniList(tmdbData.title, searchYear);
                }
                // Try without year as last resort
                return searchAniList(searchTitle, null);
            });
        })
        .then(function (anilistData) {
            if (!anilistData || !anilistData.malId) {
                throw new Error('Could not find MAL ID from AniList');
            }
            logRid(rid, 'AniList result', { malId: anilistData.malId, anilistId: anilistData.anilistId });

            // Step 3: Query database with MAL ID
            return findInDatabase(anilistData.malId);
        })
        .then(function (result) {
            if (!result) {
                throw new Error('No match found in database');
            }
            dbResult = result;

            var info = result.info;
            var episodes = result.episodes;

            logRid(rid, 'database match found', {
                title: info.title_en,
                year: info.year,
                kaiId: info.kai_id,
                episodeCount: info.episode_count
            });

            // Step 4: Get episode token
            var token = null;
            var selectedSeason = String(season || 1);
            var selectedEpisode = String(episode || 1);

            // Episodes are structured as { "1": { "1": { title, token }, "2": {...} } }
            if (episodes && episodes[selectedSeason] && episodes[selectedSeason][selectedEpisode]) {
                token = episodes[selectedSeason][selectedEpisode].token;
                logRid(rid, 'found episode token for S' + selectedSeason + 'E' + selectedEpisode);
            } else {
                // Fallback: try to find any available episode
                var seasons = Object.keys(episodes || {});
                if (seasons.length > 0) {
                    var firstSeason = seasons[0];
                    var episodesInSeason = Object.keys(episodes[firstSeason] || {});
                    if (episodesInSeason.length > 0) {
                        var firstEp = episodesInSeason[0];
                        token = episodes[firstSeason][firstEp].token;
                        logRid(rid, 'fallback: using S' + firstSeason + 'E' + firstEp);
                    }
                }
            }

            if (!token) {
                throw new Error('No episode token found');
            }

            // Step 5: Fetch streams using the token
            return runStreamFetch(token, rid);
        })
        .then(function (streamData) {
            // Build media title
            var mediaTitle = mediaInfo.title;
            if (season && episode) {
                var s = String(season).padStart(2, '0');
                var e = String(episode).padStart(2, '0');
                mediaTitle = mediaInfo.title + ' S' + s + 'E' + e;
            } else if (mediaInfo.year) {
                mediaTitle = mediaInfo.title + ' (' + mediaInfo.year + ')';
            }

            var formatted = formatToNuvioStreams(streamData, mediaTitle);

            // Sort by quality
            var order = { '4K': 7, '2160p': 7, '1440p': 6, '1080p': 5, '720p': 4, '480p': 3, '360p': 2, '240p': 1, 'Unknown': 0 };
            formatted.sort(function (a, b) { return (order[b.quality] || 0) - (order[a.quality] || 0); });

            logRid(rid, 'returning streams', { count: formatted.length });
            return formatted;
        })
        .catch(function (err) {
            logRid(rid, 'ERROR ' + (err && err.message ? err.message : String(err)));
            return [];
        });
}

// Export for Nuvio
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.AnimeKaiScraperModule = { getStreams };
}
