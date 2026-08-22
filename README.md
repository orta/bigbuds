# BigBuds

A web app for booking classes at [BigBox Leisure Club][bigbox], built on the same Resamania
member API that powers the club's own web app — and on the same API client as
[BigBox for COSMIC][cosmic-app], ported to TypeScript.

The difference from both is who else you can see. BigBox has no concept of following another
member, so the desktop app's "friends" feature works by storing a friend's *login* and signing
in as them. Here, everyone signs in for themselves, their bookings are snapshotted, and the
timetable shows who else is going. Nobody ever holds anybody else's credentials.

## Features

**Planning.** The club's timetable for every day the club will take a booking on — which is today
plus eight, not the fortnight this offered to begin with: BigBox refuses anything further out, and
a day picker that runs past that only offers classes whose Book button is going to fail. Grouped
into curated categories — Strength & Weights, HIIT & Conditioning, Mind & Body, Reformer, EMS and
so on — each with a one-line explainer, because "EMS" and "Reformer" tell you nothing useful about
what you would actually be doing. Toggle to **By time** for a flat chronological list instead.

**Filters that stick.** Hide categories you never book — the kids' sessions, the inductions — and
optionally drop classes that have already started. Both are per-member and apply to the
chronological view as well as the grouped one.

**Classes you know.** A class type you have been to before is marked with how many times, so a
timetable of sixty-odd classes distinguishes the ones you already like from the ones you have
never tried. Built from your BigBox booking history, keyed on the club's activity id so a renamed
class does not read as new.

**Who is usually around.** On the *By time* view, a class whose start falls inside somebody's
usual hours on that weekday carries a right-aligned marker; hovering it names them and their
window. This is a weaker signal than a booking and is presented as one — they are not going to
that class, they simply tend to be at the club around then.

**Search by what you want from a session**, not just the class name: `legs`, `strength`,
`weights`, `core`, `beginner`, `low-impact`. Every class carries hand-written tags, so `legs`
finds Body Pump and Spin as well as Legs, Bums and Tums. Multi-word queries narrow rather than
widen — `beginner pilates` will not match Advanced Reformer.

**Booking and waiting lists.** Book and cancel in a click. A full class shows how many people are
already waiting — `Full · 6 waiting` — because that, rather than the fact it is full, is what
tells you whether joining the list is worth it. Once you are on it, your place is shown in
context as `#2 of 6`. The club auto-promotes, so you move up without doing anything if a spot
frees.

**Booking each other in.** A member can name people who are allowed to book them onto classes —
one partner, a training buddy, whoever they choose — from the switch beside that person's name on
the People page. Those classes then carry a second control on the timetable: *Book Wanda in*,
*Put Wanda on the list*, or *Cancel for Wanda* when she already has the place. The booking is made
through her own BigBox account, by the same stored credentials the background sync uses, so the
club sees a booking she made herself and it turns up in her own app.

Nobody has this by default, and it is a list of named people rather than a switch, because "anyone
signed into BigBuds may book me" is not something anyone wants. The grant is one-directional —
letting your wife book you does not let you book her — it covers cancelling as well as booking, so
a mistake can be undone by whoever made it, and it is withdrawn from either the People page or
Settings, where everyone holding it is listed by name.

**Everyone else.** Any other member signed into BigBuds shows up against the classes they are
booked onto, as an avatar row on the timetable. Waiting-list places are shown dimmed, because
they are not a promise to be there. Visibility is a single switch in Settings — on by default,
and turning it off removes you from everyone's grid immediately while still letting you see
theirs.

Classes that have already started are dimmed and marked *Finished*, so the day still reads as a
whole without them looking bookable.

## How the shared view works

BigBox is the source of truth for the timetable and for who is booked onto what. This app's own
store holds only the things the club's API has no concept of: that a member has joined *this*
app, a snapshot of their upcoming bookings, and a rolling week of their gym visits.

Members' bookings are refreshed three ways, so the shared view stays close to live:

- when they sign in,
- immediately after they book or cancel here,
- and every 15 minutes by a scheduled task, for bookings made in the club's own app.

That last one is why the app stores credentials — see below.

**Gym hours.** The club's access control records a row per badge scan at a door, and those are
accumulated into a rolling week so the People page can say roughly when somebody trains. This has
its own switch, separate from class visibility, because wanting your classes public and your
comings and goings private is an entirely reasonable position. Turning it off deletes what was
collected rather than hiding it.

