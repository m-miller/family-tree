'use strict';

/** The editor: the people list, the person page, and signing in. */

const express = require('express');
const db = require('./db');
const treeLib = require('./tree');
const places = require('./places');
const { attemptLogin, createUser, requireLogin, flash, takeFlashes } = require('./auth');

// The person fields the form writes, so adding one means touching this list
// and the template, and nothing else.
const PERSON_FIELDS = [
	'name', 'birthplace_name', 'birth_address1', 'birth_address2', 'birth_city',
	'birth_state_province', 'birth_zip_postal_code', 'birth_country', 'birth_source',
	'deathplace_name', 'death_address1', 'death_address2', 'death_city',
	'death_state_province', 'death_zip_postal_code', 'death_country', 'death_source',
	'buried', 'buried_link', 'buried_grave', 'notes', 'linked_tree'
];

// Coordinates, filled in by the place lookup. Blank means "not placed yet",
// which is different from 0,0 - hence null rather than a number.
const COORDINATE_FIELDS = ['birth_lat', 'birth_lng', 'death_lat', 'death_lng',
	'burial_lat', 'burial_lng'];

function coordinate(req, key) {
	const raw = post(req, key);
	if (raw === '') return null;
	const value = Number(raw);
	return Number.isFinite(value) ? value : null;
}

const SORTS = {
	name: 'p.name %s',
	born: 'p.birth_year IS NULL, p.birth_year %s, p.birth_month IS NULL, p.birth_month %s, p.birth_day %s',
	died: 'p.death_year IS NULL, p.death_year %s, p.death_month IS NULL, p.death_month %s, p.death_day %s'
};

function post(req, key) {
	return String(req.body[key] == null ? '' : req.body[key]).trim();
}

/**
 * The letter a person files under: the last word of their name, ignoring a
 * trailing suffix, with accents folded so Müller files under M.
 */
function surnameLetter(name) {
	const clean = String(name).trim().replace(/[\s,]+(jr|sr|i{1,3}|iv|v)\.?$/i, '').trim();
	const parts = clean.split(/\s+/);
	const surname = (parts[parts.length - 1] || '').replace(/^[^\p{L}]+/u, '');
	const folded = surname.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
	const letter = (folded[0] || '').toUpperCase();
	return /^[A-Z]$/.test(letter) ? letter : '#';
}

function warnUnparsedDate(req, label, text) {
	if (treeLib.dateIsUnparsed(text)) {
		flash(req, `${label} "${text}" was saved as written, but it isn't a date the stats can `
			+ 'count. Use formats like "3 Mar 1902", "Mar 1902" or "1902".', 'warn');
	}
}

