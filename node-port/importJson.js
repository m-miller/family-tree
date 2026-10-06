'use strict';

/**
 * Load the tree JSON files into an empty database.
 *
 *   node tools/import-json.js src/data.json:miller:"Miller Family Tree" \
 *                             src/horne.json:horne:"Horne Family Tree"
 *
 * The JSON carries everything the chart shows, which is nearly everything the
 * database holds: names, sexes, dates, places, sources, notes and the shape
 * of the family. Two things it cannot carry, because the chart never shows
 * them:
 *
 *   - details of a second or later marriage (each person's block only
 *     mentions their first),
 *   - the distinction between an empty field and one that was never set.
 *
 * Both are easy to fix by hand afterwards; the script reports the people
 * affected so you know where to look.
 */

const fs = require('fs');
const path = require('path');
const db = require('./db');
const { parseDate } = require('./tree');

const PLACEHOLDER = /^\d+\s+unnamed\b/i;

function personColumns(node, treeId) {
	const extra = node.extra || {};
	let name = node.name || '';
	const adopted = name.startsWith('*');
	if (adopted) name = name.slice(1);

	const birth = parseDate(extra.birthdate);
	const death = parseDate(extra.deathdate);
	const burial = parseDate(extra.burial_date);

	return {
		tree_id: treeId,
		name,
		sex: ['man', 'woman', 'unknown'].includes(node.class) ? node.class : 'unknown',
		adopted,
		is_placeholder: PLACEHOLDER.test(name),
		birth_date_text: extra.birthdate || '',
		birth_year: birth.year, birth_month: birth.month, birth_day: birth.day,
		birthplace_name: extra.birthplace_name || '',
		birth_address1: extra.birth_address1 || '',
		birth_address2: extra.birth_address2 || '',
		birth_city: extra.birth_city || '',
		birth_state_province: extra.birth_state_province || '',
		birth_zip_postal_code: extra.birth_zip_postal_code || '',
		birth_country: extra.birth_country || '',
		birth_source: extra.birth_source || '',
		death_date_text: extra.deathdate || '',
		death_year: death.year, death_month: death.month, death_day: death.day,
		deathplace_name: extra.deathplace_name || '',
		death_address1: extra.death_address1 || '',
		death_address2: extra.death_address2 || '',
		death_city: extra.death_city || '',
		death_state_province: extra.death_state_province || '',
		death_zip_postal_code: extra.death_zip_postal_code || '',
		death_country: extra.death_country || '',
		death_source: extra.death_source || '',
		buried: extra.buried || '',
		buried_link: extra.buried_link || '',
		buried_grave: extra.buried_grave || '',
		burial_source: extra.burial_source || '',
		burial_date_text: extra.burial_date || '',
		burial_year: burial.year, burial_month: burial.month, burial_day: burial.day,
		notes: extra.notes || '',
		linked_tree: extra.link || ''
	};
}

