# family-tree
Online d3 dTree visualization of one side of the family tree. Mostly a [d3](https://d3js.org/)/[dTree](https://github.com/ErikGartner/dTree)/javascript exercise.

[milleronic.com](http://milleronic.com)

The public pages are static: HTML, CSS and plain JavaScript reading a JSON file. Behind them sit a MySQL database and a small PHP admin app for editing, which writes the JSON files out again.

## Pages

| Page | What it shows |
| --- | --- |
| `index.html` | The Miller tree, from `data.json` |
| `Horne.html` | The Horne tree, from `horne.json` |
| `stats.html` | Charts and tables built from `data.json` in the browser |
| `admin/` | Password-protected editor (PHP + MySQL) |

Clicking a person opens a panel with their dates, places, burial links and notes. Nodes are coloured by sex: grey for men, green for women, blue where it isn't known. Multiple marriages get a progressively darker left border.

## How the data flows

    MySQL  ->  admin rebuild  ->  data.json / horne.json  ->  the tree pages

Editing happens in the database. Pressing **Rebuild the tree files** writes both JSON files. Nothing rebuilds automatically on save, because writing a megabyte of JSON on every edit was slow enough to hit shared-hosting limits. The admin pages warn whenever the files are behind the database.

The public site never talks to MySQL, so if the database or PHP is unavailable the tree still works from the last rebuild.

## Requirements

- PHP 8.0 or newer (uses arrow functions and array destructuring)
- MySQL 5.7+ or MariaDB 10.2+
- A writable site root, so the rebuild can replace the JSON files

## Setting it up

1. Create a database and user, and grant full privileges. On cPanel both names get your account prefix.
2. Import, in this order: `sql/schema.sql`, `sql/data.sql`, `sql/users.sql`.
3. Copy `admin/config.sample.php` to `admin/config.php` and fill in the database details. That file is gitignored because it holds a password.
4. Set `allow_setup` to `true`, load `admin/setup.php`, create your account, then set it back to `false`. Setup refuses to run once an account exists.
5. Sign in and press **Rebuild the tree files** to confirm the site root is writable.

An install that is already running applies the `sql/alter-*.sql` files in filename order instead of re-importing.

## The database

Four tables, plus `users`:

- **`people`** - one row per person. `adopted` and `is_placeholder` are flags rather than conventions inside the name; the leading `*` for adopted people is added when drawing.
- **`marriages`** - links two people. `ordinal` orders multiple marriages for the same person.
- **`children`** - which marriage someone is a child of, and their position among siblings.
- **`trees`** - Miller and Horne, each with its root person, when its data last changed and when its file was last written.

### Dates

Genealogy dates are often partial, so each is stored twice: the original text exactly as written, and `year`/`month`/`day` columns that are `NULL` for the parts that aren't known.

| Typed | year | month | day |
| --- | --- | --- | --- |
| `3 Mar 1902` | 1902 | 3 | 3 |
| `Mar 1902` | 1902 | 3 | - |
| `1902` | 1902 | - | - |
| `unknown`, `abt 1850` | - | - | - |

Anything unparseable is kept as typed and flagged in the form, but can't be counted in the stats. The same parser exists in PHP (`admin/lib/tree.php`) and JavaScript (`js/stats.js`), so both agree.

### One person, one node

dTree draws a tree, not a graph, so each person appears exactly once. The admin refuses edits that would place someone twice: marrying an existing spouse into a second position, or giving someone parents when they already appear through a marriage. The rebuild also stops if it ever meets the same person twice, and names them, rather than recursing forever.

## Layout

    index.html, Horne.html, stats.html   the public pages
    data.json, horne.json                generated; edit through admin/, not by hand
    css/                                 styles
    js/                                  index.js, info.js, stats.js, dTree.js, gtag.js
    admin/                               the editor
      lib/                               db, auth, layout, tree building, error handling
    sql/                                 schema, data, migrations and the import scripts

`sql/migrate.py` converted the original hand-maintained JSON into SQL, and `sql/verify_roundtrip.py` checks that the tables rebuild the same JSON. Neither is needed on the server.

## Notes

- `js/dTree.js` is modified from upstream: rounded connectors and `spouse-N` classes.
- Admin errors are shown on screen to signed-in users, since shared hosting often hides them and writes no log.
- The stats page reads `data.json` directly, so it covers the Miller tree only.