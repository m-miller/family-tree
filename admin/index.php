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
$sql .= ' ORDER BY ' . $order_by . ', p.name LIMIT 500';
$people = fetch_all($sql, $params);

page_header('People');
?>
<?php rebuild_form() ?>

<form method="get" class="inline">
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

<p class="count"><?= count($people) ?> people<?= count($people) === 500 ? ' (showing the first 500)' : '' ?></p>

<table class="people">
	<thead>
		<tr>
			<td><?= sort_link('name', 'Name', $sort, $dir, $tree_id, $search) ?></td>
			<td>Tree</td>
			<td><?= sort_link('born', 'Born', $sort, $dir, $tree_id, $search) ?></td>
			<td><?= sort_link('died', 'Died', $sort, $dir, $tree_id, $search) ?></td>
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