async function insertPerson(client, node, treeId) {
	const values = personColumns(node, treeId);
	const columns = Object.keys(values);
	const placeholders = columns.map((_, i) => '$' + (i + 1));
	const result = await client.query(
		`INSERT INTO people (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
		columns.map((c) => values[c]));
	return result.rows[0].id;
}

async function importTree(client, file, slug, title, notes) {
	const data = JSON.parse(fs.readFileSync(file, 'utf8'));

	const tree = await client.query(
		'INSERT INTO trees (slug, title) VALUES ($1, $2) RETURNING id', [slug, title]);
	const treeId = tree.rows[0].id;

	let rootId = null;
	let people = 0;
	let marriages = 0;
	let links = 0;

	const maybeNameOnly = [];   // people whose married_to may have no node

	async function walk(node) {
		const personId = await insertPerson(client, node, treeId);
		people++;
		const extra = node.extra || {};
		if ((extra.married_to || '').trim()) {
			maybeNameOnly.push({ id: personId, name: node.name, extra });
		}

		let ordinal = 0;
		for (const marriage of node.marriages || []) {
			ordinal++;
			const spouseId = await walk(marriage.spouse);

			// Marriage details were often written on one spouse's record and
			// not the other, so take whichever side has them. A person's own
			// block describes their first marriage only, so for a second or
			// later one the spouse's block is the better source.
			const spouseExtra = (marriage.spouse && marriage.spouse.extra) || {};
			const [near, far] = ordinal === 1 ? [extra, spouseExtra] : [spouseExtra, extra];
			const detail = (key) => (near[key] || '').trim() || (far[key] || '').trim() || '';
			const details = {
				married_date: detail('married_date'),
				married_place: detail('married_place'),
				married_city: detail('married_city'),
				married_state: detail('married_state'),
				married_source: detail('married_source')
			};
			const when = parseDate(details.married_date);
			const inserted = await client.query(
				`INSERT INTO marriages (tree_id, person_id, spouse_id, ordinal, married_date_text,
				   married_year, married_month, married_day, married_place, married_city,
				   married_state, married_source)
				 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
				[treeId, personId, spouseId, ordinal, details.married_date || '',
					when.year, when.month, when.day, details.married_place || '',
					details.married_city || '', details.married_state || '',
					details.married_source || '']);
			marriages++;

			let position = 0;
			for (const childNode of marriage.children || []) {
				position++;
				const childId = await walk(childNode);
				await client.query(
					'INSERT INTO children (marriage_id, child_id, position) VALUES ($1, $2, $3)',
					[inserted.rows[0].id, childId, position]);
				links++;
			}
		}
		return personId;
	}

	for (const root of data) {
		const id = await walk(root);
		if (rootId === null) rootId = id;
	}

	// Anyone whose married_to names someone with no node of their own: the
	// spouse becomes a real person with an unknown sex, which is what the
	// chart needs in order to draw them. Done after the walk, so that people
	// already linked by a marriage are skipped.
	for (const candidate of maybeNameOnly) {
		const linked = await client.query(
			'SELECT 1 FROM marriages WHERE person_id = $1 OR spouse_id = $1 LIMIT 1', [candidate.id]);
		if (linked.rowCount) continue;

		const spouseName = candidate.extra.married_to.trim().replace(/^\*/, '');
		const spouseId = await insertPerson(client,
			{ name: spouseName, class: 'unknown', extra: {} }, treeId);
		people++;
		const when = parseDate(candidate.extra.married_date);
		await client.query(
			`INSERT INTO marriages (tree_id, person_id, spouse_id, ordinal, married_date_text,
			   married_year, married_month, married_day, married_place, married_city,
			   married_state, married_source)
			 VALUES ($1,$2,$3,1,$4,$5,$6,$7,$8,$9,$10,$11)`,
			[treeId, candidate.id, spouseId, candidate.extra.married_date || '', when.year,
				when.month, when.day, candidate.extra.married_place || '',
				candidate.extra.married_city || '', candidate.extra.married_state || '',
				candidate.extra.married_source || '']);
		marriages++;
		notes.push(`${candidate.name} is married to ${spouseName}, who had no node in the JSON; `
			+ 'added as a person with an unknown sex.');
	}

	await client.query('UPDATE trees SET root_person_id = $1 WHERE id = $2', [rootId, treeId]);
	return { slug, people, marriages, links };
}

async function main() {
	const args = process.argv.slice(2);
	if (!args.length) {
		console.error('usage: node tools/import-json.js <file>:<slug>:<title> [...]');
		process.exit(1);
	}

	const existing = await db.one('SELECT COUNT(*)::int AS n FROM people');
	if (existing.n > 0) {
		console.error(`The database already holds ${existing.n} people. `
			+ 'Import into an empty one, or clear it first.');
		process.exit(1);
	}

	const notes = [];
	const summaries = await db.transaction(async (client) => {
		const out = [];
		for (const arg of args) {
			const [file, slug, ...rest] = arg.split(':');
			const title = rest.join(':') || slug;
			out.push(await importTree(client, path.resolve(file), slug, title, notes));
		}
		return out;
	});

	for (const s of summaries) {
		console.log(`${s.slug}: ${s.people} people, ${s.marriages} marriages, ${s.links} parent-child links`);
	}
	if (notes.length) {
		console.log('\nWorth checking by hand:');
		for (const note of notes) console.log('  - ' + note);
	}
	await db.pool.end();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});