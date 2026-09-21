<?php
/** Add or edit one person, their parents and their marriages. */

require_once __DIR__ . '/lib/layout.php';
require_once __DIR__ . '/lib/tree.php';
require_once __DIR__ . '/lib/errors.php';

install_error_handlers();
require_login();

/** Columns the person form writes, so adding a field means touching one list. */
const PERSON_FIELDS = [
    'name', 'birthplace_name', 'birth_address1', 'birth_address2', 'birth_city',
    'birth_state_province', 'birth_zip_postal_code', 'birth_country',
    'deathplace_name', 'death_address1', 'death_address2', 'death_city',
    'death_state_province', 'death_zip_postal_code', 'death_country',
    'buried', 'buried_link', 'buried_grave', 'notes', 'linked_tree',
];

/** Create a bare person row and return its id. */
function create_person($tree_id, $name, $sex)
{
    query('INSERT INTO people (tree_id, name, sex) VALUES (?, ?, ?)',
          [(int) $tree_id, $name, $sex]);
    return (int) db()->lastInsertId();
}

function post($key, $default = '')
{
    return isset($_POST[$key]) ? trim((string) $_POST[$key]) : $default;
}

/**
 * Record that this tree changed. Rebuilding the JSON files is deliberately
 * NOT done here: on shared hosting, writing a megabyte of JSON on every save
 * is slow enough to hit resource limits. Press "Rebuild the tree files" when
 * you're finished editing.
 */
function mark_changed($tree_id)
{
    touch_tree($tree_id);
}

/** Warn when a date was stored but can't be counted in the stats. */
function warn_unparsed_date($label, $text)
{
    if (date_is_unparsed($text)) {
        flash(sprintf('%s "%s" was saved as written, but it isn\'t a date the stats can count. '
                    . 'Use formats like "3 Mar 1902", "Mar 1902" or "1902".', $label, $text), 'warn');
    }
}

/** True when $ancestor_id is $person_id or one of its descendants. */
function is_descendant($ancestor_id, $person_id)
{
    if ($ancestor_id === $person_id) {
        return true;
    }
    $sql = 'SELECT c.child_id FROM children c
            JOIN marriages m ON m.id = c.marriage_id
            WHERE m.person_id = ? OR m.spouse_id = ?';
    foreach (fetch_all($sql, [$ancestor_id, $ancestor_id]) as $row) {
        if (is_descendant((int) $row['child_id'], $person_id)) {
            return true;
        }
    }
    return false;
}

handle_rebuild_post(isset($_GET['id']) ? 'person.php?id=' . (int) $_GET['id'] : 'person.php?new=1');

$id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
$person = $id ? fetch_one('SELECT * FROM people WHERE id = ?', [$id]) : null;
if ($id && !$person) {
    page_header('Not found');
    echo '<p>No person has that id. <a href="index.php">Back to the list</a>.</p>';
    page_footer();
    exit;
}

