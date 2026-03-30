import { BASE_URL, TOKEN, HEADERS, SEARCH_HEADERS } from './constants.js';
import { generateSignedUrl, matchQuality, getTMDBDetails, findBestMatch } from './utils.js';

/**
 * MovieBlast Provider for Nuvio
 */
async function getStreams(tmdbId, mediaType = "movie", season = null, episode = null) {
    console.log(`[MovieBlast] Fetching streams for TMDB ID: ${tmdbId}, Type: ${mediaType}`);

    try {
        // 1. Get Title from TMDB
        const mediaInfo = await getTMDBDetails(tmdbId, mediaType);
        console.log(`[MovieBlast] Searching for: "${mediaInfo.title}" (${mediaInfo.year})`);

        // 2. Search for the content
        const safeQuery = encodeURIComponent(mediaInfo.title);
        const searchUrl = `${BASE_URL}/api/search/${safeQuery}/${TOKEN}`;
        const searchRes = await fetch(searchUrl, { headers: SEARCH_HEADERS });
        
        if (!searchRes.ok) {
            console.error(`[MovieBlast] Search failed with status: ${searchRes.status}`);
            return [];
        }

        const searchData = await searchRes.json();
        const searchResults = searchData.search || [];
        
        // Find best match based on title similarity and year
        const match = findBestMatch(mediaInfo, searchResults);
        
        if (!match) {
            console.log("[MovieBlast] No confident matches found in MovieBlast.");
            return [];
        }

        const internalId = match.id;
        const isSeries = match.type.toLowerCase().includes("serie") || mediaType === "tv";
        console.log(`[MovieBlast] Match Found: "${match.name}" (ID: ${internalId})`);
        
        // 3. Load Details
        const detailPath = isSeries ? "series/show" : "media/detail";
        const detailUrl = `${BASE_URL}/api/${detailPath}/${internalId}/${TOKEN}`;
        
        const detailRes = await fetch(detailUrl, { headers: HEADERS });
        if (!detailRes.ok) {
            console.error(`[MovieBlast] Detail fetch failed: ${detailRes.status}`);
            return [];
        }

        const detailData = await detailRes.json();
        let targetVideos = [];

        if (isSeries) {
            // Find correct episode
            const seasons = detailData.seasons || [];
            const targetSeason = seasons.find(s => s.season_number == season);
            if (targetSeason) {
                const targetEpisode = (targetSeason.episodes || []).find(e => e.episode_number == episode);
                if (targetEpisode) {
                    targetVideos = targetEpisode.videos || [];
                } else {
                    console.log(`[MovieBlast] Episode ${episode} not found in Season ${season}.`);
                }
            } else {
                console.log(`[MovieBlast] Season ${season} not found.`);
            }
        } else {
            targetVideos = detailData.videos || [];
        }

        if (targetVideos.length === 0) {
            console.log("[MovieBlast] No video links found in details.");
            return [];
        }

        // 4. Extract Streams
        const streams = targetVideos.map(vid => {
            const rawUrl = vid.link;
            if (!rawUrl) return null;
            
            const httpsUrl = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
            const signedUrl = generateSignedUrl(httpsUrl);
            
            return {
                name: "MovieBlast",
                title: `MovieBlast - ${vid.server} (${vid.lang || "EN"})`,
                url: signedUrl,
                quality: matchQuality(vid.server),
                headers: {
                    "User-Agent": "MovieBlast",
                    "Referer": "MovieBlast",
                    "x-request-x": "com.movieblast"
                },
                provider: "movieblast"
            };
        }).filter(s => s !== null);

        console.log(`[MovieBlast] Successfully found ${streams.length} streams.`);
        return streams;

    } catch (error) {
        console.error(`[MovieBlast] Error: ${error.message}`);
        return [];
    }
}

module.exports = { getStreams };
