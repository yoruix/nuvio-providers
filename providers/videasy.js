// VideoEasy Scraper for Nuvio Local Scrapers
// React Native compatible version - Promise-based (no async/await)
// Extracts streaming links using TMDB ID for all VideoEasy servers

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Connection': 'keep-alive'
};

// VideoEasy API configuration
const API = 'https://enc-dec.app/api';
const TMDB_API_KEY = 'd131017ccc6e5462a81c9304d21476de';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// VideoEasy server configurations
const SERVERS = {
  'Neon': {
    url: 'https://api.videasy.net/myflixerzupcloud/sources-with-title',
    language: 'Original'
  },
  'Sage': {
    url: 'https://api.videasy.net/1movies/sources-with-title',
    language: 'Original'
  },
  'Cypher': {
    url: 'https://api.videasy.net/moviebox/sources-with-title',
    language: 'Original'
  },
  'Yoru': {
    url: 'https://api.videasy.net/cdn/sources-with-title',
    language: 'Original',
    moviesOnly: true
  },
  'Reyna': {
    url: 'https://api.videasy.net/primewire/sources-with-title',
    language: 'Original'
  },
  'Omen': {
    url: 'https://api.videasy.net/onionplay/sources-with-title',
    language: 'Original'
  },
  'Breach': {
    url: 'https://api.videasy.net/m4uhd/sources-with-title',
    language: 'Original'
  },
  'Vyse': {
    url: 'https://api.videasy.net/hdmovie/sources-with-title',
    language: 'Original'
  },
  'Ghost': {
    url: 'https://api.videasy.net/primesrcme/sources-with-title',
    language: 'Original'
  },
  'Killjoy': {
    url: 'https://api.videasy.net/meine/sources-with-title',
    language: 'German',
    params: { language: 'german' }
  },
  'Harbor': {
    url: 'https://api.videasy.net/meine/sources-with-title',
    language: 'Italian',
    params: { language: 'italian' }
  },
  'Chamber': {
    url: 'https://api.videasy.net/meine/sources-with-title',
    language: 'French',
    params: { language: 'french' },
    moviesOnly: true
  },
  'Fade': {
    url: 'https://api.videasy.net/hdmovie/sources-with-title',
    language: 'Hindi'
  },
  'Gekko': {
    url: 'https://api.videasy.net/cuevana-latino/sources-with-title',
    language: 'Latin'
  },
  'Kayo': {
    url: 'https://api.videasy.net/cuevana-spanish/sources-with-title',
    language: 'Spanish'
  },
  'Raze': {
    url: 'https://api.videasy.net/superflix/sources-with-title',
    language: 'Portuguese'
  },
  'Phoenix': {
    url: 'https://api.videasy.net/overflix/sources-with-title',
    language: 'Portuguese'
  },
  'Astra': {
    url: 'https://api.videasy.net/visioncine/sources-with-title',
    language: 'Portuguese'
  }
};

// HTTP request helper using fetch (React Native compatible)
function requestRaw(method, urlString, options) {
  return fetch(urlString, {
    method: method,
    headers: (options && options.headers) || {},
    body: (options && options.body) || undefined
  }).then(response => {
    return response.text().then(body => {
      if (response.ok) {
        return { 
          status: response.status, 
          headers: response.headers, 
          body: body 
        };
      } else {
        throw new Error(`HTTP ${response.status}: ${body}`);
      }
    });
  });
}

// Get text from URL
function getText(url) {
  return requestRaw('GET', url, { headers: HEADERS }).then((res) => res.body);
}

// Get JSON from URL
function getJson(url) {
  return requestRaw('GET', url, { headers: HEADERS }).then((res) => {
    try {
      return JSON.parse(res.body);
    } catch (e) {
      throw new Error(`Invalid JSON from GET ${url}: ${e.message}`);
    }
  });
}

// Post JSON to URL
function postJson(url, jsonBody, extraHeaders) {
  const body = JSON.stringify(jsonBody);
  const headers = Object.assign(
    {},
    HEADERS,
    { 'Content-Type': 'application/json' },
    extraHeaders || {}
  );
  return requestRaw('POST', url, { headers, body }).then((res) => {
    try {
      return JSON.parse(res.body);
    } catch (e) {
      throw new Error(`Invalid JSON from POST ${url}: ${e.message}`);
    }
  });
}

// Decrypt VideoEasy data
function decryptVideoEasy(encryptedText, tmdbId) {
  return postJson(`${API}/dec-videasy`, { text: encryptedText, id: tmdbId })
    .then((response) => response.result);
}

