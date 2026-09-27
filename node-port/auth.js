'use strict';

/** Signing in, CSRF tokens, and the guard on the admin pages. */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');

// A hash to compare against when the username is unknown, so a wrong name
// and a wrong password take the same amount of time.
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

/**
 * PHP writes bcrypt hashes with a $2y$ prefix; bcryptjs expects $2a$ or $2b$.
 * The formats are identical apart from the marker, so existing passwords keep
 * working after the move.
 */
function normaliseHash(hash) {
	return hash.startsWith('$2y$') ? '$2a$' + hash.slice(4) : hash;
}

async function attemptLogin(username, password) {
	const user = await db.one(
		'SELECT id, username, password_hash FROM users WHERE username = $1', [username]);
	const hash = user ? normaliseHash(user.password_hash) : DUMMY_HASH;
	const matches = await bcrypt.compare(password, hash);
	if (!matches || !user) return null;

	await db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
	return { id: user.id, username: user.username };
}

async function createUser(username, password) {
	const hash = await bcrypt.hash(password, 12);
	const row = await db.one(
		'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id', [username, hash]);
	return row.id;
}

/** Give every session a token, and check it on every POST. */
function csrf(req, res, next) {
	if (!req.session.csrf) {
		req.session.csrf = crypto.randomBytes(32).toString('hex');
	}
	res.locals.csrfToken = req.session.csrf;

	if (req.method === 'POST') {
		const sent = String(req.body && req.body.csrf || '');
		const expected = req.session.csrf;
		const ok = sent.length === expected.length &&
			crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
		if (!ok) {
			return res.status(400).send('Your session expired. Go back, reload the page and try again.');
		}
	}
	next();
}

function requireLogin(req, res, next) {
	if (!req.session.user) return res.redirect('/admin/login');
	res.locals.user = req.session.user;
	next();
}

/** Messages that survive a redirect. */
function flash(req, message, type = 'ok') {
	if (!req.session.flash) req.session.flash = [];
	req.session.flash.push({ message, type });
}

function takeFlashes(req) {
	const out = req.session.flash || [];
	req.session.flash = [];
	return out;
}

module.exports = { attemptLogin, createUser, csrf, requireLogin, flash, takeFlashes, normaliseHash };