// AnimeKai Scraper for Nuvio Local Scrapers
// React Native compatible - Uses ArmSync for 100% accurate matching

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
const ARM_BASE = 'https://arm.haglund.dev/api/v2';
const JIKAN_BASE = 'https://api.jikan.moe/v4';

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

// Resolve metadata via ARM and Jikan for perfect matching
function getSyncInfo(id, mediaType, season, episode) {
    var isImdb = typeof id === 'string' && id.indexOf('tt') === 0;
    
    // Helper to get date from Cinemata
    var getCinemetaDate = function(imdbId) {
        var cinemetaType = (mediaType === 'movie') ? 'movie' : 'series';
        var cinemetaUrl = 'https://v3-cinemeta.strem.io/meta/' + cinemetaType + '/' + imdbId + '.json';
        return fetchRequest(cinemetaUrl)
            .then(function(res) { return res.json(); })
            .then(function(data) {
                var meta = data.meta;
                if (!meta) throw new Error('No Cinemata metadata');
                if (mediaType === 'movie') return meta.released ? meta.released.split('T')[0] : null;
                var videos = meta.videos || [];
                var target = videos.find(function(v) { return v.season == season && v.episode == episode; });
                return (target && target.released) ? target.released.split('T')[0] : null;
            }).catch(function() { return null; });
    };

    if (isImdb) {
        return getCinemetaDate(id).then(function(date) {
            if (date) return { imdbId: id, releaseDate: date };
            throw new Error('Could not find release date on Cinemata');
        });
    } else {
        // Use TMDB ID ONLY to find the IMDb ID
        var tmdbBase = TMDB_BASE_URL + '/' + (mediaType === 'movie' ? 'movie' : 'tv') + '/' + id;
        var getExternalId = (mediaType === 'movie')
            ? fetchRequest(tmdbBase + '?api_key=' + TMDB_API_KEY).then(function(res) { return res.json(); }).then(function(d) { return d.imdb_id; })
            : fetchRequest(tmdbBase + '/external_ids?api_key=' + TMDB_API_KEY).then(function(res) { return res.json(); }).then(function(d) { return d.imdb_id; });

        return getExternalId
            .catch(function() { return null; })
            .then(function(imdbId) {
                if (imdbId) return imdbId;
                
                // Fallback: Try ARM API if TMDB doesn't provide IMDb ID
                logRid('ArmSync: TMDB missing IMDb ID, trying ARM fallback for ' + id);
                return fetchRequest(ARM_BASE + '/themoviedb?id=' + id)
                    .then(function(res) { return res.json(); })
                    .then(function(armData) {
                        if (Array.isArray(armData) && armData.length > 0) {
                            return armData[0].imdb || null;
                        }
                        return null;
                    })
                    .catch(function() { return null; });
            })
            .then(function(imdbId) {
                if (!imdbId) throw new Error('No IMDb ID found for TMDB ' + id);
                return getCinemetaDate(imdbId).then(function(date) {
                    if (date) return { imdbId: imdbId, releaseDate: date };
                    throw new Error('Could not find release date on Cinemata for IMDb ' + imdbId);
                });
            });
    }
}

