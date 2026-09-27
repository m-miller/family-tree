'use strict';

/**
 * The tree itself: dates, building the JSON the chart reads, and the rules
 * that keep the structure drawable.
 *
 * Ported from the PHP version. The date parsing here has to agree with
 * src/js/stats.js, which parses the same strings in the browser.
 */

const db = require('./db');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
	'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const APPROX = /^(abt|about|ca|c|circa|bef|before|aft|after|est|estimated|bet|between)\b\.?\s*(.+)$/i;

/** 'Mar' or 'March' -> 1-12, or null. */
function monthNumber(word) {
	const i = MONTHS.findIndex((m) => m.toLowerCase() === word.slice(0, 3).toLowerCase());
	return i === -1 ? null : i + 1;
}

/**
 * Parse 'D Mon YYYY', 'Mon YYYY' or 'YYYY' into {year, month, day}, with
 * nulls for the parts that aren't known.
 *
 * Approximate dates - 'abt 1250', 'c. 1220', 'bef 1300' - give up their year
 * and nothing else, which is all they really claim. Anything unreadable, such
 * as 'unknown', parses to all nulls; the text is still stored as typed.
 */
function parseDate(text) {
	const s = String(text == null ? '' : text).trim().replace(/\s+/g, ' ');
	if (s === '') return { year: null, month: null, day: null };

	const approx = s.match(APPROX);
	if (approx) {
		const year = approx[2].match(/(\d{3,4})/);
		return year
			? { year: parseInt(year[1], 10), month: null, day: null }
			: { year: null, month: null, day: null };
	}

	let m = s.match(/^(\d{1,2}) ([A-Za-z]+) (\d{4})$/);
	if (m) {
		const month = monthNumber(m[2]);
		const day = parseInt(m[1], 10);
		if (month === null || day < 1 || day > 31) return { year: null, month: null, day: null };
		return { year: parseInt(m[3], 10), month, day };
	}
	m = s.match(/^([A-Za-z]+) (\d{4})$/);
	if (m) {
		const month = monthNumber(m[1]);
		return month === null
			? { year: null, month: null, day: null }
			: { year: parseInt(m[2], 10), month, day: null };
	}
	m = s.match(/^(\d{4})$/);
	if (m) return { year: parseInt(m[1], 10), month: null, day: null };

	return { year: null, month: null, day: null };
}

/** True when text was given but couldn't be read, so the user can be warned. */
function dateIsUnparsed(text) {
	if (String(text == null ? '' : text).trim() === '') return false;
	return parseDate(text).year === null;
}

/** The extra{} block every person gets, in the order the chart expects. */
function extraFor(person, marriage, spouseName) {
	return {
		birthdate: person.birth_date_text,
		birthplace_name: person.birthplace_name,
		birth_address1: person.birth_address1,
		birth_address2: person.birth_address2,
		birth_city: person.birth_city,
		birth_state_province: person.birth_state_province,
		birth_zip_postal_code: person.birth_zip_postal_code,
		birth_country: person.birth_country,
		birth_source: person.birth_source,
		married_to: spouseName || '',
		married_date: marriage ? marriage.married_date_text : '',
		married_place: marriage ? marriage.married_place : '',
		married_city: marriage ? marriage.married_city : '',
		married_state: marriage ? marriage.married_state : '',
		married_source: marriage ? marriage.married_source : '',
		deathdate: person.death_date_text,
		deathplace_name: person.deathplace_name,
		death_address1: person.death_address1,
		death_address2: person.death_address2,
		death_city: person.death_city,
		death_state_province: person.death_state_province,
		death_zip_postal_code: person.death_zip_postal_code,
		death_country: person.death_country,
		death_source: person.death_source,
		buried: person.buried,
		buried_link: person.buried_link,
		buried_grave: person.buried_grave,
		notes: person.notes,
		link: person.linked_tree
	};
}

/** Everything one tree needs, in three queries. */
async function loadTree(treeId) {
	const tree = await db.one('SELECT * FROM trees WHERE id = $1', [treeId]);
	if (!tree) return null;

	const people = new Map();
	for (const row of await db.query('SELECT * FROM people WHERE tree_id = $1', [treeId])) {
		people.set(row.id, row);
	}

	const under = new Map();     // marriages the chart hangs under a person
	const anySide = new Map();   // marriages a person is part of, either side
	const marriages = await db.query(
		'SELECT * FROM marriages WHERE tree_id = $1 ORDER BY person_id, ordinal', [treeId]);
	for (const m of marriages) {
		if (!under.has(m.person_id)) under.set(m.person_id, []);
		under.get(m.person_id).push(m);
		for (const side of [m.person_id, m.spouse_id]) {
			if (!anySide.has(side)) anySide.set(side, []);
			anySide.get(side).push(m);
		}
	}

	const children = new Map();
	const childRows = await db.query(
		`SELECT c.* FROM children c JOIN marriages m ON m.id = c.marriage_id
		 WHERE m.tree_id = $1 ORDER BY c.position, c.id`, [treeId]);
	for (const c of childRows) {
		if (!children.has(c.marriage_id)) children.set(c.marriage_id, []);
		children.get(c.marriage_id).push(c.child_id);
	}

	return { tree, people, under, anySide, marriages, children };
}

/**
 * Build the nested structure dTree draws, for one tree.
 *
 * Each person is drawn once. A loop in the data would otherwise recurse for
 * ever, so anyone already drawn is skipped and reported instead; people not
 * reachable from the root are reported too, since they are invisible.
 */
