const undici = require('undici');
const { JSDOM } = require('jsdom');
const crypto = require('crypto');
const https = require('https');

// Configurable options
const DEFAULT_MARKET = 'US';
const MAX_SC_TRACKS = 40;
const LOGGING_ENABLED = process.env.DEBUG_AUTOPLAY === '1';

/**
 * Internal logging utility
 */
function log(...args) {
    if (LOGGING_ENABLED) console.log('[autoPlay]', ...args);
}

// --- SoundCloud ---
/**
 * Fetches a random recommended SoundCloud track URL.
 * @param {string} url - The base SoundCloud user/profile URL.
 * @param {object} [opts]
 * @param {number} [opts.maxTracks=40] - Max tracks to consider.
 * @returns {Promise<string|null>} Track URL or null if not found.
 */
async function scAutoPlay(url, { maxTracks = MAX_SC_TRACKS } = {}) {
    try {
        const res = await undici.fetch(`${url}/recommended`);
        if (res.status !== 200) {
            log('SoundCloud fetch failed', res.status);
            return null;
        }
        const html = await res.text();
        const dom = new JSDOM(html);
        const document = dom.window.document;
        let trackLinks = [];
        // Try to find links using robust selectors
        try {
            const secondNoscript = document.querySelectorAll('noscript')[1];
            if (secondNoscript) {
                const sectionElement = secondNoscript.querySelector('section');
                if (sectionElement) {
                    const articleElements = sectionElement.querySelectorAll('article');
                    articleElements.forEach(articleElement => {
                        const h2Element = articleElement.querySelector('h2[itemprop="name"]');
                        if (h2Element) {
                            const aElement = h2Element.querySelector('a[itemprop="url"]');
                            if (aElement) {
                                const href = aElement.getAttribute('href');
                                if (href) {
                                    trackLinks.push(`https://soundcloud.com${href}`);
                                }
                            }
                        }
                    });
                }
            }
        } catch (e) {
            log('SoundCloud DOM parse error', e);
        }
        // Fallback: try regex if DOM fails
        if (trackLinks.length === 0) {
            const regex = /<a\s+itemprop="url"\s+href="(\/[^\"]+)"/g;
            let match;
            while ((match = regex.exec(html)) !== null) {
                trackLinks.push(`https://soundcloud.com${match[1]}`);
                if (trackLinks.length >= maxTracks) break;
            }
        }
        if (trackLinks.length === 0) {
            log('No SoundCloud tracks found');
            return null;
        }
        return trackLinks[Math.floor(Math.random() * trackLinks.length)];
    } catch (err) {
        log('scAutoPlay error', err);
        return null;
    }
}

// --- Spotify ---
let spotifyTokenCache = { token: null, expires: 0 };
/**
 * Fetches a Spotify access token, caching until expiry.
 * @returns {Promise<string>} Access token
 */
