/**
 * The ancestor chart: one person at the bottom, their forebears rising above.
 *
 * dTree draws descendants, and can only go downward from a single root, so
 * this is a separate renderer. It exposes the same handful of methods the
 * control pad calls - zoomBy, panBy, resetZoom, zoomToFit - so the buttons
 * drive either chart without knowing which is on screen.
 *
 * It reads the graph FamilyRelations builds, so nothing new is loaded.
 */
(function (root) {
	'use strict';

	var CARD_WIDTH = 100;
	var CARD_HEIGHT = 60;
	var GENERATION_GAP = 60;
	var CARD_SEPARATION = 85;
	var CORNER = 7;             // radius on the elbows, as in the other chart

	/**
	 * Turn a person into a nested structure of their ancestors.
	 *
	 * `seen` stops a loop in the data - someone recorded as their own
	 * ancestor - from recursing for ever.
	 */
	function ancestorsOf(person, depth, seen) {
		seen = seen || [];
		if (!person || seen.indexOf(person) !== -1) return null;
		if (depth === 0) return { person: person, parents: [] };

		var here = seen.concat([person]);
		var parents = (person.parents || []).map(function (parent) {
			return ancestorsOf(parent, depth - 1, here);
		}).filter(Boolean);

		return { person: person, parents: parents };
	}

	/** An elbow from a parent's card down to their child's, with round corners. */
	function elbow(parent, child) {
		var midway = (parent.y + child.y) / 2;
		var sweep = parent.x > child.x ? 1 : 0;
		var corner = Math.min(CORNER, Math.abs(parent.x - child.x) / 2);
		var step = parent.x > child.x ? corner : -corner;

		if (Math.abs(parent.x - child.x) < 1) {
			return 'M' + child.x + ',' + child.y + 'V' + parent.y;
		}
		return 'M' + child.x + ',' + child.y
			+ 'V' + (midway + corner)
			+ 'Q' + child.x + ',' + midway + ' ' + (child.x - step) + ',' + midway
			+ 'H' + (parent.x + step)
			+ 'Q' + parent.x + ',' + midway + ' ' + parent.x + ',' + (midway - corner)
			+ 'V' + parent.y;
	}

	/**
	 * Draw the chart into `container` and return the handful of controls the
	 * pad uses. `options.onNodeClick` is called with (element, name, extra).
	 */
	function render(container, person, options) {
		options = options || {};
		var generations = options.generations || 12;
		var width = options.width || 1200;
		var height = options.height || 800;

		var data = ancestorsOf(person, generations);
		if (!data) return null;

		var svg = d3.select(container).append('svg')
			.attr('class', 'pedigree')
			.attr('viewBox', '0 0 ' + width + ' ' + height);
		var layer = svg.append('g');

		var hierarchy = d3.hierarchy(data, function (d) { return d.parents; });
		d3.tree().nodeSize([CARD_WIDTH + CARD_SEPARATION, CARD_HEIGHT + GENERATION_GAP])(hierarchy);

		// d3 lays a tree out downward; ancestors belong above, so the depth
		// is negated and the whole thing shifted to sit in view.
		var nodes = hierarchy.descendants();
		nodes.forEach(function (node) {
			node.y = -node.y;
		});

		layer.selectAll('path.linage')
			.data(hierarchy.links())
			.enter()
			.append('path')
			.attr('class', 'linage')
			.attr('d', function (link) { return elbow(link.target, link.source); });

		var cards = layer.selectAll('foreignObject')
			.data(nodes)
			.enter()
			.append('foreignObject')
			.attr('x', function (d) { return Math.round(d.x - CARD_WIDTH / 2) + 'px'; })
			.attr('y', function (d) { return Math.round(d.y - CARD_HEIGHT / 2) + 'px'; })
			.attr('width', CARD_WIDTH + 'px')
			.attr('height', CARD_HEIGHT + 'px')
			.html(function (d) {
				var p = d.data.person;
				return '<div style="height:100%;width:100%;" class="' + p.sex + '">'
					+ options.textRenderer(p.name, p.extra, 'nodeText') + '</div>';
			});

		if (options.onNodeClick) {
			cards.on('click', function (d) {
				options.onNodeClick.call(this, d.data.person.name, d.data.person.extra);
			});
		}

		// start with the subject near the bottom middle of the view
		var startTransform = d3.zoomIdentity.translate(width / 2, height - CARD_HEIGHT);
		var zoom = d3.zoom().scaleExtent([0.1, 10]).on('zoom', function () {
			layer.attr('transform', d3.event.transform);
		});
		svg.call(zoom).call(zoom.transform, startTransform);

		function setTransform(transform, duration) {
			svg.transition().duration(duration === undefined ? 250 : duration)
				.call(zoom.transform, transform);
		}

		return {
			zoomBy: function (factor) {
				var current = d3.zoomTransform(svg.node());
				var scale = Math.max(0.1, Math.min(10, current.k * factor));
				var anchorX = width / 2;
				var anchorY = height / 2;
				var ratio = scale / current.k;
				setTransform(d3.zoomIdentity
					.translate(anchorX - (anchorX - current.x) * ratio,
						anchorY - (anchorY - current.y) * ratio)
					.scale(scale));
			},
			panBy: function (dx, dy) {
				var current = d3.zoomTransform(svg.node());
				svg.call(zoom.transform,
					d3.zoomIdentity.translate(current.x + dx, current.y + dy).scale(current.k));
			},
			resetZoom: function () {
				setTransform(startTransform, 500);
			},
			zoomToFit: function () {
				var box = layer.node().getBBox();
				if (!box.width || !box.height) return;
				var scale = 0.95 / Math.max(box.width / width, box.height / height);
				setTransform(d3.zoomIdentity
					.translate(width / 2 - scale * (box.x + box.width / 2),
						height / 2 - scale * (box.y + box.height / 2))
					.scale(scale), 500);
			},
			/** Remove the chart, so the other view can take the container. */
			destroy: function () {
				svg.remove();
			},
			generations: hierarchy.height + 1,
			people: nodes.length
		};
	}

	var api = { render: render, ancestorsOf: ancestorsOf };

	if (typeof module === 'object' && module.exports) {
		module.exports = api;
	} else {
		root.Pedigree = api;
	}
})(typeof window !== 'undefined' ? window : this);