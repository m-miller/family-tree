// Family tree page. The page sets `thefile` (the JSON data file) before loading this script.
(function () {
	'use strict';

	// ---------- helpers ----------

	function escapeHtml(value) {
		return String(value).replace(/[&<>"']/g, function (c) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
		});
	}

	function has(value) {
		return typeof value === 'string' && value !== '';
	}

	// prefix + escaped value + suffix, or '' when the value is empty/missing
	function part(value, prefix, suffix) {
		return has(value) ? prefix + escapeHtml(value) + (suffix || '') : '';
	}

	// only allow http(s) links from the data
	function externalLink(url, label) {
		if (!has(url) || !/^https?:\/\//i.test(url)) return '';
		return '<br /><a href="' + escapeHtml(url) + '" target="_blank" rel="noopener">' + label + '</a>';
	}

	// ---------- relationships ----------

	var family = null;      // the index built from the tree data
	var relateTo = null;    // the person picked as the other end, if any
	var peopleById = {};    // database id -> person, for links to a card

	function personFor(extra) {
		return family && extra ? family.byExtra.get(extra) || null : null;
	}
	/** Offers the ancestor chart for whoever's panel this is. */
	function ancestorsHtml(extra) {
		var person = personFor(extra);
		if (!person || !window.Pedigree) return '';
		if (!person.parents.length) return '';
		return '<hr /><button type="button" id="show-ancestors">Show this person\u2019s ancestors</button>';
	}

	/**
	 * A name that goes to that person's place on the tree. Plain text when we
	 * don't know who they are, so a stale id can never produce a dead link.
	 */
	function personLink(id, name) {
		if (id == null || !peopleById[id]) return escapeHtml(name);
		return '<a class="goto-person" data-person="' + escapeHtml(id) + '" href="?person='
			+ encodeURIComponent(id) + '">' + escapeHtml(name) + '</a>';
	}

	/** The line shown in the panel: either the relationship, or the button. */
	function relationshipHtml(extra) {
		var person = personFor(extra);
		if (!person || !window.FamilyRelations) return '';

		if (!relateTo) {
			return '<hr /><button type="button" id="relate">How is this person related to\u2026</button>';
		}
		if (relateTo === person) {
			return '<hr /><span class="relation">Pick another person to compare with '
				+ escapeHtml(person.name) + '.</span>'
				+ '<br /><button type="button" id="relate-clear">Cancel</button>';
		}
		return '<hr /><span class="relation">'
			+ window.FamilyRelations.describe(person, relateTo, function (who) {
				// no link for the person whose panel this is: they are already here
				return who === person ? escapeHtml(who.name)
					: personLink(who.extra && who.extra.person_id, who.name);
			})
			+ '</span><br /><button type="button" id="relate-clear">Clear</button>';
	}

	/**
	 * "Jonas Müller had four sons and three daughters."
	 *
	 * A placeholder node standing for several children - "8 unnamed
	 * children" - counts as that many, since that is what it represents.
	 */
	var NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
		'nine', 'ten', 'eleven', 'twelve'];

	function inWords(n) {
		return NUMBER_WORDS[n] || String(n);
	}

	function countsFor(person) {
		var tally = { sons: 0, daughters: 0, unknown: 0 };
		person.children.forEach(function (child) {
			// "8 unnamed children" is one node standing for eight people
			var standsFor = /^(\d+)\s+unnamed\b/i.exec(child.name);
			if (standsFor) {
				tally.unknown += parseInt(standsFor[1], 10);
				return;
			}
			if (child.sex === 'man') tally.sons++;
			else if (child.sex === 'woman') tally.daughters++;
			else tally.unknown++;
		});
		return tally;
	}

	function childrenHtml(extra) {
		var person = personFor(extra);
		if (!person || !person.children.length) return '';

		var tally = countsFor(person);
		var parts = [];
		if (tally.sons) parts.push(inWords(tally.sons) + (tally.sons === 1 ? ' son' : ' sons'));
		if (tally.daughters) {
			parts.push(inWords(tally.daughters) + (tally.daughters === 1 ? ' daughter' : ' daughters'));
		}
		if (tally.unknown) {
			parts.push(inWords(tally.unknown)
				+ (tally.unknown === 1 ? ' child of unrecorded sex' : ' children of unrecorded sex'));
		}
		if (!parts.length) return '';

		var list = parts.length === 1 ? parts[0]
			: parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
		return '<hr /><span class="children">Had ' + escapeHtml(list) + '.</span>';
	}

	// ---------- info panel ----------

	function buildInfoHtml(name, extra) {
		var e = extra || {};
		return '<div id="close">&times;</div>' +
			'<span style="font-size: 1rem;">' + escapeHtml(name) + '</span>' +
			// birth
			part(e.birthdate, '<br /><span>Born: ', '</span>') +
			part(e.birthplace_name, '<br />At: ') +
			part(e.birth_address1, '<br />') +
			part(e.birth_address2, '<br />') +
			part(e.birth_city, '<br />') +
			part(e.birth_state_province, ', ') +
			part(e.birth_country, '<br />') +
			part(e.birth_source, '<br /><span class="source">Source: ', '</span>') +
			// marriage
			(has(e.married_to) ? '<hr />Married to: ' + personLink(e.married_to_id, e.married_to) : '') +
			part(e.married_date, '<br />on: ') +
			part(e.married_place, '<br />at: ') +
			part(e.married_city, '<br />') +
			part(e.married_state, ', ') +
			part(e.married_source, '<br /><span class="source">Source: ', '</span>') +
			(has(e.link) ? '<br /><a href="' + escapeHtml(e.link) + '.html">' + escapeHtml(e.link) + ' Family Tree</a>' : '') +
			'<hr />' +
			// death
			part(e.deathdate, '<span>Died: ', '</span>') +
			part(e.deathplace_name, '<br />At: ') +
			part(e.death_address1, '<br />') +
			part(e.death_address2, '<br />') +
			part(e.death_city, '<br />') +
			part(e.death_state_province, ', ') +
			part(e.death_country, '<br />') +
			part(e.death_source, '<br /><span class="source">Source: ', '</span>') +
			// burial
			part(e.buried, '<br />Buried: ') +
			externalLink(e.buried_link, 'Cemetery Map') +
			externalLink(e.buried_grave, 'Find a Grave') +
			part(e.notes, '<hr />Notes: ') +
			childrenHtml(extra) +
			ancestorsHtml(extra) +
			relationshipHtml(extra);
	}

	function handlePanelButtons(info, extra) {
		Array.prototype.forEach.call(info.querySelectorAll('a.goto-person'), function (link) {
			link.addEventListener('click', function (event) {
				event.preventDefault();      // the href is only for "open in a new tab"
				event.stopPropagation();
				jumpToPerson(Number(link.dataset.person));
			});
		});
		var ancestors = info.querySelector('#show-ancestors');
		if (ancestors) {
			ancestors.addEventListener('click', function (event) {
				event.stopPropagation();
				showAncestorsOf(personFor(extra));
			});
		}
		var relate = info.querySelector('#relate');
		if (relate) {
			relate.addEventListener('click', function (event) {
				event.stopPropagation();
				relateTo = personFor(extra);
				info.classList.add('relating');
				info.innerHTML = buildInfoHtml(info.dataset.name || '', extra);
				handlePanelButtons(info, extra);
			});
		}
		var clear = info.querySelector('#relate-clear');
		if (clear) {
			clear.addEventListener('click', function (event) {
				event.stopPropagation();
				relateTo = null;
				info.classList.remove('relating');
				info.innerHTML = buildInfoHtml(info.dataset.name || '', extra);
				handlePanelButtons(info, extra);
			});
		}
	}

	// `nodeEl` is the clicked foreignObject; its child div carries the sex class
	function showInfo(nodeEl, name, extra) {
		var nodeDiv = nodeEl.querySelector('div');
		var colorClass = 'info-unknown';
		if (nodeDiv && nodeDiv.classList.contains('man')) {
			colorClass = 'info-man';
		} else if (nodeDiv && nodeDiv.classList.contains('woman')) {
			colorClass = 'info-woman';
		}

		var info = document.querySelector('.info');
		if (!info) {
			info = document.createElement('div');
			document.getElementById('graph').appendChild(info);
		}
		info.className = 'info ' + colorClass + (relateTo ? ' relating' : '');
		info.dataset.name = name;
		info.innerHTML = buildInfoHtml(name, extra);
		handlePanelButtons(info, extra);
		setUrlPerson(extra && extra.person_id);
	}

	// ---------- node text ----------

	function renderNodeText(name, extra, textClass) {
		var text = escapeHtml(name);
		if (extra) {
			text += part(extra.birthdate, '<br /><span class="halfrem">Born: ', '</span>');
			text += part(extra.deathdate, '<br /><span class="halfrem">Died: ', '</span>');
		}
		var who = extra && extra.person_id != null ? ' data-person="' + escapeHtml(extra.person_id) + '"' : '';
		return '<p class="' + escapeHtml(textClass) + '"' + who + '>' + text + '</p>';
	}

	// ---------- spouse border styles (.spouse-1 ... .spouse-9) ----------

	function addSpouseStyles() {
		var css = '';
		for (var i = 1; i < 10; i++) {
			var borderOpacity = 0.3 + (i * 0.1);
			css += '.spouse-' + i + ' {\n  border-left: 5px solid rgba(0, 0, 0, ' + borderOpacity + ');\n}\n';
		}
		var style = document.createElement('style');
		style.textContent = css;
		document.head.appendChild(style);
	}

	// ---------- zoom controls ----------

	// Panning speed while an arrow is held: starts gentle, winds up to full
	// speed after about a second, in pixels per frame.
	var PAN_START = 4;
	var PAN_TOP = 34;
	var PAN_RAMP = 1000;
	var PAN_GLIDE = 0.88;   // how much speed is kept each frame after release

	// Laid out as a pad: up on top, left and right either side of the
	// "back to the start" button, down below, then the zoom controls.
	var CONTROLS = [
		{ label: 'Scroll up (hold to go further)', icon: 'M3 10l5-5 5 5', hold: [0, 1], at: [2, 1] },
		{ label: 'Scroll left (hold to go further)', icon: 'M10 3L5 8l5 5', hold: [1, 0], at: [1, 2] },
		{ label: 'Back to the starting view', icon: 'M8 2v12M2 8h12', circle: true, at: [2, 2],
		  action: function (tree) { tree.resetZoom(); } },
		{ label: 'Scroll right (hold to go further)', icon: 'M6 3l5 5-5 5', hold: [-1, 0], at: [3, 2] },
		{ label: 'Scroll down (hold to go further)', icon: 'M3 6l5 5 5-5', hold: [0, -1], at: [2, 3] },
		{ label: 'Zoom out', icon: 'M3 8h10', at: [1, 4],
		  action: function (tree) { tree.zoomBy(1 / 1.3); } },
		{ label: 'Fit the whole tree', icon: 'M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4', at: [2, 4],
		  action: function (tree) { tree.zoomToFit(); } },
		{ label: 'Zoom in', icon: 'M8 3v10M3 8h10', at: [3, 4],
		  action: function (tree) { tree.zoomBy(1.3); } },
		{ label: 'Switch chart', at: [2, 6], mode: true,
		  markup: '<g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round">'
			+ '<path d="M32 24v8"/><path d="M16 44V32h32v12"/></g>'
			+ '<rect x="20" y="8" width="24" height="17" rx="5" fill="var(--man-color)"/>'
			+ '<rect x="5" y="43" width="22" height="16" rx="5" fill="var(--woman-color)"/>'
			+ '<rect x="37" y="43" width="22" height="16" rx="5" fill="var(--man-color)"/>' }
	]

	/**
	 * An arrow that pans while held. The longer it is held the faster it
	 * goes, so a tap nudges the view and a long press travels across the tree.
	 * `direction` is [x, y]: 1 moves the view left or up, -1 right or down.
	 */
	function addHoldToPan(button, tree, direction) {
		var frame = null;
		var startedAt = 0;
		var speed = 0;
		var gliding = false;

		function step() {
			var held = Date.now() - startedAt;
			var ramp = Math.min(1, held / PAN_RAMP);
			speed = PAN_START + (PAN_TOP - PAN_START) * ramp * ramp;
			tree.panBy(direction[0] * speed, direction[1] * speed);
			frame = requestAnimationFrame(step);
		}

		// after the button is let go, carry on and slow to a halt
		function glide() {
			speed *= PAN_GLIDE;
			if (speed < 0.4) {
				frame = null;
				gliding = false;
				return;
			}
			tree.panBy(direction[0] * speed, direction[1] * speed);
			frame = requestAnimationFrame(glide);
		}

		function start(event) {
			if (frame !== null && !gliding) return;
			if (frame !== null) cancelAnimationFrame(frame);   // cut a glide short
			event.preventDefault();
			gliding = false;
			startedAt = Date.now();
			step();
		}

		function stop() {
			if (frame === null || gliding) return;
			cancelAnimationFrame(frame);
			gliding = true;
			frame = requestAnimationFrame(glide);
		}

		button.addEventListener('mousedown', start);
		button.addEventListener('touchstart', start, { passive: false });
		// however the press ends, and wherever the pointer went
		['mouseup', 'mouseleave', 'touchend', 'touchcancel', 'blur'].forEach(function (name) {
			button.addEventListener(name, stop);
		});
		window.addEventListener('mouseup', stop);

		// keyboard: space or enter arrives as a click
		button.addEventListener('click', function () {
			if (frame === null) tree.panBy(direction[0] * 60, direction[1] * 60);
		});
	}

	function addZoomControls(tree) {
		
		var bar = document.createElement('div');
		bar.className = 'zoom-controls';

		CONTROLS.forEach(function (control) {
			var button = document.createElement('button');
			button.type = 'button';
			button.classList = "nav-icon"
			button.title = control.label;
			button.setAttribute('aria-label', control.label);
			button.style.gridColumn = control.at[0];
			button.style.gridRow = control.at[1];
			if (control.at[1] === 4) {
				button.classList.add('below-pad');
			}
			button.innerHTML = control.markup
				? '<svg viewBox="0 0 64 64" class="icon-filled" aria-hidden="true" focusable="false">'
					+ control.markup + '</svg>'
				: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">'
					+ (control.circle ? '<circle cx="8" cy="8" r="5"></circle>' : '')
					+ '<path d="' + control.icon + '"></path></svg>';

			if (control.mode) {
				modeButton = button;
				button.addEventListener('click', function () {
					if (mode === 'ancestors') { mode = 'descendants'; draw(); }
					else if (startPerson) { showAncestorsOf(startPerson); }
				});
				updateModeButton();
			} else if (control.hold) {
				addHoldToPan(button, { panBy: function (dx, dy) { (chart || tree).panBy(dx, dy); } },
					control.hold);
			} else {
				button.addEventListener('click', function () {
					control.action(chart || tree);
				});
			}

			bar.appendChild(button);
		});
		
		bar.appendChild(colorPicker('man', 1));
		bar.appendChild(colorReset(2));
		bar.appendChild(colorPicker('woman', 3));
		
		document.getElementById('graph').appendChild(bar);
	}

	// ---------- cards lean towards the pointer ----------

	var TILT = 12;          // degrees at the very edge of a card
	var LIFT = 1.05;        // how much it grows while under the pointer
	var FOLLOW = 'transform 80ms linear';
	var SETTLE = 'transform 550ms cubic-bezier(.34, 1.56, .64, 1)';

	function addCardTilt(graph) {
		if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			return;
		}

		var hovered = null;

		function release(card) {
			if (!card) return;
			card.style.transition = SETTLE;
			card.style.transform = '';
		}

		graph.addEventListener('mousemove', function (event) {
			var card = event.target.closest ? event.target.closest('.man, .woman, .unknown') : null;

			if (card !== hovered) {
				release(hovered);
				hovered = card;
				if (card) {
					// a quick lean in, then it tracks the pointer
					card.style.transition = SETTLE;
				}
			}
			if (!card) return;

			var box = card.getBoundingClientRect();
			if (!box.width || !box.height) return;

			// -1 at the left or top edge, +1 at the right or bottom
			var acrossX = (event.clientX - (box.left + box.width / 2)) / (box.width / 2);
			var acrossY = (event.clientY - (box.top + box.height / 2)) / (box.height / 2);
			acrossX = Math.max(-1, Math.min(1, acrossX));
			acrossY = Math.max(-1, Math.min(1, acrossY));

			card.style.transform = 'perspective(600px) rotateY(' + (acrossX * TILT).toFixed(2) + 'deg)'
				+ ' rotateX(' + (-acrossY * TILT).toFixed(2) + 'deg)'
				+ ' scale(' + LIFT + ')';

			// after the first frame, follow the pointer without lag
			window.setTimeout(function () {
				if (hovered === card) card.style.transition = FOLLOW;
			}, 0);
		});

		// leaving the graph entirely, or the window
		graph.addEventListener('mouseleave', function () {
			release(hovered);
			hovered = null;
		});
	}
	// ---------- card colors ----------

	// The colors live in CSS variables, so a change repaints every card at
	// once, and are remembered per browser.
	var color_KEYS = {
		man: { variable: '--man-color', fallback: '#d4d4d4', label: 'Color for men' },
		woman: { variable: '--woman-color', fallback: '#91ee91', label: 'Color for women' }
	};
	var color_STORE = 'familyTreeCardcolors';

	function savedcolors() {
		try {
			return JSON.parse(window.localStorage.getItem(color_STORE)) || {};
		} catch (err) {
			return {};   // private browsing, or nothing saved yet
		}
	}

	/** Relative luminance, 0 (black) to 1 (white). */
	function luminance(hex) {
		var channels = [1, 3, 5].map(function (i) {
			return parseInt(hex.substr(i, 2), 16) / 255;
		}).map(function (c) {
			return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
		});
		return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
	}

	function applycolor(which, value) {
		var settings = color_KEYS[which];
		var root = document.documentElement.style;
		root.setProperty(settings.variable, value);

		// 0.179 is where white text overtakes black for readability, by the
		// WCAG contrast formula. Below it, light text and a lighter hover.
		var dark = luminance(value) < 0.179;
		root.setProperty(settings.variable + '-text', dark ? '#fff' : '#111');
		root.setProperty(settings.variable + '-mix', dark ? 'white' : 'black');
		updateFavicon();
	}

	function remembercolor(which, value) {
		var all = savedcolors();
		all[which] = value;
		try {
			window.localStorage.setItem(color_STORE, JSON.stringify(all));
		} catch (err) {
			// nothing to do: the color still applies for this visit
		}
	}

	/** Puts both colors back to the ones the site ships with. */
	function colorReset(column) {
		var button = document.createElement('button');
		button.type = 'button';
		button.className = 'nav-icon color-reset';
		button.title = 'Back to the default colors';
		button.setAttribute('aria-label', 'Back to the default colors');
		button.style.gridColumn = column;
		button.style.gridRow = 5;
		button.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">'
			+ '<path d="M13 8a5 5 0 1 1-1.6-3.7"></path><path d="M13 2v3h-3"></path></svg>';

		button.addEventListener('click', function () {
			Object.keys(color_KEYS).forEach(function (which) {
				var settings = color_KEYS[which];
				applycolor(which, settings.fallback);
				if (settings.input) settings.input.value = settings.fallback;
			});
			try {
				window.localStorage.removeItem(color_STORE);
			} catch (err) {
				// nothing to do
			}
		});
		return button;
	}



	/** Redraw the tab icon in the colours currently chosen. */
	function updateFavicon() {
		var favicon = document.getElementById('dynamic-favicon');
		if (!favicon) return;

		var styles = getComputedStyle(document.documentElement);
		var man = (styles.getPropertyValue('--man-color') || '#d4d4d4').trim();
		var woman = (styles.getPropertyValue('--woman-color') || '#91ee91').trim();

		var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
			+ '<rect width="64" height="64" rx="12" fill="#222"/>'
			+ '<g stroke="#ffffff" stroke-width="4" fill="none" stroke-linecap="round">'
			+ '<path d="M32 24v8"/><path d="M16 44V32h32v12"/></g>'
			+ '<rect x="20" y="8" width="24" height="17" rx="5" fill="' + man + '"/>'
			+ '<rect x="5" y="43" width="22" height="16" rx="5" fill="' + woman + '"/>'
			+ '<rect x="37" y="43" width="22" height="16" rx="5" fill="' + man + '"/>'
			+ '</svg>';

		favicon.href = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
	}

	/** A color input, sized and placed like the buttons above it. */
	function colorPicker(which, column) {
		var settings = color_KEYS[which];
		var saved = savedcolors()[which];
		if (saved) applycolor(which, saved);

		var input = document.createElement('input');
		input.type = 'color';
		input.className = 'color-picker';
		input.value = saved || settings.fallback;
		input.title = settings.label;
		input.setAttribute('aria-label', settings.label);
		input.style.gridColumn = column;
		input.style.gridRow = 5;

		input.addEventListener('input', function () {
			applycolor(which, input.value);
		});
		input.addEventListener('change', function () {
			remembercolor(which, input.value);
		});
		settings.input = input;
		return input;
	}

		// Which chart is on screen, and who it starts from. Both call showInfo,
	// so the panel behaves the same either way.
	var mode = 'descendants';
	var startPerson = null;
	var chart = null;
	var treeData = null;
	var modeButton = null;

	function drawDescendants() {
		chart = dTree.init(treeData, {
			target: '#graph',
			debug: false,
			hideMarriageNodes: true,
			marriageNodeSize: 3,
			height: 800,
			width: 1200,
			callbacks: {
				nodeClick: function (name, extra) { showInfo(this, name, extra); },
				textRenderer: renderNodeText,
				nodeHeightSeperation: function (nodeWidth, nodeMaxHeight) {
					return nodeMaxHeight + GENERATION_GAP;
				}
			}
		});
		addSpouseStyles();
	}

	function drawAncestors(person) {
		chart = window.Pedigree.render(document.getElementById('graph'), person, {
			textRenderer: renderNodeText,
			onNodeClick: function (name, extra) { showInfo(this, name, extra); }
		});
	}

	/** Swap charts, keeping the controls pointed at whichever is showing. */
	function draw() {
		var graph = document.getElementById('graph');
		var panel = graph.querySelector('.info');
		if (panel) panel.remove();
		if (chart && chart.destroy) chart.destroy();
		var svg = graph.querySelector(':scope > svg');
		if (svg) svg.remove();

		if (mode === 'ancestors' && startPerson) {
			drawAncestors(startPerson);
		} else {
			mode = 'descendants';
			drawDescendants();
		}
		updateModeButton();
	}

	function updateModeButton() {
		if (!modeButton) return;
		var toAncestors = mode === 'descendants';
		var label = toAncestors ? 'Show ancestors of the person you pick' : 'Back to the whole tree';
		modeButton.title = label;
		modeButton.setAttribute('aria-label', label);
		modeButton.classList.toggle('active', !toAncestors);
		modeButton.disabled = toAncestors && !startPerson;
	}

	function showAncestorsOf(person) {
		startPerson = person;
		mode = 'ancestors';
		draw();
	}

	// ---------- going to a person ----------

	var JUMP_ZOOM = 1.5;      // how close to come in on the card
	var FOUND_MS = 4500;      // how long the highlight stays
	var foundTimer = null;

	/**
	 * Keep the address bar naming whoever's panel is open, so reloading or
	 * sharing the link comes back to them rather than to whoever you arrived
	 * at. replaceState, not pushState: clicking around shouldn't fill the back
	 * button with one entry per person.
	 */
	function setUrlPerson(id) {
		var url = new URL(window.location.href);
		if (id == null) {
			url.searchParams.delete('person');
		} else {
			url.searchParams.set('person', id);
		}
		var next = url.pathname + url.search + url.hash;
		if (next !== window.location.pathname + window.location.search + window.location.hash) {
			window.history.replaceState(null, '', next);
		}
	}

	/** The person's card on the chart that is showing, or null. */
	function cardFor(id) {
		var label = document.querySelector('#graph p[data-person="' + id + '"]');
		return label ? label.closest('foreignObject') : null;
	}

	function showNotice(text) {
		var graph = document.getElementById('graph');
		var old = graph.querySelector('.notice');
		if (old) old.remove();
		var note = document.createElement('div');
		note.className = 'notice';
		note.textContent = text;
		graph.appendChild(note);
		window.setTimeout(function () { note.remove(); }, 6000);
	}

	/**
	 * Take the view to a person's card, highlight it and open their panel.
	 *
	 * A person has one position, and it is on the full tree, so from the
	 * ancestor chart this switches back to that first.
	 */
	function jumpToPerson(id) {
		var person = peopleById[id];
		if (person && mode !== 'descendants') {
			mode = 'descendants';
			draw();
		}
		var node = person ? cardFor(id) : null;
		if (!node) {
			showNotice('That person isn\u2019t on this chart. They may be in the other tree, or not yet joined to this one.');
			setUrlPerson(null);
			return false;
		}

		// The card div is id="node<N>", where N is the id dTree itself uses for the
		// node. (The foreignObject's own id is a different counter, and would
		// centre on the wrong person.)
		var card = node.querySelector('div');
		chart.zoomToNode(parseInt(card.id.replace('node', ''), 10), JUMP_ZOOM, 700);

		// one highlight at a time, however quickly you jump about
		Array.prototype.forEach.call(document.querySelectorAll('.found'), function (other) {
			other.classList.remove('found');
		});
		window.clearTimeout(foundTimer);
		card.classList.add('found');
		foundTimer = window.setTimeout(function () { card.classList.remove('found'); }, FOUND_MS);

		showInfo(node, person.name, person.extra);
		return true;
	}

	// Gap between one generation's cards and the next, on top of the card
	// height itself. dTree's own default is 25.
	var GENERATION_GAP = 60;

	// ---------- init ----------

	d3.json(thefile, function (error, data) {
		if (error) {
			console.error('Could not load ' + thefile, error);
			return;
		}
		if (window.FamilyRelations) {
			family = window.FamilyRelations.index(data);
			family.people.forEach(function (person) {
				if (person.extra && person.extra.person_id != null) {
					peopleById[person.extra.person_id] = person;
				}
			});
		}
		treeData = data;
		drawDescendants();
		addZoomControls(chart);
		addCardTilt(document.getElementById('graph'));

		// The panel can close several ways (the cross, a click elsewhere, switching
		// charts), so watch for it going rather than hooking each one.
		new MutationObserver(function () {
			if (!document.querySelector('#graph > .info')) setUrlPerson(null);
		}).observe(document.getElementById('graph'), { childList: true });

		// arriving from a link: /?person=123
		var wanted = new URLSearchParams(window.location.search).get('person');
		if (wanted !== null && /^\d+$/.test(wanted)) {
			jumpToPerson(Number(wanted));
		}
	});
})();