// ---------------------------------------------------------------- actions

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    check_csrf();
    $action = post('action');

    if ($action === 'save_person') {
        $values = [];
        foreach (PERSON_FIELDS as $f) {
            $values[$f] = post($f);
        }
        $values['name'] = ltrim($values['name'], '*');
        $birth_text = post('birth_date_text');
        $death_text = post('death_date_text');
        $sex = in_array(post('sex'), ['man', 'woman', 'unknown'], true) ? post('sex') : 'unknown';
        $tree_id = (int) post('tree_id');
        $adopted = isset($_POST['adopted']) ? 1 : 0;
        $placeholder = isset($_POST['is_placeholder']) ? 1 : 0;

        if ($values['name'] === '') {
            flash('A name is required.', 'error');
            redirect($id ? "person.php?id=$id" : 'person.php?new=1');
        }
        if (!fetch_one('SELECT id FROM trees WHERE id = ?', [$tree_id])) {
            flash('Choose which tree this person belongs to.', 'error');
            redirect($id ? "person.php?id=$id" : 'person.php?new=1');
        }

        [$by, $bm, $bd] = parse_date_text($birth_text);
        [$dy, $dm, $dd] = parse_date_text($death_text);
        if ($by && $dy && [$dy, $dm ?: 0, $dd ?: 0] < [$by, $bm ?: 0, $bd ?: 0]) {
            flash('Saved, but the death date is before the birth date.', 'warn');
        }

        $columns = array_merge(PERSON_FIELDS, [
            'tree_id', 'sex', 'adopted', 'is_placeholder',
            'birth_date_text', 'birth_year', 'birth_month', 'birth_day',
            'death_date_text', 'death_year', 'death_month', 'death_day',
        ]);
        $values += [
            'tree_id' => $tree_id, 'sex' => $sex,
            'adopted' => $adopted, 'is_placeholder' => $placeholder,
            'birth_date_text' => $birth_text, 'birth_year' => $by,
            'birth_month' => $bm, 'birth_day' => $bd,
            'death_date_text' => $death_text, 'death_year' => $dy,
            'death_month' => $dm, 'death_day' => $dd,
        ];

        if ($id) {
            $set = implode(', ', array_map(fn($c) => "$c = ?", $columns));
            $params = array_map(fn($c) => $values[$c], $columns);
            $params[] = $id;
            query("UPDATE people SET $set WHERE id = ?", $params);
            flash('Saved ' . $values['name'] . '.');
        } else {
            $place = implode(', ', array_fill(0, count($columns), '?'));
            query('INSERT INTO people (' . implode(', ', $columns) . ") VALUES ($place)",
                  array_map(fn($c) => $values[$c], $columns));
            $id = (int) db()->lastInsertId();
            flash('Added ' . $values['name'] . '. Now set their parents or a marriage below.');
        }
        warn_unparsed_date('The birth date', $birth_text);
        warn_unparsed_date('The death date', $death_text);
        mark_changed($person ? $person['tree_id'] : (int) post('tree_id'));
        redirect("person.php?id=$id");
    }

    if ($action === 'set_parents') {
        $marriage_id = (int) post('marriage_id');
        query('DELETE FROM children WHERE child_id = ?', [$id]);
        if ($marriage_id) {
            $marriage = fetch_one('SELECT * FROM marriages WHERE id = ?', [$marriage_id]);
            if (!$marriage) {
                flash('That couple no longer exists.', 'error');
                redirect("person.php?id=$id");
            }
            if (is_descendant($id, (int) $marriage['person_id'])
                || ($marriage['spouse_id'] && is_descendant($id, (int) $marriage['spouse_id']))) {
                flash('That would make someone their own ancestor.', 'error');
                redirect("person.php?id=$id");
            }
            // ...and they must not already be drawn elsewhere.
            $drawn = drawn_people((int) $person['tree_id'], null, $id);
            if (isset($drawn[$id])) {
                flash('This person already appears in the tree through a marriage. '
                    . 'Remove that first, or they would be drawn twice.', 'error');
                redirect("person.php?id=$id");
            }
            $next = fetch_one('SELECT COALESCE(MAX(position), 0) + 1 AS n FROM children WHERE marriage_id = ?',
                              [$marriage_id])['n'];
            query('INSERT INTO children (marriage_id, child_id, position) VALUES (?, ?, ?)',
                  [$marriage_id, $id, $next]);
            flash('Parents set.');
        } else {
            flash('Parents cleared.');
        }
        mark_changed($person ? $person['tree_id'] : (int) post('tree_id'));
        redirect("person.php?id=$id");
    }

    if ($action === 'add_parents') {
        $father_name = ltrim(post('father_name'), '*');
        $mother_name = ltrim(post('mother_name'), '*');
        $tree_id = (int) $person['tree_id'];

        if ($father_name === '' && $mother_name === '') {
            flash('Give at least one parent a name.', 'error');
            redirect("person.php?id=$id");
        }
        if (fetch_one('SELECT id FROM children WHERE child_id = ?', [$id])) {
            flash('This person already has parents recorded. Clear them first.', 'error');
            redirect("person.php?id=$id");
        }

        // Both sides of a marriage have to exist, so an unnamed parent
        // becomes a person with an unknown name and sex, to fill in later.
        $father_id = create_person($tree_id, $father_name !== '' ? $father_name : 'Unknown',
                                   $father_name !== '' ? 'man' : 'unknown');
        $mother_id = create_person($tree_id, $mother_name !== '' ? $mother_name : 'Unknown',
                                   $mother_name !== '' ? 'woman' : 'unknown');

        $date_text = post('married_date_text');
        [$my, $mm, $md] = parse_date_text($date_text);
        query('INSERT INTO marriages (tree_id, person_id, spouse_id, ordinal, married_date_text,
                                      married_year, married_month, married_day, married_place)
               VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)',
              [$tree_id, $father_id, $mother_id, $date_text, $my, $mm, $md, post('married_place')]);
        $marriage_id = (int) db()->lastInsertId();
        query('INSERT INTO children (marriage_id, child_id, position) VALUES (?, ?, 1)',
              [$marriage_id, $id]);

        // The chart starts at one person, so a new top generation becomes the
        // root and the marriages below it are turned to face the right way.
        $was_drawn = drawn_people($tree_id);
        if (isset($was_drawn[$id]) || count($was_drawn) === 0) {
            query('UPDATE trees SET root_person_id = ? WHERE id = ?', [$father_id, $tree_id]);
            $flipped = reorient_tree($tree_id);
            flash(sprintf('Added %s and %s. The chart now starts from %s%s.',
                          $father_name ?: 'an unnamed father', $mother_name ?: 'an unnamed mother',
                          $father_name ?: 'the new father',
                          $flipped ? sprintf(', and %d marriage%s were turned around to suit',
                                             $flipped, $flipped === 1 ? '' : 's') : ''));
        } else {
            flash(sprintf('Added %s and %s as parents.',
                          $father_name ?: 'an unnamed father', $mother_name ?: 'an unnamed mother'));
        }
        warn_unparsed_date('The marriage date', $date_text);
        mark_changed($tree_id);
        redirect("person.php?id=$father_id");
    }

    if ($action === 'make_root') {
        $tree_id = (int) $person['tree_id'];
        query('UPDATE trees SET root_person_id = ? WHERE id = ?', [$id, $tree_id]);
        $flipped = reorient_tree($tree_id);
        flash(sprintf('The chart now starts from %s%s.', $person['name'],
                      $flipped ? sprintf(', and %d marriage%s turned around to suit',
                                         $flipped, $flipped === 1 ? ' was' : 's were') : ''));
        mark_changed($tree_id);
        redirect("person.php?id=$id");
    }

    if ($action === 'save_marriage') {
        $marriage_id = (int) post('marriage_id');
        $spouse_id = (int) post('spouse_id');
        $new_spouse_name = ltrim(post('new_spouse_name'), '*');
        $date_text = post('married_date_text');
        [$my, $mm, $md] = parse_date_text($date_text);

        if ($spouse_id === $id) {
            flash('Someone cannot marry themselves.', 'error');
            redirect("person.php?id=$id");
        }
        if (!$spouse_id && $new_spouse_name === '') {
            flash('Choose a spouse from the tree, or type a name to add them as a new person.', 'error');
            redirect("person.php?id=$id");
        }
        if ($spouse_id) {
            $spouse = fetch_one('SELECT tree_id FROM people WHERE id = ?', [$spouse_id]);
            if (!$spouse || (int) $spouse['tree_id'] !== (int) $person['tree_id']) {
                flash('That spouse is not in the same tree.', 'error');
                redirect("person.php?id=$id");
            }
            // The chart draws each person once, so a spouse who already
            // appears somewhere else can't be attached here too.
            $drawn = drawn_people((int) $person['tree_id'], $marriage_id ?: null);
            if (isset($drawn[$spouse_id])) {
                $spouse_row = fetch_one('SELECT name FROM people WHERE id = ?', [$spouse_id]);
                flash(sprintf('%s already appears in the tree, and the chart can only draw each '
                            . 'person once. Remove their existing marriage or parents first.',
                              $spouse_row['name']), 'error');
                redirect("person.php?id=$id");
            }
        } else {
            // A spouse who wasn't in the tree becomes a real person, so they
            // draw a node and can be filled in later. Sex is unknown for now.
            query('INSERT INTO people (tree_id, name, sex) VALUES (?, ?, ?)',
                  [(int) $person['tree_id'], $new_spouse_name, 'unknown']);
            $spouse_id = (int) db()->lastInsertId();
            flash('Added ' . $new_spouse_name . ' as a new person. Open their page to fill in their details.');
        }

        $fields = [
            'married_date_text' => $date_text, 'married_year' => $my,
            'married_month' => $mm, 'married_day' => $md,
            'married_place' => post('married_place'), 'married_city' => post('married_city'),
            'married_state' => post('married_state'),
            'spouse_id' => $spouse_id,
        ];

        if ($marriage_id) {
            $set = implode(', ', array_map(fn($c) => "$c = ?", array_keys($fields)));
            query("UPDATE marriages SET $set WHERE id = ? AND person_id = ?",
                  array_merge(array_values($fields), [$marriage_id, $id]));
            flash('Marriage updated.');
        } else {
            $exists = fetch_one('SELECT id FROM marriages WHERE (person_id = ? AND spouse_id = ?)
                                 OR (person_id = ? AND spouse_id = ?)',
                                [$id, $spouse_id, $spouse_id, $id]);
            if ($spouse_id && $exists) {
                flash('Those two are already recorded as married.', 'error');
                redirect("person.php?id=$id");
            }
            $next = fetch_one('SELECT COALESCE(MAX(ordinal), 0) + 1 AS n FROM marriages WHERE person_id = ?',
                              [$id])['n'];
            $fields['person_id'] = $id;
            $fields['tree_id'] = (int) $person['tree_id'];
            $fields['ordinal'] = $next;
            $cols = array_keys($fields);
            query('INSERT INTO marriages (' . implode(', ', $cols) . ') VALUES ('
                  . implode(', ', array_fill(0, count($cols), '?')) . ')', array_values($fields));
            flash('Marriage added.');
        }
        warn_unparsed_date('The marriage date', $date_text);
        mark_changed($person ? $person['tree_id'] : (int) post('tree_id'));
        redirect("person.php?id=$id");
    }

    if ($action === 'delete_marriage') {
        $marriage_id = (int) post('marriage_id');
        $kids = (int) fetch_one('SELECT COUNT(*) AS n FROM children WHERE marriage_id = ?',
                                [$marriage_id])['n'];
        if ($kids) {
            flash("That marriage has $kids children attached. Move them to another couple first.", 'error');
            redirect("person.php?id=$id");
        }
        query('DELETE FROM marriages WHERE id = ? AND person_id = ?', [$marriage_id, $id]);
        flash('Marriage removed.');
        mark_changed($person ? $person['tree_id'] : (int) post('tree_id'));
        redirect("person.php?id=$id");
    }

    if ($action === 'delete_person') {
        $root = fetch_one('SELECT id FROM trees WHERE root_person_id = ?', [$id]);
        if ($root) {
            flash('This person is the root of a tree, so they cannot be deleted.', 'error');
            redirect("person.php?id=$id");
        }
        $ties = (int) fetch_one('SELECT COUNT(*) AS n FROM marriages WHERE person_id = ? OR spouse_id = ?',
                                [$id, $id])['n'];
        if ($ties) {
            flash('Remove their marriages first, so no one loses a spouse by accident.', 'error');
            redirect("person.php?id=$id");
        }
        $name = $person['name'];
        $tree_id_for_delete = (int) $person['tree_id'];
        query('DELETE FROM children WHERE child_id = ?', [$id]);
        query('DELETE FROM people WHERE id = ?', [$id]);
        flash('Deleted ' . $name . '.');
        mark_changed($tree_id_for_delete);
        redirect('index.php');
    }
}

