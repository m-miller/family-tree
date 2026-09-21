/**
 * Calendar buttons for the date fields.
 *
 * The text box stays the source of truth, so partial dates ("Dec 1843",
 * "1902") and notes ("unknown", "abt 1850") can still be typed. The picker
 * only ever writes a full date, in the "3 Mar 1902" style the rest of the
 * site uses.
 *
 * The picker is attached to a hidden companion input rather than to the text
 * box itself, so the library never reformats or clears what you typed.
 */
(function () {
	'use strict';

	var FORMAT = 'd M yyyy';

	function attach(button) {
		var input = document.getElementById(button.dataset.for);
		if (!input) {
			return;
		}

		// hidden input the library owns
		var helper = document.createElement('input');
		helper.type = 'text';
		helper.tabIndex = -1;
		helper.setAttribute('aria-hidden', 'true');
		helper.className = 'date-helper';
		input.parentNode.insertBefore(helper, button.nextSibling);

		var picker = new Datepicker(helper, {
			format: FORMAT,
			autohide: true,
			todayHighlight: true,
			prevArrow: '\u2039',
			nextArrow: '\u203A'
		});

		helper.addEventListener('changeDate', function () {
			var picked = picker.getDate(FORMAT);
			if (picked) {
				input.value = picked;
				// let anything watching the field know it changed
				input.dispatchEvent(new Event('input', { bubbles: true }));
				input.focus();
			}
		});

		button.addEventListener('click', function () {
			// open on the date already typed, when it is a full one
			var existing = Datepicker.parseDate(input.value, FORMAT);
			if (!isNaN(existing) && /\d{1,2} [A-Za-z]{3,} \d{4}/.test(input.value.trim())) {
				picker.setDate(existing, { render: true });
			}
			picker.show();
		});
	}

	document.addEventListener('DOMContentLoaded', function () {
		// If the library didn't load, leave the plain text boxes alone.
		if (typeof Datepicker === 'undefined') {
			document.querySelectorAll('.date-button').forEach(function (b) {
				b.style.display = 'none';
			});
			return;
		}
		document.querySelectorAll('.date-button').forEach(attach);
	});
})();