async function buildTreeJson(treeId) {
	const loaded = await loadTree(treeId);
	if (!loaded || loaded.tree.root_person_id === null) {
		return { tree: [], loops: [], orphans: [], missingRoot: true };
	}
	const { tree, people, under, anySide, children } = loaded;

	const visited = new Set();
	const loops = [];

	function node(id) {
		if (visited.has(id)) {
			loops.push(people.get(id).name);
			return null;
		}
		visited.add(id);
		const person = people.get(id);

		// the marriage a person's own details mention is their first, either side
		const first = (anySide.get(id) || [])[0] || null;
		let spouseName = '';
		if (first) {
			const otherId = first.person_id === id ? first.spouse_id : first.person_id;
			const other = people.get(otherId);
			if (other) spouseName = (other.adopted ? '*' : '') + other.name;
		}

		const out = {
			name: (person.adopted ? '*' : '') + person.name,
			class: person.sex,
			extra: extraFor(person, first, spouseName)
		};

		const marriages = [];
		for (const m of under.get(id) || []) {
			const spouse = node(m.spouse_id);
			if (spouse === null) continue;   // already drawn; see loops
			const entry = { spouse };
			const kids = [];
			for (const childId of children.get(m.id) || []) {
				const child = node(childId);
				if (child !== null) kids.push(child);
			}
			if (kids.length) entry.children = kids;
			marriages.push(entry);
		}
		if (marriages.length) out.marriages = marriages;
		return out;
	}

	const structure = [node(tree.root_person_id)];
	const orphans = [];
	for (const [id, person] of people) {
		if (!visited.has(id)) orphans.push(person.name);
	}

	return { tree: structure, loops: [...new Set(loops)], orphans, missingRoot: false };
}

/**
 * Everyone the chart currently draws, walking from the root. The chart shows
 * each person once, so an edit placing someone who already appears is
 * refused. Pass ids to ignore the link being edited.
 */
async function drawnPeople(treeId, ignoreMarriageId = null, ignoreChildId = null) {
	const loaded = await loadTree(treeId);
	if (!loaded || loaded.tree.root_person_id === null) return new Set();

	const under = new Map();
	for (const m of loaded.marriages) {
		if (ignoreMarriageId !== null && m.id === ignoreMarriageId) continue;
		if (!under.has(m.person_id)) under.set(m.person_id, []);
		under.get(m.person_id).push(m);
	}

	const seen = new Set();
	const stack = [loaded.tree.root_person_id];
	while (stack.length) {
		const current = stack.pop();
		if (seen.has(current)) continue;   // a loop in existing data; stop rather than spin
		seen.add(current);
		for (const m of under.get(current) || []) {
			stack.push(m.spouse_id);
			for (const childId of loaded.children.get(m.id) || []) {
				if (ignoreChildId !== null && childId === ignoreChildId) continue;
				stack.push(childId);
			}
		}
	}
	return seen;
}

/** True when `personId` is `ancestorId` or one of its descendants. */
async function isDescendant(ancestorId, personId) {
	if (ancestorId === personId) return true;
	const rows = await db.query(
		`SELECT c.child_id FROM children c JOIN marriages m ON m.id = c.marriage_id
		 WHERE m.person_id = $1 OR m.spouse_id = $1`, [ancestorId]);
	for (const row of rows) {
		if (await isDescendant(row.child_id, personId)) return true;
	}
	return false;
}

/**
 * Point every marriage the right way round for the current root.
 *
 * A marriage hangs under one of its two people, and the chart reaches the
 * other through it. When the root moves - which is what adding a generation
 * above does - marriages along the way face the wrong way and whole branches
 * fall off. Returns how many were turned around.
 */
async function reorientTree(treeId) {
	const loaded = await loadTree(treeId);
	if (!loaded || loaded.tree.root_person_id === null) return 0;

	const byPerson = new Map();
	for (const m of loaded.marriages) {
		for (const side of [m.person_id, m.spouse_id]) {
			if (!byPerson.has(side)) byPerson.set(side, []);
			byPerson.get(side).push(m);
		}
	}

	let flipped = 0;
	const seenPeople = new Set();
	const seenMarriages = new Set();
	const queue = [loaded.tree.root_person_id];

	while (queue.length) {
		const id = queue.shift();
		if (seenPeople.has(id)) continue;
		seenPeople.add(id);

		for (const m of byPerson.get(id) || []) {
			if (seenMarriages.has(m.id)) continue;
			seenMarriages.add(m.id);

			let other;
			if (m.spouse_id === id) {
				// reached from the spouse's side, so turn it around
				await db.query('UPDATE marriages SET person_id = $1, spouse_id = $2 WHERE id = $3',
					[id, m.person_id, m.id]);
				flipped++;
				other = m.person_id;
			} else {
				other = m.spouse_id;
			}

			queue.push(other);
			for (const childId of loaded.children.get(m.id) || []) queue.push(childId);
		}
	}

	// ordinals can clash after flipping, so renumber them per person
	const order = new Map();
	for (const m of await db.query(
		'SELECT id, person_id FROM marriages WHERE tree_id = $1 ORDER BY person_id, ordinal, id',
		[treeId])) {
		const n = (order.get(m.person_id) || 0) + 1;
		order.set(m.person_id, n);
		await db.query('UPDATE marriages SET ordinal = $1 WHERE id = $2', [n, m.id]);
	}

	return flipped;
}

module.exports = {
	MONTHS, parseDate, dateIsUnparsed, extraFor,
	buildTreeJson, drawnPeople, isDescendant, reorientTree
};