// Fetch movie details from TMDB
function fetchMovieDetails(tmdbId) {
  const url = `${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
  return getJson(url)
    .then((data) => ({
      id: data.id,
      title: data.title,
      year: data.release_date ? data.release_date.split('-')[0] : '',
      imdbId: data.external_ids && data.external_ids.imdb_id ? data.external_ids.imdb_id : '',
      mediaType: 'movie',
      overview: data.overview,
      poster: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : '',
      backdrop: data.backdrop_path ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}` : ''
    }));
}

// Fetch TV show details from TMDB
function fetchTvDetails(tmdbId) {
  const url = `${TMDB_BASE_URL}/tv/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
  return getJson(url)
    .then((data) => ({
      id: data.id,
      title: data.name,
      year: data.first_air_date ? data.first_air_date.split('-')[0] : '',
      imdbId: data.external_ids && data.external_ids.imdb_id ? data.external_ids.imdb_id : '',
      mediaType: 'tv',
      overview: data.overview,
      poster: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : '',
      backdrop: data.backdrop_path ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}` : '',
      numberOfSeasons: data.number_of_seasons,
      numberOfEpisodes: data.number_of_episodes
    }));
}

// Auto-detect media type and fetch details
function fetchMediaDetails(tmdbId, mediaType = null) {
  if (mediaType === 'movie') {
    return fetchMovieDetails(tmdbId);
  } else if (mediaType === 'tv') {
    return fetchTvDetails(tmdbId);
  } else {
    // Try movie first, then TV if movie fails
    return fetchMovieDetails(tmdbId)
      .catch(() => fetchTvDetails(tmdbId));
  }
}

// Build VideoEasy API URL
function buildVideoEasyUrl(serverConfig, mediaType, title, year, tmdbId, imdbId, seasonId = null, episodeId = null) {
  const params = {
    title: title,
    mediaType: mediaType,
    year: year,
    tmdbId: tmdbId,
    imdbId: imdbId
  };

  // Add server-specific parameters
  if (serverConfig.params) {
    Object.keys(serverConfig.params).forEach(key => {
      params[key] = serverConfig.params[key];
    });
  }

  // Add TV show specific parameters
  if (mediaType === 'tv' && seasonId && episodeId) {
    params.seasonId = seasonId;
    params.episodeId = episodeId;
  }

  // Build query string manually for React Native compatibility
  const queryString = Object.keys(params)
    .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(params[key]))
    .join('&');

  return `${serverConfig.url}?${queryString}`;
}

// Normalize language codes/names to readable format
function normalizeLanguageName(language) {
  if (!language || typeof language !== 'string') {
    return '';
  }
  
  const languageMap = {
    'en': 'English',
    'eng': 'English',
    'english': 'English',
    'hi': 'Hindi',
    'hin': 'Hindi',
    'hindi': 'Hindi',
    'de': 'German',
    'ger': 'German',
    'german': 'German',
    'it': 'Italian',
    'ita': 'Italian',
    'italian': 'Italian',
    'fr': 'French',
    'fre': 'French',
    'french': 'French',
    'es': 'Spanish',
    'spa': 'Spanish',
    'spanish': 'Spanish',
    'pt': 'Portuguese',
    'por': 'Portuguese',
    'portuguese': 'Portuguese',
    'ar': 'Arabic',
    'ara': 'Arabic',
    'arabic': 'Arabic',
    'zh': 'Chinese',
    'chi': 'Chinese',
    'chinese': 'Chinese',
    'ja': 'Japanese',
    'jpn': 'Japanese',
    'japanese': 'Japanese',
    'ko': 'Korean',
    'kor': 'Korean',
    'korean': 'Korean',
    'bn': 'Bengali',
    'ben': 'Bengali',
    'bengali': 'Bengali',
    'ta': 'Tamil',
    'tam': 'Tamil',
    'tamil': 'Tamil',
    'te': 'Telugu',
    'tel': 'Telugu',
    'telugu': 'Telugu',
    'ml': 'Malayalam',
    'mal': 'Malayalam',
    'malayalam': 'Malayalam',
    'kn': 'Kannada',
    'kan': 'Kannada',
    'kannada': 'Kannada',
    'mr': 'Marathi',
    'mar': 'Marathi',
    'marathi': 'Marathi',
    'gu': 'Gujarati',
    'guj': 'Gujarati',
    'gujarati': 'Gujarati',
    'pa': 'Punjabi',
    'pan': 'Punjabi',
    'punjabi': 'Punjabi',
    'ur': 'Urdu',
    'urd': 'Urdu',
    'urdu': 'Urdu',
    'fa': 'Persian',
    'per': 'Persian',
    'persian': 'Persian',
    'tr': 'Turkish',
    'tur': 'Turkish',
    'turkish': 'Turkish',
    'vi': 'Vietnamese',
    'vie': 'Vietnamese',
    'vietnamese': 'Vietnamese',
    'th': 'Thai',
    'tha': 'Thai',
    'thai': 'Thai',
    'id': 'Indonesian',
    'ind': 'Indonesian',
    'indonesian': 'Indonesian'
  };
  
  const normalized = language.toLowerCase().trim();
  return languageMap[normalized] || language; // Return mapped name or original if not found
}

