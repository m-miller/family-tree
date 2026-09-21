<?php
/** Date handling and rebuilding the JSON files the tree pages load. */

require_once __DIR__ . '/db.php';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Parse 'D Mon YYYY', 'Mon YYYY' or 'YYYY'. Returns [year, month, day]
 * with nulls for the parts that aren't known. Anything else (including
 * 'unknown' and 'abt 1850') parses to all nulls; the original text is
 * still stored, it just can't be counted in the stats.
 */
function parse_date_text($text)
{
    $s = trim(preg_replace('/\s+/', ' ', (string) $text));
    if ($s === '') {
        return [null, null, null];
    }
    if (preg_match('/^(\d{1,2}) ([A-Za-z]+) (\d{4})$/', $s, $m)) {
        $month = month_number($m[2]);
        $day = (int) $m[1];
        if ($month !== null && $day >= 1 && $day <= 31) {
            return [(int) $m[3], $month, $day];
        }
        return [null, null, null];
    }
    if (preg_match('/^([A-Za-z]+) (\d{4})$/', $s, $m)) {
        $month = month_number($m[1]);
        return $month === null ? [null, null, null] : [(int) $m[2], $month, null];
    }
    if (preg_match('/^(\d{4})$/', $s, $m)) {
        return [(int) $m[1], null, null];
    }
    return [null, null, null];
}

/** 'Mar' or 'March' -> 1-12, or null */
function month_number($word)
{
    $index = array_search(strtolower(substr($word, 0, 3)),
                          array_map('strtolower', MONTHS), true);
    return $index === false ? null : $index + 1;
}

/** True when the text holds a date we couldn't parse, so the user can be warned. */
function date_is_unparsed($text)
{
    if (trim((string) $text) === '') {
        return false;
    }
    [$y] = parse_date_text($text);
    return $y === null;
}

/** The extra{} keys every person gets, in the order the JSON files use. */
function extra_for(array $p, array $marriage = null, $spouse_name = '')
{
    return [
        'birthdate'             => $p['birth_date_text'],
        'birthplace_name'       => $p['birthplace_name'],
        'birth_address1'        => $p['birth_address1'],
        'birth_address2'        => $p['birth_address2'],
        'birth_city'            => $p['birth_city'],
        'birth_state_province'  => $p['birth_state_province'],
        'birth_zip_postal_code' => $p['birth_zip_postal_code'],
        'birth_country'         => $p['birth_country'],
        'married_to'            => $spouse_name,
        'married_date'          => $marriage['married_date_text'] ?? '',
        'married_place'         => $marriage['married_place'] ?? '',
        'married_city'          => $marriage['married_city'] ?? '',
        'married_state'         => $marriage['married_state'] ?? '',
        'deathdate'             => $p['death_date_text'],
        'deathplace_name'       => $p['deathplace_name'],
        'death_address1'        => $p['death_address1'],
        'death_address2'        => $p['death_address2'],
        'death_city'            => $p['death_city'],
        'death_state_province'  => $p['death_state_province'],
        'death_zip_postal_code' => $p['death_zip_postal_code'],
        'death_country'         => $p['death_country'],
        'buried'                => (string) $p['buried'],
        'buried_link'           => $p['buried_link'],
        'buried_grave'          => $p['buried_grave'],
        'notes'                 => (string) $p['notes'],
        'link'                  => $p['linked_tree'],
    ];
}

/**
 * Build the nested structure dTree expects for one tree.
 * Returns a list with the root person as its only entry.
 */
function build_tree_json($tree_id)
{
    $people = [];
    foreach (fetch_all('SELECT * FROM people WHERE tree_id = ?', [$tree_id]) as $row) {
        $people[(int) $row['id']] = $row;
    }
    $root_id = (int) fetch_one('SELECT root_person_id FROM trees WHERE id = ?', [$tree_id])['root_person_id'];

    $under = [];     // marriages the chart hangs under a person
    $any_side = [];  // marriages a person is part of, either side
    foreach (fetch_all('SELECT * FROM marriages WHERE tree_id = ? ORDER BY person_id, ordinal',
                       [$tree_id]) as $m) {
        $under[(int) $m['person_id']][] = $m;
        $any_side[(int) $m['person_id']][] = $m;
        $any_side[(int) $m['spouse_id']][] = $m;
    }

    $children = [];
    $sql = 'SELECT c.* FROM children c JOIN marriages m ON m.id = c.marriage_id
            WHERE m.tree_id = ? ORDER BY c.position, c.id';
    foreach (fetch_all($sql, [$tree_id]) as $c) {
        $children[(int) $c['marriage_id']][] = (int) $c['child_id'];
    }

    // Each person may appear once. A loop in the data (A married to B, B to C,
    // C back to A) would otherwise recurse forever, so anyone already drawn is
    // skipped and reported instead.
    $visited = [];
    $loops = [];

    $node = function ($pid) use (&$node, &$visited, &$loops, $people, $under, $any_side, $children) {
        if (isset($visited[$pid])) {
            $loops[] = $people[$pid]['name'];
            return null;
        }
        $visited[$pid] = true;
        $p = $people[$pid];
        // The marriage a person's own details mention is their first, from either side.
        $first = $any_side[$pid][0] ?? null;
        $spouse_name = '';
        if ($first !== null) {
            $other = (int) $first['person_id'] === $pid
                ? (int) $first['spouse_id'] : (int) $first['person_id'];
            $spouse_name = isset($people[$other])
                ? ($people[$other]['adopted'] ? '*' : '') . $people[$other]['name'] : '';
        }

        $out = [
            'name'  => ($p['adopted'] ? '*' : '') . $p['name'],
            'class' => $p['sex'],
            'extra' => extra_for($p, $first, $spouse_name),
        ];

        $marriages = [];
        foreach ($under[$pid] ?? [] as $m) {
            $spouse = $node((int) $m['spouse_id']);
            if ($spouse === null) {
                continue;   // already drawn elsewhere; see $loops
            }
            $entry = ['spouse' => $spouse];
            $kids = [];
            foreach ($children[(int) $m['id']] ?? [] as $child_id) {
                $child = $node($child_id);
                if ($child !== null) {
                    $kids[] = $child;
                }
            }
            if ($kids) {
                $entry['children'] = $kids;
            }
            $marriages[] = $entry;
        }
        if ($marriages) {
            $out['marriages'] = $marriages;
        }
        return $out;
    };

    $tree = [$node($root_id)];

    // Anyone unreachable from the root is invisible on the site, which is
    // usually a mistake worth knowing about.
    $orphans = [];
    foreach ($people as $pid => $p) {
        if (!isset($visited[$pid])) {
            $orphans[] = $p['name'];
        }
    }

    return [$tree, array_unique($loops), $orphans];
}

