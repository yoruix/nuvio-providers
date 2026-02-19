import cheerio from 'cheerio-without-node-native';
import { HEADERS, MAIN_URL } from './constants.js';
import { 
  getCurrentDomain, getTMDBDetails, findBestTitleMatch, 
  extractServerName, formatBytes 
} from './utils.js';
import { loadExtractor, getRedirectLinks } from './extractors.js';

async function search(query) {
  const today = (new Date()).toISOString().split("T")[0];
  const searchUrl = `https://search.pingora.fyi/collections/post/documents/search?q=${encodeURIComponent(query)}&query_by=post_title,category&query_by_weights=4,2&sort_by=sort_by_date:desc&limit=15&highlight_fields=none&use_cache=true&page=1&analytics_tag=${today}`;
  
  const response = await fetch(searchUrl, { headers: HEADERS });
  const data = await response.json();
  
  if (!data || !data.hits) return [];
  
  return data.hits.map((hit) => {
    const doc = hit.document;
    const title = doc.post_title;
    const yearMatch = title.match(/\((\d{4})\)|\b(\d{4})\b/);
    const year = yearMatch ? parseInt(yearMatch[1] || yearMatch[2]) : null;
    let url = doc.permalink;
    if (url && url.startsWith("/")) {
      url = `${MAIN_URL}${url}`;
    }
    return {
      title,
      url,
      poster: doc.post_thumbnail,
      year
    };
  });
}

async function getDownloadLinks(mediaUrl) {
  const domain = await getCurrentDomain();
  const response = await fetch(mediaUrl, { headers: { ...HEADERS, Referer: `${domain}/` } });
  const data = await response.text();
  const $ = cheerio.load(data);
  
  const typeRaw = $("h1.page-title span").text();
  const isMovie = typeRaw.toLowerCase().includes("movie");
  
  if (isMovie) {
    const qualityLinks = $("h3 a, h4 a").filter((i, el) => $(el).text().match(/480|720|1080|2160|4K/i));
    const bodyLinks = $(".page-body > div a").filter((i, el) => {
        const href = $(el).attr("href");
        return href && (href.includes("hdstream4u") || href.includes("hubstream"));
    });
    
    const initialLinks = [...new Set([
        ...qualityLinks.map((i, el) => $(el).attr("href")).get(),
        ...bodyLinks.map((i, el) => $(el).attr("href")).get()
    ])];
    
    const results = await Promise.all(initialLinks.map(url => loadExtractor(url, mediaUrl)));
    const allFinalLinks = results.flat();
    
    const seenUrls = new Set();
    const uniqueFinalLinks = allFinalLinks.filter(link => {
      if (!link.url || link.url.includes(".zip") || link.name?.toLowerCase().includes(".zip")) return false;
      if (seenUrls.has(link.url)) return false;
      seenUrls.add(link.url);
      return true;
    });
    
    return { finalLinks: uniqueFinalLinks, isMovie };
  } else {
    // TV Logic
    const episodeLinksMap = new Map();
    const directLinkBlocks = [];

    $("h3, h4").each((i, element) => {
      const $el = $(element);
      const text = $el.text();
      const anchors = $el.find("a");
      const links = anchors.map((i2, a) => $(a).attr("href")).get();
      
      const isDirectLinkBlock = anchors.get().some(a => $(a).text().match(/1080|720|4K|2160/i));
      if (isDirectLinkBlock) {
          directLinkBlocks.push(...links);
          return;
      }

      const episodeMatch = text.match(/(?:EPiSODE\s*(\d+)|E(\d+))/i);
      if (episodeMatch) {
        const epNum = parseInt(episodeMatch[1] || episodeMatch[2]);
        if (!episodeLinksMap.has(epNum)) episodeLinksMap.set(epNum, []);
        episodeLinksMap.get(epNum).push(...links);
        
        let nextElement = $el.next();
        while (nextElement.length && nextElement.get(0).tagName !== "hr") {
            const siblingLinks = nextElement.find("a[href]").map((i2, a) => $(a).attr("href")).get();
            episodeLinksMap.get(epNum).push(...siblingLinks);
            nextElement = nextElement.next();
        }
      }
    });
    
    if (directLinkBlocks.length > 0) {
        await Promise.all(directLinkBlocks.map(async (blockUrl) => {
            try {
                const resolvedUrl = await getRedirectLinks(blockUrl);
                if (!resolvedUrl) return;
                const blockRes = await fetch(resolvedUrl, { headers: HEADERS });
                const blockData = await blockRes.text();
                const $$ = cheerio.load(blockData);
                $$("h5 a, h4 a, h3 a").each((i, el) => {
                    const linkText = $$(el).text();
                    const linkHref = $$(el).attr("href");
                    const epMatch = linkText.match(/Episode\s*(\d+)/i);
                    if (epMatch && linkHref) {
                        const epNum = parseInt(epMatch[1]);
                        if (!episodeLinksMap.has(epNum)) episodeLinksMap.set(epNum, []);
                        episodeLinksMap.get(epNum).push(linkHref);
                    }
                });
            } catch (e) {}
        }));
    }
    
    const initialLinks = [];
    episodeLinksMap.forEach((links, epNum) => {
      const uniqueLinks = [...new Set(links)];
      initialLinks.push(...uniqueLinks.map(link => ({ url: link, episode: epNum })));
    });
    
    const results = await Promise.all(initialLinks.map(async (linkInfo) => {
        try {
            const extracted = await loadExtractor(linkInfo.url, mediaUrl);
            return extracted.map(ext => ({ ...ext, episode: linkInfo.episode }));
        } catch (e) { return []; }
    }));
    
    const allFinalLinks = results.flat();
    const seenUrls = new Set();
    const uniqueFinalLinks = allFinalLinks.filter(link => {
        if (!link.url || link.url.includes(".zip")) return false;
        if (seenUrls.has(link.url)) return false;
        seenUrls.add(link.url);
        return true;
    });
    
    return { finalLinks: uniqueFinalLinks, isMovie };
  }
}