// Extract quality from URL
function extractQualityFromUrl(url) {
  const qualityPatterns = [
    /(\d{3,4})p/i,  // 1080p, 720p, etc.
    /(\d{3,4})k/i,  // 1080k, 720k, etc.
    /quality[_-]?(\d{3,4})/i,  // quality-1080, quality_720, etc.
    /res[_-]?(\d{3,4})/i,  // res-1080, res_720, etc.
    /(\d{3,4})x\d{3,4}/i,  // 1920x1080, 1280x720, etc.
    /\/MTA4MA==\//i,  // Base64 encoded "1080"
    /\/NzIw\//i,  // Base64 encoded "720"
    /\/MzYw\//i,  // Base64 encoded "360"
    /\/NDgw\//i,  // Base64 encoded "480"
    /\/MTkyMA==\//i,  // Base64 encoded "1920"
    /\/MTI4MA==\//i,  // Base64 encoded "1280"
  ];

  for (const pattern of qualityPatterns) {
    const match = url.match(pattern);
    if (match) {
      if (pattern.source.includes('MTA4MA==')) return '1080p';
      if (pattern.source.includes('NzIw')) return '720p';
      if (pattern.source.includes('MzYw')) return '360p';
      if (pattern.source.includes('NDgw')) return '480p';
      if (pattern.source.includes('MTkyMA==')) return '1080p';
      if (pattern.source.includes('MTI4MA==')) return '720p';

      const qualityNum = parseInt(match[1]);
      if (qualityNum >= 240 && qualityNum <= 4320) {
        return `${qualityNum}p`;
      }
    }
  }

  // Additional quality detection based on URL patterns
  if (url.includes('1080') || url.includes('1920')) return '1080p';
  if (url.includes('720') || url.includes('1280')) return '720p';
  if (url.includes('480') || url.includes('854')) return '480p';
  if (url.includes('360') || url.includes('640')) return '360p';
  if (url.includes('240') || url.includes('426')) return '240p';

  return 'unknown';
}

// Parse HLS playlist to extract quality information
function parseHlsPlaylist(url) {
  return getText(url)
    .then((content) => {
      const resolutions = [];
      const bandwidths = [];

      // Extract all RESOLUTION values
      const resolutionMatches = content.match(/RESOLUTION=(\d+x\d+)/g) || [];
      resolutionMatches.forEach(res => {
        const height = parseInt(res.split('x')[1].replace('RESOLUTION=', ''));
        resolutions.push(height);
      });

      // Extract all BANDWIDTH values
      const bandwidthMatches = content.match(/BANDWIDTH=(\d+)/g) || [];
      bandwidthMatches.forEach(bw => {
        const bandwidth = parseInt(bw.replace('BANDWIDTH=', ''));
        bandwidths.push(bandwidth);
      });

      // If we found resolutions, use the highest one
      if (resolutions.length > 0) {
        const maxResolution = Math.max(...resolutions);
        if (maxResolution >= 1080) return '1080p';
        else if (maxResolution >= 720) return '720p';
        else if (maxResolution >= 480) return '480p';
        else if (maxResolution >= 360) return '360p';
        else return '240p';
      }

      // If no resolutions but we have bandwidth, estimate quality
      if (bandwidths.length > 0) {
        const maxBandwidth = Math.max(...bandwidths);
        if (maxBandwidth >= 5000000) return '1080p';
        else if (maxBandwidth >= 3000000) return '720p';
        else if (maxBandwidth >= 1500000) return '480p';
        else if (maxBandwidth >= 800000) return '360p';
        else return '240p';
      }

      // Check if it's a master playlist
      if (content.includes('#EXT-X-STREAM-INF')) {
        return 'adaptive';
      }

      return 'unknown';
    })
    .catch(() => 'unknown');
}

