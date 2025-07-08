const undici = require('undici');
const { JSDOM } = require('jsdom');
const crypto = require('crypto');

/**
 * Fetches a random recommended SoundCloud track URL for a given track URL.
 * @param {string} url - The SoundCloud track URL.
 * @returns {Promise<string>} - A recommended track URL.
 */
async function scAutoPlay(url) {
    try {
        const res = await undici.fetch(`${url}/recommended`);
        if (res.status !== 200) {
            throw new Error(`Failed to fetch URL. Status code: ${res.status}`);
        }
        const html = await res.text();
        const dom = new JSDOM(html);
        const document = dom.window.document;
        const secondNoscript = document.querySelectorAll('noscript')[1];
        const sectionElement = secondNoscript.querySelector('section');
        const articleElements = sectionElement.querySelectorAll('article');
        const urls = [];
        articleElements.forEach(articleElement => {
            const h2Element = articleElement.querySelector('h2[itemprop="name"]');
            if (!h2Element) return;
            const aElement = h2Element.querySelector('a[itemprop="url"]');
            if (!aElement) return;
            const href = `https://soundcloud.com${aElement.getAttribute('href')}`;
            urls.push(href);
        });
        if (!urls.length) throw new Error('No recommended tracks found.');
        return urls[Math.floor(Math.random() * urls.length)];
    } catch (err) {
        throw new Error(`scAutoPlay error: ${err.message}`);
    }
}

/**
 * Fetches a random recommended Spotify track ID for a given track ID.
 * @param {string} track_id - The Spotify track ID.
 * @returns {Promise<string>} - A recommended Spotify track ID.
 */
async function spAutoPlay(track_id) {
    try {
        const TOTP_SECRET = new Uint8Array([53,53,48,55,49,52,53,56,53,51,52,56,55,52,57,57,53,57,50,50,52,56,54,51,48,51,50,57,51,52,55]);
        const hmac = crypto.createHmac('sha1', TOTP_SECRET);
        function generateTotp() {
            const counter = Math.floor(Date.now() / 30000);
            const counterBuffer = Buffer.alloc(8);
            counterBuffer.writeBigInt64BE(BigInt(counter));
            hmac.update(counterBuffer);
            const hmacResult = hmac.digest();
            const offset = hmacResult[hmacResult.length - 1] & 15;
            const truncatedValue = 
                ((hmacResult[offset] & 127) << 24) |
                ((hmacResult[offset + 1] & 255) << 16) |
                ((hmacResult[offset + 2] & 255) << 8) |
                (hmacResult[offset + 3] & 255);
            const totp = (truncatedValue % 1000000).toString().padStart(6, '0');
            return [totp, counter * 30000];
        }
        const [totp, timestamp] = generateTotp();
        const params = {
            "reason": "init",
            "productType": "web-player",
            "totp": totp,
            "totpVer": 5,
            "ts": timestamp,
        }
        const data = await undici.fetch("https://open.spotify.com/api/token?" + new URLSearchParams(params).toString());
        const body = await data.json();
        const res = await undici.fetch(`https://api.spotify.com/v1/recommendations?limit=10&seed_tracks=${track_id}`, {
            headers: {
                Authorization: `Bearer ${body.accessToken}`,
                'Content-Type': 'application/json',
            },
        })
        const json = await res.json();
        if (!json.tracks || !json.tracks.length) throw new Error('No recommended tracks found.');
        return json.tracks[Math.floor(Math.random() * json.tracks.length)].id
    } catch (err) {
        throw new Error(`spAutoPlay error: ${err.message}`);
    }
}

/**
 * Fetches a random recommended Apple Music track ID for a given track ID.
 * @param {string} trackId - The Apple Music track ID.
 * @param {string} [storefront='us'] - The Apple Music storefront (e.g., 'us', 'jp').
 * @returns {Promise<string>} - A recommended Apple Music track ID.
 */
async function amAutoPlay(trackId, storefront = 'us') {
    try {
        // Apple Music API: https://api.music.apple.com/v1/catalog/{storefront}/songs/{id}/recommendations
        // This requires a developer token for full access. We'll try public web scraping as fallback.
        const res = await undici.fetch(`https://music.apple.com/${storefront}/album/${trackId}`);
        if (res.status !== 200) throw new Error(`Failed to fetch Apple Music page. Status code: ${res.status}`);
        const html = await res.text();
        const dom = new JSDOM(html);
        const document = dom.window.document;
        // Try to find recommended tracks in the "You Might Also Like" section
        const recSection = Array.from(document.querySelectorAll('section')).find(sec => sec.textContent && sec.textContent.includes('You Might Also Like'));
        if (!recSection) throw new Error('No recommendations section found.');
        const links = Array.from(recSection.querySelectorAll('a[href*="/album/"]'));
        const ids = links.map(a => {
            const match = a.href.match(/\/album\/([a-zA-Z0-9]+)/);
            return match ? match[1] : null;
        }).filter(Boolean);
        if (!ids.length) throw new Error('No recommended Apple Music tracks found.');
        return ids[Math.floor(Math.random() * ids.length)];
    } catch (err) {
        throw new Error(`amAutoPlay error: ${err.message}`);
    }
}

module.exports = { scAutoPlay, spAutoPlay, amAutoPlay };
