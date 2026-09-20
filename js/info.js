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
		if (event.target.closest('#close') || !isInsidePanelOrNode(event.target)) {
			info.remove();
		}
	});
})();