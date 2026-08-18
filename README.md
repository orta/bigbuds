# BigBuds

A web app for booking classes at [BigBox Leisure Club][bigbox], built on the same Resamania
member API that powers the club's own web app — and on the same API client as
[BigBox for COSMIC][cosmic-app], ported to TypeScript.

The difference from both is who else you can see. BigBox has no concept of following another
member, so the desktop app's "friends" feature works by storing a friend's *login* and signing
in as them. Here, everyone signs in for themselves, their bookings are snapshotted, and the
timetable shows who else is going. Nobody ever holds anybody else's credentials.

## Features

**Planning.** The club's timetable for any of the next 14 days, grouped into curated categories —
Strength & Weights, HIIT & Conditioning, Mind & Body, Reformer, EMS and so on — each with a
one-line explainer, because "EMS" and "Reformer" tell you nothing useful about what you would
actually be doing. Toggle to **By time** for a flat chronological list instead.

**Search by what you want from a session**, not just the class name: `legs`, `strength`,
`weights`, `core`, `beginner`, `low-impact`. Every class carries hand-written tags, so `legs`
finds Body Pump and Spin as well as Legs, Bums and Tums. Multi-word queries narrow rather than
widen — `beginner pilates` will not match Advanced Reformer.

**Booking and waiting lists.** Book and cancel in a click. A full class shows how many people are
already waiting — `Full · 6 waiting` — because that, rather than the fact it is full, is what
tells you whether joining the list is worth it. Once you are on it, your place is shown in
context as `#2 of 6`. The club auto-promotes, so you move up without doing anything if a spot
frees.

**Everyone else.** Any other member signed into BigBuds shows up against the classes they are
booked onto, as an avatar row on the timetable. Waiting-list places are shown dimmed, because
they are not a promise to be there. Visibility is a single switch in Settings — on by default,
and turning it off removes you from everyone's grid immediately while still letting you see
theirs.

Classes that have already started are dimmed and marked *Finished*, so the day still reads as a
whole without them looking bookable.

## How the shared view works

BigBox is the source of truth for the timetable and for who is booked onto what. This app's own
database holds only the two things the club's API has no concept of: that a member has joined
*this* app, and a snapshot of their upcoming bookings.

Members' bookings are refreshed three ways, so the shared view stays close to live:

- when they sign in,
- immediately after they book or cancel here,
- and every 15 minutes by a scheduled task, for bookings made in the club's own app.

That last one is why the app stores credentials — see below.

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
- **`myBookings()` returns your entire history**, including classes attended months ago — those
  attendee records are never cleaned up. Use `bookingsFrom(date)` unless you want the history.
- **Cancelling is a state transition**, not a delete: `POST /attendees/{id}/transitions`. The
  record survives with a `cancelled` state, which is why a cancelled booking still turns up in
  `bookedAttendees` and has to be filtered on `isActive`.

Two things were added that the desktop client has no need for. The directory and planning grid
are cached process-wide rather than per-member, since every member at the club is asking for the
same bytes — safe only because neither response is personalised, which is why "am I booked" is
computed from the embedded attendee lists afterwards rather than requested per-user. And
`POST /api/classes/cancel` re-reads the member's own bookings before acting, because the attendee
IRI arrives from the browser and would otherwise cancel any booking at the club given its id.

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

## Running it locally

Needs Node 20+ and a Postgres.

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
createdb bigbuds
yarn db:migrate
yarn dev
```

Sign in with a real BigBox membership — there is no separate registration, because the membership
*is* the account.

| Command | |
| --- | --- |
| `yarn dev` | development server on :3000 |
| `yarn test` | unit tests |
| `yarn lint` | eslint |
| `yarn db:generate` | write a migration after changing `server/database/schema.ts` |
| `yarn db:migrate` | apply migrations |
| `yarn db:studio` | browse the database |

The tests cover the category table, search matching, the capacity and booking-state logic in the
API client, and the wall-clock arithmetic across both DST transitions. They are all pure
functions — nothing in the suite talks to BigBox.

## Deploying to Railway

1. Create a project and add a **Postgres** database. Railway injects `DATABASE_URL`.
2. Point a service at this repo. [`railway.json`](./railway.json) sets the build and start
   commands; migrations run on boot.
3. Set the remaining variables on the service:

   | Variable | |
   | --- | --- |
   | `NUXT_SESSION_PASSWORD` | seals the session cookie |
   | `BIGBUDS_ENCRYPTION_KEY` | encrypts stored passwords — **back this up**, losing it signs everyone out permanently |
   | `BIGBUDS_SYNC_TOKEN` | optional; only if driving the sync externally |

`numReplicas` is deliberately 1. The 15-minute sync runs in-process, so a second replica would
sign in as every member a second time on the same schedule for no benefit. If you do need to scale
out, drop `nitro.scheduledTasks` from `nuxt.config.ts` and drive `POST /api/sync` from a Railway
cron service with `BIGBUDS_SYNC_TOKEN` as a bearer token instead.

[bigbox]: https://www.bigboxleisureclub.co.uk/
[cosmic-app]: https://github.com/orta/bigbox-for-cosmic