function resolveByDate(imdbId, releaseDateStr, rid) {
    if (!releaseDateStr || !/^\d{4}-\d{2}-\d{2}/.test(releaseDateStr)) {
        return Promise.resolve(null);
    }

    logRid(rid, 'ArmSync: Resolving IMDb ' + imdbId + ' for date ' + releaseDateStr);

    return fetchRequest(ARM_BASE + '/imdb?id=' + imdbId)
        .then(function (res) { return res.json(); })
        .then(function (armData) {
            var malIds = armData.map(function (e) { return e.myanimelist; }).filter(Boolean);
            if (malIds.length === 0) return null;

            logRid(rid, 'ArmSync: Candidates ' + malIds.join(', '));

            var sequence = Promise.resolve(null);
            malIds.forEach(function (malId) {
                sequence = sequence.then(function (found) {
                    if (found) return found;

                    return new Promise(function (resolve) { setTimeout(resolve, 500); })
                        .then(function () {
                            return fetchRequest(JIKAN_BASE + '/anime/' + malId);
                        })
                        .then(function (res) { return res.json(); })
                        .then(function (jikanRes) {
                            var anime = jikanRes.data;
                            var startStr = anime.aired && anime.aired.from ? anime.aired.from.split('T')[0] : null;
                            var endStr = anime.aired && anime.aired.to ? anime.aired.to.split('T')[0] : null;

                            var isMatch = false;
                            if (startStr) {
                                var startLimit = new Date(startStr);
                                startLimit.setDate(startLimit.getDate() - 2);
                                var startLimitStr = startLimit.toISOString().split('T')[0];

                                if (releaseDateStr >= startLimitStr) {
                                    if (!endStr || releaseDateStr <= endStr) {
                                        isMatch = true;
                                    }
                                }
                            }

                            if (isMatch) {
                                logRid(rid, 'ArmSync: Match found ID ' + malId);
                                
                                // For movies, we don't need to check the episodes list
                                if (anime.type === 'Movie' || anime.episodes === 1) {
                                    logRid(rid, 'ArmSync: Movie/Single-EP resolved');
                                    return { malId: malId, episode: 1 };
                                }

                                return new Promise(function (resolve) { setTimeout(resolve, 500); })
                                    .then(function () {
                                        return fetchRequest(JIKAN_BASE + '/anime/' + malId + '/episodes');
                                    })
                                    .then(function (res) { return res.json(); })
                                    .then(function (epsRes) {
                                        var episodes = epsRes.data || [];
                                        var targetDate = new Date(releaseDateStr);

                                        var matchEp = episodes.find(function (ep) {
                                            if (!ep.aired) return false;
                                            var epDate = new Date(ep.aired);
                                            var diffDays = Math.ceil(Math.abs(targetDate.getTime() - epDate.getTime()) / (1000 * 60 * 60 * 24));
                                            return diffDays <= 2;
                                        });

                                        if (matchEp) {
                                            logRid(rid, 'ArmSync: Episode resolved #' + matchEp.mal_id);
                                            return { malId: malId, episode: matchEp.mal_id };
                                        }
                                        return null;
                                    });
                            }
                            return null;
                        })
                        .catch(function () { return null; });
                });
            });
            return sequence;
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
    if (!url) return 'Unknown';
    var patterns = [
        { regex: /[._\/-]2160[pP]?/i, label: '4K' },
        { regex: /[._\/-]1440[pP]?/i, label: '1440p' },
        { regex: /[._\/-]1080[pP]?/i, label: '1080p' },
        { regex: /[._\/-]720[pP]?/i, label: '720p' },
        { regex: /[._\/-]480[pP]?/i, label: '480p' },
        { regex: /[._\/-]360[pP]?/i, label: '360p' },
        { regex: /[._\/-]240[pP]?/i, label: '240p' },
        { regex: /\b(4k|uhd)\b/i, label: '4K' },
        { regex: /\b(fhd|1080)\b/i, label: '1080p' },
        { regex: /\b(hd|720)\b/i, label: '720p' },
        { regex: /\b(sd|480)\b/i, label: '480p' },
        { regex: /quality[_-]?(\d{3,4})/i, label: 'MATCH' },
        { regex: /res[_-]?(\d{3,4})/i, label: 'MATCH' },
        { regex: /(\d{3,4})x\d{3,4}/i, label: 'MATCH' }
    ];

    for (var i = 0; i < patterns.length; i++) {
        var m = url.match(patterns[i].regex);
        if (m) {
            if (patterns[i].label === 'MATCH') {
                var q = parseInt(m[1]);
                if (q >= 240 && q <= 4320) return q + 'p';
            } else {
                return patterns[i].label;
            }
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

function resolveM3U8(url, serverType, serverName) {
    return fetchRequest(url, { headers: Object.assign({}, HEADERS, { 'Accept': 'application/vnd.apple.mpegurl,application/x-mpegURL,application/octet-stream,*/*' }) })
        .then(function (res) { return res.text(); })
        .then(function (content) {
            if (content.indexOf('#EXT-X-STREAM-INF') !== -1) {
                var variants = parseM3U8Master(content, url);
                var out = [];
                for (var i = 0; i < variants.length; i++) {
                    var q = qualityFromResolutionOrBandwidth(variants[i]);
                    out.push({ url: variants[i].url, quality: q, serverType: serverType, serverName: serverName });
                }
                var order = { '4K': 7, '2160p': 7, '1440p': 6, '1080p': 5, '720p': 4, '480p': 3, '360p': 2, '240p': 1, 'Unknown': 0 };
                out.sort(function (a, b) { return (order[b.quality] || 0) - (order[a.quality] || 0); });
                return { success: true, streams: out };
            }
            if (content.indexOf('#EXTINF:') !== -1) {
                return { success: true, streams: [{ url: url, quality: extractQualityFromUrl(url), serverType: serverType, serverName: serverName }] };
            }
            throw new Error('Invalid M3U8');
        })
        .catch(function () { return { success: false, streams: [{ url: url, quality: extractQualityFromUrl(url), serverType: serverType, serverName: serverName }] }; });
}

function resolveMultipleM3U8(m3u8Links) {
    var promises = m3u8Links.map(function (link) { return resolveM3U8(link.url, link.serverType, link.serverName); });
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

    var typeMap = {
        'sub': 'Hard Sub',
        'softsub': 'Soft Sub',
        'dub': 'Dub & S-Sub'
    };

    // Deduplicate by URL
    var seenUrls = {};

    for (var i = 0; i < streams.length; i++) {
        var s = streams[i];
        if (seenUrls[s.url]) continue;
        seenUrls[s.url] = true;

        var quality = s.quality || extractQualityFromUrl(s.url);
        if (quality === 'Unknown') quality = 'Auto';

        var typeLabel = typeMap[s.serverType] || s.serverType || 'Raw';
        var serverLabel = s.serverName || 'Server';
        
        // Name format: ⌜ AnimeKai ⌟ | Server 1 | [Soft Sub] - 1080p
        var displayName = '⌜ AnimeKai ⌟ | ' + serverLabel + ' | [' + typeLabel + '] - ' + quality;

        links.push({
            name: displayName,
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
                .then(function (res) { return res.json(); })
                .catch(function(e) {
                    logRid(rid, 'links/list failed', e.message || e);
                    throw e;
                });
        })
        .then(function (serversResp) { return parseHtmlViaApi(serversResp.result); })
        .then(function (servers) {
            var serverTypes = Object.keys(servers || {});
            var byTypeCounts = serverTypes.map(function (st) { return { type: st, count: Object.keys(servers[st] || {}).length }; });
            logRid(rid, 'servers available', byTypeCounts);

            var serverPromises = [];
            Object.keys(servers || {}).forEach(function (serverType) {
                Object.keys(servers[serverType] || {}).forEach(function (serverKey) {
                    var serverData = servers[serverType][serverKey];
                    var lid = serverData.lid;
                    var sName = serverData.name || serverData.title || serverData.label;
                    if (!sName && !isNaN(serverKey)) sName = 'Server ' + serverKey;
                    var serverName = sName || serverKey;

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
                                                        serverType: serverType,
                                                        serverName: serverName
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
function getStreams(id, mediaType, season, episode) {
    if (mediaType !== 'tv' && mediaType !== 'movie') return Promise.resolve([]);

    var rid = createRequestId();
    logRid(rid, 'getStreams start', { id: id, S: season, E: episode });

    // Step 1: Resolve MAL ID + Episode
    var resolveTask;
    if (typeof id === 'string' && id.indexOf('mal:') === 0) {
        resolveTask = Promise.resolve({ malId: id.split(':')[1], episode: episode });
    } else {
        resolveTask = getSyncInfo(id, mediaType, season, episode)
            .then(function (syncInfo) {
                return resolveByDate(syncInfo.imdbId, syncInfo.releaseDate, rid);
            });
    }

    return resolveTask
        .then(function (syncResult) {
            if (!syncResult || !syncResult.malId) {
                throw new Error('ArmSync: Could not match episode via air date');
            }
            
            logRid(rid, 'using verified result', syncResult);
            return findInDatabase(syncResult.malId).then(function (dbData) {
                if (!dbData) throw new Error('MAL ID ' + syncResult.malId + ' not found in provider database');
                
                var token = null;
                var epStr = String(syncResult.episode);
                var seasons = dbData.episodes || {};
                
                // Exhaustive search across all season keys for the verified episode number
                var keys = Object.keys(seasons);
                for (var i = 0; i < keys.length; i++) {
                    if (seasons[keys[i]][epStr]) {
                        token = seasons[keys[i]][epStr].token;
                        break;
                    }
                }

                if (!token) throw new Error('Episode ' + epStr + ' token not found for MAL ID ' + syncResult.malId);
                
                return runStreamFetch(token, rid).then(function (streamData) {
                    var title = dbData.info ? dbData.info.title_en : 'Anime';
                    var mediaTitle = title + ' E' + epStr;
                    var formatted = formatToNuvioStreams(streamData, mediaTitle);
                    
                    // Attach subtitles to all links
                    if (streamData.subtitles && streamData.subtitles.length > 0) {
                        formatted.forEach(function(f) { f.subtitles = streamData.subtitles; });
                    }
                    return formatted;
                });
            });
        })
        .then(function (formatted) {
            var order = { '4K': 7, '2160p': 7, '1440p': 6, '1080p': 5, '720p': 4, '480p': 3, '360p': 2, '240p': 1, 'Unknown': 0 };
            formatted.sort(function (a, b) { return (order[b.quality] || 0) - (order[a.quality] || 0); });
            logRid(rid, 'done', { streams: formatted.length });
            return formatted;
        })
        .catch(function (err) {
            logRid(rid, 'ERROR: ' + (err.message || err));
            return [];
        });
}

// Export for Nuvio
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.AnimeKaiScraperModule = { getStreams };
}