## Storage

One JSON file per member under `BIGBUDS_DATA_DIR`, on a mounted disk. This was Postgres to begin
with, which was more machinery than the data justifies: there is no querying to speak of — every
read is "all members" or "one member by id" — the whole set is a few dozen records at a gym's
scale, and a volume costs less than a database.

Three things make that safe rather than merely cheap. Writes go to a temporary file and are
renamed over the target, and POSIX rename is atomic, so a crash mid-write leaves the old file or
the new one and never a half-written one. Writes to a single member are serialised through a
promise chain, so a booking sync and a settings change arriving together cannot clobber each
other. And everything is held in memory after first load, which is only sound because every write
goes through one place.

The trade is that it does not survive running on two machines at once, which is why
`railway.json` pins a single replica.

## A note on credentials

BigBuds stores each member's BigBox password, encrypted with AES-256-GCM, and the key lives only
in `BIGBUDS_ENCRYPTION_KEY` rather than in the database.

This is a real liability and it is worth being clear about why it exists. The Resamania API's
refresh tokens rotate on every use and expire in an hour, so there is nothing that can carry a
member across a nightly job. Without the password, a member who books in the club's own app and
does not open BigBuds for a week is stale to everyone else for that week — which is most of the
value of the app gone.

The trade is deliberate rather than incidental:

- Passwords are never in the session cookie. That holds an id and display fields only; the live
  BigBox session lives server-side, keyed off the database row.
- The encryption key is separate from the database, so a leaked dump alone is not enough.
- GCM is authenticated, so a tampered ciphertext fails to decrypt rather than decrypting to
  something chosen by whoever tampered with it.
- Changing your password at the club breaks the background sync rather than silently working —
  the failure is recorded against the member, and signing in again fixes it.

If you would rather not hold passwords at all, the sync can be cut back to sign-in and
post-booking only: drop `server/tasks/sync.ts` and store nothing but the session. Members then
appear to each other as of their last visit.

## The API client

[`server/utils/resamania.ts`](./server/utils/resamania.ts) is a port of `src/api.rs` from the
COSMIC app. A few things about the API shaped it, and are worth knowing before changing it:

- **Auth is an OAuth2 password grant** against `/{client_token}/oauth/v2/token`. The client id
  and secret are not secrets — they are compiled into the member web app's public JavaScript
  bundle and identify the application, not the user.
- **Entities reference each other by IRI**, not id — a class names its activity as
  `"/bigbox/activities/2300"`. Turning those into names needs the lookup tables that
  `directory()` fetches.
- **Timestamps are naive** (`"2026-08-14T06:30:00"`, no offset) and are wall-clock times in the
  club's timezone. See below.
- **Joining a waiting list is the same request as booking.** The POST body is identical; the
  server returns `state: "queued"` instead of `"booked"` when the seats are gone. So the UI
  reads the response rather than assuming a seat.
- **A booking embeds a thinner class than the planning grid does** — no capacity counters and no
  attendee lists. So `GET /api/bookings` re-fetches each class in full, otherwise the queue behind
  your own waiting-list place would be invisible on the one page that most needs to show it. Those
  fetches are cached and shared between members going to the same class.
- **Query values keep their literal slashes.** Nearly every filter value is an IRI, and
  `URLSearchParams` escapes the slashes to `%2F` — which the `entries` collection's authorisation
  check rejects with a 403, while the byte-identical request with literal slashes returns 200.
  Whatever that check matches on, it reads the raw query string. `/` is legal in a query per RFC
  3986 and every other collection accepts both forms, so the client un-escapes slashes everywhere
  rather than special-casing one endpoint.
- **`myBookings()` returns your entire history**, including classes attended months ago — those
  attendee records are never cleaned up. Use `bookingsFrom(date)` unless you want the history,
  which the attendance tracking does — and because it is many pages for a long-standing member, it
  is rebuilt daily rather than on every fifteen-minute sync. The answer only changes when a booked
  class passes.
- **Cancelling is a state transition**, not a delete: `POST /attendees/{id}/transitions`. The
  record survives with a `cancelled` state, which is why a cancelled booking still turns up in
  `bookedAttendees` and has to be filtered on `isActive`.

