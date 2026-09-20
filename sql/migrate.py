#!/usr/bin/env python3
"""Convert data.json and horne.json into SQL INSERT statements.

Run once to produce sql/data.sql, which is imported after sql/schema.sql.
Prints a report of anything in the source data that looks inconsistent.
Nothing is corrected automatically.
"""

import json
import re
import sys

MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
          'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

TREES = [
    # slug, title, source json, file the rebuild writes
    ('miller', 'Miller Family Tree', 'data.json', 'data.json'),
    ('horne', 'Horne Family Tree', 'horne.json', 'horne.json'),
]

PLACEHOLDER_RE = re.compile(r'^\d+\s+unnamed\b', re.I)


def parse_date(text):
    """'D Mon YYYY' / 'Mon YYYY' / 'YYYY' -> (year, month, day), parts unknown are None."""
    if not isinstance(text, str):
        return (None, None, None)
    s = ' '.join(text.split())
    m = re.match(r'^(\d{1,2}) ([A-Za-z]+) (\d{4})$', s)
    if m:
        mon = month_index(m.group(2))
        day = int(m.group(1))
        if mon is not None and 1 <= day <= 31:
            return (int(m.group(3)), mon, day)
        return (None, None, None)
    m = re.match(r'^([A-Za-z]+) (\d{4})$', s)
    if m:
        mon = month_index(m.group(1))
        return (int(m.group(2)), mon, None) if mon is not None else (None, None, None)
    m = re.match(r'^(\d{4})$', s)
    if m:
        return (int(m.group(1)), None, None)
    return (None, None, None)


def month_index(word):
    try:
        return MONTHS.index(word[:3].lower()) + 1
    except ValueError:
        return None


class Migration:
    def __init__(self):
        self.people = []      # dicts of column -> value
        self.marriages = []
        self.children = []
        self.trees = []
        self.problems = []
        self.next_person = 1
        self.next_marriage = 1
        self.raw_extra = {}   # person id -> the extra block it came from

    def note(self, msg):
        self.problems.append(msg)

    def add_person(self, node, tree_id):
        extra = node.get('extra') or {}
        name = node.get('name', '')
        adopted = name.startswith('*')
        if adopted:
            name = name[1:]
        pid = self.next_person
        self.next_person += 1

        by, bm, bd = parse_date(extra.get('birthdate', ''))
        dy, dm, dd = parse_date(extra.get('deathdate', ''))

        if by and dy and (dy, dm or 0, dd or 0) < (by, bm or 0, bd or 0):
            self.note('death before birth: %s (born %s, died %s)'
                      % (name, extra.get('birthdate'), extra.get('deathdate')))

        self.people.append({
            'id': pid,
            'tree_id': tree_id,
            'name': name,
            'sex': node.get('class') or 'man',
            'adopted': 1 if adopted else 0,
            'is_placeholder': 1 if PLACEHOLDER_RE.match(name) else 0,
            'birth_date_text': extra.get('birthdate', ''),
            'birth_year': by, 'birth_month': bm, 'birth_day': bd,
            'birthplace_name': extra.get('birthplace_name', ''),
            'birth_address1': extra.get('birth_address1', ''),
            'birth_address2': extra.get('birth_address2', ''),
            'birth_city': extra.get('birth_city', ''),
            'birth_state_province': extra.get('birth_state_province', ''),
            'birth_zip_postal_code': extra.get('birth_zip_postal_code', ''),
            'birth_country': extra.get('birth_country', ''),
            'death_date_text': extra.get('deathdate', ''),
            'death_year': dy, 'death_month': dm, 'death_day': dd,
            'deathplace_name': extra.get('deathplace_name', ''),
            'death_address1': extra.get('death_address1', ''),
            'death_address2': extra.get('death_address2', ''),
            'death_city': extra.get('death_city', ''),
            'death_state_province': extra.get('death_state_province', ''),
            'death_zip_postal_code': extra.get('death_zip_postal_code', ''),
            'death_country': extra.get('death_country', ''),
            'buried': extra.get('buried', ''),
            'buried_link': extra.get('buried_link', ''),
            'buried_grave': extra.get('buried_grave', ''),
            'notes': extra.get('notes', ''),
            'linked_tree': extra.get('link', ''),
        })
        self.raw_extra[pid] = extra
        if node.get('class') not in ('man', 'woman'):
            self.note('missing or unexpected class for %s: %r' % (name, node.get('class')))
        return pid

    def walk(self, node, tree_id):
        """Add a person and everything below them; returns the new person id."""
        pid = self.add_person(node, tree_id)
        person_extra = node.get('extra') or {}

        for ordinal, marriage in enumerate(node.get('marriages') or [], start=1):
            spouse_node = marriage.get('spouse') or {}
            spouse_id = self.walk(spouse_node, tree_id)
            spouse_extra = spouse_node.get('extra') or {}

            # Marriage details are duplicated on both spouses in the JSON.
            # Take the owner's copy and report any disagreement.
            mid = self.next_marriage
            self.next_marriage += 1
            fields = [('married_date', 'married_date_text'),
                      ('married_place', 'married_place'),
                      ('married_city', 'married_city'),
                      ('married_state', 'married_state')]
            values = {}
            for src, col in fields:
                own = person_extra.get(src, '') or ''
                theirs = spouse_extra.get(src, '') or ''
                values[col] = own or theirs
                if own and theirs and own != theirs:
                    self.note('%s disagrees with %s on %s: %r vs %r'
                              % (node.get('name'), spouse_node.get('name'), src, own, theirs))

            # married_to should name the other spouse
            for who, extra_, other in ((node, person_extra, spouse_node),
                                       (spouse_node, spouse_extra, node)):
                stated = (extra_.get('married_to') or '').lstrip('*')
                expected = (other.get('name') or '').lstrip('*')
                if stated and stated != expected and ordinal == 1:
                    self.note('%s has married_to=%r but is married to %r'
                              % (who.get('name'), stated, expected))

            my, mm, md = parse_date(values['married_date_text'])
            self.marriages.append({
                'id': mid, 'tree_id': tree_id,
                'person_id': pid, 'spouse_id': spouse_id, 'spouse_name': '',
                'ordinal': ordinal,
                'married_date_text': values['married_date_text'],
                'married_year': my, 'married_month': mm, 'married_day': md,
                'married_place': values['married_place'],
                'married_city': values['married_city'],
                'married_state': values['married_state'],
            })

            for position, child in enumerate(marriage.get('children') or [], start=1):
                child_id = self.walk(child, tree_id)
                self.children.append({'marriage_id': mid, 'child_id': child_id,
                                      'position': position})
        return pid

    def add_offtree_marriages(self):
        """People whose married_to names someone with no node anywhere.

        Recorded as a marriage with spouse_id NULL, so the detail survives
        without changing what the chart draws.
        """
        in_marriage = set()
        for mar in self.marriages:
            in_marriage.add(mar['person_id'])
            if mar['spouse_id']:
                in_marriage.add(mar['spouse_id'])

        for pid, extra in self.raw_extra.items():
            if pid in in_marriage:
                continue
            spouse_name = (extra.get('married_to') or '').strip()
            if not spouse_name:
                continue
            person = self.people[pid - 1]
            my, mm, md = parse_date(extra.get('married_date', ''))
            mid = self.next_marriage
            self.next_marriage += 1
            self.marriages.append({
                'id': mid, 'tree_id': person['tree_id'],
                'person_id': pid, 'spouse_id': None, 'spouse_name': spouse_name,
                'ordinal': 1,
                'married_date_text': extra.get('married_date', '') or '',
                'married_year': my, 'married_month': mm, 'married_day': md,
                'married_place': extra.get('married_place', '') or '',
                'married_city': extra.get('married_city', '') or '',
                'married_state': extra.get('married_state', '') or '',
            })
            self.note('%s is married to %r, who has no node in the tree; '
                      'stored as a name-only marriage'
                      % (person['name'], spouse_name))

    def run(self, repo):
        for tree_id, (slug, title, source, json_file) in enumerate(TREES, start=1):
            with open('%s/%s' % (repo, source), encoding='utf-8') as fh:
                roots = json.load(fh)
            if len(roots) != 1:
                self.note('%s has %d root people; only the first is the chart root'
                          % (source, len(roots)))
            root_id = None
            for root in roots:
                pid = self.walk(root, tree_id)
                if root_id is None:
                    root_id = pid
            self.trees.append({'id': tree_id, 'slug': slug, 'title': title,
                               'json_file': json_file, 'root_person_id': root_id})

        self.add_offtree_marriages()

        # people with the same name in more than one tree may be the same person
        by_name = {}
        for p in self.people:
            by_name.setdefault(p['name'], []).append(p)
        for name, group in by_name.items():
            trees = {p['tree_id'] for p in group}
            if len(trees) > 1:
                self.note('"%s" appears in more than one tree (ids %s) - possibly the same person'
                          % (name, ', '.join(str(p['id']) for p in group)))


