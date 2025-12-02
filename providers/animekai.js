// AnimeKai Scraper for Nuvio Local Scrapers (FIXED)
// React Native compatible (Promise chain only)

// TMDB API Configuration (used to build nice titles)
const TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
    'Connection': 'keep-alive'
};

const API = 'https://enc-dec.app/api';
const KAI_AJAX = 'https://animekai.to/ajax';

// Generic fetch helper that returns text or json based on caller usage
function fetchRequest(url, options) {
    const merged = Object.assign({ method: 'GET', headers: HEADERS }, options || {});
    return fetch(url, merged).then(function(response) {
        if (!response.ok) {
            throw new Error('HTTP ' + response.status + ': ' + response.statusText);
        }
        return response;
    });
}

function encryptKai(text) {
    return fetchRequest(API + '/enc-kai?text=' + encodeURIComponent(text))
        .then(function(res) { return res.text(); /* note: enc endpoints sometimes return raw string */ })
        .then(function(t) { return (t && t.trim()) ? t.trim() : ''; });
}

function decryptKai(text) {
    return fetchRequest(API + '/dec-kai', {
        method: 'POST',
        headers: Object.assign({}, HEADERS, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ text: text })
    })
        .then(function(res) { return res.json(); })
        .then(function(json) {
            // dec-kai may return a JSON object { result: "..."} or a stringified iframe object.
            if (json && json.result) {
                try { return JSON.parse(json.result); } catch(e) { return json.result; }
            }
            return json;
        });
}

function parseHtmlViaApi(html) {
    return fetchRequest(API + '/parse-html', {
        method: 'POST',
        headers: Object.assign({}, HEADERS, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ text: html })
    }).then(function(res) { return res.json(); })
      .then(function(json) { return json.result; });
}

function decryptMegaMedia(embedUrl) {
    // embedders use /e/ → replace with /media/ to get json token then call dec-mega with that token
    var mediaUrl = embedUrl.replace('/e/', '/media/');
    return fetchRequest(mediaUrl)
        .then(function(res) { return res.json(); })
        .then(function(mediaResp) {
            // mediaResp.result may be an encrypted string or object
            var encrypted = mediaResp && (mediaResp.result || mediaResp);
            if (!encrypted) return Promise.resolve({ sources: [], tracks: [] });

            // call dec-mega endpoint
            return fetchRequest(API + '/dec-mega', {
                method: 'POST',
                headers: Object.assign({}, HEADERS, { 'Content-Type': 'application/json' }),
                body: JSON.stringify({ text: encrypted, agent: HEADERS['User-Agent'] })
            }).then(function(res) { return res.json(); })
              .then(function(json) {
                  // json.result may be object or JSON-string
                  var payload = json && json.result;
                  if (typeof payload === 'string') {
                      try { payload = JSON.parse(payload); } catch(e) {}
                  }
                  // payload expected to contain sources[] and tracks[]
                  return payload || { sources: [], tracks: [] };
              });
        }).catch(function() { return { sources: [], tracks: [] }; });
}

// Debug helpers (match yflix style)
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
    } catch(e) {}
}

// Simplified Kitsu search - just get the most relevant result
function searchKitsu(animeTitle) {
    const searchUrl = 'https://kitsu.io/api/edge/anime?filter[text]=' + encodeURIComponent(animeTitle);
    return fetchRequest(searchUrl, { headers: { 'Accept': 'application/vnd.api+json', 'Content-Type': 'application/vnd.api+json' } })
        .then(function(res) { return res.json(); })
        .then(function(response) {
            var results = response.data || [];
            var normalizedQuery = animeTitle.toLowerCase().replace(/[^\w\s]/g, '').trim();
            return results.filter(function(entry) {
                var canonical = (entry.attributes.canonicalTitle || '').toLowerCase().replace(/[^\w\s]/g, '');
                var english = (entry.attributes.titles && entry.attributes.titles.en || '').toLowerCase().replace(/[^\w\s]/g, '');
                return canonical.includes(normalizedQuery) || english.includes(normalizedQuery) || normalizedQuery.includes(canonical);
            });
        }).catch(function() { return []; });
}

