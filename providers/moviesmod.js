var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
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
const cheerio = require("cheerio-without-node-native");
console.log("[MoviesMod] Using cheerio-without-node-native for DOM parsing");
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const FALLBACK_DOMAIN = "https://moviesmod.farm";
const DOMAIN_CACHE_TTL = 4 * 60 * 60 * 1e3;
let moviesModDomain = FALLBACK_DOMAIN;
let domainCacheTimestamp = 0;
function getMoviesModDomain() {
  return __async(this, null, function* () {
    const now = Date.now();
    if (now - domainCacheTimestamp < DOMAIN_CACHE_TTL) {
      return moviesModDomain;
    }
    try {
      console.log("[MoviesMod] Fetching latest domain...");
      const response = yield fetch("https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json", {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });
      if (response.ok) {
        const data = yield response.json();
        if (data && data.moviesmod) {
          moviesModDomain = data.moviesmod;
          domainCacheTimestamp = now;
          console.log(`[MoviesMod] Updated domain to: ${moviesModDomain}`);
        }
      }
    } catch (error) {
      console.error(`[MoviesMod] Failed to fetch latest domain: ${error.message}`);
    }
    return moviesModDomain;
  });
}
function makeRequest(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    const defaultHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate",
      "Connection": "keep-alive",
      "Upgrade-Insecure-Requests": "1"
    };
    const response = yield fetch(url, __spreadProps(__spreadValues({}, options), {
      headers: __spreadValues(__spreadValues({}, defaultHeaders), options.headers)
    }));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response;
  });
}
function extractQuality(text) {
  if (!text)
    return "Unknown";
  const qualityMatch = text.match(/(480p|720p|1080p|2160p|4k)/i);
  if (qualityMatch) {
    return qualityMatch[1];
  }
  const cleanMatch = text.match(/(480p|720p|1080p|2160p|4k)[^)]*\)/i);
  if (cleanMatch) {
    return cleanMatch[0];
  }
  return "Unknown";
}
function parseQualityForSort(qualityString) {
  if (!qualityString)
    return 0;
  const match = qualityString.match(/(\d{3,4})p/i);
  return match ? parseInt(match[1], 10) : 0;
}
function getTechDetails(qualityString) {
  if (!qualityString)
    return [];
  const details = [];
  const lowerText = qualityString.toLowerCase();
  if (lowerText.includes("10bit"))
    details.push("10-bit");
  if (lowerText.includes("hevc") || lowerText.includes("x265"))
    details.push("HEVC");
  if (lowerText.includes("hdr"))
    details.push("HDR");
  return details;
}
function findBestMatch(mainString, targetStrings) {
  if (!targetStrings || targetStrings.length === 0) {
    return { bestMatch: { target: "", rating: 0 }, bestMatchIndex: -1 };
  }
  const ratings = targetStrings.map((target) => {
    if (!target)
      return 0;
    const main = mainString.toLowerCase();
    const targ = target.toLowerCase();
    if (main === targ)
      return 1;
    if (targ.includes(main) || main.includes(targ))
      return 0.8;
    const mainWords = main.split(/\s+/);
    const targWords = targ.split(/\s+/);
    let matches = 0;
    for (const word of mainWords) {
      if (word.length > 2 && targWords.some((tw) => tw.includes(word) || word.includes(tw))) {
        matches++;
      }
    }
    return matches / Math.max(mainWords.length, targWords.length);
  });
  const bestRating = Math.max(...ratings);
  const bestIndex = ratings.indexOf(bestRating);
  return {
    bestMatch: { target: targetStrings[bestIndex], rating: bestRating },
    bestMatchIndex: bestIndex
  };
}
function searchMoviesMod(query) {
  return __async(this, null, function* () {
    try {
      const baseUrl = yield getMoviesModDomain();
      const searchUrl = `${baseUrl}/?s=${encodeURIComponent(query)}`;
      console.log(`[MoviesMod] Searching: ${searchUrl}`);
      const response = yield makeRequest(searchUrl);
      const html = yield response.text();
      const $ = cheerio.load(html);
      const results = [];
      $(".latestPost").each((i, element) => {
        const linkElement = $(element).find("a");
        const title = linkElement.attr("title");
        const url = linkElement.attr("href");
        if (title && url) {
          results.push({ title, url });
        }
      });
      console.log(`[MoviesMod] Found ${results.length} search results`);
      return results;
    } catch (error) {
      console.error(`[MoviesMod] Error searching: ${error.message}`);
      return [];
    }
  });
}
function extractDownloadLinks(moviePageUrl) {
  return __async(this, null, function* () {
    try {
      const response = yield makeRequest(moviePageUrl);
      const html = yield response.text();
      const $ = cheerio.load(html);
      const links = [];
      const contentBox = $(".thecontent");
      const headers = contentBox.find('h3:contains("Season"), h4');
      headers.each((i, el) => {
        const header = $(el);
        const headerText = header.text().trim();
        const blockContent = header.nextUntil("h3, h4");
        if (header.is("h3") && headerText.toLowerCase().includes("season")) {
          const linkElements = blockContent.find("a").filter((i2, el2) => {
            const text = $(el2).text().trim().toLowerCase();
            return text.includes("episode links") && !text.includes("batch");
          });
          linkElements.each((j, linkEl) => {
            const buttonText = $(linkEl).text().trim();
            const linkUrl = $(linkEl).attr("href");
            if (linkUrl) {
              links.push({
                quality: `${headerText} - ${buttonText}`,
                url: linkUrl
              });
            }
          });
        } else if (header.is("h4")) {
          const linkElement = blockContent.find("a.maxbutton-download-links, .maxbutton").first();
          if (linkElement.length > 0) {
            const link = linkElement.attr("href");
            const cleanQuality = extractQuality(headerText);
            if (link && cleanQuality) {
              links.push({
                quality: cleanQuality,
                url: link
              });
            }
          }
        }
      });
      console.log(`[MoviesMod] Extracted ${links.length} download links`);
      return links;
    } catch (error) {
      console.error(`[MoviesMod] Error extracting download links: ${error.message}`);
      return [];
    }
  });
}
function resolveIntermediateLink(initialUrl, refererUrl, quality) {
  return __async(this, null, function* () {
    try {
      const urlObject = new URL(initialUrl);
      if (urlObject.hostname.includes("links.modpro.blog") || urlObject.hostname.includes("posts.modpro.blog")) {
        const response = yield makeRequest(initialUrl, { headers: { "Referer": refererUrl } });
        const html = yield response.text();
        const $ = cheerio.load(html);
        const finalLinks = [];
        $('.entry-content a[href*="driveseed.org"], .entry-content a[href*="tech.unblockedgames.world"], .entry-content a[href*="tech.creativeexpressionsblog.com"], .entry-content a[href*="tech.examzculture.in"]').each((i, el) => {
          const link = $(el).attr("href");
          const text = $(el).text().trim();
          if (link && text && !text.toLowerCase().includes("batch")) {
            finalLinks.push({
              server: text.replace(/\s+/g, " "),
              url: link
            });
          }
        });
        if (finalLinks.length === 0) {
          $('a[href*="driveseed.org"], a[href*="tech.unblockedgames.world"], a[href*="tech.creativeexpressionsblog.com"], a[href*="tech.examzculture.in"]').each((i, el) => {
            const link = $(el).attr("href");
            const text = $(el).text().trim();
            if (link && text && !text.toLowerCase().includes("batch")) {
              finalLinks.push({
                server: text.replace(/\s+/g, " ") || "Download Link",
                url: link
              });
            }
          });
        }
        console.log(`[MoviesMod] Found ${finalLinks.length} links from ${urlObject.hostname}`);
        return finalLinks;
      } else if (urlObject.hostname.includes("episodes.modpro.blog")) {
        const response = yield makeRequest(initialUrl, { headers: { "Referer": refererUrl } });
        const html = yield response.text();
        const $ = cheerio.load(html);
        const finalLinks = [];
        $("h3").each((i, el) => {
          const headerText = $(el).text().trim();
          const episodeMatch = headerText.match(/Episode\s+(\d+)/i);
          if (episodeMatch) {
            const episodeNum = episodeMatch[1];
            const linkElement = $(el).find("a").first();
            if (linkElement.length > 0) {
              const link = linkElement.attr("href");
              if (link) {
                finalLinks.push({
                  server: `Episode ${episodeNum}`,
                  url: link
                });
              }
            }
          }
        });
        console.log(`[MoviesMod] Found ${finalLinks.length} episode links from episodes.modpro.blog`);
        return finalLinks;
      } else if (urlObject.hostname.includes("modrefer.in")) {
        const encodedUrl = urlObject.searchParams.get("url");
        if (!encodedUrl) {
          console.error("[MoviesMod] Could not find encoded URL in modrefer.in link.");
          return [];
        }
        const decodedUrl = atob(encodedUrl);
        console.log(`[MoviesMod] Decoded modrefer URL: ${decodedUrl}`);
        const response = yield makeRequest(decodedUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Referer": refererUrl
          }
        });
        const html = yield response.text();
        const $ = cheerio.load(html);
        const finalLinks = [];
        console.log(`[MoviesMod] Page title: ${$("title").text()}`);
        console.log(`[MoviesMod] Total links on page: ${$("a").length}`);
        console.log(`[MoviesMod] HTML length: ${html.length} characters`);
        $(".timed-content-client_show_0_5_0 a").each((i, el) => {
          const link = $(el).attr("href");
          const text = $(el).text().trim();
          if (link) {
            finalLinks.push({
              server: text,
              url: link
            });
          }
        });
        if (finalLinks.length === 0) {
          console.log(`[MoviesMod] No timed content found, looking for direct links...`);
          $("a").each((i, el) => {
            const link = $(el).attr("href");
            const text = $(el).text().trim();
            if (link && (link.includes("driveseed.org") || link.includes("tech.unblockedgames.world") || link.includes("tech.examzculture.in") || link.includes("tech.creativeexpressionsblog.com") || link.includes("tech.examdegree.site"))) {
              console.log(`[MoviesMod] Found direct link: ${text} -> ${link}`);
              finalLinks.push({
                server: text || "Download Link",
                url: link
              });
            }
          });
        }
        if (finalLinks.length === 0) {
          console.log(`[MoviesMod] Looking for alternative download patterns...`);
          $('button, .download-btn, .btn, [class*="download"], [class*="btn"]').each((i, el) => {
            const $el = $(el);
            const link = $el.attr("href") || $el.attr("data-href") || $el.find("a").attr("href");
            const text = $el.text().trim();
            if (link && (link.includes("driveseed.org") || link.includes("tech.unblockedgames.world") || link.includes("tech.examzculture.in") || link.includes("tech.creativeexpressionsblog.com") || link.includes("tech.examdegree.site"))) {
              console.log(`[MoviesMod] Found alternative link: ${text} -> ${link}`);
              finalLinks.push({
                server: text || "Alternative Download",
                url: link
              });
            }
          });
        }
        console.log(`[MoviesMod] Found ${finalLinks.length} total links`);
        return finalLinks;
      }
      return [];
    } catch (error) {
      console.error(`[MoviesMod] Error resolving intermediate link: ${error.message}`);
      return [];
    }
  });
}
function resolveTechUnblockedLink(sidUrl) {
  return __async(this, null, function* () {
    console.log(`[MoviesMod] Resolving SID link: ${sidUrl}`);
    try {
      const response = yield makeRequest(sidUrl);
      const html = yield response.text();
      const $ = cheerio.load(html);
      const initialForm = $("#landing");
      const wp_http_step1 = initialForm.find('input[name="_wp_http"]').val();
      const action_url_step1 = initialForm.attr("action");
      if (!wp_http_step1 || !action_url_step1) {
        console.error("  [SID] Error: Could not find _wp_http in initial form.");
        return null;
      }
      const step1Data = new URLSearchParams({ "_wp_http": wp_http_step1 });
      const responseStep1 = yield makeRequest(action_url_step1, {
        method: "POST",
        headers: {
          "Referer": sidUrl,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: step1Data.toString()
      });
      const html2 = yield responseStep1.text();
      const $2 = cheerio.load(html2);
      const verificationForm = $2("#landing");
      const action_url_step2 = verificationForm.attr("action");
      const wp_http2 = verificationForm.find('input[name="_wp_http2"]').val();
      const token = verificationForm.find('input[name="token"]').val();
      if (!action_url_step2) {
        console.error("  [SID] Error: Could not find verification form.");
        return null;
      }
      const step2Data = new URLSearchParams({ "_wp_http2": wp_http2, "token": token });
      const responseStep2 = yield makeRequest(action_url_step2, {
        method: "POST",
        headers: {
          "Referer": responseStep1.url,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: step2Data.toString()
      });
      const finalHtml = yield responseStep2.text();
      let finalLinkPath = null;
      let cookieName = null;
      let cookieValue = null;
      const cookieMatch = finalHtml.match(/s_343\('([^']+)',\s*'([^']+)'/);
      const linkMatch = finalHtml.match(/c\.setAttribute\("href",\s*"([^"]+)"\)/);
      if (cookieMatch) {
        cookieName = cookieMatch[1].trim();
        cookieValue = cookieMatch[2].trim();
      }
      if (linkMatch) {
        finalLinkPath = linkMatch[1].trim();
      }
      if (!finalLinkPath || !cookieName || !cookieValue) {
        console.error("  [SID] Error: Could not extract dynamic cookie/link from JS.");
        return null;
      }
      const { origin } = new URL(sidUrl);
      const finalUrl = new URL(finalLinkPath, origin).href;
      const finalResponse = yield makeRequest(finalUrl, {
        headers: {
          "Referer": responseStep2.url,
          "Cookie": `${cookieName}=${cookieValue}`
        }
      });
      const metaHtml = yield finalResponse.text();
      const $3 = cheerio.load(metaHtml);
      const metaRefresh = $3('meta[http-equiv="refresh"]');
      if (metaRefresh.length > 0) {
        const content = metaRefresh.attr("content");
        const urlMatch = content.match(/url=(.*)/i);
        if (urlMatch && urlMatch[1]) {
          const driveleechUrl = urlMatch[1].replace(/"/g, "").replace(/'/g, "");
          console.log(`  [SID] SUCCESS! Resolved Driveleech URL: ${driveleechUrl}`);
          return driveleechUrl;
        }
      }
      console.error("  [SID] Error: Could not find meta refresh tag with Driveleech URL.");
      return null;
    } catch (error) {
      console.error(`  [SID] Error during SID resolution: ${error.message}`);
      return null;
    }
  });
}
function resolveDriveseedLink(driveseedUrl) {
  return __async(this, null, function* () {
    try {
      const response = yield makeRequest(driveseedUrl, {
        headers: {
          "Referer": "https://links.modpro.blog/"
        }
      });
      const html = yield response.text();
      const redirectMatch = html.match(/window\.location\.replace\("([^"]+)"\)/);
      if (redirectMatch && redirectMatch[1]) {
        const finalPath = redirectMatch[1];
        const finalUrl = `https://driveseed.org${finalPath}`;
        const finalResponse = yield makeRequest(finalUrl, {
          headers: {
            "Referer": driveseedUrl
          }
        });
        const finalHtml = yield finalResponse.text();
        const $ = cheerio.load(finalHtml);
        const downloadOptions = [];
        let size = null;
        let fileName = null;
        $("ul.list-group li").each((i, el) => {
          const text = $(el).text();
          if (text.includes("Size :")) {
            size = text.split(":")[1].trim();
          } else if (text.includes("Name :")) {
            fileName = text.split(":")[1].trim();
          }
        });
        const resumeCloudLink = $('a:contains("Resume Cloud")').attr("href");
        if (resumeCloudLink) {
          downloadOptions.push({
            title: "Resume Cloud",
            type: "resume",
            url: `https://driveseed.org${resumeCloudLink}`,
            priority: 1
          });
        }
        const workerSeedLink = $('a:contains("Resume Worker Bot")').attr("href");
        if (workerSeedLink) {
          downloadOptions.push({
            title: "Resume Worker Bot",
            type: "worker",
            url: workerSeedLink,
            priority: 2
          });
        }
        $('a[href*="/download/"]').each((i, el) => {
          const href = $(el).attr("href");
          const text = $(el).text().trim();
          if (href && text && !downloadOptions.some((opt) => opt.url === href)) {
            downloadOptions.push({
              title: text,
              type: "generic",
              url: href.startsWith("http") ? href : `https://driveseed.org${href}`,
              priority: 4
            });
          }
        });
        const instantDownloadLink = $('a:contains("Instant Download")').attr("href");
        if (instantDownloadLink) {
          downloadOptions.push({
            title: "Instant Download",
            type: "instant",
            url: instantDownloadLink,
            priority: 3
          });
        }
        downloadOptions.sort((a, b) => a.priority - b.priority);
        return { downloadOptions, size, fileName };
      }
      return { downloadOptions: [], size: null, fileName: null };
    } catch (error) {
      console.error(`[MoviesMod] Error resolving Driveseed link: ${error.message}`);
      return { downloadOptions: [], size: null, fileName: null };
    }
  });
}
function resolveResumeCloudLink(resumeUrl) {
  return __async(this, null, function* () {
    try {
      const response = yield makeRequest(resumeUrl, {
        headers: {
          "Referer": "https://driveseed.org/"
        }
      });
      const html = yield response.text();
      const $ = cheerio.load(html);
      const downloadLink = $('a:contains("Cloud Resume Download")').attr("href");
      return downloadLink || null;
    } catch (error) {
      console.error(`[MoviesMod] Error resolving Resume Cloud link: ${error.message}`);
      return null;
    }
  });
}
function resolveVideoSeedLink(videoSeedUrl) {
  return __async(this, null, function* () {
    try {
      const urlParams = new URLSearchParams(new URL(videoSeedUrl).search);
      const keys = urlParams.get("url");
      if (keys) {
        const apiUrl = `${new URL(videoSeedUrl).origin}/api`;
        const formData = new URLSearchParams();
        formData.append("keys", keys);
        const apiResponse = yield fetch(apiUrl, {
          method: "POST",
          body: formData,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "x-token": new URL(videoSeedUrl).hostname,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });
        if (apiResponse.ok) {
          const responseData = yield apiResponse.json();
          if (responseData && responseData.url) {
            return responseData.url;
          }
        }
      }
      return null;
    } catch (error) {
      console.error(`[MoviesMod] Error resolving VideoSeed link: ${error.message}`);
      return null;
    }
  });
}
function validateVideoUrl(url, timeout = 1e4) {
  return __async(this, null, function* () {
    try {
      console.log(`[MoviesMod] Validating URL: ${url.substring(0, 100)}...`);
      const response = yield fetch(url, {
        method: "HEAD",
        headers: {
          "Range": "bytes=0-1",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });
      if (response.ok || response.status === 206) {
        console.log(`[MoviesMod] \u2713 URL validation successful (${response.status})`);
        return true;
      } else {
        console.log(`[MoviesMod] \u2717 URL validation failed with status: ${response.status}`);
        return false;
      }
    } catch (error) {
      console.log(`[MoviesMod] \u2717 URL validation failed: ${error.message}`);
      return false;
    }
  });
}
function processDownloadLink(link, selectedResult, mediaType, episodeNum) {
  return __async(this, null, function* () {
    var _a;
    try {
      console.log(`[MoviesMod] Processing quality: ${link.quality}`);
      const finalLinks = yield resolveIntermediateLink(link.url, selectedResult.url, link.quality);
      if (!finalLinks || finalLinks.length === 0) {
        console.log(`[MoviesMod] No final links found for ${link.quality}`);
        return null;
      }
      let targetLinks = finalLinks;
      if ((mediaType === "tv" || mediaType === "series") && episodeNum !== null) {
        targetLinks = finalLinks.filter((targetLink) => {
          const serverName = targetLink.server.toLowerCase();
          const episodePatterns = [
            new RegExp(`episode\\s+${episodeNum}\\b`, "i"),
            new RegExp(`ep\\s+${episodeNum}\\b`, "i"),
            new RegExp(`e${episodeNum}\\b`, "i"),
            new RegExp(`\\b${episodeNum}\\b`)
          ];
          return episodePatterns.some((pattern) => pattern.test(serverName));
        });
        if (targetLinks.length === 0) {
          console.log(`[MoviesMod] No episode ${episodeNum} found for ${link.quality}`);
          return null;
        }
      }
      for (const targetLink of targetLinks) {
        try {
          let currentUrl = targetLink.url;
          if (currentUrl && (currentUrl.includes("tech.unblockedgames.world") || currentUrl.includes("tech.creativeexpressionsblog.com") || currentUrl.includes("tech.examzculture.in") || currentUrl.includes("tech.examdegree.site"))) {
            console.log(`[MoviesMod] Resolving SID link: ${targetLink.server}`);
            const resolvedUrl = yield resolveTechUnblockedLink(currentUrl);
            if (!resolvedUrl) {
              console.log(`[MoviesMod] Failed to resolve SID link for ${targetLink.server}`);
              continue;
            }
            if (resolvedUrl.includes("report-broken-links") || resolvedUrl.includes("moviesmod.wiki")) {
              console.log(`[MoviesMod] Skipping broken link report page for ${targetLink.server}`);
              continue;
            }
            currentUrl = resolvedUrl;
          }
          if (currentUrl && currentUrl.includes("driveseed.org")) {
            const { downloadOptions, size, fileName } = yield resolveDriveseedLink(currentUrl);
            if (!downloadOptions || downloadOptions.length === 0) {
              console.log(`[MoviesMod] No download options found for ${targetLink.server} - ${currentUrl}`);
              continue;
            }
            let finalDownloadUrl = null;
            let usedMethod = null;
            for (const option of downloadOptions) {
              try {
                console.log(`[MoviesMod] Trying ${option.title} for ${link.quality}...`);
                if (option.type === "resume" || option.type === "worker") {
                  finalDownloadUrl = yield resolveResumeCloudLink(option.url);
                } else if (option.type === "instant") {
                  finalDownloadUrl = yield resolveVideoSeedLink(option.url);
                } else if (option.type === "generic") {
                  finalDownloadUrl = option.url;
                }
                if (finalDownloadUrl) {
                  if (typeof URL_VALIDATION_ENABLED !== "undefined" && !URL_VALIDATION_ENABLED) {
                    usedMethod = option.title;
                    console.log(`[MoviesMod] \u2713 URL validation disabled, accepting ${usedMethod} result`);
                    break;
                  }
                  const isValid = yield validateVideoUrl(finalDownloadUrl);
                  if (isValid) {
                    usedMethod = option.title;
                    console.log(`[MoviesMod] \u2713 Successfully resolved using ${usedMethod}`);
                    break;
                  } else {
                    console.log(`[MoviesMod] \u2717 ${option.title} returned invalid URL`);
                    finalDownloadUrl = null;
                  }
                }
              } catch (error) {
                console.log(`[MoviesMod] \u2717 ${option.title} failed: ${error.message}`);
              }
            }
            if (finalDownloadUrl) {
              const actualQuality = extractQuality(link.quality);
              const sizeInfo = size || ((_a = link.quality.match(/\[([^\]]+)\]/)) == null ? void 0 : _a[1]);
              const cleanFileName = fileName ? fileName.replace(/\.[^/.]+$/, "").replace(/[._]/g, " ") : `Stream from ${link.quality}`;
              const techDetails = getTechDetails(link.quality);
              const techDetailsString = techDetails.length > 0 ? ` \u2022 ${techDetails.join(" \u2022 ")}` : "";
              return {
                name: `MoviesMod`,
                title: `${cleanFileName}
${sizeInfo || ""}${techDetailsString}`,
                url: finalDownloadUrl,
                quality: actualQuality,
                size: sizeInfo,
                fileName,
                type: "direct"
              };
            }
          }
        } catch (error) {
          console.error(`[MoviesMod] Error processing target link: ${error.message}`);
        }
      }
      return null;
    } catch (error) {
      console.error(`[MoviesMod] Error processing quality ${link.quality}: ${error.message}`);
      return null;
    }
  });
}
function getStreams(tmdbId, mediaType = "movie", seasonNum = null, episodeNum = null) {
  return __async(this, null, function* () {
    var _a, _b;
    console.log(`[MoviesMod] Fetching streams for TMDB ID: ${tmdbId}, Type: ${mediaType}${seasonNum ? `, S${seasonNum}E${episodeNum}` : ""}`);
    try {
      const tmdbUrl = `https://api.themoviedb.org/3/${mediaType === "tv" ? "tv" : "movie"}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
      const tmdbResponse = yield makeRequest(tmdbUrl);
      const tmdbData = yield tmdbResponse.json();
      const title = mediaType === "tv" ? tmdbData.name : tmdbData.title;
      const year = mediaType === "tv" ? (_a = tmdbData.first_air_date) == null ? void 0 : _a.substring(0, 4) : (_b = tmdbData.release_date) == null ? void 0 : _b.substring(0, 4);
      const imdbId = tmdbData.external_ids ? tmdbData.external_ids.imdb_id : null;
      
      if (!title) {
        throw new Error("Could not extract title from TMDB response");
      }
      console.log(`[MoviesMod] TMDB Info: "${title}" (${year}) [IMDB: ${imdbId || 'N/A'}]`);
      
      let searchResults = [];
      let selectedResult = null;
      
      if (imdbId) {
        const imdbQuery = mediaType === "tv" && seasonNum ? `${imdbId} Season ${seasonNum}` : imdbId;
        console.log(`[MoviesMod] Trying IMDB ID search first: ${imdbQuery}`);
        searchResults = yield searchMoviesMod(imdbQuery);
        if (searchResults.length > 0) {
            console.log(`[MoviesMod] Found match using IMDB ID: ${searchResults[0].title}`);
            selectedResult = searchResults[0];
        }
      }

      if (!selectedResult) {
        console.log(`[MoviesMod] Falling back to title search for: ${title}`);
        const titleQuery = mediaType === "tv" && seasonNum ? `${title} Season ${seasonNum}` : title;
        searchResults = yield searchMoviesMod(titleQuery);
        if (searchResults.length === 0) {
          // If title+season fails, try just title
          searchResults = yield searchMoviesMod(title);
        }
        
        if (searchResults.length === 0) {
          console.log(`[MoviesMod] No search results found`);
          return [];
        }
        
        const titles = searchResults.map((r) => r.title);
        const bestMatch = findBestMatch(title, titles);
        console.log(`[MoviesMod] Best match for "${title}" is "${bestMatch.bestMatch.target}" with a rating of ${bestMatch.bestMatch.rating.toFixed(2)}`);
        
        if (bestMatch.bestMatch.rating > 0.3) {
          selectedResult = searchResults[bestMatch.bestMatchIndex];
          if (mediaType === "movie" && year) {
            if (!selectedResult.title.includes(year)) {
              console.warn(`[MoviesMod] Title match found, but year mismatch. Matched: "${selectedResult.title}", Expected year: ${year}. Discarding match.`);
              selectedResult = null;
            }
          }
        }
        
        if (!selectedResult) {
          console.log("[MoviesMod] Similarity match failed. Trying stricter search...");
          const titleRegex = new RegExp(`\\b${escapeRegExp(title.toLowerCase())}\\b`);
          if (mediaType === "movie") {
            selectedResult = searchResults.find(
              (r) => titleRegex.test(r.title.toLowerCase()) && (!year || r.title.includes(year))
            );
          } else {
            selectedResult = searchResults.find(
              (r) => titleRegex.test(r.title.toLowerCase()) && r.title.toLowerCase().includes("season")
            );
          }
        }
      }

      if (!selectedResult) {
        console.log(`[MoviesMod] No suitable search result found for "${title} (${year})"`);
        return [];
      }
      console.log(`[MoviesMod] Selected: ${selectedResult.title}`);
      const downloadLinks = yield extractDownloadLinks(selectedResult.url);
      if (downloadLinks.length === 0) {
        console.log(`[MoviesMod] No download links found`);
        return [];
      }
      let relevantLinks = downloadLinks;
      if ((mediaType === "tv" || mediaType === "series") && seasonNum !== null) {
        relevantLinks = downloadLinks.filter(
          (link) => link.quality.toLowerCase().includes(`season ${seasonNum}`) || link.quality.toLowerCase().includes(`s${seasonNum}`)
        );
      }
      relevantLinks = relevantLinks.filter((link) => !link.quality.toLowerCase().includes("480p"));
      console.log(`[MoviesMod] ${relevantLinks.length} links remaining after 480p filter.`);
      if (relevantLinks.length === 0) {
        console.log(`[MoviesMod] No relevant links found after filtering`);
        return [];
      }
      const streamPromises = relevantLinks.map((link) => __async(this, null, function* () {
        var _a2;
        try {
          const finalLinks = yield resolveIntermediateLink(link.url, selectedResult.url, link.quality);
          if (!finalLinks || finalLinks.length === 0) {
            console.log(`[MoviesMod] No final links found for ${link.quality}`);
            return null;
          }
          const processedStreams = [];
          for (const targetLink of finalLinks) {
            let currentUrl = targetLink.url;
            const isEpisodeLink = targetLink.server && targetLink.server.toLowerCase().includes("episode");
            console.log(`[MoviesMod] Processing link: server="${targetLink.server}", isEpisodeLink=${isEpisodeLink}, url=${targetLink.url.substring(0, 50)}...`);
            if (currentUrl.includes("tech.unblockedgames.world") || currentUrl.includes("tech.creativeexpressionsblog.com") || currentUrl.includes("tech.examzculture.in")) {
              const resolvedUrl = yield resolveTechUnblockedLink(currentUrl);
              if (!resolvedUrl)
                continue;
              currentUrl = resolvedUrl;
            }
            if (currentUrl && currentUrl.includes("driveseed.org")) {
              console.log(`[MoviesMod] Processing driveseed URL: ${currentUrl.substring(0, 80)}...`);
              const driveseedInfo = yield resolveDriveseedLink(currentUrl);
              console.log(`[MoviesMod] Driveseed info: ${driveseedInfo ? `options=${((_a2 = driveseedInfo.downloadOptions) == null ? void 0 : _a2.length) || 0}` : "null"}`);
              if (driveseedInfo && driveseedInfo.downloadOptions && driveseedInfo.downloadOptions.length > 0) {
                console.log(`[MoviesMod] Download options available: ${driveseedInfo.downloadOptions.map((opt) => `${opt.type}: ${opt.title}`).join(", ")}`);
                const sortedOptions = driveseedInfo.downloadOptions.sort((a, b) => a.priority - b.priority);
                let finalDownloadUrl = null;
                let usedMethod = null;
                for (const option of sortedOptions) {
                  console.log(`[MoviesMod] Trying ${option.title} (${option.type}) for ${link.quality}...`);
                  if (option.type === "resume" || option.type === "worker") {
                    finalDownloadUrl = yield resolveResumeCloudLink(option.url);
                    console.log(`[MoviesMod] Resume/Worker result: ${finalDownloadUrl ? "got URL" : "null"}`);
                  } else if (option.type === "instant") {
                    finalDownloadUrl = yield resolveVideoSeedLink(option.url);
                    console.log(`[MoviesMod] Instant API result: ${finalDownloadUrl ? "got URL" : "null"}`);
                    if (!finalDownloadUrl) {
                      finalDownloadUrl = option.url;
                      console.log(`[MoviesMod] Instant fallback: using URL directly`);
                    }
                  } else if (option.type === "generic") {
                    finalDownloadUrl = option.url;
                    console.log(`[MoviesMod] Generic result: using URL directly`);
                  }
                  if (finalDownloadUrl) {
                    const isValid = yield validateVideoUrl(finalDownloadUrl);
                    if (isValid) {
                      usedMethod = option.title;
                      console.log(`[MoviesMod] \u2713 Successfully resolved using ${usedMethod}`);
                      break;
                    } else {
                      console.log(`[MoviesMod] \u2717 ${option.title} returned invalid URL`);
                      finalDownloadUrl = null;
                    }
                  }
                }
                if (finalDownloadUrl) {
                  console.log(`[MoviesMod] URL validation: SUCCESS`);
                  if (isEpisodeLink && episodeNum !== null) {
                    const episodeFromServer = targetLink.server.match(/Episode\s+(\d+)/i);
                    console.log(`[MoviesMod] Episode filtering: server="${targetLink.server}", requested episode=${episodeNum}, found episode=${episodeFromServer ? episodeFromServer[1] : "none"}`);
                    if (episodeFromServer && parseInt(episodeFromServer[1]) !== episodeNum) {
                      console.log(`[MoviesMod] Skipping episode ${episodeFromServer[1]} (not episode ${episodeNum})`);
                      continue;
                    } else if (episodeFromServer && parseInt(episodeFromServer[1]) === episodeNum) {
                      console.log(`[MoviesMod] Processing episode ${episodeNum} - continuing...`);
                    }
                  }
                  const mediaTitle = mediaType === "tv" && seasonNum && episodeNum ? `${selectedResult.title} S${seasonNum.toString().padStart(2, "0")}E${episodeNum.toString().padStart(2, "0")}` : selectedResult.title;
                  processedStreams.push({
                    name: `MoviesMod ${targetLink.server || ""} - ${link.quality}`.trim(),
                    title: mediaTitle,
                    url: finalDownloadUrl,
                    quality: link.quality,
                    size: driveseedInfo.size || "Unknown",
                    headers: {
                      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                      "Referer": "https://driveseed.org/"
                    },
                    provider: "moviesmod"
                  });
                  break;
                }
              }
            }
          }
          const result = processedStreams.length > 0 ? processedStreams[0] : null;
          console.log(`[MoviesMod] Returning ${result ? "stream" : "null"} for ${link.quality}`);
          return result;
        } catch (error) {
          console.error(`[MoviesMod] Error processing link ${link.quality}: ${error.message}`);
          return null;
        }
      }));
      const rawStreams = yield Promise.all(streamPromises);
      console.log(`[MoviesMod] Raw streams before filtering: ${rawStreams.length}`);
      rawStreams.forEach((stream, i) => {
        console.log(`  [${i}] ${stream ? "VALID" : "NULL"}`);
      });
      const streams = rawStreams.filter(Boolean);
      console.log(`[MoviesMod] Streams after null filtering: ${streams.length}`);
      streams.sort((a, b) => {
        const qualityA = parseQualityForSort(a.quality);
        const qualityB = parseQualityForSort(b.quality);
        return qualityB - qualityA;
      });
      console.log(`[MoviesMod] Successfully processed ${streams.length} streams`);
      return streams;
    } catch (error) {
      console.error(`[MoviesMod] Error in getStreams: ${error.message}`);
      return [];
    }
  });
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
