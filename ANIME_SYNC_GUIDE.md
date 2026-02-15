# Anime Synchronization Guide (ArmSync)

This document describes the high-fidelity synchronization logic used to match Anime content from TMDB/IMDb to MyAnimeList (MAL) for precise scraping.

## Why this is necessary
Anime seasonal structures vary wildly between platforms. A single "Season 3" on TMDB might be split into three different entries on MyAnimeList. Title-based matching is unreliable for these cases.

## The "ArmSync" Workflow

### Phase 1: Metadata Acquisition
1. **TMDB -> IMDb**: Resolve the TMDB ID to an IMDb ID (`tt...`) using the TMDB `/external_ids` endpoint. 
   - **Fallback**: If TMDB returns no IMDb ID, query the **ARM API** (`https://arm.haglund.dev/api/v2/themoviedb?id={tmdbId}`) and extract the `imdb` field from the first matching entry.
2. **IMDb -> Air Date**: Query **Cinemata** (`https://v3-cinemeta.strem.io/meta/series/{imdbId}.json`) to get the exact `released` date for the target `season` and `episode`.

### Phase 2: Candidate Resolution
1. **ARM Lookup**: Use the **ARM API** (`https://arm.haglund.dev/api/v2/imdb?id={imdbId}`) to get a list of MyAnimeList (MAL) ID candidates.

### Phase 3: Date-Based Validation
1. **Jikan Filtering**: For each MAL ID candidate, fetch its details from **Jikan** (`https://api.jikan.moe/v4/anime/{malId}`).
2. **Range Check**: Compare the episode's `releaseDate` against the MAL entry's `aired.from` and `aired.to` dates.
3. **Episode Mapping**: Once the correct MAL ID is found, fetch its episode list (`/anime/{malId}/episodes`) and find the absolute episode number that matches the air date (within a 2-day tolerance for timezones).

## Required APIs

| API | Purpose | Endpoint |
| :--- | :--- | :--- |
| **TMDB** | ID Mapping | TV: `/tv/{id}/external_ids` <br> Movie: `/movie/{id}` |
| **Cinemata** | Air Dates | Series: `/meta/series/{id}.json` <br> Movie: `/meta/movie/{id}.json` |
| **ARM** | ID Cross-Ref | `/api/v2/imdb?id={imdbId}` |
| **Jikan** | MAL Data | `/v4/anime/{malId}` |

## Handling Movies vs. Series

### Series Logic
For series, you must match the `releaseDate` against the MAL entry's date range, then fetch the `/episodes` list to find the absolute episode number that corresponds to that date.

### Movie & Single-EP Logic
If the Jikan response indicates `type: "Movie"` or `episodes: 1`, you can skip the episode list check.
- **MAL ID**: Use the matched candidate.
- **Episode Number**: Always assume `1`.

## Reference Implementation (JS)

```javascript
// 1. Get Air Date from Cinemata
async function getAirDate(imdbId, season, episode) {
    const res = await fetch(`https://v3-cinemeta.strem.io/meta/series/${imdbId}.json`);
    const data = await res.json();
    const video = data.meta.videos.find(v => v.season == season && v.episode == episode);
    return video ? video.released.split('T')[0] : null;
}

// 2. Resolve via ARM & Jikan
async function resolveMAL(imdbId, releaseDate) {
    const armRes = await fetch(`https://arm.haglund.dev/api/v2/imdb?id=${imdbId}`);
    const malIds = (await armRes.json()).map(e => e.myanimelist).filter(Boolean);

    for (const malId of malIds) {
        const jikanRes = await fetch(`https://api.jikan.moe/v4/anime/${malId}`);
        const anime = (await jikanRes.json()).data;
        
        // Match logic: releaseDate must be between anime.aired.from and anime.aired.to
        if (isDateInRange(releaseDate, anime.aired)) {
            // Movies/Single-EPs don't need episode list checks
            if (anime.type === "Movie" || anime.episodes === 1) {
                return { malId, episode: 1 };
            }

            const epsRes = await fetch(`https://api.jikan.moe/v4/anime/${malId}/episodes`);
            const episodes = (await epsRes.json()).data;
            const match = episodes.find(ep => isSameDay(ep.aired, releaseDate));
            if (match) return { malId, episode: match.mal_id };
        }
    }
}
```

## Benefits
- **No Manual Mapping**: Works automatically for new releases.
- **Handles "Parts"**: Correcty identifies "Season 1 Part 2" vs "Season 2".
- **Absolute Numbering**: Automatically converts TMDB S2E5 to MAL Episode 30 (or whatever is correct).
