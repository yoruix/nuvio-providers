/**
 * movieblast - Built from src/movieblast/
 * Generated: 2026-03-30T05:44:57.393Z
 */
var __create = Object.create;
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/movieblast/constants.js
var BASE_URL = "https://app.cloud-mb.xyz";
var TOKEN = "jdvhhjv255vghhghdhvfch2565656jhdcghfdf";
var APP_ID = "com.movieblast";
var HEADERS = {
  "user-agent": "okhttp/5.0.0-alpha.6",
  "x-request-x": APP_ID
};
var SEARCH_HEADERS = __spreadProps(__spreadValues({}, HEADERS), {
  "hash256": "86dc03244adddb3cbedbf0ae36074a736ee293a64774b18e82a6244eafd0df30",
  "packagename": APP_ID
});
var SIGN_SECRET = "GJ8reydarI7Jqat9rvbAJKNQ9gY4DoEQF2H5nfuI1gi";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var TMDB_BASE_URL = "https://api.themoviedb.org/3";

// src/movieblast/utils.js
var import_crypto_js = __toESM(require("crypto-js"));
function generateSignedUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    const path = url.pathname;
    const timestamp = Math.floor(Date.now() / 1e3).toString();
    const hash = import_crypto_js.default.HmacSHA256(path + timestamp, SIGN_SECRET);
    const signature = import_crypto_js.default.enc.Base64.stringify(hash);
    const encodedSignature = encodeURIComponent(signature);
    return `${urlStr}?verify=${timestamp}-${encodedSignature}`;
  } catch (e) {
    console.error("[MovieBlast] Error generating signed URL:", e.message);
    return urlStr;
  }
}
function matchQuality(s) {
  if (!s)
    return "Unknown";
  const v = s.toLowerCase();
  if (v.includes("2160") || v.includes("4k"))
    return "4K";
  if (v.includes("1440"))
    return "2K";
  if (v.includes("1080"))
    return "1080p";
  if (v.includes("720"))
    return "720p";
  if (v.includes("480"))
    return "480p";
  if (v.includes("360"))
    return "360p";
  return "Unknown";
}
function normalizeTitle(title) {
  if (!title)
    return "";
  return title.toLowerCase().replace(/\b(the|a|an)\b/g, "").replace(/[:\-_]/g, " ").replace(/\s+/g, " ").replace(/[^\w\s]/g, "").trim();
}
function getTMDBDetails(tmdbId, mediaType) {
  return __async(this, null, function* () {
    const endpoint = mediaType === "tv" ? "tv" : "movie";
    const url = `${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    const response = yield fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" }
    });
    if (!response.ok)
      throw new Error(`TMDB API error: ${response.status}`);
    const data = yield response.json();
    const title = mediaType === "tv" ? data.name : data.title;
    const releaseDate = mediaType === "tv" ? data.first_air_date : data.release_date;
    const year = releaseDate ? parseInt(releaseDate.split("-")[0]) : null;
    return { title, year };
  });
}
function calculateTitleSimilarity(title1, title2) {
  const norm1 = normalizeTitle(title1);
  const norm2 = normalizeTitle(title2);
  if (norm1 === norm2)
    return 1;
  const words1 = norm1.split(/\s+/).filter((w) => w.length > 0);
  const words2 = norm2.split(/\s+/).filter((w) => w.length > 0);
  if (words1.length === 0 || words2.length === 0)
    return 0;
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  const intersection = words1.filter((w) => set2.has(w));
  const union = /* @__PURE__ */ new Set([...words1, ...words2]);
  return intersection.length / union.size;
}
function findBestMatch(mediaInfo, searchResults) {
  if (!searchResults || searchResults.length === 0)
    return null;
  let bestMatch = null;
  let bestScore = 0;
  for (const result of searchResults) {
    let score = calculateTitleSimilarity(mediaInfo.title, result.name);
    if (mediaInfo.year && result.release_date) {
      const resultYear = parseInt(result.release_date.split("-")[0]);
      if (mediaInfo.year === resultYear)
        score += 0.2;
    }
    if (score > bestScore && score > 0.4) {
      bestScore = score;
      bestMatch = result;
    }
  }
  return bestMatch;
}

// src/movieblast/index.js
function getStreams(tmdbId, mediaType = "movie", season = null, episode = null) {
  return __async(this, null, function* () {
    console.log(`[MovieBlast] Fetching streams for TMDB ID: ${tmdbId}, Type: ${mediaType}`);
    try {
      const mediaInfo = yield getTMDBDetails(tmdbId, mediaType);
      console.log(`[MovieBlast] Searching for: "${mediaInfo.title}" (${mediaInfo.year})`);
      const safeQuery = encodeURIComponent(mediaInfo.title);
      const searchUrl = `${BASE_URL}/api/search/${safeQuery}/${TOKEN}`;
      const searchRes = yield fetch(searchUrl, { headers: SEARCH_HEADERS });
      if (!searchRes.ok) {
        console.error(`[MovieBlast] Search failed with status: ${searchRes.status}`);
        return [];
      }
      const searchData = yield searchRes.json();
      const searchResults = searchData.search || [];
      const match = findBestMatch(mediaInfo, searchResults);
      if (!match) {
        console.log("[MovieBlast] No confident matches found in MovieBlast.");
        return [];
      }
      const internalId = match.id;
      const isSeries = match.type.toLowerCase().includes("serie") || mediaType === "tv";
      console.log(`[MovieBlast] Match Found: "${match.name}" (ID: ${internalId})`);
      const detailPath = isSeries ? "series/show" : "media/detail";
      const detailUrl = `${BASE_URL}/api/${detailPath}/${internalId}/${TOKEN}`;
      const detailRes = yield fetch(detailUrl, { headers: HEADERS });
      if (!detailRes.ok) {
        console.error(`[MovieBlast] Detail fetch failed: ${detailRes.status}`);
        return [];
      }
      const detailData = yield detailRes.json();
      let targetVideos = [];
      if (isSeries) {
        const seasons = detailData.seasons || [];
        const targetSeason = seasons.find((s) => s.season_number == season);
        if (targetSeason) {
          const targetEpisode = (targetSeason.episodes || []).find((e) => e.episode_number == episode);
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
      const streams = targetVideos.map((vid) => {
        const rawUrl = vid.link;
        if (!rawUrl)
          return null;
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
      }).filter((s) => s !== null);
      console.log(`[MovieBlast] Successfully found ${streams.length} streams.`);
      return streams;
    } catch (error) {
      console.error(`[MovieBlast] Error: ${error.message}`);
      return [];
    }
  });
}
module.exports = { getStreams };