async function getStreams(tmdbId, mediaType = "movie", season = null, episode = null) {
  console.log(`[HDHub4u] Fetching streams for TMDB ID: ${tmdbId}, Type: ${mediaType}`);
  try {
    const mediaInfo = await getTMDBDetails(tmdbId, mediaType);
    console.log(`[HDHub4u] TMDB Info: "${mediaInfo.title}" (${mediaInfo.year || "N/A"})`);
    
    const searchQuery = mediaType === "tv" && season ? `${mediaInfo.title} Season ${season}` : mediaInfo.title;
    const searchResults = await search(searchQuery);
    if (searchResults.length === 0) return [];
    
    const bestMatch = findBestTitleMatch(mediaInfo, searchResults, mediaType, season);
    const selectedMedia = bestMatch || searchResults[0];
    console.log(`[HDHub4u] Selected: "${selectedMedia.title}" (${selectedMedia.url})`);
    
    const result = await getDownloadLinks(selectedMedia.url);
    const finalLinks = result.finalLinks;
    let filteredLinks = finalLinks;
    
    if (mediaType === "tv" && episode !== null) {
      filteredLinks = finalLinks.filter(link => link.episode === episode);
    }
    
    const streams = filteredLinks.map(link => {
      let mediaTitle = link.fileName && link.fileName !== "Unknown" ? link.fileName : mediaInfo.title;
      if (mediaType === "tv" && season && episode) {
          mediaTitle = `${mediaInfo.title} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
      }
      
      const serverName = extractServerName(link.source);
      let qualityStr = "Unknown";
      if (typeof link.quality === "number" && link.quality > 0) {
          if (link.quality >= 2160) qualityStr = "4K";
          else if (link.quality >= 1080) qualityStr = "1080p";
          else if (link.quality >= 720) qualityStr = "720p";
          else if (link.quality >= 480) qualityStr = "480p";
      } else if (typeof link.quality === "string") {
          qualityStr = link.quality;
      }
      
      return {
        name: `HDHub4u ${serverName}`,
        title: mediaTitle,
        url: link.url,
        quality: qualityStr,
        size: formatBytes(link.size),
        headers: HEADERS,
        provider: "hdhub4u"
      };
    });
    
    const qualityOrder = { "4K": 4, "1080p": 2, "720p": 1, "480p": 0, "Unknown": -2 };
    return streams.sort((a, b) => (qualityOrder[b.quality] || -3) - (qualityOrder[a.quality] || -3));
  } catch (error) {
    console.error(`[HDHub4u] Scraping error: ${error.message}`);
    return [];
  }
}

module.exports = { getStreams };
