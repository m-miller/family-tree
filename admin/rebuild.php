<?php
/**
 * Rebuilds the JSON files, one tree at a time, and reports what it used.
 *
 * This is a page of its own rather than a redirect, so that if the rebuild
 * runs out of memory or time you can see how far it got and what the limits
 * are, instead of a blank 500.
 */

require_once __DIR__ . '/lib/layout.php';
require_once __DIR__ . '/lib/tree.php';
require_once __DIR__ . '/lib/errors.php';

install_error_handlers();
require_login();

// Shared hosts often allow raising these per request; if not, the calls are
// simply ignored and the report below shows the real limits.
@ini_set('memory_limit', '256M');
@set_time_limit(180);

$results = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    check_csrf();
    foreach (fetch_all('SELECT * FROM trees ORDER BY id') as $tree) {
        $started = microtime(true);
        $before = memory_get_usage(true);
        [$written, $errors] = rebuild_json_files((int) $tree['id']);
        $results[] = [
            'tree'    => $tree['title'],
            'file'    => $tree['json_file'],
            'written' => $written,
            'errors'  => $errors,
            'seconds' => round(microtime(true) - $started, 2),
            'memory'  => memory_get_peak_usage(true) - $before,
        ];
    }
}

page_header('Rebuild the tree files');
?>

<?php if ($results): ?>
	<table class="people">
		<thead><tr><td>Tree</td><td>Result</td><td>Seconds</td><td>Memory</td></tr></thead>
		<tbody>
		<?php foreach ($results as $r): ?>
			<tr>
				<td><?= h($r['tree']) ?></td>
				<td>
					<?php if ($r['errors']): ?>
						<?php foreach ($r['errors'] as $e): ?>
							<span class="warn"><?= h($e) ?></span><br>
						<?php endforeach; ?>
					<?php else: ?>
						Wrote <?= h($r['file']) ?>
					<?php endif; ?>
				</td>
				<td><?= h($r['seconds']) ?></td>
				<td><?= h(round(max($r['memory'], 0) / 1048576, 1)) ?> MB</td>
			</tr>
		<?php endforeach; ?>
		</tbody>
	</table>
	<p><a href="index.php">Back to the people list</a></p>
<?php else: ?>
	<?php $stale = stale_trees(); ?>
	<?php if ($stale): ?>
		<p class="flash warn">These files are behind the database:
			<?= h(implode(', ', array_map(function ($t) { return $t['json_file']; }, $stale))) ?></p>
	<?php else: ?>
		<p class="flash ok">The site already matches the database.</p>
	<?php endif; ?>
	<form method="post">
		<?= csrf_field() ?>
		<button type="submit">Rebuild now</button>
		<a class="cancel" href="index.php">Cancel</a>
	</form>
<?php endif; ?>

<h2>Limits on this server</h2>
<table class="people">
	<tbody>
		<tr><td>PHP version</td><td><?= h(PHP_VERSION) ?></td></tr>
		<tr><td>Memory limit</td><td><?= h(ini_get('memory_limit')) ?></td></tr>
		<tr><td>Max execution time</td><td><?= h(ini_get('max_execution_time')) ?> seconds</td></tr>
		<tr><td>Peak memory this request</td><td><?= h(round(memory_get_peak_usage(true) / 1048576, 1)) ?> MB</td></tr>
		<tr><td>Writing to</td><td><?= h(realpath(config('site_root')) ?: config('site_root')) ?></td></tr>
		<tr><td>Folder writable</td><td><?= is_writable(config('site_root')) ? 'yes' : 'no' ?></td></tr>
	</tbody>
</table>
<?php page_footer();
