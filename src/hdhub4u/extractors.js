import cheerio from 'cheerio-without-node-native';
import CryptoJS from 'crypto-js';
import { HEADERS, MAIN_URL } from './constants.js';
import { atob, rot13, cleanTitle } from './utils.js';

export async function getRedirectLinks(url) {
  try {
    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    const doc = await response.text();
    
    const regex = /s\s*\(\s*['"]o['"]\s*,\s*['"]([A-Za-z0-9+/=]+)['"]|ck\s*\(\s*['"]_wp_http_\d+['"]\s*,\s*['"]([^'"]+)['"]/g;
    let combinedString = "";
    let match;
    while ((match = regex.exec(doc)) !== null) {
      const extractedValue = match[1] || match[2];
      if (extractedValue) combinedString += extractedValue;
    }
    
    if (!combinedString) {
      const redirectMatch = doc.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
      if (redirectMatch && redirectMatch[1]) {
          const newUrl = redirectMatch[1];
          if (newUrl !== url && !newUrl.includes(url)) {
              return await getRedirectLinks(newUrl);
          }
      }
      return null;
    }
    
    const decodedString = atob(rot13(atob(atob(combinedString))));
    const jsonObject = JSON.parse(decodedString);
    const encodedUrl = atob(jsonObject.o || "").trim();
    if (encodedUrl) return encodedUrl;
    
    const data = atob(jsonObject.data || "").trim();
    const wpHttp = (jsonObject.blog_url || "").trim();
    if (wpHttp && data) {
      const directLinkResponse = await fetch(`${wpHttp}?re=${data}`, { headers: HEADERS });
      const html = await directLinkResponse.text();
      const $ = cheerio.load(html);
      return ($("body").text() || html).trim();
    }
    return null;
  } catch (e) {
    return null;
  }
}

export async function vidStackExtractor(url) {
    try {
        const hash = url.split('#').pop().split('/').pop();
        const baseUrl = new URL(url).origin;
        const apiUrl = `${baseUrl}/api/v1/video?id=${hash}`;
        
        const response = await fetch(apiUrl, { headers: { ...HEADERS, Referer: url } });
        const encoded = (await response.text()).trim();
        
        const key = CryptoJS.enc.Utf8.parse("kiemtienmua911ca");
        const ivs = ["1234567890oiuytr", "0123456789abcdef"];
        
        for (const ivStr of ivs) {
            try {
                const iv = CryptoJS.enc.Utf8.parse(ivStr);
                const decrypted = CryptoJS.AES.decrypt(
                    { ciphertext: CryptoJS.enc.Hex.parse(encoded) },
                    key,
                    { iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
                );
                const decryptedText = decrypted.toString(CryptoJS.enc.Utf8);
                if (decryptedText && decryptedText.includes("source")) {
                    const m3u8 = decryptedText.match(/"source":"(.*?)"/)?.[1]?.replace(/\\/g, '');
                    if (m3u8) {
                        return [{ 
                            source: "Vidstack Hubstream", 
                            quality: "M3U8", 
                            url: m3u8.replace("https:", "http:"),
                            headers: {
                                "Referer": url,
                                "Origin": url.split('/').pop()
                            }
                        }];
                    }
                }
            } catch (e) {}
        }
        return [];
    } catch (e) { return []; }
}

export async function hbLinksExtractor(url) {
    try {
        const response = await fetch(url, { headers: { ...HEADERS, Referer: url } });
        const data = await response.text();
        const $ = cheerio.load(data);
        const links = $("h3 a, h5 a, div.entry-content p a").map((i, el) => $(el).attr("href")).get();
        const results = await Promise.all(links.map(l => loadExtractor(l, url)));
        return results.flat().map(link => ({
            ...link,
            source: `${link.source} Hblinks`
        }));
    } catch (e) { return []; }
}

export async function pixelDrainExtractor(link) {
  try {
    const urlObj = new URL(link);
    const baseUrl = `${urlObj.protocol}//${urlObj.hostname}`;
    const fileId = link.match(/(?:file|u)\/([A-Za-z0-9]+)/)?.[1] || link.split("/").pop();
    if (!fileId) return [{ source: "Pixeldrain", quality: 0, url: link }];
    
    const finalUrl = link.includes("?download") ? link : `${baseUrl}/api/file/${fileId}?download`;
    return [{ source: "Pixeldrain", quality: 0, url: finalUrl }];
  } catch (e) {
    return [{ source: "Pixeldrain", quality: 0, url: link }];
  }
}

export async function streamTapeExtractor(link) {
  try {
    const url = new URL(link);
    url.hostname = "streamtape.com";
    const res = await fetch(url.toString(), { headers: HEADERS });
    const data = await res.text();
    let videoSrc = data.match(/document\.getElementById\('videolink'\)\.innerHTML = (.*?);/)?.[1]
                   ?.match(/'(\/\/streamtape\.com\/get_video[^']+)'/)?.[1];
    
    if (!videoSrc) {
        videoSrc = data.match(/'(\/\/streamtape\.com\/get_video[^']+)'/)?.[1];
    }
    
    return videoSrc ? [{ source: "StreamTape", quality: 720, url: "https:" + videoSrc }] : [];
  } catch (e) { return []; }
}

