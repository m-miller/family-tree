'use strict';

const { Pool } = require('pg');

// Render provides DATABASE_URL; set it in the environment locally too.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
	console.error('DATABASE_URL is not set. Copy .env.example and fill it in, or export it:\n'
		+ '  export DATABASE_URL="postgres://user:password@localhost:5432/familytree"');
	process.exit(1);
}

/**
 * A hosted database needs SSL; one on your own machine usually refuses it.
 * Decide from the host rather than making you set a flag, but let
 * DATABASE_SSL=true or =false override when the guess is wrong.
 */
function useSsl() {
	if (process.env.DATABASE_SSL === 'true') return { rejectUnauthorized: false };
	if (process.env.DATABASE_SSL === 'false') return false;
	const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(connectionString);
	return local ? false : { rejectUnauthorized: false };
}

const pool = new Pool({ connectionString, ssl: useSsl() });

pool.on('error', (err) => {
	console.error('Unexpected database error', err);
});

async function query(text, params = []) {
	const result = await pool.query(text, params);
	return result.rows;
}

async function one(text, params = []) {
	const rows = await query(text, params);
	return rows.length ? rows[0] : null;
}

/** Run several statements as a unit; the callback gets a client. */
async function transaction(work) {
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const result = await work(client);
		await client.query('COMMIT');
		return result;
	} catch (err) {
		await client.query('ROLLBACK');
		throw err;
	} finally {
		client.release();
	}
}

module.exports = { pool, query, one, transaction };