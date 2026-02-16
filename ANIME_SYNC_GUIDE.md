# Anime Synchronization Guide (ArmSync)

This document describes the high-fidelity synchronization logic used to match Anime content from TMDB/IMDb to AniList for precise scraping.

## Why this is necessary
Anime seasonal structures vary wildly between platforms. A single "Season 3" on TMDB might be split into three different entries on AniList. Title-based mapping is unreliable without date verification.

## The "ArmSync" Workflow

### Phase 1: Metadata Acquisition
1. **Target Date & Title**: Query **Cinemata** (`https://v3-cinemeta.strem.io/meta/series/{imdbId}.json`) to get the exact `released` date and `name` (title) for the target `season` and `episode`.
   - **ID Fallback**: If TMDB lacks an IMDb ID, the **ARM API** (`/themoviedb?id={id}`) is queried to resolve the IMDb link first.

### Phase 2: Candidate Resolution
1. **AniList Title Search**: Query the **AniList GraphQL API** using the show's title from TMDB.
2. **Bulk Discovery**: This returns all related AniList entries (TV, OVA, Special, Movie) in a single request.

### Phase 3: Date & Title Validation
1. **Air Date Match**: Compare the episode's `releaseDate` against the `startDate` and `endDate` of every AniList candidate.
   - **Tolerance**: A **2-day grace period** is allowed to account for timezone differences.
2. **Title Tie-Breaker**: If multiple episodes match the same date, the scraper compares the **Cinemata Episode Title** against the **AniList Episode Titles** to pick the correct part.
3. **Database Sync**: The scraper then queries the streaming backend using the verified **AniList ID**.

## Required APIs

| API | Purpose | Endpoint |
| :--- | :--- | :--- |
| **TMDB** | Metadata | `/tv/{id}` |
| **Cinemata** | Air Dates | `/meta/series/{id}.json` |
| **ARM** | ID Fallback | `/api/v2/themoviedb?id={id}` |
| **AniList** | Discovery | `https://graphql.anilist.co` |

## Reference Implementation (Logic)

1. **Phase 1**: Get `TargetDate` + `TargetTitle` from Cinemata.
2. **Phase 2**: `Candidates = SearchAniList(ShowName)`.
3. **Phase 3**: `Match = Candidates.Find(c => IsDateInRange(TargetDate, c.Aired) && MatchTitle(TargetTitle, c.Title))`.

## Benefits
- **No Manual Mapping**: Bypasses mapping gaps in ARM/IMDb.
- **Specials Support**: Correctly identifies Season 0 content by searching across all production formats.
- **Split Part Support**: Handles episodes split into "Special 1" and "Special 2" via title matching.
