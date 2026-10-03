/**
 * "Look up" buttons beside the place fields in the admin.
 *
 * Asks the server for candidate places, shows what came back, and fills in
 * the coordinates for whichever you choose. It never rewrites the place name
 * you typed: these are historical names, and the match is often approximate.
 */
(function () {
	'use strict';

	function fieldValue(form, name) {
		var input = form.querySelector('[name="' + name + '"]');
		console.log(input);
		return input ? input.value.trim() : '';
	}

	/** The place name to search for: the parts of this group, joined up. */
	function queryFor(button) {
		var form = button.closest('form');
		var parts = (button.dataset.fields || '').split(',')
			.map(function (name) { return fieldValue(form, name); })
			.filter(Boolean);
		return parts.join(', ');
	}

	function show(results, panel, button) {
		var form = button.closest('form');
		var latField = form.querySelector('[name="' + button.dataset.lat + '"]');
		var lngField = form.querySelector('[name="' + button.dataset.lng + '"]');

		panel.innerHTML = '';
		if (!results.length) {
			panel.textContent = 'Nothing found. The place may have changed name, or no longer exist.';
			return;
		}

		results.forEach(function (place) {
			var choice = document.createElement('button');
			choice.type = 'button';
			choice.className = 'place-choice';
			choice.innerHTML = '<strong>' + place.lat + ', ' + place.lng + '</strong> '
				+ place.name;
			choice.addEventListener('click', function () {
				if (latField) latField.value = place.lat;
				if (lngField) lngField.value = place.lng;
				panel.textContent = 'Using ' + place.lat + ', ' + place.lng
					+ ' - save the person to keep it.';
			});
			panel.appendChild(choice);
		});
	}

	function attach(button) {
		var panel = document.createElement('div');
		panel.className = 'place-results';
		button.parentNode.insertBefore(panel, button.nextSibling);

		button.addEventListener('click', function () {
			var query = queryFor(button);
			if (query.length < 3) {
				panel.textContent = 'Fill in the place first.';
				return;
			}
			panel.textContent = 'Looking up ' + query + '\u2026';
			fetch('/admin/places?q=' + encodeURIComponent(query), { credentials: 'same-origin' })
				.then(function (response) { return response.json(); })
				.then(function (results) { show(results, panel, button); })
				.catch(function () { panel.textContent = 'The lookup failed. Try again in a moment.'; });
		});
	}

	document.addEventListener('DOMContentLoaded', function () {
		document.querySelectorAll('.place-lookup').forEach(attach);
	});
})();