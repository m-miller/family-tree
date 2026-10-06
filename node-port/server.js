'use strict';

/**
 * The family tree site.
 *
 *   /            the public chart, served from src/
 *   /data.json   the Miller tree, built from the database
 *   /horne.json  the Horne tree
 *   /admin       the editor, behind a login
 *
 * The old PHP version wrote the JSON files to disk and tracked whether they
 * were stale. Render's disk does not survive a restart, so the JSON is built
 * per request instead - which removes the staleness problem rather than
 * porting it.
 */

const path = require('path');
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);

const db = require('./db');
const tree = require('./tree');
const admin = require('./adminRoutes');
const { requireLogin, csrf } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;
const SITE = path.join(__dirname, '..', 'src');

// Render (like most hosts) terminates TLS at a proxy and forwards plain
// HTTP. Without this, Express thinks the connection is insecure and refuses
// to send the session cookie, which shows up as "your session expired" on
// every sign-in attempt.
app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: false }));

app.use(session({
	store: new PgSession({ pool: db.pool, tableName: 'session' }),
	secret: process.env.SESSION_SECRET || 'change-me-in-the-environment-boo',
	resave: false,
	saveUninitialized: false,
	cookie: {
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
		maxAge: 1000 * 60 * 60 * 24 * 14
	}
}));
app.use(csrf);

// ---------- the tree data ----------

const cache = new Map();   // slug -> { json, at }
const CACHE_MS = Number(process.env.TREE_CACHE_MS || 30000);

/** Drop the cached JSON after an edit. */
function invalidateTree() {
	cache.clear();
}

async function treeJson(slug) {
	const cached = cache.get(slug);
	if (cached && Date.now() - cached.at < CACHE_MS) return cached.json;

	const row = await db.one('SELECT id FROM trees WHERE slug = $1', [slug]);
	if (!row) return null;
	const built = await tree.buildTreeJson(row.id);
	if (built.missingRoot) return [];
	cache.set(slug, { json: built.tree, at: Date.now() });
	return built.tree;
}

// The chart asks for these by name, as it did when they were files on disk.
const TREE_FILES = { 'data.json': 'miller', 'horne.json': 'horne' };

Object.entries(TREE_FILES).forEach(([file, slug]) => {
	app.get('/' + file, async (req, res, next) => {
		try {
			const json = await treeJson(slug);
			if (json === null) return res.status(404).json([]);
			res.json(json);
		} catch (err) {
			next(err);
		}
	});
});

// ---------- places on the map ----------

// Every recorded birth, death, burial and marriage that has coordinates.
app.get('/places.json', async (req, res, next) => {
	try {
		const rows = await db.query(`
			SELECT p.id, p.name, 'born' AS kind, p.birth_date_text AS date_text,
			       concat_ws(', ', NULLIF(p.birthplace_name, ''), NULLIF(p.birth_city, ''),
			                 NULLIF(p.birth_state_province, ''), NULLIF(p.birth_country, '')) AS place,
			       p.birth_lat AS lat, p.birth_lng AS lng,
			       t.slug AS tree, NULL::text AS name2, NULL::int AS id2, p.birth_year AS year
			  FROM people p JOIN trees t ON t.id = p.tree_id
			 WHERE p.birth_lat IS NOT NULL AND p.birth_lng IS NOT NULL
			UNION ALL
			SELECT p.id, p.name, 'died', p.death_date_text,
			       concat_ws(', ', NULLIF(p.deathplace_name, ''), NULLIF(p.death_city, ''),
			                 NULLIF(p.death_state_province, ''), NULLIF(p.death_country, '')),
			       p.death_lat, p.death_lng, t.slug, NULL::text, NULL::int, p.death_year
			  FROM people p JOIN trees t ON t.id = p.tree_id
			 WHERE p.death_lat IS NOT NULL AND p.death_lng IS NOT NULL
			UNION ALL
			SELECT p.id, p.name, 'buried', '', p.buried, p.burial_lat, p.burial_lng,
			       t.slug, NULL::text, NULL::int,
			       p.death_year   -- burials have no date of their own; the death year stands in
			  FROM people p JOIN trees t ON t.id = p.tree_id
			 WHERE p.burial_lat IS NOT NULL AND p.burial_lng IS NOT NULL
			UNION ALL
			SELECT m.person_id, a.name, 'married', m.married_date_text,
			       concat_ws(', ', NULLIF(m.married_place, ''), NULLIF(m.married_city, ''),
			                 NULLIF(m.married_state, '')),
			       m.married_lat, m.married_lng, t.slug, b.name, m.spouse_id, m.married_year
			  FROM marriages m
			  JOIN people a ON a.id = m.person_id
			  JOIN people b ON b.id = m.spouse_id
			  JOIN trees t ON t.id = m.tree_id
			 WHERE m.married_lat IS NOT NULL AND m.married_lng IS NOT NULL`);

		// numeric columns arrive as strings; the map wants numbers
		res.json(rows.map((r) => ({
			id: r.id, name: r.name, kind: r.kind, date: r.date_text, place: r.place,
			lat: Number(r.lat), lng: Number(r.lng),
			tree: r.tree, name2: r.name2, id2: r.id2,
			year: r.year == null ? null : Number(r.year)
		})));
	} catch (err) {
		next(err);
	}
});

// ---------- the admin ----------

app.use('/admin', admin(invalidateTree));

// ---------- the public site ----------

// admin.css and date-fields.js, which the admin pages ask for by name
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(SITE, { extensions: ['html'] }));

app.use((req, res) => {
	res.status(404).send('Not found');
});

app.use((err, req, res, next) => {   // eslint-disable-line no-unused-vars
	console.error(err);
	res.status(500).send('Something went wrong.');
});

if (require.main === module) {
	app.listen(PORT, () => {
		console.log(`Family tree listening on ${PORT}`);
	});
}

module.exports = { app, invalidateTree, requireLogin };