// ------------------------------------------------------------------ view

$trees = fetch_all('SELECT * FROM trees ORDER BY id');
$blank = array_fill_keys(array_merge(PERSON_FIELDS,
    ['birth_date_text', 'death_date_text']), '');
$p = $person ?: $blank + ['sex' => 'man', 'adopted' => 0, 'is_placeholder' => 0,
                          'tree_id' => (int) ($_GET['tree'] ?? ($trees[0]['id'] ?? 1))];

$is_root = false;
$marriages = [];
$parent_marriage = null;
$candidates = [];
$couples = [];
if ($person) {
    $marriages = fetch_all(
        'SELECT m.*, s.name AS spouse_person_name FROM marriages m
         JOIN people s ON s.id = m.spouse_id
         WHERE m.person_id = ? ORDER BY m.ordinal', [$id]);
    $parent_marriage = fetch_one('SELECT marriage_id FROM children WHERE child_id = ?', [$id]);
    $is_root = (bool) fetch_one('SELECT id FROM trees WHERE root_person_id = ?', [$id]);
    $drawn_here = isset(drawn_people((int) $person['tree_id'])[$id]);
    $candidates = fetch_all(
        'SELECT id, name, birth_date_text, death_date_text FROM people
         WHERE tree_id = ? AND id <> ? ORDER BY name', [$person['tree_id'], $id]);
    $couples = fetch_all(
        'SELECT m.id, a.name AS a_name, b.name AS b_name,
                a.birth_date_text AS a_born
         FROM marriages m
         JOIN people a ON a.id = m.person_id
         JOIN people b ON b.id = m.spouse_id
         WHERE m.tree_id = ? ORDER BY a.name', [$person['tree_id']]);
}

$GLOBALS['needs_datepicker'] = true;
page_header($person ? 'Edit ' . $p['name'] : 'Add a person');
rebuild_form();
?>
<form method="post" class="person">
	<?= csrf_field() ?>
	<input type="hidden" name="action" value="save_person">

	<fieldset>
		<legend>Person</legend>
		<?php field('Name', 'name', $p['name']) ?>
		<label>Sex
			<select name="sex">
				<option value="man"<?= $p['sex'] === 'man' ? ' selected' : '' ?>>Man</option>
				<option value="woman"<?= $p['sex'] === 'woman' ? ' selected' : '' ?>>Woman</option>
				<option value="unknown"<?= $p['sex'] === 'unknown' ? ' selected' : '' ?>>Unknown/nonbinary</option>
			</select>
		</label>
		<label>Tree
			<select name="tree_id"<?= $person ? ' disabled' : '' ?>>
				<?php foreach ($trees as $t): ?>
					<option value="<?= (int) $t['id'] ?>"<?= (int) $p['tree_id'] === (int) $t['id'] ? ' selected' : '' ?>>
						<?= h($t['title']) ?>
					</option>
				<?php endforeach; ?>
			</select>
		</label>
		<?php if ($person): ?><input type="hidden" name="tree_id" value="<?= (int) $p['tree_id'] ?>"><?php endif; ?>
		<?php checkbox('Adopted (shown with an asterisk)', 'adopted', $p['adopted']) ?>
		<?php checkbox('Placeholder, e.g. "8 unnamed children"', 'is_placeholder', $p['is_placeholder']) ?>
		<?php field('Links to another tree (slug, e.g. horne)', 'linked_tree', $p['linked_tree'] ?? '') ?>
	</fieldset>

	<fieldset>
		<legend>Birth</legend>
		<?php date_field('Date (3 Mar 1902, Mar 1902, 1902 or unknown)', 'birth_date_text', $p['birth_date_text']) ?>
		<?php field('Place name', 'birthplace_name', $p['birthplace_name']) ?>
		<?php field('Address 1', 'birth_address1', $p['birth_address1']) ?>
		<?php field('Address 2', 'birth_address2', $p['birth_address2']) ?>
		<?php field('City', 'birth_city', $p['birth_city']) ?>
		<?php field('State or province', 'birth_state_province', $p['birth_state_province']) ?>
		<?php field('Postal code', 'birth_zip_postal_code', $p['birth_zip_postal_code']) ?>
		<?php field('Country', 'birth_country', $p['birth_country']) ?>
	</fieldset>

	<fieldset>
		<legend>Death</legend>
		<?php date_field('Date', 'death_date_text', $p['death_date_text']) ?>
		<?php field('Place name', 'deathplace_name', $p['deathplace_name']) ?>
		<?php field('Address 1', 'death_address1', $p['death_address1']) ?>
		<?php field('Address 2', 'death_address2', $p['death_address2']) ?>
		<?php field('City', 'death_city', $p['death_city']) ?>
		<?php field('State or province', 'death_state_province', $p['death_state_province']) ?>
		<?php field('Postal code', 'death_zip_postal_code', $p['death_zip_postal_code']) ?>
		<?php field('Country', 'death_country', $p['death_country']) ?>
	</fieldset>

	<fieldset>
		<legend>Burial and notes</legend>
		<?php field('Buried', 'buried', $p['buried']) ?>
		<?php field('Cemetery map link (https://...)', 'buried_link', $p['buried_link']) ?>
		<?php field('Find a Grave link (https://...)', 'buried_grave', $p['buried_grave']) ?>
		<?php textarea('Notes', 'notes', $p['notes']) ?>
	</fieldset>

	<button style="height: 3rem;" type="submit"><?= $person ? 'Save changes' : 'Add this person' ?></button>
	<a class="cancel" href="index.php">Back to the list</a>
</form>

<?php if ($person): ?>
<section>
	<h2>Parents</h2>
	<form method="post" class="inline">
		<?= csrf_field() ?>
		<input type="hidden" name="action" value="set_parents">
		<label class="inline-label">Child of
			<select name="marriage_id">
				<option value="0">No parents recorded</option>
				<?php foreach ($couples as $c): ?>
					<option value="<?= (int) $c['id'] ?>"
						<?= $parent_marriage && (int) $parent_marriage['marriage_id'] === (int) $c['id'] ? ' selected' : '' ?>>
						<?= h($c['a_name'] . ' & ' . ($c['b_name'] ?: '?')) ?>
					</option>
				<?php endforeach; ?>
			</select>
		</label>
		<button type="submit">Save</button>
	</form>

	<?php if (!$parent_marriage): ?>
	<form method="post" class="marriage new">
		<?= csrf_field() ?>
		<input type="hidden" name="action" value="add_parents">
		<h3>Add parents</h3>
		<p class="hint">Creates both parents and makes <?= h($p['name']) ?> their child.
			Leave a name blank to add an unknown parent you can fill in later.
			<?php if ($is_root || $drawn_here): ?>
				Because <?= h($p['name']) ?> appears on the chart, the chart will start from
				the new father afterwards.
			<?php endif; ?>
		</p>
		<?php field('Father', 'father_name', '') ?>
		<?php field('Mother', 'mother_name', '') ?>
		<?php date_field('Married on', 'married_date_text', '') ?>
		<?php field('Married at', 'married_place', '') ?>
		<button type="submit">Add parents</button>
	</form>
	<?php endif; ?>
</section>

<section>
	<h2>Marriages</h2>
	<?php foreach ($marriages as $m): ?>
	<form method="post" class="marriage">
		<?= csrf_field() ?>
		<input type="hidden" name="action" value="save_marriage">
		<input type="hidden" name="marriage_id" value="<?= (int) $m['id'] ?>">
		<label>Spouse
			<select name="spouse_id">
				<?php foreach ($candidates as $c): ?>
					<option value="<?= (int) $c['id'] ?>"<?= (int) $m['spouse_id'] === (int) $c['id'] ? ' selected' : '' ?>>
						<?= h(person_label($c)) ?>
					</option>
				<?php endforeach; ?>
			</select>
		</label>
		<?php date_field('Date', 'married_date_text', $m['married_date_text']) ?>
		<?php field('Place', 'married_place', $m['married_place']) ?>
		<?php field('City', 'married_city', $m['married_city']) ?>
		<?php field('State', 'married_state', $m['married_state']) ?>
		<button type="submit">Save this marriage</button>
		<button type="submit" name="action" value="delete_marriage" class="danger"
			onclick="return confirm('Remove this marriage?')">Remove</button>
	</form>
	<?php endforeach; ?>

	<form method="post" class="marriage new">
		<?= csrf_field() ?>
		<input type="hidden" name="action" value="save_marriage">
		<input type="hidden" name="marriage_id" value="0">
		<h3>Add a marriage</h3>
		<label>Spouse already in the tree
			<select name="spouse_id">
				<option value="0">Not in the tree yet</option>
				<?php foreach ($candidates as $c): ?>
					<option value="<?= (int) $c['id'] ?>"><?= h(person_label($c)) ?></option>
				<?php endforeach; ?>
			</select>
		</label>
		<?php field('Or add them by name (creates a new person, sex unknown)', 'new_spouse_name', '') ?>
		<?php date_field('Date', 'married_date_text', '') ?>
		<?php field('Place', 'married_place', '') ?>
		<?php field('City', 'married_city', '') ?>
		<?php field('State', 'married_state', '') ?>
		<button type="submit">Add marriage</button>
	</form>
</section>

<section>
	<h2>Chart</h2>
	<?php if ($is_root): ?>
		<p>The chart starts from this person.</p>
	<?php else: ?>
		<form method="post" onsubmit="return confirm('Start the chart from <?= h($p['name']) ?>?')">
			<?= csrf_field() ?>
			<input type="hidden" name="action" value="make_root">
			<button type="submit">Start the chart from this person</button>
		</form>
	<?php endif; ?>
</section>

<section>
	<h2>Delete</h2>
	<form method="post" onsubmit="return confirm('Delete <?= h($p['name']) ?>? This cannot be undone.')">
		<?= csrf_field() ?>
		<input type="hidden" name="action" value="delete_person">
		<button type="submit" class="danger">Delete this person</button>
	</form>
</section>
<?php endif; ?>
<?php page_footer();