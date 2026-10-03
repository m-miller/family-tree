'use strict';

/**
 * Looking up a place name's coordinates, through OpenStreetMap's Nominatim.
 *
 * Their usage policy asks for no more than one request a second and a real
 * User-Agent naming the application, so requests are queued and spaced, and
 * every answer is kept in the database - the same place is never asked for
 * twice.
 *
 * Results are suggestions only. The typed place name is never overwritten:
 * these names are historical ("Kürhessen", "Prussia") and often have no
 * modern match, so the coordinates are accepted by hand, one at a time.
 */

const db = require('./db');

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const AGENT = process.env.NOMINATIM_AGENT
	|| 'MillerFamilyTree/1.0 (https://miller-family-tree.com)';
const GAP_MS = 1100;          // their policy is one request a second
const CACHE_DAYS = 365;

let lastRequest = 0;
let queue = Promise.resolve();

/** Run the work, never less than GAP_MS after the previous request. */
function spaced(work) {
	queue = queue.then(async () => {
		const wait = Math.max(0, lastRequest + GAP_MS - Date.now());
		if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
		lastRequest = Date.now();
		return work();
	}).catch((err) => {
		lastRequest = Date.now();
		throw err;
	});
	return queue;
}

async function cached(query) {
	const row = await db.one(
		`SELECT results FROM place_lookups
		 WHERE query = $1 AND fetched_at > now() - ($2 || ' days')::interval`,
		[query, CACHE_DAYS]);
	return row ? row.results : null;
}

async function remember(query, results) {
	await db.query(
		`INSERT INTO place_lookups (query, results, fetched_at) VALUES ($1, $2, now())
		 ON CONFLICT (query) DO UPDATE SET results = $2, fetched_at = now()`,
		[query, JSON.stringify(results)]);
}

/**
 * Candidate places for a name. Returns [] rather than throwing when the
 * service is unreachable - a lookup failing should not stop you editing.
 */
async function lookup(name, fetchImpl = global.fetch) {
	const query = String(name || '').trim();
	if (query.length < 3) return [];

	const known = await cached(query);
	if (known) return known;

	const url = ENDPOINT + '?format=jsonv2&limit=5&addressdetails=1&q='
		+ encodeURIComponent(query);

	let results = [];
	try {
		const response = await spaced(() => fetchImpl(url, {
			headers: { 'User-Agent': AGENT, 'Accept-Language': 'en' }
		}));
		if (!response.ok) throw new Error('Nominatim returned ' + response.status);
		const body = await response.json();
		results = body.map((place) => ({
			name: place.display_name,
			lat: Number(place.lat).toFixed(6),
			lng: Number(place.lon).toFixed(6),
			kind: place.type || place.category || ''
		}));
		await remember(query, results);
	} catch (err) {
		console.error('Place lookup failed for ' + query + ': ' + err.message);
		return [];
	}
	return results;
}

module.exports = { lookup };