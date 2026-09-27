# family-tree

Online d3 dTree visualization of one side of the family tree. Mostly a [d3](https://d3js.org/)/[dTree](https://github.com/ErikGartner/dTree)/javascript exercise.

This is the Node version, ported from the PHP one. The public pages are unchanged: static HTML,
CSS and plain JavaScript. Behind them an Express app serves the tree data from PostgreSQL and
hosts the editor.

## What changed in the port

- **PHP to Node and Express**, with the admin pages as EJS templates.
- **MySQL to PostgreSQL.** Same four tables; identity columns instead of `AUTO_INCREMENT`, a check
  constraint instead of `ENUM`, and a trigger for `updated_at`.
- **No more rebuild step.** The old version wrote `data.json` to disk and tracked whether the file
  was stale. Render's disk does not survive a restart, so `/data.json` and `/horne.json` are built
  from the database per request instead, with a short cache. The rebuild button, the staleness
  warning and the `changed_at`/`rebuilt_at` columns are all gone.
- **Sessions in the database**, so a restart doesn't sign you out.

Everything else behaves as it did: the same fields, the same guards on the tree's shape, the same
A-Z list, the same date handling.

## Running it locally

    createdb familytree
    psql familytree -f sql/schema.sql
    cp .env.example .env          # then edit it
    npm install
    npm run import -- "src/data.json:miller:Miller Family Tree" \
                      "src/horne.json:horne:Horne Family Tree"
    npm run dev

`npm run dev` reads `.env`; `npm start` does not, because Render has no such
file and supplies the same variables from the service environment.

Then open <http://localhost:3000>, and <http://localhost:3000/admin/setup> to create the first
account. Setup closes itself once an account exists.

The importer reads the JSON the old site served. It carries everything the chart shows, which is
almost everything the database holds. Two things it cannot carry: where a marriage was recorded on
neither spouse's record, and the difference between an empty field and one never filled in. It
reports anyone whose details had to be reconstructed.

## Deploying to Render

`render.yaml` describes a web service and a free Postgres database. Render generates
`SESSION_SECRET` and fills in `DATABASE_URL`, so no secrets live in the repo. After the first
deploy, load the schema and import the data against the external database URL from the Render
dashboard, then visit `/admin/setup`.

Three settings that are easy to get wrong:

- **Service type is Web Service, not Static Site.** A static site asks for a publish directory; a
  Node service asks for build and start commands. The two cannot be converted into each other.
- **Root Directory** must name the folder holding `package.json` if the app is not at the repo
  root. Render's own checkout lives at `/opt/render/project/src`, which is unrelated to this
  project's `src/`.
- **`app.set('trust proxy', 1)`** in `server.js` is load-bearing. Render terminates TLS at a proxy
  and forwards plain HTTP; without it Express will not send a secure session cookie, and every
  sign-in fails with "your session expired".

**Never commit a file holding database credentials.** The `.gitignore` covers `.env`; on Render the
values come from the environment. Free Postgres plans have expired in the past, so keep your own
`pg_dump` somewhere private - this database is the only copy of the tree.

## Layout

    server.js          routes: the site, the tree JSON, the admin
    env.js         reads .env when there is one
    db.js          the connection pool
    tree.js        dates, building the tree JSON, the structural guards
    auth.js        sessions, CSRF, bcrypt
    adminRoutes.js the editor
    views/             admin pages (EJS)
    public/            admin.css and date-fields.js
    src/               the public site, served as static files
    schema.sql     PostgreSQL schema
    importJson.js  load the tree JSON into an empty database

## The public site

Clicking a person opens a panel with their dates, places, burial links, sources and notes. Nodes
are coloured by sex: grey for men, green for women, blue where it isn't known. Cards lean towards
the pointer as it passes over them.

A pad of controls sits over the chart: arrows to scroll, a button to return to the starting view,
and zoom out, fit and zoom in. Holding an arrow picks up speed and coasts to a stop.

The panel also has a **How is this person related to...** button: press it, click a second person,
and their panel names the relationship - parents and grandparents, siblings, uncles and aunts with
their grand- and great- prefixes, nephews and nieces, Nth cousins with "once removed" counts, and
in-laws. Worked out in `src/js/relate.js` from the tree data itself. Half-siblings are not
distinguished from full siblings.

## The admin

The people list filters by tree, by a name search, and by an A-Z strip grouping people on the first
letter of their surname - the last word of the name, ignoring suffixes like "Jr", so Müller files
under M. Name, born and died are sortable, and the date columns sort chronologically, with unknown
dates last.

A person's page edits every field, sets who their parents are, manages marriages, and deletes.

- **Add parents** creates a father and mother for someone who has none and makes them their child.
  A chart has to start from one person, so it also moves the root up to the new father and turns
  any marriages in between the right way round. That is how the tree grows backwards a generation
  at a time. **Start the chart from this person** does the same re-rooting by hand.
- **Sources**: birth, death and marriage each take a note of where the details came from. The tree
  shows a source line only where one has been recorded.

## Dates

Genealogy dates are often partial, so each is stored twice: the original text exactly as written,
and `year`/`month`/`day` columns that are `NULL` for the parts that aren't known.

| Typed | year | month | day |
| --- | --- | --- | --- |
| `3 Mar 1902` | 1902 | 3 | 3 |
| `Mar 1902` | 1902 | 3 | - |
| `1902` | 1902 | - | - |
| `abt 1250`, `c. 1220`, `bef 1300` | 1250, 1220, 1300 | - | - |
| `unknown` | - | - | - |

The same parser exists in `lib/tree.js` and in `src/js/stats.js`, so the server and the browser
agree.

## One person, one node

dTree draws a tree, not a graph, so each person appears exactly once. The admin refuses edits that
would place someone twice, and the JSON builder stops and names anyone it meets a second time
rather than recursing for ever. It also reports people not connected to the root, who exist in the
database but appear nowhere.

## Notes

- `src/js/dTree.js` is modified from upstream; the header of that file lists every difference.
  dTree is by Erik Gärtner, MIT licensed - see `src/dTree.LICENSE`. Upstream has not been updated
  since 2019, which also pins the front end to d3 v4.
- The stats page reads `/data.json`, so it covers the Miller tree only.