Two things were added that the desktop client has no need for. The directory and planning grid
are cached process-wide rather than per-member, since every member at the club is asking for the
same bytes — safe only because neither response is personalised, which is why "am I booked" is
computed from the embedded attendee lists afterwards rather than requested per-user. And
`POST /api/classes/cancel` re-reads the member's own bookings before acting, because the attendee
IRI arrives from the browser and would otherwise cancel any booking at the club given its id.

## Gym visits

`GET /bigbox/entries` returns badge scans: a timestamp, a door, and nothing saying which way the
member was walking. Three things about it shaped `shared/visits.ts`:

- **You can only ever read your own.** The `targetId` filter's *value* is ignored — passing
  another member's contact IRI, or a nonexistent one, still returns your own records. A bare
  request with no filter at all is a 403. So the collection is scoped server-side, and there is no
  way to read anybody else's movements. That fits how the rest of the app works: each member's own
  session collects their own data.
- **Direction has to be inferred.** The doors evidently know — the collection can be filtered on
  `crossingPoint.entryZone` and `crossingPoint.exitZone` — but `crossing_points` is closed to
  members, 403 on the collection and on each door, so their names are unavailable. Within a visit
  the first scan is the arrival and the last is the departure, which is enough. Scans are grouped
  into visits by a three-hour gap rather than by calendar date, so a morning session and an evening
  one do not merge into one eleven-hour visit.
- **How far back the club keeps them is not established.** The only account available to test
  against was four days old and had visited twice, so the five records it returned are equally
  consistent with "all of it" and "a short window". Rather than depend on the answer, the scheduled
  sync accumulates what it sees and prunes past a week.

The same data drives "who is usually around" on the timetable, drawn only from the same weekday in
previous weeks and never from the day being viewed — "Sam is usually here about now" is a
different claim from "Sam is here", and only the first is one a week of history supports. Members
whose visits recorded no departure are left out of it: without both ends there is no window for a
class time to fall inside, and inventing a plausible length would be making the answer up.

One thing worth knowing if you change how the pattern is summarised: a median arrival is only
quoted when the arrivals actually cluster. Someone who came once at 09:25 and once at 19:11 has a
median of 14:18 — an afternoon they were never there — so `usualPattern` reports `consistent:
false` and the UI says the visits vary instead. There is a test pinning that exact case.

## Wall-clock times

[`shared/naive.ts`](./shared/naive.ts) keeps the API's timestamps as strings and never turns them
into a `Date`. The format is fixed-width and zero-padded, so lexicographic order *is*
chronological order and comparisons need no parsing at all.

This matters more than it looks. A naive London time passed through `new Date()` is reinterpreted
in whatever zone the code is running in — UTC on Railway, London on a laptop, something else
entirely for a member checking the timetable on holiday. The bug only appears for half the year,
and it tells someone their 06:30 class is at 07:30. There are tests pinning both a BST and a GMT
date for exactly this reason.

## Class categories

BigBox's API does expose its own `activity_groups`, but they are too coarse to browse by and
wrong in places — it files "Beginners Hyrox" under *Dance* and "Zumba Gold" under *Aqua*. So the
categories and tags live in [`shared/categories.ts`](./shared/categories.ts), hand-curated from
each class's own description in the API and covering all 66 classes the club currently runs.

If the club adds a class that is not in that table, it falls back to keyword matching on the name,
so new classes still land somewhere sensible rather than disappearing.

## App icon and metadata

The mark is Lucide's `boxes` — the same glyph the header uses as the logo, so the tab icon and the
thing at the top of the page are one drawing rather than two that resemble each other — in
lime-500 on the app's near-black, with the corner radius plates iOS and Android expect.

[`scripts/generate-icons.mjs`](./scripts/generate-icons.mjs) draws all of it and writes the
outputs into `public/`; `yarn icons` regenerates them. They are committed, so nothing runs this at
build or deploy time. Two decisions in there are worth knowing about:

- **Small sizes are a different drawing.** Three cubes at 16px is five pixels per cube and renders
  as a green blob, so the 16px and 32px entries in `favicon.ico` carry a single cube instead, and
  the 16px one is a filled silhouette because line art that thin closes up. Each size is
  rasterised at its own size rather than resampled down from a 512px master, which is the
  difference between landing on the pixel grid and not.