function getAccurateAnimeKaiEntry(animeTitle, season, episode, tmdbId) {
    return searchKitsu(animeTitle).then(function(kitsuResults) {
        if (kitsuResults && kitsuResults.length > 0) {
            var kitsuEntry = kitsuResults[0];
            var kitsuTitle = kitsuEntry.attributes.titles && kitsuEntry.attributes.titles.en ||
                            kitsuEntry.attributes.canonicalTitle;
            return searchAnimeByName(kitsuTitle).then(function(animeKaiResults) {
                return pickResultForSeason(animeKaiResults, season, tmdbId);
            });
        }
        return searchAnimeByName(animeTitle).then(function(results) {
            return pickResultForSeason(results, season, tmdbId);
        });
    }).catch(function() {
        return searchAnimeByName(animeTitle).then(function(results) {
            return pickResultForSeason(results, season, tmdbId);
        });
    });
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

// M3U8 utilities (master/media playlist parsing)
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
    if (!url) return url;
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
        .then(function(res) { return res.text(); })
        .then(function(content) {
            if (content.indexOf('#EXT-X-STREAM-INF') !== -1) {
                var variants = parseM3U8Master(content, url);
                var out = [];
                for (var i = 0; i < variants.length; i++) {
                    var q = qualityFromResolutionOrBandwidth(variants[i]);
                    out.push({ url: variants[i].url, quality: q, serverType: serverType });
                }
                var order = { '4K': 7, '2160p': 7, '1440p': 6, '1080p': 5, '720p': 4, '480p': 3, '360p': 2, '240p': 1, 'Unknown': 0 };
                out.sort(function(a,b){ return (order[b.quality]||0)-(order[a.quality]||0); });
                return { success: true, streams: out };
            }
            if (content.indexOf('#EXTINF:') !== -1) {
                return { success: true, streams: [{ url: url, quality: 'Unknown', serverType: serverType }] };
            }
            throw new Error('Invalid M3U8');
        })
        .catch(function(){ return { success: false, streams: [{ url: url, quality: 'Unknown', serverType: serverType }] }; });
}

function resolveMultipleM3U8(m3u8Links) {
    var promises = m3u8Links.map(function(link){ return resolveM3U8(link.url, link.serverType); });
    return Promise.allSettled(promises).then(function(results){
        var out = [];
        for (var i = 0; i < results.length; i++) {
            if (results[i].status === 'fulfilled' && results[i].value && results[i].value.streams) {
                out = out.concat(results[i].value.streams);
            }
        }
        return out;
    });
}

function buildMediaTitle(info, mediaType, season, episode, episodeInfo) {
    if (episodeInfo && episodeInfo.seasonName) {
        if (episodeInfo.episode) {
            var e = String(episodeInfo.episode).padStart(2, '0');
            return episodeInfo.seasonName + ' E' + e;
        } else {
            var e = String(episode).padStart(2, '0');
            return episodeInfo.seasonName + ' E' + e;
        }
    }

    if (!info || !info.title) return '';
    if (mediaType === 'tv' && season && episode) {
        var s = String(season).padStart(2, '0');
        var e = String(episode).padStart(2, '0');
        return info.title + ' S' + s + 'E' + e;
    }
    if (info.year) return info.title + ' (' + info.year + ')';
    return info.title;
}

// TMDB minimal info for display
function getTMDBDetails(tmdbId, mediaType) {
    if (!tmdbId) return Promise.resolve({ title: null, year: null });
    var endpoint = mediaType === 'tv' ? 'tv' : 'movie';
    var url = TMDB_BASE_URL + '/' + endpoint + '/' + tmdbId + '?api_key=' + TMDB_API_KEY + '&append_to_response=external_ids';
    return fetchRequest(url)
        .then(function(res) { return res.json(); })
        .then(function(data) {
            var title = mediaType === 'tv' ? data.name : data.title;
            var releaseDate = mediaType === 'tv' ? data.first_air_date : data.release_date;
            var year = releaseDate ? parseInt(releaseDate.split('-')[0]) : null;
            return {
                title: title,
                year: year
            };
        })
        .catch(function() { return { title: null, year: null }; });
}