/**
 * Everyone the chart currently draws, walking from the tree's root person
 * down through marriages and children.
 *
 * The chart shows each person once, so an edit that would place someone who
 * already appears is rejected. Pass $ignore_marriage_id or $ignore_child_id
 * to leave out the link being edited.
 */
function drawn_people($tree_id, $ignore_marriage_id = null, $ignore_child_id = null)
{
    $tree = fetch_one('SELECT root_person_id FROM trees WHERE id = ?', [(int) $tree_id]);
    if (!$tree || $tree['root_person_id'] === null) {
        return [];
    }

    $under = [];
    foreach (fetch_all('SELECT * FROM marriages WHERE tree_id = ?', [(int) $tree_id]) as $m) {
        if ($ignore_marriage_id !== null && (int) $m['id'] === (int) $ignore_marriage_id) {
            continue;
        }
        $under[(int) $m['person_id']][] = $m;
    }
    $children = [];
    $sql = 'SELECT c.* FROM children c JOIN marriages m ON m.id = c.marriage_id WHERE m.tree_id = ?';
    foreach (fetch_all($sql, [(int) $tree_id]) as $c) {
        if ($ignore_child_id !== null && (int) $c['child_id'] === (int) $ignore_child_id) {
            continue;
        }
        $children[(int) $c['marriage_id']][] = (int) $c['child_id'];
    }

    $seen = [];
    $stack = [(int) $tree['root_person_id']];
    while ($stack) {
        $current = array_pop($stack);
        if (isset($seen[$current])) {
            continue;   // a loop in existing data; stop rather than spin
        }
        $seen[$current] = true;
        foreach ($under[$current] ?? [] as $m) {
            $stack[] = (int) $m['spouse_id'];
            foreach ($children[(int) $m['id']] ?? [] as $child_id) {
                $stack[] = $child_id;
            }
        }
    }
    return $seen;
}

/** Mark a tree's data as changed, so the admin pages know a rebuild is due. */
function touch_tree($tree_id)
{
    query('UPDATE trees SET changed_at = NOW() WHERE id = ?', [(int) $tree_id]);
}

/** Trees whose JSON file is older than their latest change. */
function stale_trees()
{
    return fetch_all('SELECT * FROM trees
                      WHERE changed_at IS NOT NULL
                        AND (rebuilt_at IS NULL OR rebuilt_at < changed_at)
                      ORDER BY id');
}

/**
 * Write the JSON file for one tree, or for all of them when $only_tree_id is
 * null. Writes to a temporary file first and renames, so a half-written file
 * is never served. Doing one tree at a time keeps peak memory down on shared
 * hosting.
 * Returns [written files, error messages].
 */
function rebuild_json_files($only_tree_id = null)
{
    $root = rtrim(config('site_root'), '/');
    $written = [];
    $errors = [];

    $trees = $only_tree_id === null
        ? fetch_all('SELECT * FROM trees ORDER BY id')
        : fetch_all('SELECT * FROM trees WHERE id = ?', [(int) $only_tree_id]);

    foreach ($trees as $tree) {
        if ($tree['root_person_id'] === null) {
            $errors[] = sprintf('Tree "%s" has no root person set, so %s was not written.',
                                $tree['slug'], $tree['json_file']);
            continue;
        }
        $path = $root . '/' . basename($tree['json_file']);
        list($structure, $loops, $orphans) = build_tree_json((int) $tree['id']);
        foreach ($loops as $name) {
            $errors[] = sprintf('%s is reachable twice in "%s", so the second place was left out. '
                              . 'Check their marriages and parents for a loop.', $name, $tree['slug']);
        }
        if ($orphans) {
            $errors[] = sprintf('%d people in "%s" are not connected to the root and do not appear: %s',
                                count($orphans), $tree['slug'],
                                implode(', ', array_slice($orphans, 0, 10))
                                . (count($orphans) > 10 ? ', ...' : ''));
        }
        $json = json_encode($structure,
                            JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            $errors[] = 'Could not encode ' . $tree['json_file'] . ': ' . json_last_error_msg();
            continue;
        }
        $temp = $path . '.tmp';
        if (file_put_contents($temp, $json) === false || !rename($temp, $path)) {
            @unlink($temp);
            $errors[] = sprintf('Could not write %s. Check that the web server may write to %s.',
                                $path, $root);
            continue;
        }
        query('UPDATE trees SET rebuilt_at = NOW() WHERE id = ?', [(int) $tree['id']]);
        $written[] = basename($path);
    }
    return [$written, $errors];
}
