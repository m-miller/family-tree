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
			// marriage
			part(e.married_to, '<hr />Married to: ') +
			part(e.married_date, '<br />on: ') +
			part(e.married_place, '<br />at: ') +
			part(e.married_city, '<br />') +
			part(e.married_state, ', ') +
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
			// burial
			part(e.buried, '<br />Buried: ') +
			externalLink(e.buried_link, 'Cemetery Map') +
			externalLink(e.buried_grave, 'Find a Grave') +
			part(e.notes, '<hr />Notes: ');
	}

	// `nodeEl` is the clicked foreignObject; its child div carries the man/woman class
	function showInfo(nodeEl, name, extra) {
		var nodeDiv = nodeEl.querySelector('div');
		var colourClass = nodeDiv && nodeDiv.classList.contains('man') ? 'info-man' : 'info-woman';

		var info = document.querySelector('.info');
		if (!info) {
			info = document.createElement('div');
			document.getElementById('graph').appendChild(info);
		}
		info.className = 'info ' + colourClass;
		info.innerHTML = buildInfoHtml(name, extra);
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

	// ---------- init ----------

	d3.json(thefile, function (error, treeData) {
		if (error) {
			console.error('Could not load ' + thefile, error);
			return;
		}
		dTree.init(treeData, {
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
				textRenderer: renderNodeText
			}
		});
		addSpouseStyles();
	});
})();