export async function hubCloudExtractor(url, referer) {
  try {
    let currentUrl = url.replace("hubcloud.ink", "hubcloud.dad");
    const pageResponse = await fetch(currentUrl, { headers: { ...HEADERS, Referer: referer } });
    let pageData = await pageResponse.text();
    let finalUrl = currentUrl;
    
    if (!currentUrl.includes("hubcloud.php")) {
      let nextHref = "";
      const $first = cheerio.load(pageData);
      const downloadBtn = $first("#download");
      if (downloadBtn.length) {
          nextHref = downloadBtn.attr("href");
      } else {
          const scriptUrlMatch = pageData.match(/var url = '([^']*)'/);
          if (scriptUrlMatch) nextHref = scriptUrlMatch[1];
      }

      if (nextHref) {
          if (!nextHref.startsWith("http")) {
              const urlObj = new URL(currentUrl);
              nextHref = `${urlObj.protocol}//${urlObj.hostname}/${nextHref.replace(/^\//, "")}`;
          }
          finalUrl = nextHref;
          const secondResponse = await fetch(finalUrl, { headers: { ...HEADERS, Referer: currentUrl } });
          pageData = await secondResponse.text();
      }
    }
    
    const $ = cheerio.load(pageData);
    const size = $("i#size").text().trim();
    const header = $("div.card-header").text().trim();
    const qualityStr = header.match(/(\d{3,4})[pP]/)?.[1];
    const quality = qualityStr ? parseInt(qualityStr) : 1080;
    const headerDetails = cleanTitle(header);
    const labelExtras = (headerDetails ? `[${headerDetails}]` : "") + (size ? `[${size}]` : "");
    const sizeInBytes = (() => {
      const sizeMatch = size.match(/([\d.]+)\s*(GB|MB|KB)/i);
      if (!sizeMatch) return 0;
      const multipliers = { GB: 1024**3, MB: 1024**2, KB: 1024 };
      return parseFloat(sizeMatch[1]) * (multipliers[sizeMatch[2].toUpperCase()] || 0);
    })();
    
    const links = [];
    const elements = $("a.btn").get();
    for (const element of elements) {
      const link = $(element).attr("href");
      const text = $(element).text().toLowerCase();
      const fileName = header || headerDetails || "Unknown";
      
      if (text.includes("download file") || text.includes("fsl server") || text.includes("s3 server") || text.includes("fslv2") || text.includes("mega server")) {
        let label = "HubCloud";
        if (text.includes("fsl server")) label = "HubCloud - FSL";
        else if (text.includes("s3 server")) label = "HubCloud - S3";
        else if (text.includes("fslv2")) label = "HubCloud - FSLv2";
        else if (text.includes("mega server")) label = "HubCloud - Mega";
        
        links.push({ source: `${label} ${labelExtras}`, quality, url: link, size: sizeInBytes, fileName });
      } else if (text.includes("buzzserver")) {
        try {
          const buzzResp = await fetch(`${link}/download`, { method: "GET", headers: { ...HEADERS, Referer: link } });
          if (buzzResp.url && buzzResp.url !== `${link}/download`) {
            links.push({ source: `HubCloud - BuzzServer ${labelExtras}`, quality, url: buzzResp.url, size: sizeInBytes, fileName });
          }
        } catch (e) {}
      } else if (text.includes("10gbps")) {
          try {
              const resp = await fetch(link, { method: "GET", redirect: "manual" });
              const loc = resp.headers.get("location");
              if (loc && loc.includes("link=")) {
                  const dlink = loc.substring(loc.indexOf("link=") + 5);
                  links.push({ source: `HubCloud - 10Gbps ${labelExtras}`, quality, url: dlink, size: sizeInBytes, fileName });
              }
          } catch (e) {}
      } else if (link && link.includes("pixeldra")) {
        const results = await pixelDrainExtractor(link);
        links.push(...results.map(l => ({ ...l, source: `${l.source} ${labelExtras}`, size: sizeInBytes, fileName })));
      } else if (link && !link.includes("magnet:") && link.startsWith("http")) {
        const extracted = await loadExtractor(link, finalUrl);
        links.push(...extracted.map(l => ({ ...l, quality: l.quality || quality })));
      }
    }
    return links;
  } catch (e) { return []; }
}

