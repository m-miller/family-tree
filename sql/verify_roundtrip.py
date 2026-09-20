#!/usr/bin/env python3
"""Rebuild the nested JSON from the migrated rows and compare with the originals.

Proves the three tables hold everything data.json and horne.json hold.
"""

import json
import sys

sys.path.insert(0, '/'.join(__file__.split('/')[:-1]))
from migrate import Migration, TREES  # noqa: E402

EXTRA_ORDER = [
    'birthdate', 'birthplace_name', 'birth_address1', 'birth_address2',
    'birth_city', 'birth_state_province', 'birth_zip_postal_code', 'birth_country',
    'married_to', 'married_date', 'married_place', 'married_city', 'married_state',
    'deathdate', 'deathplace_name', 'death_address1', 'death_address2',
    'death_city', 'death_state_province', 'death_zip_postal_code', 'death_country',
    'buried', 'buried_link', 'buried_grave', 'notes', 'link',
]


def rebuild(m, tree_id):
    people = {p['id']: p for p in m.people if p['tree_id'] == tree_id}
    marriages = [x for x in m.marriages if x['tree_id'] == tree_id]
    by_person = {}      # marriages the chart hangs under this person
    any_side = {}       # marriages this person is part of, either side
    for mar in sorted(marriages, key=lambda x: (x['person_id'], x['ordinal'])):
        if mar['spouse_id']:
            by_person.setdefault(mar['person_id'], []).append(mar)
            any_side.setdefault(mar['spouse_id'], []).append(mar)
        any_side.setdefault(mar['person_id'], []).append(mar)
    kids = {}
    for c in m.children:
        kids.setdefault(c['marriage_id'], []).append(c)

    def node(pid):
        p = people[pid]
        mars = by_person.get(pid, [])
        mine = any_side.get(pid, [])
        first = mine[0] if mine else None
        if first and not first['spouse_id']:
            spouse_name = first['spouse_name']
        elif first:
            other = first['spouse_id'] if first['person_id'] == pid else first['person_id']
            spouse_name = people[other]['name']
        else:
            spouse_name = ''
        extra = {
            'birthdate': p['birth_date_text'],
            'birthplace_name': p['birthplace_name'],
            'birth_address1': p['birth_address1'],
            'birth_address2': p['birth_address2'],
            'birth_city': p['birth_city'],
            'birth_state_province': p['birth_state_province'],
            'birth_zip_postal_code': p['birth_zip_postal_code'],
            'birth_country': p['birth_country'],
            'married_to': spouse_name,
            'married_date': first['married_date_text'] if first else '',
            'married_place': first['married_place'] if first else '',
            'married_city': first['married_city'] if first else '',
            'married_state': first['married_state'] if first else '',
            'deathdate': p['death_date_text'],
            'deathplace_name': p['deathplace_name'],
            'death_address1': p['death_address1'],
            'death_address2': p['death_address2'],
            'death_city': p['death_city'],
            'death_state_province': p['death_state_province'],
            'death_zip_postal_code': p['death_zip_postal_code'],
            'death_country': p['death_country'],
            'buried': p['buried'],
            'buried_link': p['buried_link'],
            'buried_grave': p['buried_grave'],
            'notes': p['notes'],
            'link': p['linked_tree'],
        }
        out = {
            'name': ('*' if p['adopted'] else '') + p['name'],
            'class': p['sex'],
            'extra': {k: extra[k] for k in EXTRA_ORDER},
        }
        if mars:
            out['marriages'] = []
            for mar in mars:
                entry = {'spouse': node(mar['spouse_id'])}
                children = sorted(kids.get(mar['id'], []), key=lambda c: c['position'])
                if children:
                    entry['children'] = [node(c['child_id']) for c in children]
                out['marriages'].append(entry)
        return out

    root = next(t['root_person_id'] for t in m.trees if t['id'] == tree_id)
    return [node(root)]


def compare(original, rebuilt, path, problems):
    """Every value in the original must survive; added keys must be empty."""
    if isinstance(original, dict):
        for k, v in original.items():
            if k not in rebuilt:
                problems.append('%s: key %r lost' % (path, k))
            else:
                compare(v, rebuilt[k], '%s.%s' % (path, k), problems)
        for k, v in rebuilt.items():
            if k not in original and v not in ('', [], {}, None):
                problems.append('%s: key %r added with value %r' % (path, k, v))
    elif isinstance(original, list):
        if len(original) != len(rebuilt):
            problems.append('%s: list length %d vs %d' % (path, len(original), len(rebuilt)))
        else:
            for i, (a, b) in enumerate(zip(original, rebuilt)):
                compare(a, b, '%s[%d]' % (path, i), problems)
    else:
        if original != rebuilt:
            problems.append('%s: %r became %r' % (path, original, rebuilt))


def main():
    repo = sys.argv[1] if len(sys.argv) > 1 else '.'
    m = Migration()
    m.run(repo)

    total = 0
    for tree_id, (slug, title, source, json_file) in enumerate(TREES, start=1):
        with open('%s/%s' % (repo, source), encoding='utf-8') as fh:
            original = json.load(fh)
        rebuilt = rebuild(m, tree_id)
        problems = []
        compare(original, rebuilt, slug, problems)
        print('%s: %d differences' % (source, len(problems)))
        for p in problems:
            print('   - %s' % p)
        total += len(problems)
    print('\nTOTAL DIFFERENCES: %d' % total)
    return 1 if total else 0


if __name__ == '__main__':
    sys.exit(main())
