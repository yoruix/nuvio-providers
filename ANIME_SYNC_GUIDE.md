# Anime Synchronization Guide (ArmSync)

This document describes the high-fidelity synchronization logic used to match Anime content from TMDB/IMDb to AniList for precise scraping.

## Why this is necessary
Anime seasonal structures vary wildly between platforms. A single "Season 3" on TMDB might be split into three different entries on AniList. Title-based mapping is unreliable without date verification.

## The "ArmSync" Workflow

### Phase 1: Metadata Acquisition (The First Step)
1. **IMDb Resolution**: The very first step is obtaining the **IMDb ID** (`tt...`). 
   - The scraper queries TMDB for the `imdb_id`.
   - **Fallback**: If TMDB lacks an IMDb ID, the **ARM API** (`/themoviedb?id={id}`) is queried to resolve the link.
2. **Target Date & Title**: Using the IMDb ID, the scraper queries **Cinemata** (`https://v3-cinemeta.strem.io/meta/series/{imdbId}.json`) to get the exact `released` date and `name` (title) for the target `season` and `episode`.
   - **Movie Logic**: For movies, the **TMDB Release Date** is prioritized over Cinemata to ensure matching against the original Japanese air date.
3. **Day Index Calculation**: The scraper calculates the **Release Order** of the episode for that specific day (e.g., if two episodes aired on the same day, Episode 15 is index `1`, Episode 16 is index `2`).

### Phase 2: Candidate Resolution
1. **AniList Title Search**: Query the **AniList GraphQL API** using the show's title from TMDB.
2. **Bulk Discovery**: This returns all related AniList entries (TV, OVA, Special, Movie) in a single request.

### Phase 3: Date & Title Validation
1. **Air Date Match**: Compare the episode's `releaseDate` against the `startDate` and `endDate` of every AniList candidate.
   - **Tolerance**: A **2-day grace period** is allowed to account for timezone differences.
2. **Title Tie-Breaker**: If multiple episodes match the same date, the scraper compares the **Cinemata Episode Title** against the **AniList Episode Titles** to pick the correct part.
3. **Database Sync**: The scraper then queries the streaming backend using the verified **AniList ID**.
   - **Token Selection**: Uses **Day Index** first (numerical order) to ensure the correct part is selected for split specials, with **Title Match** as a reliable fallback.

## Required APIs

| API | Purpose | Endpoint |
| :--- | :--- | :--- |
| **TMDB** | Metadata & IMDb ID | `/tv/{id}` |
| **Cinemata** | Air Dates & Indexing | `/meta/series/{id}.json` |
| **ARM** | IMDb ID Fallback | `/api/v2/themoviedb?id={id}` |
| **AniList** | Discovery | `https://graphql.anilist.co` |

## Benefits
- **IMDb-First Foundation**: Ensures reliable air date data from the start.
- **No Manual Mapping**: Bypasses mapping gaps in ARM/IMDb.
- **Movies & Specials Support**: Correctly identifies regional movie releases and Season 0 content.
- **Split Part Support**: Precise resolution via **Day Indexing** and **Title Matching**.
