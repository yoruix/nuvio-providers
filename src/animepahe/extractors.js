import { fetchText } from './utils.js';
import { HEADERS } from './constants.js';

// JavaScript port of the Packer (p,a,c,k,e,d) unpacker
export function unpack(code) {
    try {
        // More robust regex to find the 4 arguments: p, a, c, k
        const match = code.match(/}\((['"])([\s\S]*?)\1,\s*(\d+),\s*(\d+),\s*(['"])([\s\S]*?)\5\.split\((['"])\|\7\)/);
        
        if (match) {
            let [_, quote1, p, a, c, quote2, kStr] = match;
            
            // UNESCAPE p - This is critical because it often contains \' instead of '
            p = p.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            
            a = parseInt(a);
            c = parseInt(c);
            const k = kStr.split('|');
            const e = (c) => (c < a ? '' : e(parseInt(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
            
            const d = {};
            while (c--) d[e(c)] = k[c] || e(c);
            
            return p.replace(/\b\w+\b/g, (w) => d[w]);
        }
    } catch (e) {
        console.error('[AnimePahe] Unpack error:', e.message);
    }
    return code;
}

export async function extractKwik(url) {
    try {
        // Fetch the kwik page directly (no proxy as it blocks kwik)
        // Referer must be the URL itself as per Kotlin code: app.get(url, referer=url)
        const html = await fetchText(url, { 
            headers: { 
                ...HEADERS, 
                "Referer": url,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            },
            useProxy: false 
        });
        
        // Find all script tags
        const scripts = html.match(/<script.*?>([\s\S]*?)<\/script>/g) || [];
        const matches = [];
        
        for (const script of scripts) {
            if (script.includes('eval(function(p,a,c,k,e,d)')) {
                let pos = 0;
                while (true) {
                    const start = script.indexOf('eval(function(p,a,c,k,e,d)', pos);
                    if (start === -1) break;
                    
                    const end = script.indexOf('.split(\'|\')', start);
                    if (end === -1) break;
                    
                    const closeParen = script.indexOf('))', end);
                    if (closeParen === -1) break;
                    
                    matches.push(script.substring(start, closeParen + 2));
                    pos = closeParen + 2;
                }
            }
        }
        
        for (const scriptContent of matches) {
            const unpacked = unpack(scriptContent);
            
            // Regex to find the source URL - more lenient now
            const urlMatch = unpacked.match(/source\s*=\s*['"](https?:\/\/.*?)['"]/) || 
                             unpacked.match(/const\s+source\s*=\s*['"](https?:\/\/.*?)['"]/) ||
                             unpacked.match(/var\s+source\s*=\s*['"](https?:\/\/.*?)['"]/) ||
                             unpacked.match(/src\s*:\s*['"](https?:\/\/.*?)['"]/);
            
            if (urlMatch) {
                return {
                    url: urlMatch[1],
                    headers: {
                        "Referer": "https://kwik.cx/",
                        "Origin": "https://kwik.cx",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                    }
                };
            }
        }
    } catch (e) {
        console.error('[AnimePahe] Kwik extraction failed:', e.message);
    }
    return null;
}

// Custom decryption for Pahe extractor
function paheDecrypt(fullString, key, v1, v2) {
    const keyIndexMap = {};
    for (let i = 0; i < key.length; i++) keyIndexMap[key[i]] = i;
    
    let result = "";
    let i = 0;
    const toFind = key[v2];

    while (i < fullString.length) {
        const nextIndex = fullString.indexOf(toFind, i);
        if (nextIndex === -1) break;
        
        let decodedCharStr = "";
        for (let j = i; j < nextIndex; j++) {
            decodedCharStr += keyIndexMap[fullString[j]];
        }

        i = nextIndex + 1;
        const decodedChar = String.fromCharCode(parseInt(decodedCharStr, v2) - v1);
        result += decodedChar;
    }

    return result;
}

export async function extractPahe(url) {
    // Porting the complex 302 redirect logic is hard in some JS environments 
    // because fetch might auto-follow. We'll attempt a direct approach first.
    try {
        // Pahe logic in Kotlin involves getting /i first
        const initUrl = url.endsWith('/i') ? url : `${url}/i`;
        const html = await fetchText(initUrl, { headers: { ...HEADERS, Referer: 'https://pahe.win/' } });
        
        const kwikParamsRegex = /\("(\w+)",\d+,"(\w+)",(\d+),(\d+),\d+\)/;
        const match = html.match(kwikParamsRegex);
        
        if (match) {
            const [_, fullString, key, v1, v2] = match;
            const decrypted = paheDecrypt(fullString, key, parseInt(v1), parseInt(v2));
            
            const actionMatch = decrypted.match(/action="([^"]+)"/);
            const tokenMatch = decrypted.match(/value="([^"]+)"/);
            
            if (actionMatch && tokenMatch) {
                // This would usually be a POST that returns a 302
                // For now, we'll return null and focus on Kwik which provides M3U8
                console.log('[AnimePahe] Pahe extractor (MP4) requires 302 handling');
            }
        }
    } catch (e) {
        // ignore
    }
    return null;
}
