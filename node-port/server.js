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