export async function hubCdnExtractor(url, referer) {
  try {
    const response = await fetch(url, { headers: { ...HEADERS, Referer: referer } });
    const data = await response.text();
    
    const encoded = data.match(/r=([A-Za-z0-9+/=]+)/)?.[1];
    if (encoded) {
      const m3u8Link = atob(encoded).substring(atob(encoded).lastIndexOf("link=") + 5);
      return [{ source: "HubCdn", quality: 1080, url: m3u8Link }];
    }
    
    const scriptEncoded = data.match(/reurl\s*=\s*["']([^"']+)["']/)?.[1];
    if (scriptEncoded) {
        const queryPart = scriptEncoded.split('?r=').pop();
        const m3u8Link = atob(queryPart).substring(atob(queryPart).lastIndexOf("link=") + 5);
        return [{ source: "HubCdn", quality: 1080, url: m3u8Link }];
    }
    
    return [];
  } catch (e) { return []; }
}

export async function loadExtractor(url, referer = MAIN_URL) {
  try {
    const hostname = new URL(url).hostname;
    const isRedirect = url.includes("?id=") || 
                       hostname.includes("techyboy4u") || 
                       hostname.includes("gadgetsweb.xyz") || 
                       hostname.includes("cryptoinsights.site") ||
                       hostname.includes("bloggingvector") ||
                       hostname.includes("ampproject.org");

    if (isRedirect) {
      const finalLink = await getRedirectLinks(url);
      if (finalLink && finalLink !== url) return await loadExtractor(finalLink, url);
      return [];
    }
    
    if (hostname.includes("hubcloud")) return await hubCloudExtractor(url, referer);
    if (hostname.includes("hubcdn")) return await hubCdnExtractor(url, referer);
    if (hostname.includes("hblinks") || hostname.includes("hubstream.dad")) return await hbLinksExtractor(url);
    if (hostname.includes("hubstream") || hostname.includes("vidstack")) return await vidStackExtractor(url);
    if (hostname.includes("pixeldrain")) return await pixelDrainExtractor(url);
    if (hostname.includes("streamtape")) return await streamTapeExtractor(url);
    if (hostname.includes("hdstream4u")) return [{ source: "HdStream4u", quality: 1080, url }];
    
    if (hostname.includes("hubdrive")) {
        const res = await fetch(url, { headers: { ...HEADERS, Referer: referer } });
        const data = await res.text();
        const href = cheerio.load(data)(".btn.btn-primary.btn-user.btn-success1.m-1").attr("href");
        if (href) return await loadExtractor(href, url);
    }
    
    return [];
  } catch (e) { return []; }
}
