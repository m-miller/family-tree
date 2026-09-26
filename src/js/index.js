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

	function personFor(extra) {
		return family && extra ? family.byExtra.get(extra) || null : null;
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
			+ escapeHtml(window.FamilyRelations.describe(person, relateTo))
			+ '</span><br /><button type="button" id="relate-clear">Clear</button>';
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
			part(e.married_to, '<hr />Married to: ') +
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
			relationshipHtml(extra);
	}

	function handlePanelButtons(info, extra) {
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
		var colourClass = 'info-unknown';
		if (nodeDiv && nodeDiv.classList.contains('man')) {
			colourClass = 'info-man';
		} else if (nodeDiv && nodeDiv.classList.contains('woman')) {
			colourClass = 'info-woman';
		}

		var info = document.querySelector('.info');
		if (!info) {
			info = document.createElement('div');
			document.getElementById('graph').appendChild(info);
		}
		info.className = 'info ' + colourClass + (relateTo ? ' relating' : '');
		info.dataset.name = name;
		info.innerHTML = buildInfoHtml(name, extra);
		handlePanelButtons(info, extra);
	}

	// ---------- node text ----------

	function renderNodeText(name, extra, textClass) {
		var text = escapeHtml(name);
		if (extra) {
			text += part(extra.birthdate, '<br /><span class="halfrem">Born: ', '</span>');
			text += part(extra.deathdate, '<br /><span class="halfrem">Died: ', '</span>');
		}
		return '<p class="' + escapeHtml(textClass) + '">' + text + '</p>';
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
		  action: function (tree) { tree.zoomBy(1.3); } }
	];

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
			button.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">'
				+ (control.circle ? '<circle cx="8" cy="8" r="5"></circle>' : '')
				+ '<path d="' + control.icon + '"></path></svg>';
			if (control.hold) {
				addHoldToPan(button, tree, control.hold);
			} else {
				button.addEventListener('click', function () {
					control.action(tree);
				});
			}
			bar.appendChild(button);
		});

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

	// Gap between one generation's cards and the next, on top of the card
	// height itself. dTree's own default is 25.
	var GENERATION_GAP = 60;

	// ---------- init ----------

	d3.json(thefile, function (error, treeData) {
		if (error) {
			console.error('Could not load ' + thefile, error);
			return;
		}
		var tree = dTree.init(treeData, {
			target: '#graph',
			debug: false,
			hideMarriageNodes: true,
			marriageNodeSize: 3,
			height: 800,
			width: 1200,
			callbacks: {
				nodeClick: function (name, extra) {
					showInfo(this, name, extra);
				},
				textRenderer: renderNodeText,
				nodeHeightSeperation: function (nodeWidth, nodeMaxHeight) {
					return nodeMaxHeight + GENERATION_GAP;
				}
			}
		});
		if (window.FamilyRelations) {
			family = window.FamilyRelations.index(treeData);
		}
		addSpouseStyles();
		addZoomControls(tree);
		addCardTilt(document.getElementById('graph'));
	});
})();