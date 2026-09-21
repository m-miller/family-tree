<?php
/** Page chrome shared by the admin pages. */

require_once __DIR__ . '/auth.php';

function flash($message, $type = 'ok')
{
    start_session();
    $_SESSION['flash'][] = ['message' => $message, 'type' => $type];
}

function take_flashes()
{
    start_session();
    $out = $_SESSION['flash'] ?? [];
    unset($_SESSION['flash']);
    return $out;
}

function redirect($url)
{
    header('Location: ' . $url);
    exit;
}

function page_header($title, $show_nav = true)
{
    $user = current_user();
    ?><!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= h($title) ?> &middot; Family Tree Admin</title>
<link rel="stylesheet" href="admin.css">
</head>
<body>
<?php if ($show_nav && $user): ?>
<nav>
	<a href="index.php">People</a>
	<a href="person.php?new=1">Add a person</a>
	<a href="../index.html">View the tree</a>
	<span class="spacer"></span>
	<span class="who">Signed in as <?= h($user['username']) ?></span>
	<a href="logout.php">Sign out</a>
</nav>
<?php endif; ?>
<main>
<h1><?= h($title) ?></h1>
<?php foreach (take_flashes() as $f): ?>
	<p class="flash <?= h($f['type']) ?>"><?= h($f['message']) ?></p>
<?php endforeach;
}

function page_footer()
{
    echo "</main>\n</body>\n</html>\n";
}

/** <input> with the current value filled in. */
function field($label, $name, $value, $attrs = '')
{
    printf('<label>%s<input type="text" name="%s" value="%s" %s></label>' . "\n",
           h($label), h($name), h($value), $attrs);
}

function textarea($label, $name, $value)
{
    printf('<label>%s<textarea name="%s" rows="3">%s</textarea></label>' . "\n",
           h($label), h($name), h($value));
}

function checkbox($label, $name, $checked)
{
    printf('<label class="check"><input type="checkbox" name="%s" value="1"%s> %s</label>' . "\n",
           h($name), $checked ? ' checked' : '', h($label));
}

/**
 * Handles the rebuild button. Call near the top of any page that shows it,
 * before any output. $back is where to return afterwards.
 */
function handle_rebuild_post($back)
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST' || ($_POST['action'] ?? '') !== 'rebuild') {
        return;
    }
    check_csrf();
    list($written, $errors) = rebuild_json_files();
    foreach ($errors as $e) {
        flash($e, 'error');
    }
    if ($written) {
        flash('Rebuilt ' . implode(' and ', $written) . '. The site is up to date.');
    }
    redirect($back);
}

/** Rebuild button, with a warning when the files are behind the database. */
function rebuild_form()
{
    $stale = stale_trees();
    $names = array_map(function ($t) { return $t['json_file']; }, $stale);
    ?>
	<form method="get" action="rebuild.php" class="inline rebuild<?= $stale ? ' is-stale' : '' ?>">
		<button type="submit">Rebuild the tree files</button>
		<?php if ($stale): ?>
			<span class="warn">Not yet on the site: <?= h(implode(', ', $names)) ?> needs rebuilding.</span>
		<?php else: ?>
			<span class="ok-note">The site matches the database.</span>
		<?php endif; ?>
	</form>
	<?php
}

/**
 * A column heading that links to the same list sorted by that column,
 * flipping direction when it's already the active one.
 */
function sort_link($column, $label, $current_sort, $current_dir, $tree_id, $search)
{
    $is_current = $column === $current_sort;
    $next_dir = ($is_current && $current_dir === 'ASC') ? 'desc' : 'asc';
    $query = http_build_query(array_filter([
        'sort' => $column,
        'dir'  => $next_dir,
        'tree' => $tree_id ?: null,
        'q'    => $search !== '' ? $search : null,
    ]));
    $arrow = $is_current ? ($current_dir === 'ASC' ? " \u{25B2}" : " \u{25BC}") : '';
    return sprintf('<a class="sort%s" href="index.php?%s">%s%s</a>',
                   $is_current ? ' active' : '', h($query), h($label), $arrow);
}

/** A person's name with dates, for dropdowns and lists. */
function person_label(array $p)
{
    $dates = trim(($p['birth_date_text'] ?: '?') . ' - ' . ($p['death_date_text'] ?: ''));
    return $p['name'] . ' (' . $dates . ')';
}
