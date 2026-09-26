// Closes the info panel via its × button, or on any click outside the panel and the tree nodes.
(function () {
	'use strict';

	function isInsidePanelOrNode(el) {
		for (; el; el = el.parentNode) {
			if (el.classList && el.classList.contains('info')) return true;
			if (el.localName === 'foreignObject') return true;
		}
		return false;
	}

	document.addEventListener('click', function (event) {
		var info = document.querySelector('.info');
		if (!info) return;

		// the × always closes it
		if (event.target.closest('#close')) {
			info.remove();
			return;
		}
		// while a relationship is being compared, the panel stays put so you
		// can pan and zoom your way to the other person
		if (info.classList.contains('relating')) return;

		if (!isInsidePanelOrNode(event.target)) {
			info.remove();
		}
	});
})();