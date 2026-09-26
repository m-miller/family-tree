/**
 * Works out how two people in the tree are related, and puts a name to it.
 *
 * Everything comes from the tree data itself: the nesting already says who
 * the parents, children and spouses are. Nothing here touches the DOM, so it
 * can be tested on its own.
 */
(function (root) {
	'use strict';

	// ---------- building the index ----------

	/**
	 * Walk the tree and record each person with their parents, children and
	 * spouses. People are keyed by their `extra` object, because dTree hands
	 * that same object back when a node is clicked.
	 */
	function index(treeData) {
		var people = [];
		var byExtra = new Map();

		function record(node) {
			var person = byExtra.get(node.extra);
			if (!person) {
				person = {
					name: node.name || '',
					sex: node['class'] || 'unknown',
					extra: node.extra,
					parents: [],
					children: [],
					spouses: []
				};
				byExtra.set(node.extra, person);
				people.push(person);
			}
			return person;
		}

		function walk(node) {
			var person = record(node);
			(node.marriages || []).forEach(function (marriage) {
				var spouse = marriage.spouse ? walk(marriage.spouse) : null;
				if (spouse) {
					if (person.spouses.indexOf(spouse) === -1) person.spouses.push(spouse);
					if (spouse.spouses.indexOf(person) === -1) spouse.spouses.push(person);
				}
				(marriage.children || []).forEach(function (childNode) {
					var child = walk(childNode);
					[person, spouse].forEach(function (parent) {
						if (!parent) return;
						if (child.parents.indexOf(parent) === -1) child.parents.push(parent);
						if (parent.children.indexOf(child) === -1) parent.children.push(child);
					});
				});
			});
			return person;
		}

		(treeData || []).forEach(walk);
		return { people: people, byExtra: byExtra };
	}

	// ---------- the shape of the relationship ----------

	/** Every ancestor of a person, with how many generations up they are. */
	function ancestors(person) {
		var found = new Map();
		var queue = [{ person: person, depth: 0 }];
		while (queue.length) {
			var step = queue.shift();
			if (found.has(step.person) && found.get(step.person) <= step.depth) continue;
			found.set(step.person, step.depth);
			step.person.parents.forEach(function (parent) {
				queue.push({ person: parent, depth: step.depth + 1 });
			});
		}
		return found;
	}

	/**
	 * The closest ancestor the two share, with the number of generations from
	 * each of them up to that ancestor. Null when they share none.
	 */
	function meetingPoint(a, b) {
		var fromA = ancestors(a);
		var fromB = ancestors(b);
		var best = null;
		fromA.forEach(function (upA, person) {
			if (!fromB.has(person)) return;
			var upB = fromB.get(person);
			if (best === null || (upA + upB) < (best.up + best.down)) {
				best = { ancestor: person, up: upA, down: upB };
			}
		});
		return best;
	}

	// ---------- putting a name to it ----------

	function pick(sex, male, female, neutral) {
		if (sex === 'man') return male;
		if (sex === 'woman') return female;
		return neutral;
	}

	/** 'great-great-' for the given count. */
	function greats(count) {
		var out = '';
		for (var i = 0; i < count; i++) out += 'great-';
		return out;
	}

	function ordinal(n) {
		var names = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh',
			'eighth', 'ninth', 'tenth'];
		return names[n - 1] || (n + 'th');
	}

	function removedBy(n) {
		if (n === 0) return '';
		if (n === 1) return ' once removed';
		if (n === 2) return ' twice removed';
		if (n === 3) return ' three times removed';
		return ' ' + n + ' times removed';
	}

	/**
	 * Name the blood relationship of `a` to `b` - that is, what a is to b.
	 * Returns null when they share no ancestor.
	 */
	function bloodRelation(a, b) {
		if (a === b) return 'the same person';
		var meeting = meetingPoint(a, b);
		if (!meeting) return null;

		var up = meeting.up;      // generations from a to the shared ancestor
		var down = meeting.down;  // generations from b to the shared ancestor

		// a is an ancestor of b
		if (up === 0) {
			if (down === 1) return pick(a.sex, 'father', 'mother', 'parent');
			if (down === 2) return pick(a.sex, 'grandfather', 'grandmother', 'grandparent');
			return greats(down - 2) + pick(a.sex, 'grandfather', 'grandmother', 'grandparent');
		}
		// a is a descendant of b
		if (down === 0) {
			if (up === 1) return pick(a.sex, 'son', 'daughter', 'child');
			if (up === 2) return pick(a.sex, 'grandson', 'granddaughter', 'grandchild');
			return greats(up - 2) + pick(a.sex, 'grandson', 'granddaughter', 'grandchild');
		}
		// same generation from the shared ancestor
		if (up === 1 && down === 1) return pick(a.sex, 'brother', 'sister', 'sibling');
		// a is the sibling of one of b's ancestors: uncle, granduncle, and so on
		if (up === 1) {
			var unclePrefix = down === 2 ? '' : (down === 3 ? 'grand' : greats(down - 3) + 'grand');
			return unclePrefix + pick(a.sex, 'uncle', 'aunt', 'uncle or aunt');
		}
		// the mirror of that: nephew, grandnephew, and so on
		if (down === 1) {
			var nephewPrefix = up === 2 ? '' : (up === 3 ? 'grand' : greats(up - 3) + 'grand');
			return nephewPrefix + pick(a.sex, 'nephew', 'niece', 'nephew or niece');
		}
		// cousins
		return ordinal(Math.min(up, down) - 1) + ' cousin' + removedBy(Math.abs(up - down));
	}

	/**
	 * Name the relationship of `a` to `b`, including relationships by
	 * marriage. Returns a sentence fragment, or null if nothing connects them.
	 */
	function relationship(a, b) {
		if (!a || !b) return null;
		if (a === b) return 'the same person';

		var blood = bloodRelation(a, b);
		if (blood) return blood;

		// married to each other
		if (b.spouses.indexOf(a) !== -1) {
			return pick(a.sex, 'husband', 'wife', 'spouse');
		}

		// a is married to a blood relative of b
		var throughOwnMarriage = null;
		a.spouses.forEach(function (spouse) {
			if (throughOwnMarriage) return;
			var link = bloodRelation(spouse, b);
			if (!link) return;
			if (link === 'brother' || link === 'sister' || link === 'sibling') {
				throughOwnMarriage = pick(a.sex, 'brother-in-law', 'sister-in-law', 'sibling-in-law');
			} else if (link === 'son' || link === 'daughter' || link === 'child') {
				throughOwnMarriage = pick(a.sex, 'son-in-law', 'daughter-in-law', 'child-in-law');
			} else if (link === 'father' || link === 'mother' || link === 'parent') {
				throughOwnMarriage = pick(a.sex, 'stepfather', 'stepmother', 'step-parent');
			} else {
				// the sentence already ends with "of <b>", so don't name them again
				throughOwnMarriage = pick(a.sex, 'husband', 'wife', 'spouse') + ' of the ' + link;
			}
		});
		if (throughOwnMarriage) return throughOwnMarriage;

		// a is a blood relative of b's husband or wife
		var throughTheirMarriage = null;
		b.spouses.forEach(function (spouse) {
			if (throughTheirMarriage) return;
			var link = bloodRelation(a, spouse);
			if (!link) return;
			if (link === 'brother' || link === 'sister' || link === 'sibling') {
				throughTheirMarriage = pick(a.sex, 'brother-in-law', 'sister-in-law', 'sibling-in-law');
			} else if (link === 'father' || link === 'mother' || link === 'parent') {
				throughTheirMarriage = pick(a.sex, 'father-in-law', 'mother-in-law', 'parent-in-law');
			} else {
				throughTheirMarriage = link + ' of the ' +
					pick(spouse.sex, 'husband', 'wife', 'spouse');
			}
		});
		if (throughTheirMarriage) return throughTheirMarriage;

		return null;
	}

	/** A whole sentence, ready to show. */
	function describe(a, b) {
		var term = relationship(a, b);
		if (!term) {
			return a.name + ' and ' + b.name + ' have no recorded connection.';
		}
		if (term === 'the same person') {
			return 'That is the same person.';
		}
		return a.name + ' is the ' + term + ' of ' + b.name + '.';
	}

	var api = {
		index: index,
		relationship: relationship,
		bloodRelation: bloodRelation,
		describe: describe
	};

	if (typeof module === 'object' && module.exports) {
		module.exports = api;
	} else {
		root.FamilyRelations = api;
	}
})(typeof window !== 'undefined' ? window : this);