async function getSpotifyAccessTokenCached() {
    if (spotifyTokenCache.token && Date.now() < spotifyTokenCache.expires) {
        return spotifyTokenCache.token;
    }
    const clientId = process.env.SPOTIFY_CLIENT_ID || 'ab6373a74cbe461386fdee1d6f276b67';
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET || 'eb2843351b3d45b49e6e1d043364f3f2';
    if (!clientId || !clientSecret) {
        throw new Error('Spotify Client ID or Secret not found in environment variables.');
    }
    const response = await undici.fetch("https://accounts.spotify.com/api/token", {
        method: 'POST',
        headers: {
            'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    });
    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Failed to get Spotify access token. Status: ${response.status}. Body: ${errorBody}`);
    }
    const data = await response.json();
    // Cache for 50 minutes (token is valid for 1 hour)
    spotifyTokenCache = {
        token: data.access_token,
        expires: Date.now() + 50 * 60 * 1000
    };
    return data.access_token;
}

/**
 * Fetches a random recommended Spotify track ID using related artists and their top tracks.
 * @param {string} track_id - The starting Spotify track ID.
 * @param {object} [opts]
 * @param {string} [opts.market=DEFAULT_MARKET] - Market code.
 * @returns {Promise<string|null>} Track ID or null if not found.
 */
async function spAutoPlay(track_id, { market = DEFAULT_MARKET } = {}) {
    try {
        const accessToken = await getSpotifyAccessTokenCached();
        const authHeaders = { Authorization: `Bearer ${accessToken}` };
        const trackDetailsResponse = await undici.fetch(`https://api.spotify.com/v1/tracks/${track_id}`, {
            headers: authHeaders,
        });
        if (!trackDetailsResponse.ok) {
            log(`Failed to fetch track details for ${track_id}`, trackDetailsResponse.status);
            return null;
        }
        const trackDetails = await trackDetailsResponse.json();
        if (!trackDetails.artists || trackDetails.artists.length === 0) {
            log(`No artists found for input track ${track_id}`);
            return null;
        }
        const primaryArtistId = trackDetails.artists[0].id;
        let artistToQueryId = primaryArtistId;
        // Try to get a related artist
        const relatedArtistsResponse = await undici.fetch(`https://api.spotify.com/v1/artists/${primaryArtistId}/related-artists`, {
            headers: authHeaders,
        });
        if (relatedArtistsResponse.ok) {
            const relatedArtistsData = await relatedArtistsResponse.json().catch(() => null);
            if (relatedArtistsData && relatedArtistsData.artists && relatedArtistsData.artists.length > 0) {
                artistToQueryId = relatedArtistsData.artists[Math.floor(Math.random() * relatedArtistsData.artists.length)].id;
            }
        }
        // Get top tracks for the chosen artist
        let topTracksResponse = await undici.fetch(`https://api.spotify.com/v1/artists/${artistToQueryId}/top-tracks?market=${market}`, {
            headers: authHeaders,
        });
        if (!topTracksResponse.ok && artistToQueryId !== primaryArtistId) {
            // Fallback to primary artist
            topTracksResponse = await undici.fetch(`https://api.spotify.com/v1/artists/${primaryArtistId}/top-tracks?market=${market}`, {
                headers: authHeaders,
            });
            artistToQueryId = primaryArtistId;
        }
        if (!topTracksResponse.ok) {
            log(`Failed to fetch top tracks for artist ${artistToQueryId}`, topTracksResponse.status);
            return null;
        }
        const topTracksData = await topTracksResponse.json();
        if (!topTracksData.tracks || topTracksData.tracks.length === 0) {
            log(`No top tracks found for artist ${artistToQueryId} in market ${market}`);
            return null;
        }
        return topTracksData.tracks[Math.floor(Math.random() * topTracksData.tracks.length)].id;
    } catch (err) {
        log('spAutoPlay error', err);
        return null;
    }
}

/**
 * Fetches a random popular Apple Music track using the Apple Music RSS feeds (public, no auth required).
 * @param {object} [opts]
 * @param {string} [opts.country='us'] - Country code for the Apple Music store.
 * @param {string} [opts.chartType='most-played'] - Chart type (e.g., 'most-played', 'new-releases').
 * @param {object} [opts.originalTrack] - Optional original track object to use for fallbacks.
 * @returns {Promise<object|null>} Track info object or null if not found.
 */
