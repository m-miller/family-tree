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
<?php if (!empty($GLOBALS['needs_datepicker'])): ?>
	<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/vanillajs-datepicker@1.3.4/dist/css/datepicker.min.css">
	<script src="https://cdn.jsdelivr.net/npm/vanillajs-datepicker@1.3.4/dist/js/datepicker-full.min.js"></script>
	<script src="date-fields.js"></script>
<?php endif; ?>
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

/** The calendar glyph on the date buttons. Sized by CSS, not by these numbers. */
function calendar_icon()
{
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
         . '<rect x="3" y="5" width="18" height="16" rx="2"></rect>'
         . '<path d="M3 10h18"></path>'
         . '<path d="M8 3v4M16 3v4"></path>'
         . '<path d="M7 14h2M11 14h2M15 14h2M7 17.5h2M11 17.5h2"></path>'
         . '</svg>';
}

/**
 * A date text box with a calendar button. The text box still accepts
 * anything, including partial dates; the calendar only fills in full ones.
 */
function date_field($label, $name, $value)
{
    static $n = 0;
    $id = 'date-' . (++$n);
    printf('<label>%s<span class="date-row">'
         . '<input type="text" id="%s" name="%s" value="%s" autocomplete="off">'
         . '<button type="button" class="date-button" data-for="%s" title="Pick a date" '
         . 'aria-label="Pick a date">' . calendar_icon() . '</button>'
         . '</span></label>' . "\n",
           h($label), h($id), h($name), h($value), h($id));
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
function sort_link($column, $label, $current_sort, $current_dir, $tree_id, $search, $letter = '')
{
    $is_current = $column === $current_sort;
    $next_dir = ($is_current && $current_dir === 'ASC') ? 'desc' : 'asc';
    $query = http_build_query(array_filter([
        'sort' => $column,
        'dir'  => $next_dir,
        'tree' => $tree_id ?: null,
        'q'    => $search !== '' ? $search : null,
        'letter' => $letter !== '' ? $letter : null,
    ]));
    $arrow = $is_current ? ($current_dir === 'ASC' ? " \u{25B2}" : " \u{25BC}") : '';
    return sprintf('<a class="sort%s" href="index.php?%s">%s%s</a>',
                   $is_current ? ' active' : '', h($query), h($label), $arrow);
}

/**
 * The letter a person files under: the last word of their name, ignoring a
 * trailing suffix, with accents folded so Müller files under M. Anything
 * that doesn't start with a letter files under '#'.
 */
function surname_letter($name)
{
    $clean = trim(preg_replace('/[\s,]+(jr|sr|i{1,3}|iv|v)\.?$/i', '', trim($name)));
    $parts = preg_split('/\s+/', $clean);
    $surname = end($parts);
    // drop quotes, brackets and the like from around the word
    $surname = preg_replace('/^[^\p{L}]+/u', '', $surname);

    // first character, without needing mbstring
    $first = preg_match('/^./u', $surname, $m) ? $m[0] : '';
    $folded = @iconv('UTF-8', 'ASCII//TRANSLIT', $first);
    $letter = strtoupper(substr((string) $folded, 0, 1));
    return preg_match('/^[A-Z]$/', $letter) ? $letter : '#';
}

/** The A-Z strip. $counts maps letter to how many people file under it. */
function letter_links($counts, $current, $base_query)
{
    $letters = range('A', 'Z');
    if (!empty($counts['#'])) {
        $letters[] = '#';
    }

    $link = function ($value, $label, $enabled) use ($current, $base_query) {
        $classes = 'letter' . ($value === $current ? ' active' : '') . ($enabled ? '' : ' is-empty');
        if (!$enabled) {
            return sprintf('<span class="%s">%s</span>', $classes, h($label));
        }
        $query = http_build_query(array_filter($base_query + ['letter' => $value]));
        return sprintf('<button class="nav-btn" type="button"><a class="%s" href="index.php?%s">%s</a></button>', $classes, h($query), h($label));
        
    };

    $out = [$link('', 'All', true)];
    foreach ($letters as $letter) {
        $out[] = $link($letter, $letter, !empty($counts[$letter]));
    }
    return '<nav class="letters">' . implode('', $out) . '</nav>';
}

/** A person's name with dates, for dropdowns and lists. */
function person_label(array $p)
{
    $dates = trim(($p['birth_date_text'] ?: '?') . ' - ' . ($p['death_date_text'] ?: ''));
    return $p['name'] . ' (' . $dates . ')';
}