// Format streams for Nuvio
function formatStreamsForNuvio(mediaData, serverName, serverConfig, mediaDetails) {
  if (!mediaData || typeof mediaData !== 'object' || !mediaData.sources) {
    return [];
  }

  const streams = [];

  // Process sources
  mediaData.sources.forEach((source) => {
    if (source.url) {
      let quality = source.quality || extractQualityFromUrl(source.url);
      let detectedLanguage = '';

      // If quality is still unknown and it's an HLS stream, try to parse it
      if (quality === 'unknown' && source.url.includes('.m3u8')) {
        parseHlsPlaylist(source.url).then((parsedQuality) => {
          quality = parsedQuality === 'adaptive' ? 'Adaptive' : parsedQuality;
        });
      }

      // Clean up quality values - remove provider names and invalid quality strings
      if (quality && typeof quality === 'string') {
        // Check if it's a provider name instead of quality
        const providerNames = ['streamwish', 'voesx', 'filemoon', 'fileions', 'filelions', 'streamtape', 'streamlare', 'doodstream', 'upstream', 'mixdrop'];
        const isProviderName = providerNames.some(provider =>
          quality.toLowerCase().includes(provider.toLowerCase())
        );

        if (isProviderName) {
          // If it's a provider name, try to extract quality from URL or set to unknown
          quality = extractQualityFromUrl(source.url);
          if (quality === 'unknown') {
            // Default for HLS streams with unknown quality
            quality = 'Adaptive';
          }
        }

        // Clean up other invalid quality strings
        if (quality.includes('GB') || quality.includes('MB') || quality.includes('|')) {
          quality = extractQualityFromUrl(source.url);
          if (quality === 'unknown') {
            quality = 'Adaptive';
          }
        }

        // Check if quality field contains language information (common in Vyse server)
        const languageNames = ['english', 'hindi', 'german', 'italian', 'spanish', 'portuguese', 'french', 'arabic', 'chinese', 'japanese', 'korean', 'bengali', 'tamil', 'telugu', 'malayalam', 'kannada', 'marathi', 'gujarati', 'punjabi', 'urdu', 'persian', 'turkish', 'vietnamese', 'thai', 'indonesian'];
        const isLanguageName = languageNames.some(lang =>
          quality.toLowerCase().includes(lang.toLowerCase())
        );

        if (isLanguageName) {
          // Extract language from quality field
          detectedLanguage = normalizeLanguageName(quality);
          // Try to extract actual quality from URL
          quality = extractQualityFromUrl(source.url);
          if (quality === 'unknown') {
            quality = 'Adaptive';
          }
        }

        // Handle generic quality terms
        if (quality.toLowerCase() === 'hd' || quality.toLowerCase() === 'high') {
          // Try to extract specific quality from URL
          const urlQuality = extractQualityFromUrl(source.url);
          if (urlQuality !== 'unknown') {
            quality = urlQuality;
          } else {
            quality = '720p'; // Default HD to 720p
          }
        }

        if (quality.toLowerCase() === 'sd' || quality.toLowerCase() === 'standard') {
          quality = '480p'; // Default SD to 480p
        }

        if (quality.toLowerCase() === 'auto') {
          quality = 'Auto';
        }
        if (quality.toLowerCase() === 'adaptive') {
          quality = 'Adaptive';
        }
      }

      // Determine stream type and create appropriate headers
      let streamType = 'unknown';
      let headers = Object.assign({}, HEADERS, {
        'Referer': 'https://api.videasy.net/',
        'Origin': 'https://player.videasy.net'
      });

      if (source.url.includes('.m3u8')) {
        streamType = 'hls';
        headers = Object.assign(headers, {
          'Accept': 'application/vnd.apple.mpegurl,application/x-mpegURL,*/*'
        });
      } else if (source.url.includes('.mp4')) {
        streamType = 'mp4';
        headers = Object.assign(headers, {
          'Accept': 'video/mp4,*/*',
          'Range': 'bytes=0-'
        });
      } else if (source.url.includes('.mkv')) {
        streamType = 'mkv';
        headers = Object.assign(headers, {
          'Accept': 'video/x-matroska,*/*',
          'Range': 'bytes=0-'
        });
      }

      const title = `${mediaDetails.title} (${mediaDetails.year})`;

      // Extract and normalize language information if available
      let languageInfo = '';
      if (source.language) {
        const normalizedLanguage = normalizeLanguageName(source.language);
        if (normalizedLanguage) {
          languageInfo = ` [${normalizedLanguage}]`;
        }
      } else if (detectedLanguage) {
        // Use detected language from quality field (Vyse server case)
        languageInfo = ` [${detectedLanguage}]`;
      }

      streams.push({
        name: `VIDEASY ${serverName} (${serverConfig.language})${languageInfo} - ${quality}`,
        title: title,
        url: source.url,
        quality: quality,
        size: 'Unknown',
        headers: headers,
        provider: 'videasy'
      });
    }
  });

  return streams;
}