- **`favicon.ico` is written by hand.** `sharp` does not encode ICO, and the format is simple
  enough to emit directly: a header, a directory entry per image, then — since Vista — the images
  as whole PNGs.

`public/site.webmanifest` makes it installable: standalone display, the club's colours for the
splash, a maskable icon for Android launchers, and shortcuts straight to *My classes* and
*People*. `nuxt.config.ts` carries the head links, a `theme-color` per colour scheme so the
browser chrome matches the page, and the Open Graph tags — the way anybody joins BigBuds is a
member sending them the link, so the link is worth a card. Its absolute URLs come from the request
in `app/app.vue` rather than a configured domain, which would be wrong the first time the
deployment moved.

## Running it locally

Needs Node 22+. No database.

```sh
yarn install
cp .env.example .env
```

Fill in `.env`:

```sh
# both of these want a fresh 32-byte key
openssl rand -base64 32   # NUXT_SESSION_PASSWORD
openssl rand -base64 32   # BIGBUDS_ENCRYPTION_KEY
```

Then:

```sh
yarn dev
```

Data lands in `./.data` unless `BIGBUDS_DATA_DIR` says otherwise.

Sign in with a real BigBox membership — there is no separate registration, because the membership
*is* the account.

| Command | |
| --- | --- |
| `yarn dev` | development server on :3000 |
| `yarn test` | unit tests |
| `yarn lint` | eslint |

The tests cover the category table, search matching, the capacity and booking-state logic in the
API client, the wall-clock arithmetic across both DST transitions, and grouping badge scans into
visits — the last of those pinned against scans the club actually produced. They are all pure
functions — nothing in the suite talks to BigBox.

## Deploying to Railway

Built from the [`Dockerfile`](./Dockerfile) rather than by Nixpacks. Nixpacks picks a Node
version from a nixpkgs snapshot it controls, so `.nvmrc` and `engines` can only narrow the
choice, never name a patch version — which produced two failed deploys in a row, first on Node 18
and then on 24.10.0 when a transitive dependency wanted 24.15.0. The Dockerfile pins it and
builds identically on a laptop.

1. Point a service at this repo. [`railway.json`](./railway.json) selects the Dockerfile builder.
2. Add a **volume** and mount it somewhere — `/data` is the obvious choice.
3. Set the variables on the service:

   | Variable | |
   | --- | --- |
   | `BIGBUDS_DATA_DIR` | the volume's mount path, e.g. `/data` — **without this the store lands on the container's ephemeral disk and every member is signed out on each deploy** |
   | `NUXT_SESSION_PASSWORD` | seals the session cookie |
   | `BIGBUDS_ENCRYPTION_KEY` | encrypts stored passwords — **back this up**, losing it signs everyone out permanently |
   | `BIGBUDS_SYNC_TOKEN` | optional; only if driving the sync externally |

The container does not pin a port. Railway injects `PORT` and health-checks it, and Nitro
resolves `NITRO_PORT` before `PORT` — so setting `NITRO_PORT` in the image makes the app listen on
one port while the healthcheck knocks on another, which fails the deploy with a healthy-looking
build and nothing in the logs to explain it.

The container runs as root on purpose. Railway mounts volumes owned by root, and a non-root
process cannot create the store directory inside one — which surfaces as a 500 on the first
sign-in rather than an error at boot, so it looks like a broken app rather than a permissions
problem. If you would rather it did not, chown the mount path to the user you pick.

A startup check logs whether the data directory is writable, and warns if `BIGBUDS_DATA_DIR` is
unset in production, so a misconfigured volume announces itself in the deploy logs instead of at
the first sign-in.

`BIGBOX_EMAIL` and `BIGBOX_PASSWORD` are for poking the API by hand from a laptop. The deployed
app never reads them — there is no reason for them to exist as service variables.

`numReplicas` is deliberately 1. The 15-minute sync runs in-process, so a second replica would
sign in as every member a second time on the same schedule for no benefit. If you do need to scale
out, drop `nitro.scheduledTasks` from `nuxt.config.ts` and drive `POST /api/sync` from a Railway
cron service with `BIGBUDS_SYNC_TOKEN` as a bearer token instead.

[bigbox]: https://www.bigboxleisureclub.co.uk/
[cosmic-app]: https://github.com/orta/bigbox-for-cosmic
