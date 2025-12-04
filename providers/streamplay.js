// multiprovider_all59_singlefile.js
// Single-file multiprovider: 59 providers registry + utilities + TMDB + 12 site-specific extractors (vegamovies, playm4u, filemoon, mixdrop, streamsb, mp4upload, streamtape, dood, voe, vidzee, vidsrccc, vcloud) + generic extractor fallback
// Promise-based; compatible with Nuvio local scrapers (cheerio allowed if available).

(function () {
  // Attempt to require cheerio if running in environment that supports it
  const cheerio = (typeof require !== 'undefined') ? (function tryReq(){ try { return require('cheerio-without-node-native'); } catch(e){ return null; } })() : (global.cheerio || null);

  // -----------------------
  // Config & Defaults
  // -----------------------
  var TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c'; // change if needed
  var TMDB_BASE = 'https://api.themoviedb.org/3';
  const DEFAULT_REMOTE_CONFIG_URL = null;
  const DEFAULT_FETCH_TIMEOUT = 3500;
  const MASTER_FETCH_TIMEOUT = 10000;

  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 12; Mobile) AppleWebKit/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'identity'
  };

  // -----------------------
  // Utilities
  // -----------------------
  function fetchWithTimeout(url, options, timeoutMs) {
    timeoutMs = timeoutMs || MASTER_FETCH_TIMEOUT;
    var controller = null;
    try { controller = (typeof AbortController !== 'undefined') ? new AbortController() : null; } catch (e) { controller = null; }
    var fetchOpts = Object.assign({}, options || {});
    if (controller) fetchOpts.signal = controller.signal;
    var timer = null;
    return new Promise(function (resolve, reject) {
      if (controller) {
        timer = setTimeout(function () { try { controller.abort(); } catch (e) {} reject(new Error('Fetch timeout')); }, timeoutMs);
      }
      fetch(url, fetchOpts).then(function (res) {
        if (timer) clearTimeout(timer);
        resolve(res);
      }).catch(function (err) {
        if (timer) clearTimeout(timer);
        reject(err);
      });
    });
  }

  function getText(url, options) {
    return fetchWithTimeout(url, Object.assign({ headers: HEADERS }, options || {}), MASTER_FETCH_TIMEOUT)
      .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.text(); });
  }
  function getJson(url, options) {
    return fetchWithTimeout(url, Object.assign({ headers: HEADERS }, options || {}), MASTER_FETCH_TIMEOUT)
      .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); });
  }
  function postJson(url, body, extraHeaders) {
    var headers = Object.assign({ 'Content-Type': 'application/json' }, HEADERS, extraHeaders || {});
    return fetchWithTimeout(url, { method: 'POST', headers: headers, body: JSON.stringify(body) }, MASTER_FETCH_TIMEOUT)
      .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); });
  }

  function toAbsolute(base, href) {
    try { return new URL(href, base).toString(); } catch (e) { return href || ''; }
  }

  function parseQualityFromM3u8(m3u8Text, baseUrl) {
    var streams = [];
    var lines = m3u8Text.split(/\r?\n/);
    var current = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (line.startsWith('#EXT-X-STREAM-INF')) {
        var resMatch = line.match(/RESOLUTION=\s*(\d+)x(\d+)/i);
        var bandMatch = line.match(/BANDWIDTH=\s*(\d+)/i);
        var height = (resMatch && parseInt(resMatch[2])) || null;
        var bandwidth = (bandMatch && parseInt(bandMatch[1])) || null;
        var quality = null;
        if (height) quality = (height + 'p');
        else if (bandwidth) {
          var b = bandwidth;
          if (b >= 6000000) quality = '2160p';
          else if (b >= 4000000) quality = '1440p';
          else if (b >= 2500000) quality = '1080p';
          else if (b >= 1500000) quality = '720p';
          else if (b >= 800000) quality = '480p';
          else quality = '360p';
        } else quality = 'adaptive';
        current = { quality: quality, url: null, bandwidth: bandwidth, height: height };
      } else if (!line.startsWith('#') && current) {
        var streamUrl = line;
        try { if (!/^https?:\/\//i.test(streamUrl) && baseUrl) streamUrl = new URL(streamUrl, baseUrl).href; } catch(e){}
        current.url = streamUrl;
        streams.push(current);
        current = null;
      }
    }
    return { isMaster: streams.length > 0, streams: streams.sort(function(a,b){ return (b.height||0)-(a.height||0); }) };
  }

  function enhanceStreamsWithQuality(streams) {
    var enhanced = [];
    var tasks = (streams || []).map(function (s) {
      if (!s || !s.url) { return Promise.resolve(); }
      if (s.url.indexOf('.m3u8') !== -1) {
        return getText(s.url).then(function (txt) {
          try {
            var info = parseQualityFromM3u8(txt, s.url);
            if (info.isMaster && info.streams.length) {
              info.streams.forEach(function (q) {
                enhanced.push(Object.assign({}, s, { url: q.url, quality: q.quality, bandwidth: q.bandwidth, height: q.height, masterUrl: s.url }));
              });
            } else {
              enhanced.push(Object.assign({}, s, { quality: s.quality || 'Adaptive' }));
            }
          } catch (e) {
            enhanced.push(Object.assign({}, s, { quality: s.quality || 'Adaptive' }));
          }
        }).catch(function () {
          enhanced.push(Object.assign({}, s, { quality: s.quality || 'Adaptive' }));
        });
      } else {
        enhanced.push(s);
        return Promise.resolve();
      }
    });
    return Promise.all(tasks).then(function () { return enhanced; });
  }

  // -----------------------
  // Remote config loader
  // -----------------------
  function loadRemoteConfig(configUrl, timeoutMs) {
    timeoutMs = timeoutMs || DEFAULT_FETCH_TIMEOUT;
    if (!configUrl) return Promise.resolve(null);
    return new Promise(function (resolve) {
      var didTimeout = false;
      var timer = setTimeout(function () { didTimeout = true; console.warn('[multiprovider] config fetch timeout'); resolve(null); }, timeoutMs);
      fetch(configUrl).then(function (res) {
        if (didTimeout) return;
        clearTimeout(timer);
        if (!res.ok) return resolve(null);
        return res.text();
      }).then(function (text) {
        if (didTimeout) return;
        if (!text) return resolve(null);
        try {
          var cfg = JSON.parse(text);
          resolve(cfg);
        } catch (e) {
          console.warn('[multiprovider] invalid config json', e && e.message);
          resolve(null);
        }
      }).catch(function (err) {
        if (!didTimeout) clearTimeout(timer);
        console.warn('[multiprovider] config fetch failed', err && err.message);
        resolve(null);
      });
    });
  }

  function applyConfigOverrides(registry, config) {
    if (!config) return registry;
    var enabledMap = (config.enabled) || {};
    var priorityMap = (config.priority) || {};
    return registry.map(function (p) {
      var copy = Object.assign({}, p);
      if (enabledMap.hasOwnProperty(copy.id)) copy.enabled = !!enabledMap[copy.id];
      if (priorityMap.hasOwnProperty(copy.id)) copy.priority = Number(priorityMap[copy.id]) || 0;
      return copy;
    }).sort(function (a,b){ return (b.priority||0)-(a.priority||0); });
  }

  // -----------------------
  // TMDB helper
  // -----------------------
  function fetchTMDBDetails(tmdbId, mediaType) {
    return new Promise(function (resolve) {
      if (!tmdbId) return resolve(null);
      if (!TMDB_API_KEY) return resolve(null);
      var id = String(tmdbId).trim();
      if (!/^\d+$/.test(id)) return resolve(null);
      var endpoint = (mediaType === 'tv') ? 'tv' : 'movie';
      var url = TMDB_BASE + '/' + endpoint + '/' + encodeURIComponent(id) + '?api_key=' + encodeURIComponent(TMDB_API_KEY);
      getJson(url).then(function (data) {
        if (!data) return resolve(null);
        var title = data.title || data.name || data.original_title || null;
        var year = null;
        if (data.release_date) year = (new Date(data.release_date)).getFullYear();
        else if (data.first_air_date) year = (new Date(data.first_air_date)).getFullYear();
        resolve({ title: title, year: year, original_title: data.original_title || null, language: data.original_language || null });
      }).catch(function (err) { console.warn('[TMDB] lookup failed', err && err.message); resolve(null); });
    });
  }

  // -----------------------
  // PROVIDERS registry (59)
  // -----------------------
  var PROVIDERS = [
    { id: 'yflix', name: 'YFlix', supports: ['movie','tv','anime'], enabled: true, priority: 20, fn: null },

    { id: 'vegamovies', name: 'VegaMovies', supports: ['movie','tv'], enabled: true, priority: 10, fn: null },
    { id: 'vidsrccc', name: 'Vidsrccc', supports: ['movie','tv'], enabled: true, priority: 9, fn: null },
    { id: 'vidzee', name: 'Vidzee', supports: ['movie','tv'], enabled: true, priority: 9, fn: null },
    { id: 'kisskh', name: 'Kisskh', supports: ['movie','tv'], enabled: true, priority: 8, fn: null },
    { id: 'animepahe', name: 'AnimePahe', supports: ['anime','tv'], enabled: true, priority: 8, fn: null },
    { id: 'multimovies', name: 'Multimovies', supports: ['movie','tv'], enabled: true, priority: 8, fn: null },
    { id: 'uhdmovies', name: 'UHDMovies', supports: ['movie','tv'], enabled: true, priority: 7, fn: null },
    { id: 'anime', name: 'AllAnimeSources', supports: ['anime','tv'], enabled: true, priority: 7, fn: null },
    { id: 'player4u', name: 'Player4U', supports: ['movie','tv'], enabled: true, priority: 7, fn: null },
    { id: 'player4u2', name: 'Player4U-Alt', supports: ['movie','tv'], enabled: true, priority: 6, fn: null },
    { id: 'vidnest', name: 'Vidnest', supports: ['movie','tv'], enabled: true, priority: 6, fn: null },
    { id: 'vidfast', name: 'VidFastPro', supports: ['movie','tv'], enabled: true, priority: 6, fn: null },
    { id: 'vidplus', name: 'VidPlus', supports: ['movie','tv'], enabled: true, priority: 6, fn: null },
    { id: 'ridomovies', name: 'RidoMovies', supports: ['movie','tv'], enabled: true, priority: 6, fn: null },
    { id: 'emovies', name: 'Emovies', supports: ['movie','tv'], enabled: true, priority: 6, fn: null },
    { id: '2embed', name: 'TwoEmbed', supports: ['movie','tv'], enabled: true, priority: 5, fn: null },
    { id: 'zshow', name: 'ZShow', supports: ['movie','tv'], enabled: true, priority: 5, fn: null },
    { id: 'showflix', name: 'Showflix', supports: ['movie','tv'], enabled: true, priority: 5, fn: null },
    { id: 'zoechip', name: 'Zoechip', supports: ['movie','tv'], enabled: true, priority: 5, fn: null },
    { id: 'nepu', name: 'Nepu', supports: ['movie','tv'], enabled: true, priority: 5, fn: null },
    { id: 'watch32', name: 'Watch32APIHQ', supports: ['movie','tv'], enabled: true, priority: 5, fn: null },
    { id: 'riverse', name: 'RiveStream', supports: ['movie','tv'], enabled: true, priority: 5, fn: null },
    { id: 'superstream', name: 'SuperStream', supports: ['movie','tv'], enabled: true, priority: 5, fn: null },
    { id: 'streamplay', name: 'StreamPlayInternal', supports: ['movie','tv'], enabled: true, priority: 4, fn: null },
    { id: 'animetosho', name: 'Animetosho', supports: ['anime'], enabled: true, priority: 4, fn: null },
    { id: 'hianime', name: 'HiAnime', supports: ['anime'], enabled: true, priority: 4, fn: null },
    { id: 'anizone', name: 'Anizone', supports: ['anime'], enabled: true, priority: 4, fn: null },
    { id: 'kickassanime', name: 'KickAssAnime', supports: ['anime'], enabled: true, priority: 4, fn: null },
    { id: 'zoro', name: 'ZoroLike', supports: ['anime'], enabled: true, priority: 4, fn: null },
    { id: 'playm4u', name: 'Playm4u', supports: ['movie','tv'], enabled: true, priority: 4, fn: null },
    { id: 'm4ufree', name: 'M4ufree', supports: ['movie','tv'], enabled: true, priority: 4, fn: null },
    { id: 'vcloud', name: 'VCloud', supports: ['movie','tv'], enabled: true, priority: 4, fn: null },
    { id: 'vcloudgd', name: 'VCloudGD', supports: ['movie','tv'], enabled: true, priority: 4, fn: null },
    { id: 'filemoon', name: 'FileMoon', supports: ['movie','tv'], enabled: true, priority: 4, fn: null },
    { id: 'mixdrop', name: 'MixDrop', supports: ['movie','tv'], enabled: true, priority: 4, fn: null },
    { id: 'mp4upload', name: 'Mp4Upload', supports: ['movie','tv'], enabled: true, priority: 4, fn: null },
    { id: 'streamsb', name: 'StreamSB', supports: ['movie','tv'], enabled: true, priority: 4, fn: null },
    { id: 'streamsb8', name: 'StreamSB8', supports: ['movie','tv'], enabled: true, priority: 4, fn: null },
    { id: 'streamtape', name: 'StreamTape', supports: ['movie','tv'], enabled: true, priority: 4, fn: null },
    { id: 'voe', name: 'Voe', supports: ['movie','tv'], enabled: true, priority: 4, fn: null },
    { id: 'dood', name: 'Dood', supports: ['movie','tv'], enabled: true, priority: 4, fn: null },
    { id: 'doodre', name: 'DoodRe', supports: ['movie','tv'], enabled: true, priority: 4, fn: null },
    { id: 'vidstack', name: 'VidStack', supports: ['movie','tv'], enabled: true, priority: 3, fn: null },
    { id: 'pixelDrain', name: 'PixelDrain', supports: ['movie','tv'], enabled: true, priority: 3, fn: null },
    { id: 'film1k', name: 'Film1k', supports: ['movie','tv'], enabled: true, priority: 3, fn: null },
    { id: 'mwish', name: 'MWish', supports: ['movie','tv'], enabled: true, priority: 3, fn: null },
    { id: 'vidhide', name: 'Vidhide', supports: ['movie','tv'], enabled: true, priority: 3, fn: null },
    { id: 'embedrise', name: 'EmbedRise', supports: ['movie','tv'], enabled: true, priority: 3, fn: null },
    { id: 'vidfastpro', name: 'VidFastProAlt', supports: ['movie','tv'], enabled: true, priority: 3, fn: null },
    { id: 'vidplusapi', name: 'VidPlusAPI', supports: ['movie','tv'], enabled: true, priority: 3, fn: null },
    { id: 'xdmovies', name: 'XDmovies', supports: ['movie','tv'], enabled: true, priority: 3, fn: null },
    { id: 'vidnest_api', name: 'VidnestAPI', supports: ['movie','tv'], enabled: true, priority: 3, fn: null },
    { id: 'moflix', name: 'Moflix', supports: ['movie','tv'], enabled: true, priority: 3, fn: null },
    { id: 'moflix2', name: 'MoflixAlt', supports: ['movie','tv'], enabled: true, priority: 3, fn: null },
    { id: 'vhideo', name: 'VHideGMPlayer', supports: ['movie','tv'], enabled: true, priority: 3, fn: null }
  ];

  // -----------------------
  // Generic provider extractor (fallback)
  // -----------------------
  function genericProviderExtractor(providerId, input, options) {
    options = options || {};
    var tlds = options.tlds || ['.com', '.to', '.site', '.tv', '.io', '.xyz', '.net', '.org'];
    var searchPatterns = options.searchPatterns || ['/search?q=', '/?s=', '/find/', '/search/', '/?keyword='];
    var tried = new Set();

    function guessDomains() {
      var domains = [];
      if (providerId.indexOf('.') !== -1) domains.push(providerId);
      else tlds.forEach(function(tld){ domains.push(providerId + tld); });
      domains.push(providerId);
      return domains;
    }

    function searchDomainForQuery(baseUrl, query) {
      var urls = searchPatterns.map(function(p){ return baseUrl + p + encodeURIComponent(query); });
      urls.push(baseUrl + '/search?q=' + encodeURIComponent(query));
      urls.push(baseUrl + '/search/' + encodeURIComponent(query));
      return urls;
    }

    function parseDetailForLinks(detailHtml, baseUrl) {
      var streams = [];
      try {
        if (cheerio) {
          var $ = cheerio.load(detailHtml);
          $('iframe').each(function(i, el) {
            var s = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
            if (s) streams.push(toAbsolute(baseUrl, s));
          });
          $('source').each(function(i, el) {
            var s = $(el).attr('src') || $(el).attr('data-src');
            if (s) streams.push(toAbsolute(baseUrl, s));
          });
          $('a').each(function(i, el) {
            var href = $(el).attr('href');
            if (!href) return;
            if (href.indexOf('.m3u8') !== -1 || href.indexOf('.mp4') !== -1 || /embed|player|stream|download/i.test(href)) {
              streams.push(toAbsolute(baseUrl, href));
            }
          });
          $('[data-file],[data-src],[data-video]').each(function(i, el){
            var s = $(el).attr('data-file') || $(el).attr('data-src') || $(el).attr('data-video');
            if (s) streams.push(toAbsolute(baseUrl, s));
          });
        } else {
          var iframeRx = /<iframe[^>]+src=["']([^"']+)["']/gi;
          var m;
          while ((m = iframeRx.exec(detailHtml)) !== null) streams.push(toAbsolute(baseUrl, m[1]));
          var linkRx = /href=["']([^"']+\.(m3u8|mp4))["']/gi;
          while ((m = linkRx.exec(detailHtml)) !== null) streams.push(toAbsolute(baseUrl, m[1]));
        }
      } catch (e) {}
      var out = [];
      var seen = {};
      streams.forEach(function(u){
        if (!u) return;
        var clean = u.split('#')[0];
        if (!seen[clean]) { seen[clean] = true; out.push(clean); }
      });
      return out;
    }

    function tryFollowEmbed(url) {
      return getText(url).then(function(html){
        var found = parseDetailForLinks(html, url);
        return (found && found.length) ? found : [url];
      }).catch(function(){ return [url]; });
    }

    function classifyAndFormat(urls) {
      var arr = [];
      urls.forEach(function(u){
        if (!u) return;
        var q = 'Unknown';
        var low = u.toLowerCase();
        var m;
        if ((m = low.match(/(\d{3,4}p)/))) q = m[1];
        else if (low.indexOf('1080') !== -1) q = '1080p';
        else if (low.indexOf('720') !== -1) q = '720p';
        else if (low.indexOf('.m3u8') !== -1) q = 'Adaptive';
        arr.push({ url: u, quality: q, type: (u.indexOf('.m3u8') !== -1 ? 'hls' : 'file') });
      });
      return enhanceStreamsWithQuality(arr).catch(function(){ return arr; }).then(function(expanded){
        var out = [];
        var seenU = {};
        expanded.forEach(function(s){
          if (!s || !s.url) return;
          if (seenU[s.url]) return;
          seenU[s.url] = true;
          out.push({
            name: providerId + ' - ' + (s.quality || 'Unknown'),
            title: (input.title || '') + (input.year ? ' ('+input.year+')' : ''),
            url: s.url,
            quality: s.quality || 'Unknown',
            size: 'Unknown',
            headers: HEADERS,
            provider: providerId
          });
        });
        return out;
      });
    }

    return new Promise(function (resolve) {
      var queryParts = [];
      if (input.title) queryParts.push(input.title + (input.year ? ' ' + input.year : ''));
      if (input.tmdbId && /^\d+$/.test(String(input.tmdbId))) queryParts.push(String(input.tmdbId));
      if (queryParts.length === 0) queryParts.push(String(input.tmdbId || providerId));

      var domains = guessDomains();
      var foundAny = false;
      var aggregated = [];

      (function tryDomain(iDom) {
        if (iDom >= domains.length) {
          if (!foundAny) return resolve([]);
          return resolve(aggregated);
        }
        var domain = domains[iDom];
        var base = domain.indexOf('://') === -1 ? ('https://' + domain) : domain;
        var queries = queryParts.slice();
        (function tryQuery(iQ) {
          if (iQ >= queries.length) return tryDomain(iDom + 1);
          var q = queries[iQ];
          var searchUrls = searchDomainForQuery(base, q);
          (function trySearchUrl(iS) {
            if (iS >= searchUrls.length) return tryQuery(iQ + 1);
            var sUrl = searchUrls[iS];
            if (tried.has(sUrl)) return trySearchUrl(iS + 1);
            tried.add(sUrl);

            getText(sUrl).then(function(html){
              var detailCandidates = [];
              try {
                if (cheerio) {
                  var $ = cheerio.load(html);
                  $('a').each(function(idx, el){
                    var href = ($(el).attr('href')||'').trim();
                    if (!href) return;
                    if (/watch|movie|detail|series|episode|\/watch\//i.test(href) || href.indexOf('embed')!==-1 || href.indexOf('/v/')!==-1) detailCandidates.push(toAbsolute(base, href));
                  });
                } else {
                  var rx = /href=["']([^"']+)["']/gi;
                  var m;
                  while ((m = rx.exec(html)) !== null) {
                    var href = m[1];
                    if (/watch|movie|detail|series|episode|embed|\/v\//i.test(href)) detailCandidates.push(toAbsolute(base, href));
                  }
                }
              } catch (e) { detailCandidates = []; }

              var directLinks = parseDetailForLinks(html, base);
              if (directLinks && directLinks.length) {
                foundAny = true;
                return classifyAndFormat(directLinks).then(function(form){
                  aggregated = aggregated.concat(form);
                  return resolve(aggregated);
                });
              }

              if (!detailCandidates || detailCandidates.length === 0) return trySearchUrl(iS + 1);
              var followCount = Math.min(3, detailCandidates.length);
              var followPromises = [];
              for (var f = 0; f < followCount; f++) {
                (function(fidx){
                  var durl = detailCandidates[fidx];
                  var p = getText(durl).then(function(dhtml){
                    var foundLinks = parseDetailForLinks(dhtml, durl);
                    if (foundLinks && foundLinks.length) {
                      var further = [];
                      foundLinks.forEach(function(u){
                        if (/iframe|embed|player|cloudflare|rapidshare|vidcdn|streamtape/i.test(u)) {
                          further.push( tryFollowEmbed(u).catch(function(){ return [u]; }) );
                        } else {
                          further.push(Promise.resolve([u]));
                        }
                      });
                      return Promise.all(further).then(function(arrs){
                        var flat = [].concat.apply([], arrs || []);
                        return flat;
                      });
                    }
                    return [];
                  }).catch(function(){ return []; });
                  followPromises.push(p);
                })(f);
              }
              Promise.all(followPromises).then(function(arrOfArr){
                var flat = [].concat.apply([], arrOfArr || []);
                flat = flat.filter(Boolean);
                if (flat.length === 0) return trySearchUrl(iS + 1);
                foundAny = true;
                classifyAndFormat(flat).then(function(form){
                  aggregated = aggregated.concat(form);
                  return resolve(aggregated);
                }).catch(function(){ return resolve(aggregated); });
              }).catch(function(){ return trySearchUrl(iS + 1); });

            }).catch(function(){ trySearchUrl(iS + 1); });
          })(0);
        })(0);
      })(0);
    });
  }

  // -----------------------
  // Site-specific extractors for top 12 providers
  // (they try canonical domains + special embed resolvers; fallback to generic)
  // -----------------------

  // Helper: extract direct links from common embed pages (simple host detectors)
  function resolveCommonHosters(url) {
    // returns Promise resolving to array of direct urls or empty
    if (!url) return Promise.resolve([]);
    var low = url.toLowerCase();

    // MixDrop (example: mixdrop.co/e/ID or mixdrop.to/e/ID) - often embeds JSON in page or XHR
    if (/mixdrop\.(?:co|to|io|pw)/.test(low) || /mixdrop/.test(low)) {
      return getText(url).then(function(html){
        // try to find sources JSON in script tags
        var jsonMatch = html.match(/sources:\s*(\[[\s\S]*?\])/i) || html.match(/player\.setup\((\{[\s\S]*?\})\)/i);
        if (jsonMatch) {
          try {
            var js = jsonMatch[1];
            var parsed = JSON.parse(js);
            var urls = [];
            if (Array.isArray(parsed)) parsed.forEach(function(s){ if (s && s.file) urls.push(s.file); });
            else if (parsed && parsed.sources) parsed.sources.forEach(function(s){ if (s && s.file) urls.push(s.file); });
            if (urls.length) return urls;
          } catch (e){}
        }
        // fallback: find m3u8 or mp4 links by regex
        var links = [];
        var rx = /https?:\/\/[^\s"']+\.(m3u8|mp4)/gi;
        var m; while ((m = rx.exec(html)) !== null) links.push(m[0]);
        return links;
      }).catch(function(){ return []; });
    }

    // StreamTape (streamtape.com/e/ID -> embed page has token via ajax)
    if (/streamtape\.com\/e\//.test(low) || /streamtape\.com\/v\//.test(low)) {
      // attempt to fetch the embed page and extract 'sources' or XHR token
      return getText(url).then(function(html){
        // StreamTape sometimes has "document.getElementById('videolink').value = '...';"
        var m = html.match(/'(https?:\/\/(?:[\w-]+\.)+streamtape\.com\/\S+)'/i);
        var urls = [];
        if (m) urls.push(m[1]);
        // regex for mp4/m3u8
        var rx = /https?:\/\/[^\s"']+\.(m3u8|mp4)/gi;
        var mm; while ((mm = rx.exec(html)) !== null) urls.push(mm[0]);
        return urls;
      }).catch(function(){ return []; });
    }

    // Mp4Upload (embed pages often include sources in JS)
    if (/mp4upload\.(?:com|to)/.test(low) || /mp4upload/.test(low)) {
      return getText(url).then(function(html){
        var urls = [];
        var m = html.match(/(?:file|src)\s*:\s*["']([^"']+\.(mp4|m3u8))["']/i);
        if (m) urls.push(m[1]);
        var rx = /https?:\/\/[^\s"']+\.(m3u8|mp4)/gi;
        var mm; while ((mm = rx.exec(html)) !== null) urls.push(mm[0]);
        return urls;
      }).catch(function(){ return []; });
    }

    // Dood (dood.to embed: doodcdn.co/d/[id].json or dood.watch/e/... ; known JSON endpoints)
    if (/dood\.(?:to|watch|so|re|la)/.test(low) || /dood\.watch/.test(low)) {
      // common pattern: embed page contains 'sources' or a json endpoint like /d/{id}/json
      return getText(url).then(function(html){
        var urls=[];
        var m = html.match(/sources\s*:\s*(\[[\s\S]*?\])/i) || html.match(/"file"\s*:\s*"([^"]+\.(mp4|m3u8))"/i);
        if (m) {
          try {
            if (m[1]) {
              var js = m[1];
              var parsed = JSON.parse(js);
              parsed.forEach(function(s){ if (s && s.file) urls.push(s.file); });
            } else {
              urls.push(m[1]);
            }
          } catch(e){}
        }
        var rx = /https?:\/\/[^\s"']+\.(m3u8|mp4)/gi;
        var mm; while ((mm = rx.exec(html)) !== null) urls.push(mm[0]);
        return urls;
      }).catch(function(){ return []; });
    }

    // Voe (voe.sx etc) embed usually returns direct mp4 or may require following iframe
    if (/voe\.(?:sx|cloud|sx)/.test(low) || /voe\./.test(low)) {
      return getText(url).then(function(html){
        var urls=[];
        var m = html.match(/player\.src\(|"file":"([^"]+\.mp4)"/i);
        if (m) urls.push(m[1]);
        var rx = /https?:\/\/[^\s"']+\.(m3u8|mp4)/gi;
        var mm; while ((mm = rx.exec(html)) !== null) urls.push(mm[0]);
        return urls;
      }).catch(function(){ return []; });
    }

    // VCloud / VCloudGD - often have direct mp4 links or JSON
    if (/vcloud\.(?:tv|gd|to|co)/.test(low) || /vcloud/.test(low)) {
      return getText(url).then(function(html){
        var urls=[];
        var rx = /https?:\/\/[^\s"']+\.(m3u8|mp4)/gi;
        var mm; while ((mm = rx.exec(html)) !== null) urls.push(mm[0]);
        return urls;
      }).catch(function(){ return []; });
    }

    // StreamSB / StreamSB8 (streamsb.net etc) - embed pages often have XHR to /video/ or 'sources' JSON
    if (/streamsb\.(?:net|com|to|xyz)/.test(low) || /sbplay\.|sbembed\./.test(low)) {
      return getText(url).then(function(html){
        var urls=[];
        // try to find JSON sources
        var m = html.match(/sources\s*:\s*(\[[\s\S]*?\])/i) || html.match(/"file"\s*:\s*"([^"]+\.(mp4|m3u8))"/i);
        if (m) {
          try {
            var js = m[1] || m[0];
            var parsed = JSON.parse(js);
            if (Array.isArray(parsed)) parsed.forEach(function(s){ if (s && s.file) urls.push(s.file); });
          } catch(e){}
        }
        var rx = /https?:\/\/[^\s"']+\.(m3u8|mp4)/gi;
        var mm; while ((mm = rx.exec(html)) !== null) urls.push(mm[0]);
        return urls;
      }).catch(function(){ return []; });
    }

    // Generic fallback - try to regex for m3u8/mp4
    return getText(url).then(function(html){
      var urls = [];
      var rx = /https?:\/\/[^\s"']+\.(m3u8|mp4)/gi;
      var m;
      while ((m = rx.exec(html)) !== null) urls.push(m[0]);
      return urls;
    }).catch(function(){ return []; });
  }

  // Helper: takes array of raw urls and returns formatted Nuvio streams via enhanceStreamsWithQuality
  function formatRawUrlsAsStreams(providerId, urls, input) {
    var items = (urls || []).filter(Boolean).map(function(u){ return { url: u, quality: u.indexOf('.m3u8')!==-1 ? 'Adaptive' : 'Unknown' }; });
    return enhanceStreamsWithQuality(items).then(function(exp){
      var out = [], seen={};
      exp.forEach(function(s){
        if (!s || !s.url) return;
        if (seen[s.url]) return;
        seen[s.url]=true;
        out.push({
          name: providerId + ' - ' + (s.quality || 'Unknown'),
          title: (input.title || '') + (input.year ? ' (' + input.year + ')' : ''),
          url: s.url,
          quality: s.quality || 'Unknown',
          size: 'Unknown',
          headers: HEADERS,
          provider: providerId
        });
      });
      return out;
    });
  }

  // VegaMovies - site-focused extractor
  function provider_vegamovies(input) {
    var domains = ['https://vegamovies.tz','https://vegamovies.yoga','https://vegamovies.to','https://vegamovies.cc'];
    var tried = 0;
    var queries = [];
    if (input.title) queries.push(input.title + (input.year ? ' ' + input.year : ''));
    if (input.tmdbId) queries.push(String(input.tmdbId));
    if (queries.length===0) queries.push(String(input.tmdbId||''));
    return new Promise(function (resolve) {
      (function tryDomain(iDom) {
        if (iDom >= domains.length) return resolve([]);
        var base = domains[iDom];
        (function tryQ(iQ) {
          if (iQ >= queries.length) return tryDomain(iDom+1);
          var qs = queries[iQ];
          var searchUrls = [ base + '/?s=' + encodeURIComponent(qs), base + '/search?keyword=' + encodeURIComponent(qs), base + '/search/' + encodeURIComponent(qs) ];
          (function trySearch(iS) {
            if (iS >= searchUrls.length) return tryQ(iQ+1);
            var sUrl = searchUrls[iS];
            getText(sUrl).then(function(html){
              // parse for detail links
              var links = [];
              try {
                if (cheerio) {
                  var $ = cheerio.load(html);
                  $('a').each(function(i,el){ var href = ($(el).attr('href')||'').trim(); if (!href) return; if (/watch|\/movie|\/watch\//i.test(href) || /\/movie\//i.test(href)) links.push(toAbsolute(base, href)); });
                } else {
                  var rx = /href=["']([^"']+)["']/gi; var m; while ((m=rx.exec(html))!==null) { var h=m[1]; if (/watch|\/movie|\/watch\//i.test(h)) links.push(toAbsolute(base,h)); }
                }
              } catch(e){ links = []; }
              if (!links || links.length===0) return trySearch(iS+1);
              // follow first link(s)
              var followCount = Math.min(3, links.length);
              var fPromises = [];
              for (var f=0; f<followCount; f++) {
                (function(idx){
                  var url = links[idx];
                  var p = getText(url).then(function(detail){
                    // parse embed links
                    var found = [];
                    try {
                      if (cheerio) {
                        var $$ = cheerio.load(detail);
                        $$('iframe').each(function(i,el){ var s = $$(el).attr('src') || $$(el).attr('data-src'); if (s) found.push(toAbsolute(url,s));});
                        $$('a').each(function(i,el){ var h = $$(el).attr('href'); if (h && (h.indexOf('.m3u8')!==-1||h.indexOf('.mp4')!==-1)) found.push(toAbsolute(url,h));});
                        $$('[data-file],[data-src]').each(function(i,el){ var s = $$(el).attr('data-file')||$$(el).attr('data-src'); if (s) found.push(toAbsolute(url,s)); });
                      } else {
                        var iframeRx = /<iframe[^>]+src=["']([^"']+)["']/gi; var m; while ((m=iframeRx.exec(detail))!==null) found.push(toAbsolute(url,m[1]));
                        var linkRx = /href=["']([^"']+\.(m3u8|mp4))["']/gi; while ((m=linkRx.exec(detail))!==null) found.push(toAbsolute(url,m[1]));
                      }
                    } catch(e){}
                    if (found.length===0) return [];
                    // resolve common hosters
                    var chain = found.map(function(u){ return resolveCommonHosters(u).catch(function(){ return []; }); });
                    return Promise.all(chain).then(function(arrs){ return [].concat.apply([], arrs || []).concat(found); });
                  }).catch(function(){ return []; });
                  fPromises.push(p);
                })(f);
              }
              Promise.all(fPromises).then(function(arr){
                var flat = [].concat.apply([], arr || []);
                flat = flat.filter(Boolean);
                if (flat.length===0) return trySearch(iS+1);
                // format and return
                formatRawUrlsAsStreams('vegamovies', flat, input).then(function(out){ resolve(out); });
              }).catch(function(){ trySearch(iS+1); });
            }).catch(function(){ trySearch(iS+1); });
          })(0);
        })(0);
      })(0);
    });
  }

  // Playm4u - site-focused extractor
  function provider_playm4u(input) {
    var domains = ['https://playm4u.to','https://playm4u.me','https://playm4u.cc'];
    var queries = [];
    if (input.title) queries.push(input.title + (input.year ? ' ' + input.year : ''));
    if (input.tmdbId) queries.push(String(input.tmdbId));
    if (queries.length===0) queries.push(String(input.tmdbId||''));
    return new Promise(function (resolve) {
      (function tryDomain(iDom){
        if (iDom>=domains.length) return resolve([]);
        var base = domains[iDom];
        (function tryQ(iQ){
          if (iQ>=queries.length) return tryDomain(iDom+1);
          var q = queries[iQ];
          var searchUrls = [ base + '/?s=' + encodeURIComponent(q), base + '/search?keyword=' + encodeURIComponent(q) ];
          (function trySearch(iS){
            if (iS>=searchUrls.length) return tryQ(iQ+1);
            var sUrl = searchUrls[iS];
            getText(sUrl).then(function(html){
              var detailLinks=[];
              try {
                if (cheerio) {
                  var $ = cheerio.load(html);
                  $('a').each(function(i,el){ var href=($(el).attr('href')||'').trim(); if (!href) return; if (/watch|\/movie|\/series|\/episode/i.test(href)) detailLinks.push(toAbsolute(base,href)); });
                } else {
                  var rx=/href=["']([^"']+)["']/gi; var m; while ((m=rx.exec(html))!==null) { var h=m[1]; if (/watch|\/movie|\/series|\/episode/i.test(h)) detailLinks.push(toAbsolute(base,h)); }
                }
              } catch(e){}
              if (!detailLinks.length) return trySearch(iS+1);
              var follow = Math.min(3, detailLinks.length);
              var pArr = [];
              for (var f=0; f<follow; f++){
                (function(idx){ var u = detailLinks[idx]; var p = getText(u).then(function(dhtml){
                  var links = [];
                  try {
                    if (cheerio) {
                      var $$ = cheerio.load(dhtml);
                      $$('iframe').each(function(i,el){ var s = $$(el).attr('src') || $$(el).attr('data-src'); if (s) links.push(toAbsolute(u,s)); });
                      $$('a').each(function(i,el){ var h=$$(el).attr('href'); if (h && (h.indexOf('.m3u8')!==-1||h.indexOf('.mp4')!==-1)) links.push(toAbsolute(u,h)); });
                    } else {
                      var ifr=/iframe[^>]+src=["']([^"']+)["']/gi; var m; while ((m=ifr.exec(dhtml))!==null) links.push(toAbsolute(u,m[1]));
                      var rlink=/href=["']([^"']+\.(m3u8|mp4))["']/gi; while ((m=rlink.exec(dhtml))!==null) links.push(toAbsolute(u,m[1]));
                    }
                  } catch(e){}
                  if (links.length===0) return [];
                  var chain = links.map(function(x){ return resolveCommonHosters(x).catch(function(){ return []; }); });
                  return Promise.all(chain).then(function(arrs){ return [].concat.apply([], arrs || []).concat(links); });
                }).catch(function(){ return []; }); pArr.push(p); })(f);
              }
              Promise.all(pArr).then(function(r){ var flat = [].concat.apply([], r || []).filter(Boolean); if (!flat.length) return trySearch(iS+1); formatRawUrlsAsStreams('playm4u', flat, input).then(resolve); }).catch(function(){ trySearch(iS+1); });
            }).catch(function(){ trySearch(iS+1); });
          })(0);
        })(0);
      })(0);
    });
  }

  // FileMoon - site-focused extractor
  function provider_filemoon(input) {
    var domains = ['https://filemoon.sx','https://filemoon.to','https://filemoon.co'];
    var queries = [];
    if (input.title) queries.push(input.title + (input.year ? ' ' + input.year : ''));
    if (input.tmdbId) queries.push(String(input.tmdbId));
    if (queries.length===0) queries.push(String(input.tmdbId||''));
    return new Promise(function(resolve){
      (function tryDomain(iDom){
        if (iDom>=domains.length) return resolve([]);
        var base = domains[iDom];
        (function tryQ(iQ){
          if (iQ>=queries.length) return tryDomain(iDom+1);
          var q = queries[iQ];
          var searchUrls = [ base + '/?s=' + encodeURIComponent(q), base + '/search?q=' + encodeURIComponent(q) ];
          (function trySearch(iS){
            if (iS>=searchUrls.length) return tryQ(iQ+1);
            var sUrl = searchUrls[iS];
            getText(sUrl).then(function(html){
              var links=[];
              try {
                if (cheerio) { var $ = cheerio.load(html); $('a').each(function(i,el){ var h=($(el).attr('href')||'').trim(); if (!h) return; if (/filemoon/i.test(h) || /watch|movie|video|\/v\//i.test(h)) links.push(toAbsolute(base,h)); }); }
                else { var rx=/href=["']([^"']+)["']/gi; var m; while ((m=rx.exec(html))!==null) { var h=m[1]; if (/filemoon|watch|movie|video|\/v\//i.test(h)) links.push(toAbsolute(base,h)); } }
              } catch(e){}
              if (!links.length) return trySearch(iS+1);
              var fPromises = links.slice(0,3).map(function(u){ return getText(u).then(function(d){ var found=[]; try { if (cheerio) { var $$=cheerio.load(d); $$('iframe').each(function(i,el){ var s=$$(el).attr('src')||$$(el).attr('data-src'); if (s) found.push(toAbsolute(u,s)); }); } else { var iframeRx=/iframe[^>]+src=["']([^"']+)["']/gi; var m; while ((m=iframeRx.exec(d))!==null) found.push(toAbsolute(u,m[1])); } } catch(e){} if (!found.length) return []; var chain = found.map(function(x){ return resolveCommonHosters(x).catch(function(){ return []; }); }); return Promise.all(chain).then(function(arrs){ return [].concat.apply([], arrs || []).concat(found); }); }).catch(function(){ return []; }); 
              Promise.all(fPromises).then(function(arr){ var flat = [].concat.apply([], arr || []).filter(Boolean); if (!flat.length) return trySearch(iS+1); formatRawUrlsAsStreams('filemoon', flat, input).then(resolve); }).catch(function(){ trySearch(iS+1); });
            }).catch(function(){ trySearch(iS+1); });
          })(0);
        })(0);
      })(0);
    });
  }

  // MixDrop - site-focused extractor (tries to find sources JSON or direct m3u8/mp4)
  function provider_mixdrop(input) {
    var domains = ['https://mixdrop.co','https://mixdrop.to','https://mixdrop.me'];
    var queries = [];
    if (input.title) queries.push(input.title + (input.year ? ' ' + input.year : ''));
    if (input.tmdbId) queries.push(String(input.tmdbId));
    if (queries.length===0) queries.push(String(input.tmdbId||''));
    return new Promise(function(resolve){
      (function tryDomain(iDom){
        if (iDom>=domains.length) return resolve([]);
        var base = domains[iDom];
        (function tryQ(iQ){
          if (iQ>=queries.length) return tryDomain(iDom+1);
          var q = queries[iQ];
          var searchUrls = [ base + '/?s=' + encodeURIComponent(q), base + '/search?q=' + encodeURIComponent(q) ];
          (function trySearch(iS){
            if (iS>=searchUrls.length) return tryQ(iQ+1);
            var sUrl = searchUrls[iS];
            getText(sUrl).then(function(html){
              var details=[];
              try { if (cheerio) { var $=cheerio.load(html); $('a').each(function(i,el){ var h=($(el).attr('href')||'').trim(); if (!h) return; if (/mixdrop|embed|player|watch|movie/i.test(h)) details.push(toAbsolute(base,h)); }); } else { var rx=/href=["']([^"']+)["']/gi; var m; while((m=rx.exec(html))!==null){ var h=m[1]; if (/mixdrop|embed|player|watch|movie/i.test(h)) details.push(toAbsolute(base,h)); } } } catch(e){}
              if (!details.length) return trySearch(iS+1);
              var pArr = details.slice(0,3).map(function(u){ return getText(u).then(function(d){ // try to find sources array or mp4 links
                var res = [];
                var jsMatch = d.match(/sources\s*:\s*(\[[\s\S]*?\])/i) || d.match(/player\.setup\((\{[\s\S]*?\})\)/i);
                if (jsMatch) {
                  try { var js = jsMatch[1]; var parsed = JSON.parse(js); if (Array.isArray(parsed)) parsed.forEach(function(s){ if (s && s.file) res.push(s.file); }); else if (parsed.sources) parsed.sources.forEach(function(s){ if (s && s.file) res.push(s.file); }); } catch(e){}
                }
                var rx = /https?:\/\/[^\s"']+\.(m3u8|mp4)/gi; var mm; while ((mm=rx.exec(d))!==null) res.push(mm[0]);
                return res;
              }).catch(function(){ return []; }); });
              Promise.all(pArr).then(function(arr){ var flat = [].concat.apply([], arr || []).filter(Boolean); if (!flat.length) return trySearch(iS+1); formatRawUrlsAsStreams('mixdrop', flat, input).then(resolve); }).catch(function(){ trySearch(iS+1); });
            }).catch(function(){ trySearch(iS+1); });
          })(0);
        })(0);
      })(0);
    });
  }

  // StreamSB - site-focused extractor
  function provider_streamsb(input) {
    var domains = ['https://streamsb.net','https://sbplay.org','https://sbplay.to'];
    var queries = [];
    if (input.title) queries.push(input.title + (input.year ? ' ' + input.year : ''));
    if (input.tmdbId) queries.push(String(input.tmdbId));
    if (queries.length===0) queries.push(String(input.tmdbId||''));
    return new Promise(function(resolve){
      (function tryDomain(iDom){
        if (iDom>=domains.length) return resolve([]);
        var base = domains[iDom];
        (function tryQ(iQ){
          if (iQ>=queries.length) return tryDomain(iDom+1);
          var q = queries[iQ];
          var searchUrls = [ base + '/?s=' + encodeURIComponent(q), base + '/search?q=' + encodeURIComponent(q) ];
          (function trySearch(iS){
            if (iS>=searchUrls.length) return tryQ(iQ+1);
            var sUrl = searchUrls[iS];
            getText(sUrl).then(function(html){
              var detailLinks=[];
              try { if (cheerio) { var $=cheerio.load(html); $('a').each(function(i,el){ var h=($(el).attr('href')||'').trim(); if (!h) return; if (/streamsb|sbplay|embed|watch|movie/i.test(h)) detailLinks.push(toAbsolute(base,h)); }); } else { var rx=/href=["']([^"']+)["']/gi; var m; while((m=rx.exec(html))!==null){ var h=m[1]; if (/streamsb|sbplay|embed|watch|movie/i.test(h)) detailLinks.push(toAbsolute(base,h)); } } } catch(e){}
              if (!detailLinks.length) return trySearch(iS+1);
              var pArr = detailLinks.slice(0,3).map(function(u){ return getText(u).then(function(d){
                var res=[];
                var jsMatch = d.match(/sources\s*:\s*(\[[\s\S]*?\])/i) || d.match(/"file":"([^"]+\.(mp4|m3u8))"/i);
                if (jsMatch) {
                  try { var js = jsMatch[1] || jsMatch[0]; var parsed = JSON.parse(js); if (Array.isArray(parsed)) parsed.forEach(function(s){ if (s && s.file) res.push(s.file); }); } catch(e){} 
                }
                var rx = /https?:\/\/[^\s"']+\.(m3u8|mp4)/gi; var mm; while ((mm=rx.exec(d))!==null) res.push(mm[0]);
                return res;
              }).catch(function(){ return []; }); });
              Promise.all(pArr).then(function(arr){ var flat = [].concat.apply([], arr || []).filter(Boolean); if (!flat.length) return trySearch(iS+1); formatRawUrlsAsStreams('streamsb', flat, input).then(resolve); }).catch(function(){ trySearch(iS+1); });
            }).catch(function(){ trySearch(iS+1); });
          })(0);
        })(0);
      })(0);
    });
  }

  // Mp4Upload - site-focused extractor
  function provider_mp4upload(input) {
    var domains = ['https://www.mp4upload.com','https://mp4upload.com'];
    var queries = [];
    if (input.title) queries.push(input.title + (input.year ? ' ' + input.year : ''));
    if (input.tmdbId) queries.push(String(input.tmdbId));
    if (queries.length===0) queries.push(String(input.tmdbId||''));
    return new Promise(function(resolve){
      (function tryDomain(iDom){
        if (iDom>=domains.length) return resolve([]);
        var base = domains[iDom];
        (function tryQ(iQ){
          if (iQ>=queries.length) return tryDomain(iDom+1);
          var q = queries[iQ];
          var searchUrls = [ base + '/?s=' + encodeURIComponent(q), base + '/search?q=' + encodeURIComponent(q) ];
          (function trySearch(iS){
            if (iS>=searchUrls.length) return tryQ(iQ+1);
            var sUrl = searchUrls[iS];
            getText(sUrl).then(function(html){
              var detail=[];
              try { if (cheerio) { var $=cheerio.load(html); $('a').each(function(i,el){ var h=$($(el)).attr('href')||''; if (!h) return; if (/mp4upload|embed|video|watch/i.test(h)) detail.push(toAbsolute(base,h)); }); } else { var rx=/href=["']([^"']+)["']/gi; var m; while((m=rx.exec(html))!==null){ var h=m[1]; if (/mp4upload|embed|video|watch/i.test(h)) detail.push(toAbsolute(base,h)); } } } catch(e){}
              if (!detail.length) return trySearch(iS+1);
              var pArr = detail.slice(0,3).map(function(u){ return getText(u).then(function(d){
                var res=[];
                var mm = d.match(/(https?:\/\/[^\s'"]+\.mp4)/i);
                if (mm) res.push(mm[1]);
                var rx = /https?:\/\/[^\s"']+\.(m3u8|mp4)/gi; var m; while ((m=rx.exec(d))!==null) res.push(m[0]);
                return res;
              }).catch(function(){ return []; }); });
              Promise.all(pArr).then(function(arr){ var flat = [].concat.apply([], arr || []).filter(Boolean); if (!flat.length) return trySearch(iS+1); formatRawUrlsAsStreams('mp4upload', flat, input).then(resolve); }).catch(function(){ trySearch(iS+1); });
            }).catch(function(){ trySearch(iS+1); });
          })(0);
        })(0);
      })(0);
    });
  }

  // StreamTape - site-focused extractor
  function provider_streamtape(input) {
    var domains = ['https://streamtape.com','https://streamtape.to'];
    var queries = [];
    if (input.title) queries.push(input.title + (input.year ? ' ' + input.year : ''));
    if (input.tmdbId) queries.push(String(input.tmdbId));
    if (queries.length===0) queries.push(String(input.tmdbId||''));
    return new Promise(function(resolve){
      (function tryDomain(iDom){
        if (iDom>=domains.length) return resolve([]);
        var base = domains[iDom];
        (function tryQ(iQ){
          if (iQ>=queries.length) return tryDomain(iDom+1);
          var q=queries[iQ];
          var searchUrls = [ base + '/?s=' + encodeURIComponent(q), base + '/search?q=' + encodeURIComponent(q) ];
          (function trySearch(iS){
            if (iS>=searchUrls.length) return tryQ(iQ+1);
            var sUrl = searchUrls[iS];
            getText(sUrl).then(function(html){
              var links=[];
              try { if (cheerio) { var $=cheerio.load(html); $('a').each(function(i,el){ var h=$(el).attr('href')||''; if (!h) return; if (/streamtape|embed|watch|video/i.test(h)) links.push(toAbsolute(base,h)); }); } else { var rx=/href=["']([^"']+)["']/gi; var m; while((m=rx.exec(html))!==null){ var h=m[1]; if (/streamtape|embed|watch|video/i.test(h)) links.push(toAbsolute(base,h)); } } } catch(e){}
              if (!links.length) return trySearch(iS+1);
              var pArr = links.slice(0,3).map(function(u){ return getText(u).then(function(d){
                var res=[]; var rx = /https?:\/\/[^\s"']+\.(m3u8|mp4)/gi; var mm; while((mm=rx.exec(d))!==null) res.push(mm[0]); return res;
              }).catch(function(){ return []; }); });
              Promise.all(pArr).then(function(arr){ var flat = [].concat.apply([], arr || []).filter(Boolean); if (!flat.length) return trySearch(iS+1); formatRawUrlsAsStreams('streamtape', flat, input).then(resolve); }).catch(function(){ trySearch(iS+1); });
            }).catch(function(){ trySearch(iS+1); });
          })(0);
        })(0);
      })(0);
    });
  }

  // Dood - site-focused extractor (common dood patterns)
  function provider_dood(input) {
    var domains = ['https://dood.to','https://dood.watch','https://dood.pm'];
    var queries = [];
    if (input.title) queries.push(input.title + (input.year ? ' ' + input.year : ''));
    if (input.tmdbId) queries.push(String(input.tmdbId));
    if (queries.length===0) queries.push(String(input.tmdbId||''));
    return new Promise(function(resolve){
      (function tryDomain(iDom){
        if (iDom>=domains.length) return resolve([]);
        var base = domains[iDom];
        (function tryQ(iQ){
          if (iQ>=queries.length) return tryDomain(iDom+1);
          var q = queries[iQ];
          var searchUrls = [ base + '/?s=' + encodeURIComponent(q), base + '/search?keyword=' + encodeURIComponent(q) ];
          (function trySearch(iS){
            if (iS>=searchUrls.length) return tryQ(iQ+1);
            var sUrl = searchUrls[iS];
            getText(sUrl).then(function(html){
              var details=[];
              try { if (cheerio) { var $=cheerio.load(html); $('a').each(function(i,el){ var h=$(el).attr('href')||''; if (!h) return; if (/dood|embed|watch|video|stream/i.test(h)) details.push(toAbsolute(base,h)); }); } else { var rx=/href=["']([^"']+)["']/gi; var m; while((m=rx.exec(html))!==null){ var h=m[1]; if (/dood|embed|watch|video|stream/i.test(h)) details.push(toAbsolute(base,h)); } } } catch(e){}
              if (!details.length) return trySearch(iS+1);
              var pArr = details.slice(0,3).map(function(u){ return getText(u).then(function(d){
                var res=[];
                var rx = /https?:\/\/[^\s"']+\.(mp4|m3u8)/gi; var mm; while((mm=rx.exec(d))!==null) res.push(mm[0]);
                // dood sometimes exposes json endpoint e.g., /d/<id>/json
                var idm = u.match(/dood\.(?:to|watch|pm)\/(?:e\/)?([^\/\?]+)/i);
                if (idm) {
                  var jsonUrl = base + '/d/' + idm[1] + '/json';
                  // try fetch json quick
                  return getJson(jsonUrl).then(function(j){ (j&&j.source||[]).forEach(function(s){ if (s && s.file) res.push(s.file); }); return res; }).catch(function(){ return res; });
                }
                return res;
              }).catch(function(){ return []; }); });
              Promise.all(pArr).then(function(arr){ var flat = [].concat.apply([], arr || []).filter(Boolean); if (!flat.length) return trySearch(iS+1); formatRawUrlsAsStreams('dood', flat, input).then(resolve); }).catch(function(){ trySearch(iS+1); });
            }).catch(function(){ trySearch(iS+1); });
          })(0);
        })(0);
      })(0);
    });
  }

  // Voe - site-focused extractor
  function provider_voe(input) {
    var domains = ['https://voe.sx','https://voe.sx','https://voe.sx']; // conservative
    var queries = [];
    if (input.title) queries.push(input.title + (input.year ? ' ' + input.year : ''));
    if (input.tmdbId) queries.push(String(input.tmdbId));
    if (queries.length===0) queries.push(String(input.tmdbId||''));
    return new Promise(function(resolve){
      (function tryDomain(iDom){
        if (iDom>=domains.length) return resolve([]);
        var base = domains[iDom];
        (function tryQ(iQ){
          if (iQ>=queries.length) return tryDomain(iDom+1);
          var q = queries[iQ];
          var searchUrls = [ base + '/search?keyword=' + encodeURIComponent(q), base + '/?s=' + encodeURIComponent(q) ];
          (function trySearch(iS){
            if (iS>=searchUrls.length) return tryQ(iQ+1);
            var sUrl = searchUrls[iS];
            getText(sUrl).then(function(html){
              var details=[];
              try { if (cheerio) { var $=cheerio.load(html); $('a').each(function(i,el){ var h=$(el).attr('href')||''; if (!h) return; if (/voe|embed|watch|video/i.test(h)) details.push(toAbsolute(base,h)); }); } else { var rx=/href=["']([^"']+)["']/gi; var m; while((m=rx.exec(html))!==null){ var h=m[1]; if (/voe|embed|watch|video/i.test(h)) details.push(toAbsolute(base,h)); } } } catch(e){}
              if (!details.length) return trySearch(iS+1);
              var pArr = details.slice(0,3).map(function(u){ return getText(u).then(function(d){
                var res=[];
                var rx = /https?:\/\/[^\s"']+\.(mp4|m3u8)/gi; var mm; while((mm=rx.exec(d))!==null) res.push(mm[0]);
                return res;
              }).catch(function(){ return []; }); });
              Promise.all(pArr).then(function(arr){ var flat = [].concat.apply([], arr || []).filter(Boolean); if (!flat.length) return trySearch(iS+1); formatRawUrlsAsStreams('voe', flat, input).then(resolve); }).catch(function(){ trySearch(iS+1); });
            }).catch(function(){ trySearch(iS+1); });
          })(0);
        })(0);
      })(0);
    });
  }

  // Vidzee - site-focused extractor (popular embed host)
  function provider_vidzee(input) {
    var domains = ['https://vidzee.org','https://vidzee.to','https://vidzee.com'];
    var queries = [];
    if (input.title) queries.push(input.title + (input.year ? ' ' + input.year : ''));
    if (input.tmdbId) queries.push(String(input.tmdbId));
    if (queries.length===0) queries.push(String(input.tmdbId||''));
    return new Promise(function(resolve){
      (function tryDomain(iDom){
        if (iDom>=domains.length) return resolve([]);
        var base = domains[iDom];
        (function tryQ(iQ){
          if (iQ>=queries.length) return tryDomain(iDom+1);
          var q = queries[iQ];
          var searchUrls = [ base + '/?s=' + encodeURIComponent(q), base + '/search?q=' + encodeURIComponent(q) ];
          (function trySearch(iS){
            if (iS>=searchUrls.length) return tryQ(iQ+1);
            var sUrl = searchUrls[iS];
            getText(sUrl).then(function(html){
              var details=[];
              try { if (cheerio) { var $=cheerio.load(html); $('a').each(function(i,el){ var h=$(el).attr('href')||''; if (!h) return; if (/vidzee|embed|watch|movie/i.test(h)) details.push(toAbsolute(base,h)); }); } else { var rx=/href=["']([^"']+)["']/gi; var m; while((m=rx.exec(html))!==null){ var h=m[1]; if (/vidzee|embed|watch|movie/i.test(h)) details.push(toAbsolute(base,h)); } } } catch(e){}
              if (!details.length) return trySearch(iS+1);
              var pArr = details.slice(0,4).map(function(u){ return getText(u).then(function(d){
                var res=[]; var rx=/https?:\/\/[^\s"']+\.(mp4|m3u8)/gi; var mm; while((mm=rx.exec(d))!==null) res.push(mm[0]); return res;
              }).catch(function(){ return []; }); });
              Promise.all(pArr).then(function(arr){ var flat = [].concat.apply([], arr || []).filter(Boolean); if (!flat.length) return trySearch(iS+1); formatRawUrlsAsStreams('vidzee', flat, input).then(resolve); }).catch(function(){ trySearch(iS+1); });
            }).catch(function(){ trySearch(iS+1); });
          })(0);
        })(0);
      })(0);
    });
  }

  // Vidsrccc - site-specific wrapper
  function provider_vidsrccc(input) {
    var domains = ['https://vidsrccc.com','https://vidsrccc.net','https://vidsrccc.org'];
    var queries = [];
    if (input.title) queries.push(input.title + (input.year ? ' ' + input.year : ''));
    if (input.tmdbId) queries.push(String(input.tmdbId));
    if (queries.length===0) queries.push(String(input.tmdbId||''));
    return new Promise(function(resolve){
      (function tryDomain(iDom){
        if (iDom>=domains.length) return resolve([]);
        var base = domains[iDom];
        (function tryQ(iQ){
          if (iQ>=queries.length) return tryDomain(iDom+1);
          var q = queries[iQ];
          var searchUrls = [ base + '/?s=' + encodeURIComponent(q), base + '/search?q=' + encodeURIComponent(q) ];
          (function trySearch(iS){
            if (iS>=searchUrls.length) return tryQ(iQ+1);
            var sUrl = searchUrls[iS];
            getText(sUrl).then(function(html){
              var links=[];
              try { if (cheerio) { var $=cheerio.load(html); $('a').each(function(i,el){ var h=$(el).attr('href')||''; if (!h) return; if (/vidsrccc|embed|watch|movie|series/i.test(h)) links.push(toAbsolute(base,h)); }); } else { var rx=/href=["']([^"']+)["']/gi; var m; while((m=rx.exec(html))!==null){ var h=m[1]; if (/vidsrccc|embed|watch|movie|series/i.test(h)) links.push(toAbsolute(base,h)); } } } catch(e){}
              if (!links.length) return trySearch(iS+1);
              var pArr = links.slice(0,3).map(function(u){ return getText(u).then(function(d){
                var res=[]; var rx=/https?:\/\/[^\s"']+\.(mp4|m3u8)/gi; var mm; while((mm=rx.exec(d))!==null) res.push(mm[0]); return res;
              }).catch(function(){ return []; }); });
              Promise.all(pArr).then(function(arr){ var flat = [].concat.apply([], arr || []).filter(Boolean); if (!flat.length) return trySearch(iS+1); formatRawUrlsAsStreams('vidsrccc', flat, input).then(resolve); }).catch(function(){ trySearch(iS+1); });
            }).catch(function(){ trySearch(iS+1); });
          })(0);
        })(0);
      })(0);
    });
  }

  // VCloud - site-focused extractor
  function provider_vcloud(input) {
    var domains = ['https://vcloud.to','https://vcloud.vip','https://vclouds.xyz'];
    var queries = [];
    if (input.title) queries.push(input.title + (input.year ? ' ' + input.year : ''));
    if (input.tmdbId) queries.push(String(input.tmdbId));
    if (queries.length===0) queries.push(String(input.tmdbId||''));
    return new Promise(function(resolve){
      (function tryDomain(iDom){
        if (iDom>=domains.length) return resolve([]);
        var base = domains[iDom];
        (function tryQ(iQ){
          if (iQ>=queries.length) return tryDomain(iDom+1);
          var q = queries[iQ];
          var searchUrls = [ base + '/?s=' + encodeURIComponent(q), base + '/search?q=' + encodeURIComponent(q) ];
          (function trySearch(iS){
            if (iS>=searchUrls.length) return tryQ(iQ+1);
            var sUrl = searchUrls[iS];
            getText(sUrl).then(function(html){
              var detail=[];
              try { if (cheerio) { var $=cheerio.load(html); $('a').each(function(i,el){ var h=$(el).attr('href')||''; if (!h) return; if (/vcloud|embed|watch|movie/i.test(h)) detail.push(toAbsolute(base,h)); }); } else { var rx=/href=["']([^"']+)["']/gi; var m; while((m=rx.exec(html))!==null){ var h=m[1]; if (/vcloud|embed|watch|movie/i.test(h)) detail.push(toAbsolute(base,h)); } } } catch(e){}
              if (!detail.length) return trySearch(iS+1);
              var pArr = detail.slice(0,3).map(function(u){ return getText(u).then(function(d){
                var res=[]; var rx=/https?:\/\/[^\s"']+\.(mp4|m3u8)/gi; var mm; while((mm=rx.exec(d))!==null) res.push(mm[0]); return res;
              }).catch(function(){ return []; }); });
              Promise.all(pArr).then(function(arr){ var flat = [].concat.apply([], arr || []).filter(Boolean); if (!flat.length) return trySearch(iS+1); formatRawUrlsAsStreams('vcloud', flat, input).then(resolve); }).catch(function(){ trySearch(iS+1); });
            }).catch(function(){ trySearch(iS+1); });
          })(0);
        })(0);
      })(0);
    });
  }

  // -----------------------
  // YFlix provider (kept faithful to provided implementation)
  // -----------------------
  (function defineYFlix() {
    var API = 'https://enc-dec.app/api';
    var YFLIX_AJAX = 'https://yflix.to/ajax';
    function createRequestId() { try { var rand = Math.random().toString(36).slice(2,8); var ts = Date.now().toString(36).slice(-6); return rand + ts; } catch (e) { return String(Date.now()); } }
    function logRid(rid, msg, extra) { try { if (extra !== undefined) console.log('[YFlix][rid:' + rid + '] ' + msg, extra); else console.log('[YFlix][rid:' + rid + '] ' + msg); } catch(e){} }
    function encryptRemote(text) { return getJson(API + '/enc-movies-flix?text=' + encodeURIComponent(text)).then(function (j) { return j && j.result; }); }
    function decryptRemote(text) { return postJson(API + '/dec-movies-flix', { text: text }).then(function (j) { return j && j.result; }); }
    function parseHtmlRemote(html) { return postJson(API + '/parse-html', { text: html }).then(function (j) { return j && j.result; }); }
    function decryptRapidMedia(embedUrl) { var media = embedUrl.replace('/e/', '/media/').replace('/e2/', '/media/'); return getJson(media).then(function (mediaJson) { var encrypted = mediaJson && mediaJson.result; if (!encrypted) throw new Error('No encrypted media result from RapidShare media endpoint'); return postJson(API + '/dec-rapid', { text: encrypted, agent: HEADERS['User-Agent'] }).then(function (j) { return j && j.result; }); }); }

    function runStreamFetch(contentId, specificEid, title, year, mediaType, seasonNum, episodeNum, rid) {
      logRid(rid, 'runStreamFetch start for contentId=' + contentId);
      return encryptRemote(contentId)
        .then(function(encId){
          logRid(rid, 'episodes/list enc ready');
          return getJson(YFLIX_AJAX + '/episodes/list?id=' + contentId + '&_=' + encId);
        })
        .then(function(episodesResp){
          return parseHtmlRemote(episodesResp.result);
        })
        .then(function(episodes){
          var eid = null;
          if (specificEid) eid = specificEid;
          else {
            var seasons = Object.keys(episodes || {});
            if (seasons.length > 0) {
              var firstSeason = seasons[0];
              var eps = Object.keys(episodes[firstSeason] || {});
              if (eps.length > 0) eid = episodes[firstSeason][eps[0]].eid;
            }
          }
          if (!eid) { logRid(rid, 'no eid found'); }
          return encryptRemote(eid).then(function(encEid){ return { eid: eid, encEid: encEid }; });
        })
        .then(function(obj){
          return getJson(YFLIX_AJAX + '/links/list?eid=' + obj.eid + '&_=' + obj.encEid);
        })
        .then(function(serversResp){
          return parseHtmlRemote(serversResp.result);
        })
        .then(function(servers){
          var allStreams = [];
          var serverPromises = [];
          Object.keys(servers || {}).forEach(function(serverType){
            Object.keys(servers[serverType] || {}).forEach(function(serverKey){
              var lid = servers[serverType][serverKey].lid;
              var p = encryptRemote(lid)
                .then(function(encLid){
                  return getJson(YFLIX_AJAX + '/links/view?id=' + lid + '&_=' + encLid);
                })
                .then(function(embedResp){
                  return decryptRemote(embedResp.result);
                })
                .then(function(decrypted){
                  if (decrypted && typeof decrypted === 'object' && decrypted.url && decrypted.url.indexOf('rapidshare.cc') !== -1) {
                    return decryptRapidMedia(decrypted.url).then(function(rapidData){
                      var formatted = (function formatRapid(rapidResult){
                        var streams = [];
                        if (rapidResult && typeof rapidResult === 'object') {
                          (rapidResult.sources || []).forEach(function(src){ if (src && src.file) streams.push({ url: src.file, quality: src.file.indexOf('.m3u8') !== -1 ? 'Adaptive' : 'unknown', type: src.file.indexOf('.m3u8') !== -1 ? 'hls' : 'file' }); });
                        }
                        return { streams: streams };
                      })(rapidData);
                      return enhanceStreamsWithQuality(formatted.streams).then(function(enh){
                        enh.forEach(function(s){ s.serverType = serverType; s.serverKey = serverKey; s.serverLid = lid; allStreams.push(s); });
                        return null;
                      });
                    });
                  }
                  return null;
                })
                .catch(function(){ return null; });
              serverPromises.push(p);
            });
          });
          return Promise.all(serverPromises).then(function(){
            var seen = {};
            var dedup = [];
            (allStreams || []).forEach(function(s){
              if (!s || !s.url) return;
              if (seen[s.url]) return;
              seen[s.url] = true; dedup.push(s);
            });
            var nuvio = dedup.map(function(stream){
              return {
                name: 'YFlix ' + (stream.serverType || 'Server') + ' - ' + (stream.quality || 'Unknown'),
                title: (stream.title || ''),
                url: stream.url,
                quality: stream.quality || 'Unknown',
                size: 'Unknown',
                headers: HEADERS,
                provider: 'yflix'
              };
            });
            return nuvio;
          });
        });
    }

    function getContentInfoFromYflixUrl(yflixUrl) {
      return getText(yflixUrl).then(function(html){
        var contentId = null;
        var idMatch = html.match(/<div[^>]*class="[^"]*rating[^"]*"[^>]*data-id="([^"]*)"[^>]*>/);
        if (idMatch) contentId = idMatch[1];
        else {
          var alt = html.match(/data-id="([^"]*)"[^>]*id="movie-rating/);
          if (alt) contentId = alt[1];
        }
        var titleMatch = html.match(/<h1[^>]*itemprop="name"[^>]*class="title"[^>]*>([^<]+)<\/h1>/);
        var title = titleMatch ? titleMatch[1].trim() : 'Unknown Title';
        var yearMatch = html.match(/<div[^>]*class="[^"]*metadata[^"]*set[^"]*"[^>]*>[\s\S]*?<span[^>]*>(\d{4})<\/span>/);
        var year = yearMatch ? parseInt(yearMatch[1]) : null;
        return { contentId: contentId, title: title, year: year };
      });
    }

    function handleTvShow(yflixUrl, contentId, title, year, seasonNum, episodeNum, rid) {
      var selectedSeason = seasonNum || 1;
      var selectedEpisode = episodeNum || 1;
      var episodeUrl = yflixUrl + '#ep=' + selectedSeason + ',' + selectedEpisode;
      return getText(episodeUrl).then(function(html){
        var epMatch = html.match(/data-episode="([^"]*)"/) || html.match(/episode["\s]*:[\s]*["']([^"']+)["']/);
        if (epMatch) return epMatch[1];
        return contentId;
      }).then(function(episodeId){
        return runStreamFetch(contentId, episodeId, title, year, 'tv', selectedSeason, selectedEpisode, rid);
      });
    }

    function providerYFlix(input) {
      return new Promise(function (resolve) {
        var rid = createRequestId();
        var providedTitle = input.title || null;
        var providedYear = input.year || null;
        var searchQueries = [];
        if (providedTitle) {
          if (providedYear) searchQueries.push(providedTitle + ' ' + providedYear);
          searchQueries.push(providedTitle);
        } else {
          searchQueries.push(String(input.tmdbId || ''));
        }

        var qIndex = 0;
        function tryNext() {
          if (qIndex >= searchQueries.length) { resolve([]); return; }
          var q = searchQueries[qIndex++];
          var searchUrl = (YFLIX_AJAX.replace('/ajax','')) + '/browser?keyword=' + encodeURIComponent(q);
          getText(searchUrl).then(function(html){
            var results = [];
            var infoRegex = /<div[^>]*class="[^"]*info[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]*watch\/[^"]*)"[^>]*class="[^"]*title[^"]*"[^>]*>([^<]*)<\/a>[\s\S]*?<div[^>]*class="[^"]*metadata[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
            var match;
            while ((match = infoRegex.exec(html)) !== null) {
              var url = match[1], title = match[2], metadata = match[3];
              var cleanUrl = url && (url.indexOf('http') === 0 ? url : (YFLIX_AJAX.replace('/ajax','') + url));
              var typeMatch = (metadata.match(/<span[^>]*>([^<]*)<\/span>/g) || []).map(function(s){ return s.replace(/<\/?span[^>]*>/g,''); });
              results.push({ url: cleanUrl, title: (title||'').trim(), metadata: typeMatch, year: (typeMatch[1] && /^\d{4}$/.test(typeMatch[1])? parseInt(typeMatch[1]) : null) });
            }
            if (!results || results.length === 0) return tryNext();
            var sel = results[0];
            return getContentInfoFromYflixUrl(sel.url).then(function(info){
              if (input.mediaType === 'tv') return handleTvShow(sel.url, info.contentId, info.title, info.year, input.seasonNum, input.episodeNum, rid);
              return runStreamFetch(info.contentId, null, info.title, info.year, input.mediaType, input.seasonNum, input.episodeNum, rid);
            });
          }).then(function(out){
            if (out && out.length) resolve(out); else tryNext();
          }).catch(function(err){
            console.warn('[YFlix] search error', err && err.message);
            tryNext();
          });
        }
        tryNext();
      });
    }

    for (var i=0;i<PROVIDERS.length;i++){
      if (PROVIDERS[i].id === 'yflix') { PROVIDERS[i].fn = providerYFlix; break; }
    }
  })();

  // -----------------------
  // Master getStreams (TMDB integrated)
  // -----------------------
  function parseTmdbIdForConfig(raw) {
    if (!raw) return { tmdbId: raw, configUrl: null };
    var parts = raw.split('::config=');
    if (parts.length === 2) return { tmdbId: parts[0], configUrl: parts[1] };
    return { tmdbId: raw, configUrl: null };
  }

  function master_getStreams(rawTmdbId, mediaType, seasonNum, episodeNum) {
    return new Promise(function (resolve) {
      var parsed = parseTmdbIdForConfig(rawTmdbId || '');
      var tmdbId = parsed.tmdbId;
      var remoteUrl = parsed.configUrl || (typeof global !== 'undefined' && global.MULTIPROVIDER_CONFIG_URL) || DEFAULT_REMOTE_CONFIG_URL;

      // Fetch TMDB details (improves search matching)
      var tmdbPromise = fetchTMDBDetails(tmdbId, mediaType);

      loadRemoteConfig(remoteUrl, DEFAULT_FETCH_TIMEOUT).then(function (cfg) {
        var registry = applyConfigOverrides(PROVIDERS, cfg);
        tmdbPromise.then(function (tmdbInfo) {
          var input = { tmdbId: tmdbId, mediaType: mediaType, seasonNum: seasonNum, episodeNum: episodeNum };
          if (tmdbInfo) { input.title = tmdbInfo.title; input.year = tmdbInfo.year; input.original_title = tmdbInfo.original_title; input.language = tmdbInfo.language; }

          var chosen = registry.filter(function (p) { return p.enabled && p.supports && p.supports.indexOf(mediaType) !== -1; });
          if (chosen.length === 0) return resolve([]);

          var concurrency = 3;
          var index = 0, running = 0;
          var results = new Array(chosen.length);
          function next() {
            if (index >= chosen.length && running === 0) {
              var flat = [].concat.apply([], results.filter(function(r){ return Array.isArray(r); }));
              flat.sort(function(a,b){
                var qa = parseInt((a.quality||'').toString().replace('p',''))||0;
                var qb = parseInt((b.quality||'').toString().replace('p',''))||0;
                return qb - qa;
              });
              resolve(flat);
              return;
            }
            while (running < concurrency && index < chosen.length) {
              (function(iLocal){
                var prov = chosen[iLocal];
                running++;
                index++;
                try {
                  prov.fn(input).then(function (res) {
                    results[iLocal] = res || [];
                  }).catch(function (e) {
                    console.warn('[multiprovider] provider error', prov.id, e && e.message);
                    results[iLocal] = [];
                  }).finally(function(){
                    running--; next();
                  });
                } catch (err) {
                  console.warn('[multiprovider] provider sync error', prov.id, err && err.message);
                  results[iLocal] = [];
                  running--; next();
                }
              })(index);
            }
          }
          next();
        }).catch(function(){ resolve([]); });
      }).catch(function(err){
        console.warn('[multiprovider] config load failed', err && err.message);
        resolve([]); // fail safe
      });
    });
  }

  // Expose
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams: master_getStreams };
  } else {
    global.getStreams = master_getStreams;
  }

})(); // end file