async function amAutoPlay({ country = 'us', chartType = 'most-played', originalTrack = null } = {}) {
    try {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; AppleMusicAutoplay/1.0; +https://apple.com)'
            }
        };
        function fetchWithRedirects(url, options, maxRedirects = 3) {
            return new Promise((resolve, reject) => {
                let redirects = 0;
                function request(u) {
                    const req = require('https').get(u, options, (res) => {
                        if ([301, 302].includes(res.statusCode) && res.headers.location && redirects < maxRedirects) {
                            log('Apple Music RSS redirect to:', res.headers.location);
                            redirects++;
                            request(res.headers.location);
                            return;
                        }
                        if (res.statusCode !== 200) {
                            log('Apple Music RSS fetch failed', res.statusCode);
                            resolve(null);
                            return;
                        }
                        let rawData = '';
                        res.on('data', (chunk) => { rawData += chunk; });
                        res.on('end', () => {
                            try {
                                resolve(JSON.parse(rawData));
                            } catch (e) {
                                resolve(null);
                            }
                        });
                    });
                    req.on('error', reject);
                }
                request(url);
            });
        }
        // Helper to pick a random track from a feed
        function pickRandomTrack(feed) {
            if (!feed || !feed.feed || !feed.feed.results || feed.feed.results.length === 0) return null;
            return feed.feed.results[Math.floor(Math.random() * feed.feed.results.length)];
        }
        // 1. Try all genres of the original track in the original country
        let genres = (originalTrack && originalTrack.genres) ? originalTrack.genres.filter(g => g.name && g.name.toLowerCase() !== 'music') : [];
        let artistName = originalTrack && originalTrack.artistName;
        let origCountry = country;
        let foundTrack = null;
        for (const genre of genres) {
            if (genre && genre.genreId) {
                const genreUrl = `https://rss.applemarketingtools.com/api/v2/${encodeURIComponent(origCountry)}/music/${encodeURIComponent(chartType)}/50/${encodeURIComponent(genre.genreId)}.json`;
                log('Apple Music genre RSS fetch URL:', genreUrl);
                let genreFeed = await fetchWithRedirects(genreUrl, options);
                foundTrack = pickRandomTrack(genreFeed);
                if (foundTrack) {
                    log('Apple Music genre chart used:', genre.name);
                    break;
                } else {
                    log(`Apple Music genre RSS tracks not found for genreId ${genre.genreId}`);
                }
            }
        }
        // 2. Try the main chart in the original country
        if (!foundTrack) {
            const mainChartUrl = `https://rss.applemarketingtools.com/api/v2/${encodeURIComponent(origCountry)}/music/${encodeURIComponent(chartType)}/50/songs.json`;
            log('Apple Music main chart fetch URL:', mainChartUrl);
            let mainFeed = await fetchWithRedirects(mainChartUrl, options);
            foundTrack = pickRandomTrack(mainFeed);
            if (foundTrack) log('Apple Music main chart used (original country)');
        }
        // 3. Try pop genre in the original country
        if (!foundTrack) {
            const popGenreId = '14';
            const popGenreUrl = `https://rss.applemarketingtools.com/api/v2/${encodeURIComponent(origCountry)}/music/${encodeURIComponent(chartType)}/50/${popGenreId}.json`;
            log('Apple Music pop genre RSS fetch URL:', popGenreUrl);
            let popFeed = await fetchWithRedirects(popGenreUrl, options);
            foundTrack = pickRandomTrack(popFeed);
            if (foundTrack) log('Apple Music pop genre chart used (original country)');
        }
        // 4. If KPOP/JPOP, try Korean/Japanese main chart
        const isKpop = genres.some(g => /k[- ]?pop/i.test(g.name));
        const isJpop = genres.some(g => /j[- ]?pop/i.test(g.name));
        if (!foundTrack && isKpop) {
            const krChartUrl = 'https://rss.applemarketingtools.com/api/v2/kr/music/most-played/50/songs.json';
            log('Apple Music KPOP fallback: using Korean main chart', krChartUrl);
            let krFeed = await fetchWithRedirects(krChartUrl, options);
            foundTrack = pickRandomTrack(krFeed);
            if (foundTrack) log('Apple Music Korean main chart used for KPOP fallback');
        }
        if (!foundTrack && isJpop) {
            const jpChartUrl = 'https://rss.applemarketingtools.com/api/v2/jp/music/most-played/50/songs.json';
            log('Apple Music JPOP fallback: using Japanese main chart', jpChartUrl);
            let jpFeed = await fetchWithRedirects(jpChartUrl, options);
            foundTrack = pickRandomTrack(jpFeed);
            if (foundTrack) log('Apple Music Japanese main chart used for JPOP fallback');
        }
        // 5. Try the US main chart as a last resort
        if (!foundTrack && origCountry.toLowerCase() !== 'us') {
            const usChartUrl = 'https://rss.applemarketingtools.com/api/v2/us/music/most-played/50/songs.json';
            log('Apple Music US main chart fallback', usChartUrl);
            let usFeed = await fetchWithRedirects(usChartUrl, options);
            foundTrack = pickRandomTrack(usFeed);
            if (foundTrack) log('Apple Music US main chart used as last resort');
        }
        // If still nothing, return null
        if (!foundTrack) {
            log('Apple Music fallback: no tracks found in any chart');
            return null;
        }
        // Return track info
        return {
            name: foundTrack.name,
            artistName: foundTrack.artistName,
            url: foundTrack.url,
            artworkUrl100: foundTrack.artworkUrl100,
            genres: foundTrack.genres,
        };
    } catch (e) {
        log('Apple Music RSS error', e);
        return null;
    }
}

module.exports = { 
    scAutoPlay, 
    spAutoPlay, 
    amAutoPlay 
};