def sql_value(v):
    if v is None:
        return 'NULL'
    if isinstance(v, int):
        return str(v)
    return "'" + str(v).replace('\\', '\\\\').replace("'", "''") + "'"


def insert_block(table, rows, columns):
    if not rows:
        return ''
    out = ['INSERT INTO %s (%s) VALUES' % (table, ', '.join(columns))]
    lines = ['  (%s)' % ', '.join(sql_value(r.get(c)) for c in columns) for r in rows]
    out.append(',\n'.join(lines) + ';')
    return '\n'.join(out) + '\n\n'


def main():
    repo = sys.argv[1] if len(sys.argv) > 1 else '.'
    out_path = sys.argv[2] if len(sys.argv) > 2 else '%s/sql/data.sql' % repo

    m = Migration()
    m.run(repo)

    person_cols = list(m.people[0].keys())
    marriage_cols = list(m.marriages[0].keys())

    parts = ['-- Generated by sql/migrate.py - import after schema.sql\n',
             'SET NAMES utf8mb4;\n',
             'SET FOREIGN_KEY_CHECKS = 0;\n\n',
             insert_block('trees', [{k: t[k] for k in ('id', 'slug', 'title', 'json_file')}
                                    for t in m.trees],
                          ['id', 'slug', 'title', 'json_file']),
             insert_block('people', m.people, person_cols),
             insert_block('marriages', m.marriages, marriage_cols),
             insert_block('children', m.children, ['marriage_id', 'child_id', 'position'])]
    for t in m.trees:
        parts.append('UPDATE trees SET root_person_id = %d WHERE id = %d;\n'
                     % (t['root_person_id'], t['id']))
    parts.append('\nSET FOREIGN_KEY_CHECKS = 1;\n')

    with open(out_path, 'w', encoding='utf-8') as fh:
        fh.write(''.join(parts))

    print('people: %d   marriages: %d   parent-child links: %d'
          % (len(m.people), len(m.marriages), len(m.children)))
    print('wrote %s' % out_path)
    print('\n%d things to look at in the source data:' % len(m.problems))
    for p in m.problems:
        print('  - %s' % p)


if __name__ == '__main__':
    main()