module.exports = function adminRoutes(invalidateTree) {
	const router = express.Router();

	// make flashes and the signed-in user available to every template
	router.use((req, res, next) => {
		res.locals.flashes = takeFlashes(req);
		res.locals.user = req.session.user || null;
		res.locals.path = req.path;
		res.locals.listUrl = req.session.listUrl || '/admin';
		next();
	});

	// ---------- signing in ----------

	router.get('/login', (req, res) => {
		if (req.session.user) return res.redirect('/admin');
		res.render('login', { title: 'Sign in', error: null });
	});

	router.post('/login', async (req, res, next) => {
		try {
			const user = await attemptLogin(post(req, 'username'), req.body.password || '');
			if (user) {
				req.session.regenerate((err) => {
					if (err) return next(err);
					req.session.user = user;
					res.redirect('/admin');
				});
				return;
			}
			// deliberately vague, and slow, to discourage guessing
			setTimeout(() => {
				res.render('login', { title: 'Sign in', error: 'That username and password did not match.' });
			}, 1000);
		} catch (err) {
			next(err);
		}
	});

	router.post('/logout', (req, res) => {
		req.session.destroy(() => res.redirect('/admin/login'));
	});

	// ---------- first account ----------

	router.get('/setup', async (req, res, next) => {
		try {
			const count = await db.one('SELECT COUNT(*)::int AS n FROM users');
			if (count.n > 0) return res.render('setup', { title: 'Setup', closed: true, errors: [] });
			res.render('setup', { title: 'Create the first account', closed: false, errors: [] });
		} catch (err) {
			next(err);
		}
	});

	router.post('/setup', async (req, res, next) => {
		try {
			const count = await db.one('SELECT COUNT(*)::int AS n FROM users');
			if (count.n > 0) return res.render('setup', { title: 'Setup', closed: true, errors: [] });

			const username = post(req, 'username');
			const password = req.body.password || '';
			const errors = [];
			if (!username) errors.push('Choose a username.');
			if (password.length < 12) errors.push('Use a password of at least 12 characters.');
			if (password !== (req.body.confirm || '')) errors.push('The two passwords do not match.');

			if (errors.length) {
				return res.render('setup', { title: 'Create the first account', closed: false, errors });
			}
			await createUser(username, password);
			flash(req, 'Account created. Sign in to continue.');
			res.redirect('/admin/login');
		} catch (err) {
			next(err);
		}
	});

	router.use(requireLogin);

	// ---------- looking a place up ----------

	router.get('/places', async (req, res, next) => {
		try {
			res.json(await places.lookup(req.query.q || ''));
		} catch (err) {
			next(err);
		}
	});

	// ---------- the people list ----------

router.get('/', async (req, res, next) => {
	try {
		req.session.listUrl = req.originalUrl;
		const trees = await db.query('SELECT * FROM trees ORDER BY id');

		const treeId = Number(req.query.tree) || 0;
		const search = String(req.query.q || '').trim();

		const searchBy = req.query.search_by === 'last' ? 'last' : 'first';

		const sort = SORTS[req.query.sort] ? req.query.sort : 'name';
		const dir = req.query.dir === 'desc' ? 'DESC' : 'ASC';
		const orderBy = SORTS[sort].replace(/%s/g, dir);

		const params = [];
		let sql = `
			SELECT p.*, t.slug AS tree_slug
			FROM people p
			JOIN trees t ON t.id = p.tree_id
			WHERE 1=1
		`;

		if (treeId) {
			params.push(treeId);
			sql += ` AND p.tree_id = $${params.length}`;
		}

		if (search) {
			params.push('%' + search + '%');

			if (searchBy === 'last') {
				sql += ` AND p.name ILIKE $${params.length}`;
			} else {
				sql += ` AND p.name ILIKE $${params.length}`;
			}
		}

		sql += ` ORDER BY ${orderBy}, p.name`;

		const all = await db.query(sql, params);

		// Determine which initial the A-Z filter should use.
		function nameLetter(name, searchBy) {
			const parts = String(name || '').trim().split(/\s+/);

			if (searchBy === 'last') {
				return (parts[parts.length - 1] || '').slice(0, 1).toUpperCase();
			}

			return (parts[0] || '').slice(0, 1).toUpperCase();
		}


		const letter = String(req.query.letter || '').slice(0, 1).toUpperCase();

		const counts = {};
		const people = [];

		for (const person of all) {
			const initial = nameLetter(person.name, searchBy);

			counts[initial] = (counts[initial] || 0) + 1;

			if (!letter || initial === letter) {
				people.push(person);
			}
		}

		res.render('list', {
			title: 'People',
			trees,
			treeId,
			search,
			searchBy,
			sort,
			dir,
			letter,
			counts,
			total: people.length,
			people: people.slice(0, 500)
		});
	} catch (err) {
		next(err);
	}
});


	// ---------- one person ----------

	async function personPageData(id) {
		const person = await db.one('SELECT * FROM people WHERE id = $1', [id]);
		if (!person) return null;

		const marriages = await db.query(
			`SELECT m.*, s.name AS spouse_person_name FROM marriages m
			 JOIN people s ON s.id = m.spouse_id
			 WHERE m.person_id = $1 ORDER BY m.ordinal`, [id]);
		const parentMarriage = await db.one('SELECT marriage_id FROM children WHERE child_id = $1', [id]);
		const candidates = await db.query(
			`SELECT id, name, birth_date_text, death_date_text FROM people
			 WHERE tree_id = $1 AND id <> $2 ORDER BY name`, [person.tree_id, id]);
		const couples = await db.query(
			`SELECT m.id, a.name AS a_name, b.name AS b_name FROM marriages m
			 JOIN people a ON a.id = m.person_id
			 JOIN people b ON b.id = m.spouse_id
			 WHERE m.tree_id = $1 ORDER BY a.name`, [person.tree_id]);
		const isRoot = Boolean(await db.one('SELECT id FROM trees WHERE root_person_id = $1', [id]));
		const drawn = await treeLib.drawnPeople(person.tree_id);

		// People who could be attached as a parent: in this tree, not this
		// person, and not already drawn - anyone drawn would appear twice.
		const unattached = candidates.filter(function (c) {
			return !drawn.has(c.id);
		});

		return { person, marriages, parentMarriage, candidates, couples, isRoot,
			drawnHere: drawn.has(id), unattached };
	}

	router.get('/person/new', async (req, res, next) => {
		try {
			const trees = await db.query('SELECT * FROM trees ORDER BY id');
			res.render('person', {
				title: 'Add a person',
				trees, person: null, marriages: [], parentMarriage: null,
				candidates: [], couples: [], isRoot: false, drawnHere: false, unattached: [],
				treeId: Number(req.query.tree) || (trees[0] && trees[0].id) || 1
			});
		} catch (err) {
			next(err);
		}
	});

	router.get('/person/:id', async (req, res, next) => {
		try {
			const data = await personPageData(Number(req.params.id));
			if (!data) return res.status(404).render('missing', { title: 'Not found' });
			const trees = await db.query('SELECT * FROM trees ORDER BY id');
			res.render('person', Object.assign({
				title: 'Edit ' + data.person.name, trees, treeId: data.person.tree_id
			}, data));
		} catch (err) {
			next(err);
		}
	});

	/** Save a new person or an edit. */
	router.post('/person/save', async (req, res, next) => {
		try {
			const id = Number(req.body.id) || 0;
			const existing = id ? await db.one('SELECT * FROM people WHERE id = $1', [id]) : null;

			const values = {};
			for (const field of PERSON_FIELDS) values[field] = post(req, field);
			for (const field of COORDINATE_FIELDS) values[field] = coordinate(req, field);
			values.name = values.name.replace(/^\*+/, '');

			const treeId = existing ? existing.tree_id : Number(req.body.tree_id) || 0;
			if (!values.name) {
				flash(req, 'A name is required.', 'error');
				return res.redirect(id ? `/admin/person/${id}` : '/admin/person/new');
			}
			if (!await db.one('SELECT id FROM trees WHERE id = $1', [treeId])) {
				flash(req, 'Choose which tree this person belongs to.', 'error');
				return res.redirect(id ? `/admin/person/${id}` : '/admin/person/new');
			}

			const birthText = post(req, 'birth_date_text');
			const deathText = post(req, 'death_date_text');
			const birth = treeLib.parseDate(birthText);
			const death = treeLib.parseDate(deathText);
			if (birth.year && death.year &&
				[death.year, death.month || 0, death.day || 0] < [birth.year, birth.month || 0, birth.day || 0]) {
				flash(req, 'Saved, but the death date is before the birth date.', 'warn');
			}

			Object.assign(values, {
				tree_id: treeId,
				sex: ['man', 'woman', 'unknown'].includes(post(req, 'sex')) ? post(req, 'sex') : 'unknown',
				adopted: Boolean(req.body.adopted),
				is_placeholder: Boolean(req.body.is_placeholder),
				birth_date_text: birthText,
				birth_year: birth.year, birth_month: birth.month, birth_day: birth.day,
				death_date_text: deathText,
				death_year: death.year, death_month: death.month, death_day: death.day
			});

			const columns = Object.keys(values);
			let savedId = id;
			if (id) {
				const sets = columns.map((c, i) => `${c} = $${i + 1}`);
				await db.query(`UPDATE people SET ${sets.join(', ')} WHERE id = $${columns.length + 1}`,
					columns.map((c) => values[c]).concat([id]));
				flash(req, 'Saved ' + values.name + '.');
			} else {
				const placeholders = columns.map((_, i) => '$' + (i + 1));
				const row = await db.one(
					`INSERT INTO people (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
					columns.map((c) => values[c]));
				savedId = row.id;
				flash(req, `Added ${values.name}. Now set their parents or a marriage below.`);
			}

			warnUnparsedDate(req, 'The birth date', birthText);
			warnUnparsedDate(req, 'The death date', deathText);
			invalidateTree();
			res.redirect(`/admin/person/${savedId}`);
		} catch (err) {
			next(err);
		}
	});

	/** Who someone's parents are. */
	router.post('/person/:id/parents', async (req, res, next) => {
		const id = Number(req.params.id);
		try {
			const person = await db.one('SELECT * FROM people WHERE id = $1', [id]);
			if (!person) return res.status(404).render('missing', { title: 'Not found' });

			const marriageId = Number(req.body.marriage_id) || 0;
			await db.query('DELETE FROM children WHERE child_id = $1', [id]);

			if (marriageId) {
				const marriage = await db.one('SELECT * FROM marriages WHERE id = $1', [marriageId]);
				if (!marriage) {
					flash(req, 'That couple no longer exists.', 'error');
					return res.redirect(`/admin/person/${id}`);
				}
				if (await treeLib.isDescendant(id, marriage.person_id) ||
					await treeLib.isDescendant(id, marriage.spouse_id)) {
					flash(req, 'That would make someone their own ancestor.', 'error');
					return res.redirect(`/admin/person/${id}`);
				}
				const drawn = await treeLib.drawnPeople(person.tree_id, null, id);
				if (drawn.has(id)) {
					flash(req, 'This person already appears in the tree through a marriage. '
						+ 'Remove that first, or they would be drawn twice.', 'error');
					return res.redirect(`/admin/person/${id}`);
				}
				const next_ = await db.one(
					'SELECT COALESCE(MAX(position), 0) + 1 AS n FROM children WHERE marriage_id = $1',
					[marriageId]);
				await db.query('INSERT INTO children (marriage_id, child_id, position) VALUES ($1, $2, $3)',
					[marriageId, id, next_.n]);
				flash(req, 'Parents set.');
			} else {
				flash(req, 'Parents cleared.');
			}
			invalidateTree();
			res.redirect(`/admin/person/${id}`);
		} catch (err) {
			next(err);
		}
	});

	/**
	 * Add a whole generation above someone.
	 *
	 * Each parent is either a name to create, or someone already in the tree
	 * chosen from the dropdown. Choosing existing people is how a line that
	 * was entered separately gets attached: they are not drawn yet, so no one
	 * ends up on the chart twice.
	 */
	router.post('/person/:id/add-parents', async (req, res, next) => {
		const id = Number(req.params.id);
		try {
			const person = await db.one('SELECT * FROM people WHERE id = $1', [id]);
			if (!person) return res.status(404).render('missing', { title: 'Not found' });

			const fatherName = post(req, 'father_name').replace(/^\*+/, '');
			const motherName = post(req, 'mother_name').replace(/^\*+/, '');
			const fatherId = Number(req.body.father_id) || 0;
			const motherId = Number(req.body.mother_id) || 0;

			if (!fatherName && !motherName && !fatherId && !motherId) {
				flash(req, 'Name a parent, or choose one already in the tree.', 'error');
				return res.redirect(`/admin/person/${id}`);
			}
			if (await db.one('SELECT id FROM children WHERE child_id = $1', [id])) {
				flash(req, 'This person already has parents recorded. Clear them first.', 'error');
				return res.redirect(`/admin/person/${id}`);
			}

			// Someone chosen from the dropdown must be in this tree, must not
			// be the person themselves, and must not already be drawn, or
			// they would appear twice.
			const drawn = await treeLib.drawnPeople(person.tree_id);
			for (const chosen of [fatherId, motherId]) {
				if (!chosen) continue;
				if (chosen === id) {
					flash(req, 'Someone cannot be their own parent.', 'error');
					return res.redirect(`/admin/person/${id}`);
				}
				const row = await db.one('SELECT name, tree_id FROM people WHERE id = $1', [chosen]);
				if (!row || row.tree_id !== person.tree_id) {
					flash(req, 'That person is not in the same tree.', 'error');
					return res.redirect(`/admin/person/${id}`);
				}
				if (drawn.has(chosen) && chosen !== person.id) {
					flash(req, `${row.name} already appears in the tree. Remove their marriage or `
						+ 'parents first, or they would be drawn twice.', 'error');
					return res.redirect(`/admin/person/${id}`);
				}
			}

			const dateText = post(req, 'married_date_text');
			const when = treeLib.parseDate(dateText);
			const wasDrawn = drawn;

			const newRoot = await db.transaction(async (client) => {
				// use the chosen person, or create one from the name given
				const resolve = async (chosenId, name, sex) => {
					if (chosenId) return chosenId;
					const row = await client.query(
						'INSERT INTO people (tree_id, name, sex) VALUES ($1, $2, $3) RETURNING id',
						[person.tree_id, name || 'Unknown', name ? sex : 'unknown']);
					return row.rows[0].id;
				};
				const father = await resolve(fatherId, fatherName, 'man');
				const mother = await resolve(motherId, motherName, 'woman');

				// they may already be married to each other
				const existing = await client.query(
					`SELECT id FROM marriages WHERE (person_id = $1 AND spouse_id = $2)
					 OR (person_id = $2 AND spouse_id = $1)`, [father, mother]);

				let marriageId;
				if (existing.rowCount) {
					marriageId = existing.rows[0].id;
				} else {
					const ordinal = await client.query(
						'SELECT COALESCE(MAX(ordinal), 0) + 1 AS n FROM marriages WHERE person_id = $1',
						[father]);
					const inserted = await client.query(
						`INSERT INTO marriages (tree_id, person_id, spouse_id, ordinal, married_date_text,
						   married_year, married_month, married_day, married_place)
						 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
						[person.tree_id, father, mother, ordinal.rows[0].n, dateText,
							when.year, when.month, when.day, post(req, 'married_place')]);
					marriageId = inserted.rows[0].id;
				}

				const position = await client.query(
					'SELECT COALESCE(MAX(position), 0) + 1 AS n FROM children WHERE marriage_id = $1',
					[marriageId]);
				await client.query(
					'INSERT INTO children (marriage_id, child_id, position) VALUES ($1, $2, $3)',
					[marriageId, id, position.rows[0].n]);
				return father;
			});

			// A chart starts from one person, so a new top generation becomes
			// the root - unless the father already sits below someone else,
			// in which case the tree already has a top and we leave it alone.
			const fatherHasParents = await db.one(
				'SELECT id FROM children WHERE child_id = $1', [newRoot]);
			const fatherLabel = fatherName || (await db.one(
				'SELECT name FROM people WHERE id = $1', [newRoot])).name;

			if ((wasDrawn.has(id) || wasDrawn.size === 0) && !fatherHasParents) {
				await db.query('UPDATE trees SET root_person_id = $1 WHERE id = $2',
					[newRoot, person.tree_id]);
				const flipped = await treeLib.reorientTree(person.tree_id);
				flash(req, `Parents added. The chart now starts from ${fatherLabel}`
					+ (flipped ? `, and ${flipped} marriage${flipped === 1 ? ' was' : 's were'} `
						+ 'turned around to suit' : '') + '.');
			} else if (fatherHasParents) {
				// the new parents hang off a line that is already attached
				const flipped = await treeLib.reorientTree(person.tree_id);
				flash(req, 'Parents added, joining the line that is already in the tree'
					+ (flipped ? `, and ${flipped} marriage${flipped === 1 ? ' was' : 's were'} `
						+ 'turned around to suit' : '') + '.');
			} else {
				flash(req, 'Parents added.');
			}
			warnUnparsedDate(req, 'The marriage date', dateText);
			invalidateTree();
			res.redirect(`/admin/person/${newRoot}`);
		} catch (err) {
			next(err);
		}
	});

	/** Add or edit a marriage. */
	router.post('/person/:id/marriage', async (req, res, next) => {
		const id = Number(req.params.id);
		try {
			const person = await db.one('SELECT * FROM people WHERE id = $1', [id]);
			if (!person) return res.status(404).render('missing', { title: 'Not found' });

			const marriageId = Number(req.body.marriage_id) || 0;
			let spouseId = Number(req.body.spouse_id) || 0;
			const newSpouseName = post(req, 'new_spouse_name').replace(/^\*+/, '');
			const dateText = post(req, 'married_date_text');
			const when = treeLib.parseDate(dateText);

			if (spouseId === id) {
				flash(req, 'Someone cannot marry themselves.', 'error');
				return res.redirect(`/admin/person/${id}`);
			}
			if (!spouseId && !newSpouseName) {
				flash(req, 'Choose a spouse from the tree, or type a name to add them as a new person.', 'error');
				return res.redirect(`/admin/person/${id}`);
			}

			if (spouseId) {
				const spouse = await db.one('SELECT tree_id FROM people WHERE id = $1', [spouseId]);
				if (!spouse || spouse.tree_id !== person.tree_id) {
					flash(req, 'That spouse is not in the same tree.', 'error');
					return res.redirect(`/admin/person/${id}`);
				}
				// the chart draws each person once
				const drawn = await treeLib.drawnPeople(person.tree_id, marriageId || null);
				if (drawn.has(spouseId)) {
					const row = await db.one('SELECT name FROM people WHERE id = $1', [spouseId]);
					flash(req, `${row.name} already appears in the tree, and the chart can only draw `
						+ 'each person once. Remove their existing marriage or parents first.', 'error');
					return res.redirect(`/admin/person/${id}`);
				}
			} else {
				const row = await db.one(
					'INSERT INTO people (tree_id, name, sex) VALUES ($1, $2, $3) RETURNING id',
					[person.tree_id, newSpouseName, 'unknown']);
				spouseId = row.id;
				flash(req, `Added ${newSpouseName} as a new person. Open their page to fill in their details.`);
			}

			const fields = {
				married_date_text: dateText,
				married_year: when.year, married_month: when.month, married_day: when.day,
				married_place: post(req, 'married_place'),
				married_city: post(req, 'married_city'),
				married_state: post(req, 'married_state'),
				married_source: post(req, 'married_source'),
				married_lat: coordinate(req, 'married_lat'),
				married_lng: coordinate(req, 'married_lng'),
				spouse_id: spouseId
			};

			if (marriageId) {
				const columns = Object.keys(fields);
				const sets = columns.map((c, i) => `${c} = $${i + 1}`);
				await db.query(
					`UPDATE marriages SET ${sets.join(', ')} WHERE id = $${columns.length + 1} AND person_id = $${columns.length + 2}`,
					columns.map((c) => fields[c]).concat([marriageId, id]));
				flash(req, 'Marriage updated.');
			} else {
				const clash = await db.one(
					`SELECT id FROM marriages WHERE (person_id = $1 AND spouse_id = $2)
					 OR (person_id = $2 AND spouse_id = $1)`, [id, spouseId]);
				if (clash) {
					flash(req, 'Those two are already recorded as married.', 'error');
					return res.redirect(`/admin/person/${id}`);
				}
				const next_ = await db.one(
					'SELECT COALESCE(MAX(ordinal), 0) + 1 AS n FROM marriages WHERE person_id = $1', [id]);
				const columns = Object.keys(fields).concat(['person_id', 'tree_id', 'ordinal']);
				const values = Object.values(fields).concat([id, person.tree_id, next_.n]);
				await db.query(
					`INSERT INTO marriages (${columns.join(', ')}) VALUES (${columns.map((_, i) => '$' + (i + 1)).join(', ')})`,
					values);
				flash(req, 'Marriage added.');
			}
			warnUnparsedDate(req, 'The marriage date', dateText);
			invalidateTree();
			res.redirect(`/admin/person/${id}`);
		} catch (err) {
			next(err);
		}
	});

	router.post('/person/:id/marriage/:marriageId/delete', async (req, res, next) => {
		const id = Number(req.params.id);
		try {
			const marriageId = Number(req.params.marriageId);
			const kids = await db.one(
				'SELECT COUNT(*)::int AS n FROM children WHERE marriage_id = $1', [marriageId]);
			if (kids.n) {
				flash(req, `That marriage has ${kids.n} children attached. Move them to another couple first.`, 'error');
				return res.redirect(`/admin/person/${id}`);
			}
			await db.query('DELETE FROM marriages WHERE id = $1 AND person_id = $2', [marriageId, id]);
			flash(req, 'Marriage removed.');
			invalidateTree();
			res.redirect(`/admin/person/${id}`);
		} catch (err) {
			next(err);
		}
	});

	/** Make this person the one the chart starts from. */
	router.post('/person/:id/make-root', async (req, res, next) => {
		const id = Number(req.params.id);
		try {
			const person = await db.one('SELECT * FROM people WHERE id = $1', [id]);
			if (!person) return res.status(404).render('missing', { title: 'Not found' });
			await db.query('UPDATE trees SET root_person_id = $1 WHERE id = $2', [id, person.tree_id]);
			const flipped = await treeLib.reorientTree(person.tree_id);
			flash(req, `The chart now starts from ${person.name}`
				+ (flipped ? `, and ${flipped} marriage${flipped === 1 ? ' was' : 's were'} turned around to suit` : '')
				+ '.');
			invalidateTree();
			res.redirect(`/admin/person/${id}`);
		} catch (err) {
			next(err);
		}
	});

	router.post('/person/:id/delete', async (req, res, next) => {
		const id = Number(req.params.id);
		try {
			const person = await db.one('SELECT * FROM people WHERE id = $1', [id]);
			if (!person) return res.status(404).render('missing', { title: 'Not found' });

			if (await db.one('SELECT id FROM trees WHERE root_person_id = $1', [id])) {
				flash(req, 'This person is the root of a tree, so they cannot be deleted.', 'error');
				return res.redirect(`/admin/person/${id}`);
			}
			const ties = await db.one(
				'SELECT COUNT(*)::int AS n FROM marriages WHERE person_id = $1 OR spouse_id = $1', [id]);
			if (ties.n) {
				flash(req, 'Remove their marriages first, so no one loses a spouse by accident.', 'error');
				return res.redirect(`/admin/person/${id}`);
			}
			await db.query('DELETE FROM children WHERE child_id = $1', [id]);
			await db.query('DELETE FROM people WHERE id = $1', [id]);
			flash(req, 'Deleted ' + person.name + '.');
			invalidateTree();
			res.redirect(req.session.listUrl || '/admin');
		} catch (err) {
			next(err);
		}
	});

	return router;
};

module.exports.surnameLetter = surnameLetter;