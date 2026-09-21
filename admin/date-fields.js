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

	function remInPixels() {
		var size = parseFloat(getComputedStyle(document.documentElement).fontSize);
		return size || 16;
	}

	/**
	 * Put the picker beside the calendar button, one rem clear of it.
	 *
	 * The library anchors the picker to the input it owns - our hidden helper -
	 * so it needs placing by hand. It is positioned, then measured and nudged,
	 * because the visible card sits inside a wrapper with its own padding and
	 * the offset parent isn't always the page.
	 */
	function placeBesideButton(button, element) {
		var gap = remInPixels();
		var card = element.querySelector('.datepicker-picker') || element;
		var box = button.getBoundingClientRect();
		var width = card.offsetWidth || 260;

		// the left of the button by preference, the right if there's no room
		var onLeft = box.left - gap - width >= gap;
		var wantedX = onLeft ? box.left - gap - width : box.right + gap;
		var wantedY = box.top;

		element.style.position = 'absolute';
		element.style.left = (wantedX + window.pageXOffset) + 'px';
		element.style.top = (wantedY + window.pageYOffset) + 'px';
		element.classList.toggle('from-right', onLeft);

		// measure where the card actually landed and correct the difference
		var landed = card.getBoundingClientRect();
		if (landed.width) {
			element.style.left = (parseFloat(element.style.left) + (wantedX - landed.left)) + 'px';
			element.style.top = (parseFloat(element.style.top) + (wantedY - landed.top)) + 'px';
		}
	}

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

		var pickerElement = picker.picker.element;
		pickerElement.classList.add('beside-icon');

		helper.addEventListener('show', function () {
			placeBesideButton(button, pickerElement);
			// next frame: the library positions on show too, so place again
			// after it, and give the transition a starting point to move from
			requestAnimationFrame(function () {
				placeBesideButton(button, pickerElement);
				pickerElement.classList.add('is-in');
			});
		});

		helper.addEventListener('hide', function () {
			pickerElement.classList.remove('is-in');
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