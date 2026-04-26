/**
 * allmovieland - Built from src/allmovieland/
 * Generated: 2026-04-26T06:39:13.171Z
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

// src/allmovieland/index.js
var import_cheerio_without_node_native = __toESM(require("cheerio-without-node-native"));

// src/allmovieland/constants.js
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var TMDB_BASE_URL = "https://api.themoviedb.org/3";
var MAIN_URL = "https://allmovieland.you";
var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5"
};

// src/allmovieland/utils.js
function getTMDBDetails(tmdbId, mediaType) {
  return __async(this, null, function* () {
    var _a;
    const endpoint = mediaType === "tv" ? "tv" : "movie";
    const url = `${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
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
    return { title, year, imdbId: ((_a = data.external_ids) == null ? void 0 : _a.imdb_id) || null, data };
  });
}
function normalizeTitle(title) {
  if (!title)
    return "";
  return title.toLowerCase().replace(/\b(the|a|an)\b/g, "").replace(/[:\-_]/g, " ").replace(/\s+/g, " ").replace(/[^\w\s]/g, "").trim();
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
  const jaccard = intersection.length / union.size;
  const extraWordsCount = words2.filter((w) => !set1.has(w)).length;
  let score = jaccard - extraWordsCount * 0.05;
  if (words1.length > 0 && words1.every((w) => set2.has(w))) {
    score += 0.2;
  }
  return score;
}
function findBestTitleMatch(mediaInfo, searchResults) {
  if (!searchResults || searchResults.length === 0)
    return null;
  let bestMatch = null;
  let bestScore = 0;
  for (const result of searchResults) {
    let score = calculateTitleSimilarity(mediaInfo.title, result.title);
    if (mediaInfo.year && result.year) {
      const yearDiff = Math.abs(mediaInfo.year - result.year);
      if (yearDiff === 0)
        score += 0.2;
      else if (yearDiff <= 1)
        score += 0.1;
      else if (yearDiff > 5)
        score -= 0.3;
    }
    if (score > bestScore && score > 0.3) {
      bestScore = score;
      bestMatch = result;
    }
  }
  return bestMatch;
}

// src/allmovieland/index.js
function getStreams(tmdbId, mediaType = "movie", season = null, episode = null) {
  return __async(this, null, function* () {
    console.log(`[AllMovieLand] Fetching streams for TMDB ID: ${tmdbId}, Type: ${mediaType}`);
    try {
      const mediaInfo = yield getTMDBDetails(tmdbId, mediaType);
      console.log(`[AllMovieLand] TMDB Info: "${mediaInfo.title}" (${mediaInfo.year || "N/A"})`);
      const query = mediaInfo.title;
      const searchUrl = `${MAIN_URL}/index.php?story=${encodeURIComponent(query)}&do=search&subaction=search`;
      const res = yield fetch(searchUrl, { headers: HEADERS });
      const html = yield res.text();
      const $ = import_cheerio_without_node_native.default.load(html);
      const searchResults = [];
      $("article.short-mid").each((i, el) => {
        const title = $(el).find("a > h3").text().trim();
        const href = $(el).find("a").attr("href");
        const yearMatch = title.match(/\((\d{4})\)/);
        const year = yearMatch ? parseInt(yearMatch[1]) : null;
        searchResults.push({ title, href, year });
      });
      if (searchResults.length === 0) {
        console.log("[AllMovieLand] No search results found.");
        return [];
      }
      const bestMatch = findBestTitleMatch(mediaInfo, searchResults);
      if (!bestMatch) {
        console.log("[AllMovieLand] No confident match found.");
        return [];
      }
      const selectedMedia = bestMatch;
      console.log(`[AllMovieLand] Selected: "${selectedMedia.title}" (${selectedMedia.href})`);
      const docRes = yield fetch(selectedMedia.href, { headers: HEADERS });
      const docHtml = yield docRes.text();
      const doc$ = import_cheerio_without_node_native.default.load(docHtml);
      const tabsContent = doc$("div.tabs__content script").html() || "";
      const playerScriptMatch = tabsContent.match(/const AwsIndStreamDomain\s*=\s*'([^']+)'/);
      const playerDomain = playerScriptMatch ? playerScriptMatch[1].replace(/\/$/, "") : null;
      const idMatch = tabsContent.match(/src:\s*'([^']+)'/);
      const id = idMatch ? idMatch[1] : null;
      if (!playerDomain || !id) {
        console.log("[AllMovieLand] Could not find player domain or ID.");
        return [];
      }
      const embedLink = `${playerDomain}/play/${id}`;
      const embedRes = yield fetch(embedLink, { headers: __spreadProps(__spreadValues({}, HEADERS), { Referer: selectedMedia.href }) });
      const embedHtml = yield embedRes.text();
      const embed$ = import_cheerio_without_node_native.default.load(embedHtml);
      const lastScript = embed$("body > script").last().html() || "";
      const p3Match = lastScript.match(/let\s+p3\s*=\s*(\{.*\});/);
      if (!p3Match) {
        console.log("[AllMovieLand] No p3 JSON found in embed.");
        return [];
      }
      const json = JSON.parse(p3Match[1]);
      let fileUrl = json.file.replace(/\\\//g, "/");
      if (!fileUrl.startsWith("http"))
        fileUrl = `${playerDomain}${fileUrl}`;
      const fileRes = yield fetch(fileUrl, {
        method: "POST",
        headers: __spreadProps(__spreadValues({}, HEADERS), { "X-CSRF-TOKEN": json.key, "Referer": embedLink })
      });
      const fileText = yield fileRes.text();
      let targetFiles = [];
      const parsedData = JSON.parse(fileText.replace(/,\]/g, "]"));
      if (mediaType === "movie") {
        targetFiles = parsedData.filter((s) => s && s.file);
      } else if (mediaType === "tv") {
        const seasonData = parsedData.find((s) => {
          const sTitle = s.title || "";
          const sNumMatch = sTitle.match(/Season\s*(\d+)/i) || sTitle.match(/(\d+)\s*Season/i);
          const sNum = sNumMatch ? parseInt(sNumMatch[1]) : null;
          return sNum === season || s.id == season;
        });
        if (seasonData && seasonData.folder) {
          const episodeData = seasonData.folder.find((e) => {
            const eTitle = e.title || "";
            const eNumMatch = eTitle.match(/Episode\s*(\d+)/i) || eTitle.match(/(\d+)\s*Episode/i);
            const eNum = eNumMatch ? parseInt(eNumMatch[1]) : null;
            return eNum === episode || e.episode == episode;
          });
          if (episodeData && episodeData.folder) {
            targetFiles = episodeData.folder.filter((s) => s && s.file);
          }
        }
      }
      if (targetFiles.length === 0) {
        console.log("[AllMovieLand] No streams found for the requested media.");
        return [];
      }
      const streams = [];
      yield Promise.all(targetFiles.map((fileObj) => __async(this, null, function* () {
        try {
          const playlistFile = fileObj.file.replace(/^~/, "");
          const playlistUrl = `${playerDomain}/playlist/${playlistFile}.txt`;
          const postRes = yield fetch(playlistUrl, {
            method: "POST",
            headers: __spreadProps(__spreadValues({}, HEADERS), { "X-CSRF-TOKEN": json.key, "Referer": embedLink })
          });
          const m3u8Url = (yield postRes.text()).trim();
          if (m3u8Url && m3u8Url.startsWith("http")) {
            const qualityStr = fileObj.title || "Unknown";
            streams.push({
              name: "AllMovieLand",
              title: `AllMovieLand - ${qualityStr}`,
              url: m3u8Url,
              quality: qualityStr,
              headers: {
                "Referer": `${playerDomain}/`,
                "Origin": playerDomain,
                "User-Agent": HEADERS["User-Agent"]
              },
              provider: "allmovieland"
            });
          }
        } catch (e) {
          console.error(`[AllMovieLand] Failed to extract stream: ${e.message}`);
        }
      })));
      return streams;
    } catch (error) {
      console.error(`[AllMovieLand] Error: ${error.message}`);
      return [];
    }
  });
}
module.exports = { getStreams };