// Search on animekai.to and return first matching slug URL
function searchAnimeByName(animeName) {
    var searchUrl = KAI_AJAX.replace('/ajax', '') + '/browser?keyword=' + encodeURIComponent(animeName);
    return fetchRequest(searchUrl)
        .then(function(res) { return res.text(); })
        .then(function(html) {
            var results = [];
            // find simple item links; tolerate multiple markup patterns
            var pattern = /href="(\/watch\/[^\"]*)"[^>]*>(?:[\s\S]*?)<a[^>]*class="[^"]*title[^"]*"[^>]*>([^<]*)<\/a>/g;
            var m;
            while ((m = pattern.exec(html)) !== null) {
                var href = m[1];
                var title = (m[2] || '').trim();
                if (href && title) {
                    results.push({
                        title: title,
                        url: (href.indexOf('http') === 0 ? href : KAI_AJAX.replace('/ajax', '') + href),
                        episodeCount: 0,
                        type: 'TV'
                    });
                }
            }
            return results;
        })
        .catch(function(){ return []; });
}

// Get TMDB season info for better mapping
function getTMDBSeasonInfo(tmdbId, season) {
    if (!tmdbId) return Promise.resolve({ name: null, episodeCount: 0, seasonNumber: season });
    var url = TMDB_BASE_URL + '/tv/' + tmdbId + '/season/' + season + '?api_key=' + TMDB_API_KEY;
    return fetchRequest(url)
        .then(function(res) { return res.json(); })
        .then(function(seasonData) {
            return {
                name: seasonData.name,
                episodeCount: seasonData.episodes ? seasonData.episodes.length : 0,
                seasonNumber: seasonData.season_number
            };
        })
        .catch(function() {
            return { name: null, episodeCount: 0, seasonNumber: season };
        });
}

// Pick best search result for a given season (AnimeKai splits seasons by page)
function pickResultForSeason(results, season, tmdbId) {
    if (!results || results.length === 0) return Promise.resolve(null);
    if (!season || !Number.isFinite(season)) return Promise.resolve(results[0]);

    var seasonStr = String(season);
    var candidates = [];

    for (var i = 0; i < results.length; i++) {
        var r = results[i];
        var t = (r.title || '').toLowerCase();
        if (t.indexOf('season ' + seasonStr) !== -1 || t.indexOf('s' + seasonStr) !== -1) {
            candidates.push({ r: r, score: 3 });
        }
    }

    for (var j = 0; j < results.length; j++) {
        var r2 = results[j];
        var u = (r2.url || '').toLowerCase();
        if (u.indexOf('season-' + seasonStr) !== -1 || u.indexOf('-s' + seasonStr) !== -1 || u.indexOf('-season-' + seasonStr) !== -1) {
            candidates.push({ r: r2, score: 2 });
        }
    }

    if (tmdbId && season > 1) {
        return getTMDBSeasonInfo(tmdbId, season).then(function(seasonInfo) {

            if (seasonInfo.episodeCount > 0) {
                for (var k = 0; k < results.length; k++) {
                    var r3 = results[k];
                    if (r3.episodeCount === seasonInfo.episodeCount) {
                        return r3;
                    }
                }

                for (var m = 0; m < results.length; m++) {
                    var r4 = results[m];
                    if (Math.abs(r4.episodeCount - seasonInfo.episodeCount) <= 1 && r4.episodeCount > 0) {
                        return r4;
                    }
                }
            }

            if (candidates.length > 0) {
                candidates.sort(function(a,b){ return b.score - a.score; });
                return candidates[0].r;
            }

            if (season > 1) {
                for (var l = 0; l < results.length; l++) {
                    var r5 = results[l];
                    var t5 = (r5.title || '').toLowerCase();
                    if (t5.indexOf('season 1') === -1 && t5.indexOf('s1') === -1) {
                        return r5;
                    }
                }
            }

            return results[0];
        }).catch(function() {
            for (var n = 0; n < results.length; n++) {
                var r6 = results[n];
                if (r6.episodeCount > 0) {
                    return r6;
                }
            }

            if (candidates.length > 0) {
                candidates.sort(function(a,b){ return b.score - a.score; });
                return candidates[0].r;
            }
            return results[0];
        });
    }

    return Promise.resolve(candidates.length > 0 ? candidates.sort(function(a,b){ return b.score - a.score; })[0].r : results[0]);
}