// Fetch streams from a single server
function fetchFromServer(serverName, serverConfig, mediaType, title, year, tmdbId, imdbId, seasonId, episodeId) {
  console.log(`[VideoEasy] Fetching from ${serverName} (${serverConfig.language})...`);

  // Skip movie-only servers for TV shows
  if (mediaType === 'tv' && serverConfig.moviesOnly) {
    console.log(`[VideoEasy] Skipping ${serverName} - movies only`);
    return Promise.resolve([]);
  }

  const url = buildVideoEasyUrl(serverConfig, mediaType, title, year, tmdbId, imdbId, seasonId, episodeId);

  return getText(url)
    .then((encryptedData) => {
      if (!encryptedData || encryptedData.trim() === '') {
        throw new Error('No encrypted data received');
      }
      return decryptVideoEasy(encryptedData, tmdbId);
    })
    .then((decryptedData) => {
      const streams = formatStreamsForNuvio(decryptedData, serverName, serverConfig, { title, year });
      console.log(`[VideoEasy] ✅ Found ${streams.length} stream(s) from ${serverName}`);
      return streams;
    })
    .catch((error) => {
      console.log(`[VideoEasy] ❌ Error from ${serverName}: ${error.message}`);
      return [];
    });
}

// Main function to extract streaming links for Nuvio
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  console.log(`[VideoEasy] Starting extraction for TMDB ID: ${tmdbId}, Type: ${mediaType}`);

  return new Promise((resolve, reject) => {
    // First, fetch media details from TMDB
    fetchMediaDetails(tmdbId, mediaType)
      .then((mediaDetails) => {
        console.log(`[VideoEasy] Found: ${mediaDetails.title} (${mediaDetails.year})`);

        const serverPromises = Object.keys(SERVERS).map(serverName => {
          const serverConfig = SERVERS[serverName];
          // Double-encode title as per Phisher's implementation
          const doubleEncodedTitle = encodeURIComponent(encodeURIComponent(mediaDetails.title).replace(/\+/g, "%20"));
          return fetchFromServer(
            serverName,
            serverConfig,
            mediaDetails.mediaType,
            doubleEncodedTitle,
            mediaDetails.year,
            tmdbId,
            mediaDetails.imdbId,
            seasonNum,
            episodeNum
          );
        });

        return Promise.all(serverPromises)
          .then((results) => {
            // Combine all streams from all servers
            const allStreams = [];
            results.forEach(streams => {
              allStreams.push(...streams);
            });

            // Remove duplicate streams by URL
            const uniqueStreams = [];
            const seenUrls = new Set();
            allStreams.forEach(stream => {
              if (!seenUrls.has(stream.url)) {
                seenUrls.add(stream.url);
                uniqueStreams.push(stream);
              }
            });

            // Sort streams by quality (highest first)
            const getQualityValue = (quality) => {
              const q = quality.toLowerCase().replace(/p$/, ''); // Remove trailing 'p'

              // Handle specific quality names
              if (q === '4k' || q === '2160') return 2160;
              if (q === '1440') return 1440;
              if (q === '1080') return 1080;
              if (q === '720') return 720;
              if (q === '480') return 480;
              if (q === '360') return 360;
              if (q === '240') return 240;

              // Handle adaptive/auto streams (put them first)
              if (q === 'Adaptive' || q === 'Auto') return 4000;

              // Handle unknown quality (put at end)
              if (q === 'unknown') return 0;

              // Try to parse as number (for custom resolutions like 840p)
              const numQuality = parseInt(q);
              if (!isNaN(numQuality) && numQuality > 0) {
                return numQuality;
              }

              // Default for unrecognized qualities
              return 1;
            };

            uniqueStreams.sort((a, b) => {
              const qualityA = getQualityValue(a.quality);
              const qualityB = getQualityValue(b.quality);
              return qualityB - qualityA;
            });

            console.log(`[VideoEasy] Total streams found: ${uniqueStreams.length}`);
            resolve(uniqueStreams);
          });
      })
      .catch((error) => {
        console.error(`[VideoEasy] Error fetching media details: ${error.message}`);
        resolve([]); // Return empty array on error for Nuvio compatibility
      });
  });
}

// Export for React Native compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
