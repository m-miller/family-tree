<?php
/** List of people, with search and the rebuild button. */

require_once __DIR__ . '/lib/layout.php';
require_once __DIR__ . '/lib/tree.php';
require_once __DIR__ . '/lib/errors.php';

install_error_handlers();
require_login();

handle_rebuild_post('index.php');

$trees = fetch_all('SELECT * FROM trees ORDER BY id');
$tree_id = isset($_GET['tree']) ? (int) $_GET['tree'] : 0;
$search = trim($_GET['q'] ?? '');

// Sorting. Dates sort by their year/month/day columns rather than the text,
// so "Dec 1843" lands in 1843 and not under D. Unknown dates always sort last.
$sorts = [
    'name' => 'p.name %s',
    'born' => 'p.birth_year IS NULL, p.birth_year %s, p.birth_month IS NULL, p.birth_month %s, p.birth_day %s',
    'died' => 'p.death_year IS NULL, p.death_year %s, p.death_month IS NULL, p.death_month %s, p.death_day %s',
];
$sort = isset($_GET['sort']) && isset($sorts[$_GET['sort']]) ? $_GET['sort'] : 'name';
$dir = (isset($_GET['dir']) && $_GET['dir'] === 'desc') ? 'DESC' : 'ASC';
$order_by = vsprintf($sorts[$sort], array_fill(0, substr_count($sorts[$sort], '%s'), $dir));

$sql = 'SELECT p.*, t.slug AS tree_slug FROM people p JOIN trees t ON t.id = p.tree_id WHERE 1=1';
$params = [];
if ($tree_id) {
    $sql .= ' AND p.tree_id = ?';
    $params[] = $tree_id;
}
if ($search !== '') {
    $sql .= ' AND p.name LIKE ?';
    $params[] = '%' . $search . '%';
}
$sql .= ' ORDER BY ' . $order_by . ', p.name';
$all = fetch_all($sql, $params);

// Group by the first letter of the surname. Done here rather than in SQL so
// that suffixes ("Sr.") and accents behave, and so it doesn't depend on the
// server having REGEXP_REPLACE.
$letter = isset($_GET['letter']) ? strtoupper(substr($_GET['letter'], 0, 1)) : '';
$counts = [];
$people = [];
foreach ($all as $person) {
    $initial = surname_letter($person['name']);
    $counts[$initial] = ($counts[$initial] ?? 0) + 1;
    if ($letter === '' || $initial === $letter) {
        $people[] = $person;
    }
}
$total = count($people);
$people = array_slice($people, 0, 500);

page_header('People');
?>
<?php rebuild_form() ?>

<form method="get" class="inline">
	<input type="hidden" name="letter" value="<?= h($letter) ?>">
	<label class="inline-label">Tree
		<select name="tree" onchange="this.form.submit()">
			<option value="0">All</option>
			<?php foreach ($trees as $t): ?>
				<option value="<?= (int) $t['id'] ?>"<?= $tree_id === (int) $t['id'] ? ' selected' : '' ?>>
					<?= h($t['title']) ?>
				</option>
			<?php endforeach; ?>
		</select>
	</label>
	<label class="inline-label">Search
		<input type="search" name="q" value="<?= h($search) ?>" placeholder="name">
	</label>
	<button type="submit">Go</button>
</form>

<?= letter_links($counts, $letter, ['tree' => $tree_id ?: null, 'q' => $search !== '' ? $search : null,
                                    'sort' => $sort !== 'name' ? $sort : null,
                                    'dir' => $dir === 'DESC' ? 'desc' : null]) ?>

<p class="count"><?= $total ?> people<?= $letter !== '' ? ' with surnames beginning ' . h($letter) : '' ?><?= $total > 500 ? ' (showing the first 500)' : '' ?></p>

<table class="people">
	<thead>
		<tr>
			<td style="width:40rem"><?= sort_link('name', 'Name', $sort, $dir, $tree_id, $search, $letter) ?></td>
			<td style="width:10rem">Tree</td>
			<td style="width:10rem"><?= sort_link('born', 'Born', $sort, $dir, $tree_id, $search, $letter) ?></td>
			<td style="width:10rem"><?= sort_link('died', 'Died', $sort, $dir, $tree_id, $search, $letter) ?></td>
			<td></td>
		</tr>
	</thead>
	<tbody>
		<?php foreach ($people as $p): ?>
		<tr>
			<td>
				<a href="person.php?id=<?= (int) $p['id'] ?>"><?= h($p['name']) ?></a>
				<?php if ($p['adopted']): ?><span class="tag">adopted</span><?php endif; ?>
				<?php if ($p['is_placeholder']): ?><span class="tag">placeholder</span><?php endif; ?>
			</td>
			<td><?= h($p['tree_slug']) ?></td>
			<td><?= h($p['birth_date_text']) ?></td>
			<td><?= h($p['death_date_text']) ?></td>
			<td><a href="person.php?id=<?= (int) $p['id'] ?>">Edit</a></td>
		</tr>
		<?php endforeach; ?>
	</tbody>
</table>
<?php page_footer();