function extractEpisodeAndTitleFromHtml(html) {
    var episodeInfo = {
        episode: null,
        title: null,
        seasonName: null
    };

    var episodeMatch = html.match(/You are watching <b>Episode (\d+)<\/b>/i) ||
                      html.match(/Episode (\d+)/i);
    if (episodeMatch) {
        episodeInfo.episode = parseInt(episodeMatch[1]);
    }

    var titleMatch = html.match(/<h1[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/h1>/i) ||
                    html.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
                    html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) {
        var title = titleMatch[1].trim().replace(/\s+/g, ' ').replace(/&[^;]+;/g, '');
        if (title && title.length > 3) {
            episodeInfo.seasonName = title;
        }
    }

    return episodeInfo;
}

function extractContentIdFromSlug(slugUrl) {
    return fetchRequest(slugUrl)
        .then(function(res) { return res.text(); })
        .then(function(html) {
            var m1 = html.match(/<div[^>]*class="[^"]*rate-box[^"]*"[^>]*data-id="([^"]*)"/);
            var contentId = null;
            if (m1) {
                contentId = m1[1];
            } else {
                var m2 = html.match(/data-id="([^"]*)"/);
                if (m2) contentId = m2[1];
            }

            if (!contentId) {
                throw new Error('Could not find content ID');
            }

            var episodeInfo = extractEpisodeAndTitleFromHtml(html);

            return {
                contentId: contentId,
                episodeInfo: episodeInfo
            };
        });
}

function formatToNuvioStreams(formattedData, mediaTitle) {
    var links = [];
    var subs = formattedData && formattedData.subtitles ? formattedData.subtitles : [];
    var streams = formattedData && formattedData.streams ? formattedData.streams : [];
    var headers = {
        'User-Agent': HEADERS['User-Agent'],
        'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity'
    };
    for (var i = 0; i < streams.length; i++) {
        var s = streams[i];
        if (!s || !s.url) continue;
        var quality = s.quality || extractQualityFromUrl(s.url) || 'Unknown';
        var server = (s.serverType || 'server').toUpperCase();
        links.push({
            name: 'ANIMEKAI ' + server + ' - ' + quality,
            title: mediaTitle || '',
            url: s.url,
            quality: quality,
            size: 'Unknown',
            headers: headers,
            subtitles: subs || [],
            provider: 'animekai'
        });
    }
    return links;
}

