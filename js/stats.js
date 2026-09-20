// Stats page: loads the tree data, fills the tables and draws the charts.
(function () {
	'use strict';

	const DATA_FILE = 'data.json';
	const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

	// ---------- dates ----------

	// Month name ('Mar' or 'March') -> 0-11, or null
	function monthIndex(word) {
		const i = MONTHS.map(function (m) { return m.toLowerCase(); }).indexOf(word.slice(0, 3).toLowerCase());
		return i === -1 ? null : i;
	}

	// Parse 'D Mon YYYY', 'Mon YYYY' or 'YYYY' without relying on the browser's Date parser.
	// Returns {day, month, year} (missing parts are null), or null if unparseable.
	function parseDate(str) {
		if (typeof str !== 'string') return null;
		const s = str.trim().replace(/\s+/g, ' ');
		let m;
		if ((m = s.match(/^(\d{1,2}) ([A-Za-z]+) (\d{4})$/))) {
			const month = monthIndex(m[2]);
			const day = parseInt(m[1], 10);
			if (month === null || day < 1 || day > 31) return null;
			return { day: day, month: month, year: parseInt(m[3], 10) };
		}
		if ((m = s.match(/^([A-Za-z]+) (\d{4})$/))) {
			const month = monthIndex(m[1]);
			if (month === null) return null;
			return { day: null, month: month, year: parseInt(m[2], 10) };
		}
		if ((m = s.match(/^(\d{4})$/))) {
			return { day: null, month: null, year: parseInt(m[1], 10) };
		}
		return null;
	}

	function isFullDate(d) {
		return d !== null && d.day !== null && d.month !== null;
	}

	// Whole years between two full dates
	function calcAge(birth, death) {
		let years = death.year - birth.year;
		if (death.month < birth.month || (death.month === birth.month && death.day < birth.day)) {
			years--;
		}
		return years;
	}

	// ---------- data helpers ----------

	// Every value of `property` anywhere in the tree, in document order
	function collectValues(obj, property, output) {
		output = output || [];
		for (const key in obj) {
			if (obj[key] !== null && typeof obj[key] === 'object') {
				collectValues(obj[key], property, output);
			} else if (key === property) {
				output.push(obj[key]);
			}
		}
		return output;
	}

	// [value, value, ...] -> [[value, count], ...] sorted by count, highest first
	function countSorted(values) {
		const counts = {};
		values.forEach(function (v) {
			counts[v] = (counts[v] || 0) + 1;
		});
		return Object.keys(counts)
			.map(function (k) { return [k, counts[k]]; })
			.sort(function (a, b) { return b[1] - a[1]; });
	}

	// Month names from a list of dates. Dates with no month go into `unknown`.
	// Blank dates count as unknown only when blankIsUnknown is true.
	function monthsOf(dates, blankIsUnknown) {
		const months = [];
		let unknown = 0;
		dates.forEach(function (str) {
			if (typeof str !== 'string' || str.trim() === '') {
				if (blankIsUnknown) unknown++;
				return;
			}
			const d = parseDate(str);
			if (d !== null && d.month !== null) {
				months.push(MONTHS[d.month]);
			} else {
				unknown++;
			}
		});
		return { months: months, unknown: unknown };
	}

	// Ages at death. A blank death date is skipped (may be living / not recorded);
	// anything else without two full dates goes into the unknown/approximate count.
	// birthdates[i] and deathdates[i] belong to the same person.
	function agesOf(birthdates, deathdates) {
		const ages = [];
		let unknown = 0;
		for (let i = 0; i < birthdates.length; i++) {
			if (deathdates[i] === '') continue;
			const b = parseDate(birthdates[i]);
			const d = parseDate(deathdates[i]);
			if (isFullDate(b) && isFullDate(d)) {
				ages.push(calcAge(b, d));
			} else {
				unknown++;
			}
		}
		return { ages: ages, unknown: unknown };
	}

	// ---------- tables ----------

	// Summary rows (unknown, average) stay at the bottom when the table is sorted
	function addRow(label, value, tbodyId, isSummary) {
		const row = document.getElementById(tbodyId).insertRow(-1);
		row.insertCell(0).textContent = label;
		row.insertCell(1).textContent = value;
		if (isSummary) row.dataset.summary = 'true';
	}

	function makeSortable(table) {
		const headers = table.tHead.rows[0].cells;
		Array.prototype.forEach.call(headers, function (cell, col) {
			cell.classList.add('sortable');
			cell.addEventListener('click', function () {
				const ascending = cell.getAttribute('aria-sort') !== 'ascending';
				Array.prototype.forEach.call(headers, function (h) { h.removeAttribute('aria-sort'); });
				cell.setAttribute('aria-sort', ascending ? 'ascending' : 'descending');

				const body = table.tBodies[0];
				const rows = Array.from(body.rows);
				const dataRows = rows.filter(function (r) { return !r.dataset.summary; });
				const summaryRows = rows.filter(function (r) { return r.dataset.summary; });

				dataRows.sort(function (a, b) {
					const x = a.cells[col].textContent;
					const y = b.cells[col].textContent;
					const nx = Number(x);
					const ny = Number(y);
					const result = (!isNaN(nx) && !isNaN(ny)) ? nx - ny : x.localeCompare(y);
					return ascending ? result : -result;
				});
				dataRows.concat(summaryRows).forEach(function (r) { body.appendChild(r); });
			});
		});
	}

	// ---------- charts ----------

	// pairs: [[label, count], ...] sorted by count, highest first
	function barchart(pairs, selector, color) {
		const margin = { top: 30, right: 30, bottom: 70, left: 20 };
		const width = 500;
		const height = 400 - margin.top - margin.bottom;

		const svg = d3.select(selector)
			.append('svg')
			.attr('width', width + margin.left + margin.right)
			.attr('height', height + margin.top + margin.bottom)
			.append('g')
			.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

		const x = d3.scaleBand()
			.range([0, width])
			.domain(pairs.map(function (d) { return d[0]; }))
			.padding(0.2);
		svg.append('g')
			.attr('transform', 'translate(0,' + height + ')')
			.call(d3.axisBottom(x))
			.selectAll('text')
			.attr('transform', 'translate(-10,0)rotate(-45)')
			.style('text-anchor', 'end');

		const y = d3.scaleLinear()
			.domain([0, d3.max(pairs, function (d) { return d[1]; }) || 0])
			.range([height, 0]);
		svg.append('g')
			.call(d3.axisLeft(y));

		const tooltip = d3.select(selector).append('div')
			.attr('class', 'tooltip')
			.style('opacity', 0);

		svg.selectAll('rect.bar')
			.data(pairs)
			.enter()
			.append('rect')
			.attr('class', 'bar')
			.attr('x', function (d) { return x(d[0]); })
			.attr('width', x.bandwidth())
			.attr('fill', color)
			// start with no height, then animate up
			.attr('y', y(0))
			.attr('height', 0)
			.on('mouseover', function (d) {
				tooltip.transition().duration(200).style('opacity', 0.8);
				tooltip.text(d[0] + ', ' + d[1])
					.style('left', (d3.event.layerX - 10) + 'px')
					.style('top', (d3.event.layerY - 40) + 'px');
			})
			.on('mouseout', function () {
				tooltip.transition().duration(500).style('opacity', 0);
			})
			.transition()
			.duration(800)
			.delay(function (d, i) { return i * 100; })
			.attr('y', function (d) { return y(d[1]); })
			.attr('height', function (d) { return height - y(d[1]); });
	}

	// ---------- page ----------

	function render(tree) {
		const birthdates = collectValues(tree, 'birthdate');
		const deathdates = collectValues(tree, 'deathdate');
		const marriedDates = collectValues(tree, 'married_date');
		const firstNames = collectValues(tree, 'name').map(function (n) { return n.split(' ')[0]; });

		// births: blank = unknown; deaths: blank = skipped (may be living); marriages: blank = skipped
		const births = monthsOf(birthdates, true);
		const deaths = monthsOf(deathdates, false);
		const marriages = monthsOf(marriedDates, false);
		const ages = agesOf(birthdates, deathdates);

		const sortedBirths = countSorted(births.months);
		const sortedDeaths = countSorted(deaths.months);
		const sortedNames = countSorted(firstNames);
		const sortedAges = countSorted(ages.ages);
		const sortedMarriages = countSorted(marriages.months);

		// average over every person with a known age (not over distinct ages)
		const total = ages.ages.reduce(function (sum, a) { return sum + a; }, 0);
		const avg = ages.ages.length ? Math.round(total / ages.ages.length) : '';

		sortedBirths.forEach(function (p) { addRow(p[0], p[1], 'bdaysbody'); });
		addRow('Unknown/approximate', births.unknown, 'bdaysbody', true);

		sortedDeaths.forEach(function (p) { addRow(p[0], p[1], 'ddaysbody'); });
		addRow('Unknown/approximate', deaths.unknown, 'ddaysbody', true);

		sortedNames.forEach(function (p) { addRow(p[0], p[1], 'namesbody'); });

		sortedAges.forEach(function (p) { addRow(p[0], p[1], 'agesbody'); });
		addRow('Unknown/approximate', ages.unknown, 'agesbody', true);
		addRow('Average', avg, 'agesbody', true);

		document.querySelector('#married p').append(' (' + marriages.unknown + ' unknown/approximate not shown)');

		barchart(sortedNames.slice(0, 20), '#namesgraph', '#045FB4');
		barchart(sortedAges.slice(0, 20), '#agesgraph', '#0B2161');
		barchart(sortedMarriages.slice(0, 12), '#married', '#29088A');

		['birthdays', 'deaths', 'nameslist', 'age'].forEach(function (id) {
			makeSortable(document.getElementById(id));
		});
	}

	fetch(DATA_FILE)
		.then(function (response) {
			if (!response.ok) throw new Error(response.status + ' ' + response.statusText);
			return response.json();
		})
		.then(render)
		.catch(function (err) {
			console.error('Could not load ' + DATA_FILE, err);
		});
})();