// Main Nuvio entry
function getStreams(tmdbId, mediaType, season, episode) {
    if (mediaType !== 'tv') {
        return Promise.resolve([]);
    }

    var mediaInfo = null;
    var selectedEpisodeKey = null;
    var token = null;
    var rid = createRequestId();
    logRid(rid, 'getStreams start', { tmdbId: tmdbId, mediaType: mediaType, season: season, episode: episode });

    return getTMDBDetails(tmdbId, 'tv')
        .then(function(info) {
            mediaInfo = info || { title: null, year: null };
            var titleToSearch = mediaInfo.title || '';

            if (season > 1) {
                return getTMDBSeasonInfo(tmdbId, season).then(function(seasonInfo) {
                    var searchTitle = titleToSearch;
                    if (seasonInfo.name && seasonInfo.name !== `Season ${season}`) {
                        searchTitle = titleToSearch + ' ' + seasonInfo.name;
                    }
                    return getAccurateAnimeKaiEntry(searchTitle, season, episode, tmdbId);
                });
            }
            return getAccurateAnimeKaiEntry(titleToSearch, season, episode, tmdbId);
        })
        .then(function(chosen) {
            if (!chosen || !chosen.url) {
                throw new Error('No AnimeKai entry found via Kitsu mapping');
            }

            var actualEpisode = chosen.translatedEpisode || episode;
            logRid(rid, 'chosen', { title: chosen.title, url: chosen.url, season: season, episode: actualEpisode });

            return extractContentIdFromSlug(chosen.url).then(function(result) {
                logRid(rid, 'content page parsed', { contentId: result.contentId, episodeInfo: result.episodeInfo });
                return {
                    contentId: result.contentId,
                    episode: actualEpisode,
                    episodeInfo: result.episodeInfo
                };
            });
        })
        .then(function(result) {
            var contentId = result.contentId;
            var actualEpisode = result.episode;

            // enc for episodes/list expects enc of contentId
            return encryptKai(contentId).then(function(encId) {
                var url = KAI_AJAX + '/episodes/list?ani_id=' + contentId + '&_=' + encId;
                logRid(rid, 'episodes/list enc(contentId) ready');
                return fetchRequest(url).then(function(res) { return res.json(); });
            })
            .then(function(episodesResp) {
                return parseHtmlViaApi(episodesResp.result);
            })
            .then(function(episodes) {
                logRid(rid, 'episodes parsed', { totalKeys: Object.keys(episodes||{}).length });
                var keys = Object.keys(episodes || {}).sort(function(a,b){ return parseInt(a) - parseInt(b); });
                if (keys.length === 0) throw new Error('No episodes');

                // find selectedEpisodeKey that contains the desired episode, else fallback
                selectedEpisodeKey = null;
                for (var i = 0; i < keys.length; i++) {
                    var k = keys[i];
                    var block = episodes[k] || {};
                    if ((actualEpisode !== undefined && block[String(actualEpisode)]) || block[actualEpisode]) {
                        selectedEpisodeKey = k;
                        break;
                    }
                }
                if (!selectedEpisodeKey) selectedEpisodeKey = keys[0];

                // Attempt to pull the token for the specific episode inside that key; if not present, take first available
                var episodeBlock = episodes[selectedEpisodeKey] || {};
                var tokenEntry = null;
                if (episodeBlock[String(actualEpisode)]) tokenEntry = episodeBlock[String(actualEpisode)];
                else {
                    // find first property in episodeBlock
                    var innerKeys = Object.keys(episodeBlock);
                    if (innerKeys.length > 0) tokenEntry = episodeBlock[innerKeys[0]];
                }

                if (!tokenEntry || !tokenEntry.token) throw new Error('Episode token not found');

                token = tokenEntry.token;
                return encryptKai(token);
            })
            .then(function(encToken) {
                // use raw token in query param and encToken as '_' param (this matches server expectations)
                var url = KAI_AJAX + '/links/list?token=' + token + '&_=' + encToken;
                logRid(rid, 'links/list enc(token) ready', { selectedEpisodeKey: selectedEpisodeKey });
                return fetchRequest(url).then(function(res) { return res.json(); });
            })
            .then(function(serversResp) { return parseHtmlViaApi(serversResp.result); })
            .then(function(servers) {
                var serverTypes = Object.keys(servers || {});
                var byTypeCounts = serverTypes.map(function(st){ return { type: st, count: Object.keys(servers[st]||{}).length }; });
                logRid(rid, 'servers available', byTypeCounts);
                var serverPromises = [];
                var lids = [];
                Object.keys(servers || {}).forEach(function(serverType) {
                    Object.keys(servers[serverType] || {}).forEach(function(serverKey) {
                        var lid = servers[serverType][serverKey].lid;
                        if (!lid) return;
                        lids.push(lid);
                        var p = encryptKai(lid)
                            .then(function(encLid) {
                                var url = KAI_AJAX + '/links/view?id=' + lid + '&_=' + encLid;
                                logRid(rid, 'links/view enc(lid) ready', { serverType: serverType, serverKey: serverKey, lid: lid });
                                return fetchRequest(url).then(function(res) { return res.json(); });
                            })
                            .then(function(embedResp) { 
                                logRid(rid, 'decrypt(embed)', { lid: lid, serverType: serverType, serverKey: serverKey }); 
                                return decryptKai(embedResp.result || embedResp);
                            })
                            .then(function(decrypted) {
                                // decrypted may be a plain URL string or object { url: "..."} or a mega embed
                                if (!decrypted) return { streams: [], subtitles: [] };

                                var embedUrl = typeof decrypted === 'string' ? decrypted : (decrypted.url || decrypted.file || null);
                                if (!embedUrl) return { streams: [], subtitles: [] };

                                // If embed is a mega/media embed, handle via decryptMegaMedia
                                return decryptMegaMedia(embedUrl)
                                    .then(function(mediaData) {
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
                                                } else if (src && src.url) {
                                                    srcs.push({
                                                        url: src.url,
                                                        quality: extractQualityFromUrl(src.url),
                                                        serverType: serverType
                                                    });
                                                }
                                            }
                                        } else if (embedUrl) {
                                            // fallback: use embedUrl as direct stream if it looks like media
                                            srcs.push({ url: embedUrl, quality: extractQualityFromUrl(embedUrl), serverType: serverType });
                                        }

                                        var tracks = mediaData && mediaData.tracks ? mediaData.tracks : [];
                                        // Normalize tracks to {file,label,default,kind}
                                        var subtitles = (tracks || []).filter(function(t){ return t && (t.kind === 'captions' || t.file && (t.file.endsWith('.vtt') || t.file.indexOf('.srt')>-1)); })
                                            .map(function(t) {
                                                return { language: t.label || 'Unknown', url: t.file, default: !!t.default };
                                            });

                                        return { streams: srcs, subtitles: subtitles };
                                    });
                            })
                            .catch(function(){ return { streams: [], subtitles: [] }; });
                        serverPromises.push(p);
                    });
                });
                var uniqueLids = Array.from(new Set(lids));
                logRid(rid, 'fan-out lids', { total: lids.length, unique: uniqueLids.length });

                return Promise.allSettled(serverPromises).then(function(results) {
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
                    var m3u8Links = allStreams.filter(function(s){ return s && s.url && s.url.indexOf('.m3u8') !== -1; });
                    var directLinks = allStreams.filter(function(s){ return !(s && s.url && s.url.indexOf('.m3u8') !== -1); });

                    return resolveMultipleM3U8(m3u8Links).then(function(resolved) {
                        var combined = directLinks.concat(resolved);
                        logRid(rid, 'streams resolved', { direct: directLinks.length, m3u8: m3u8Links.length, combined: combined.length });
                        // Deduplicate subtitles by URL
                        var uniqueSubs = [];
                        var seen = {};
                        for (var j = 0; j < allSubs.length; j++) {
                            var su = allSubs[j];
                            if (su && su.url && !seen[su.url]) { seen[su.url] = true; uniqueSubs.push(su); }
                        }
                        var mediaTitle = buildMediaTitle(mediaInfo, 'tv', season, actualEpisode || parseInt(selectedEpisodeKey), result.episodeInfo);
                        var formatted = formatToNuvioStreams({ streams: combined, subtitles: uniqueSubs }, mediaTitle);
                        // Sort by quality roughly
                        var order = { '4K': 7, '2160p': 7, '1440p': 6, '1080p': 5, '720p': 4, '480p': 3, '360p': 2, '240p': 1, 'Unknown': 0 };
                        formatted.sort(function(a, b) { return (order[b.quality] || 0) - (order[a.quality] || 0); });
                        logRid(rid, 'returning streams', { count: formatted.length });
                        return formatted;
                    });
                });
            });
        })
        .catch(function(err) {
            logRid(rid, 'ERROR ' + (err && err.message ? err.message : String(err)));
            return [];
        });
}

// Export for Nuvio
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = getStreams;
}