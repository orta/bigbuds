# KAL Pal

A web app for booking classes at [Kirklees Active Leisure][kal] (KAL), built on the Gladstone
booking API that sits behind the club's own KAL app.

The difference from the club's app is who else you can see. KAL has no concept of following
another member. Here, everyone signs in for themselves, their bookings are snapshotted, and the
timetable shows who else is going. Nobody ever holds anybody else's credentials.

It began life as BigBuds, a web port of [BigBox for COSMIC][cosmic-app] for BigBox Leisure Club,
which runs on a different booking system (Resamania). When the gym changed, the API client was
replaced and almost nothing above it had to move — see [The API client](#the-api-client).

## Features

**Planning.** The club's timetable for every day the club will take a booking on — today plus
eight, because a day picker that runs past the booking window only offers classes whose Book
button is going to fail. (That window was measured at BigBox and is in
[`shared/booking.ts`](./shared/booking.ts); it has not yet been re-checked against KAL.) Grouped
into curated categories — Indoor Cycling, Strength & Weights, HIIT & Conditioning, Mind & Body,
Aqua, Gentle & Over 50s and so on — each with a one-line explainer, because "R P M" and "Sh'bam"
tell you nothing useful about what you would actually be doing. Toggle to **By time** for a flat
chronological list instead.

**More than one centre.** KAL's timetable covers every centre at once; KAL Pal shows your home
centre by default, and Settings lets you tick any others you would go to. The timetable then
interleaves them, each row naming its centre. Your bookings, and everyone else's, are read from
every centre regardless, so a class booked elsewhere never goes missing.

**Filters that stick.** Hide categories you never book — the kids' sessions, the inductions —
and optionally drop classes that have already started, or the virtual (screen-played) ones, which
are about a third of the timetable. All per-member, and they apply to the chronological view as
well as the grouped one.

**Classes you know.** A class type you have been to before is marked with how many times, so a
timetable of sixty-odd classes distinguishes the ones you already like from the ones you have
never tried. Keyed on the class's name rather than on one session. Gladstone offers no booking
history to build this from, so the count starts at zero and grows from the classes KAL Pal sees
you booked onto.

**Who is usually around.** On the *By time* view, a class whose start falls inside somebody's
usual hours on that weekday carries a right-aligned marker; hovering it names them and their
window. This is a weaker signal than a booking and is presented as one — they are not going to
that class, they simply tend to be at the club around then. *Dormant at KAL:* it is built from
badge scans at the doors, and Gladstone does not expose those — see [Gym visits](#gym-visits).

**Search by what you want from a session**, not just the class name: `legs`, `strength`,
`weights`, `core`, `beginner`, `low-impact`. Every class carries hand-written tags, so `legs`
finds Body Pump and Strength Development as well as Legs, Bums and Tums. Multi-word queries
narrow rather than widen — `beginner pilates` will not match a plain Pilates class.

**What a class actually is.** Clicking a class name opens the club's own description of it —
which is in the API, and which the timetable has nowhere to put — along with its tags, how many
times you have been, and the notes members have left. A class with notes on it carries a count
beside its name, because a name with four people's advice behind it should not look like one with
nothing.

**Notes.** Everyone can write one note per class type, which everyone else can see against their
name. The club's description says what the session is, in the voice of the person selling it;
what it cannot say is the thing you only learn by going — that this one is harder than the name
suggests, that the 06:30 fills from the front row back, that you want grip socks. Notes are keyed
to the class *type* rather than to one Tuesday's instance, so writing one is worth doing once.

**Booking and waiting lists.** Book and cancel in a click. A full class shows how many people are
already waiting — `Full · 6 waiting` — because that, rather than the fact it is full, is what
tells you whether joining the list is worth it. Once you are on it, your place is shown in
context as `#2 of 6`.

**And it tells you when a space opens.** KAL does not promote off its waiting lists. When somebody
cancels, it emails *everybody* on the list that a space has come up and gives it to whoever books
first — and in practice it is gone within minutes. KAL Pal is already signing in as everybody
every two minutes, and already working out each booking's state in order to store it, so noticing
costs nothing: a place that is still `queued` at a class that had no free spaces last time and has
one now is news. It arrives as a push notification if the member has turned them on, and as a
banner in the app if they have not — see [Notices](#notices).

**Or it books the space for you.** Each of your waiting-list places has an **Auto-accept** toggle.
With it on, the sync that sees a space open books it before telling you anything, and the alert
you get is *you are in* instead. One attempt per opt-in: if the booking is refused, the opt-in is
dropped and you get the ordinary "a space opened" alert, so a refusal is never re-sent to the club
every two minutes. Somebody who lets you book for them can have it turned on for their places too,
from the people menu on the row. It is stored on their record and booked with their login, so they
get the *you are in* alert just as if they had set it up themselves.

**And when somebody else books you.** The same two channels for the other thing that happens to a
member's schedule without them: being put into a class, or taken out of one, by somebody they gave
that right to. Allowing your partner to book for you is not the same as agreeing to find out about
a 06:30 by looking, and a class quietly *disappearing* is worse still, because you find out by not
going.

**Your classes in your calendar.** A private, subscribable link that puts what you have booked
alongside everything else you have on. It keeps itself current: bookings made in the club's own
app appear within a few minutes, and cancelling anywhere removes them. Waiting-list places
go in as tentative events titled *Waiting list · Body Pump*, which is the calendar's version of
the dimmed avatars on the timetable.

**Booking each other in.** A member can name people who are allowed to book them onto classes —
one partner, a training buddy, whoever they choose — from the switch beside that person's name on
the People page. Those classes then carry a second control on the timetable: *Book Wanda in*,
*Put Wanda on the list*, or *Cancel for Wanda* when she already has the place. The booking is made
through her own KAL account, by the same stored credentials the background sync uses, so the
club sees a booking she made herself and it turns up in her own app.

Nobody has this by default, and it is a list of named people rather than a switch, because "anyone
signed into KAL Pal may book me" is not something anyone wants. The grant is one-directional —
letting your wife book you does not let you book her — it covers cancelling as well as booking, so
a mistake can be undone by whoever made it, and it is withdrawn from either the People page or
Settings, where everyone holding it is listed by name.

**Everyone else.** Any other member signed into KAL Pal shows up against the classes they are
booked onto, as an avatar row on the timetable. Waiting-list places are shown dimmed, because
they are not a promise to be there. Visibility is a single switch in Settings — on by default,
and turning it off removes you from everyone's grid immediately while still letting you see
theirs.

Classes that have already started are dimmed and marked *Finished*, so the day still reads as a
whole without them looking bookable.

## How the shared view works

KAL is the source of truth for the timetable and for who is booked onto what. This app's own
store holds only the things the club's API has no concept of: that a member has joined *this*
app, a snapshot of their upcoming bookings, a rolling week of their gym visits, and the handful of
things members have added themselves — their notes, their calendar link, the devices they want
notifying, and the notices they have not yet acknowledged.

Members' bookings are refreshed three ways, so the shared view stays close to live:

- when they sign in,
- immediately after they book or cancel here,
- and every 2 minutes by a scheduled task, for bookings made in the club's own app.

That last one is why the app stores credentials — see below.

**Gym hours.** Where the club's API offers badge scans, they are accumulated into a rolling week
so the People page can say roughly when somebody trains. This has its own switch, separate from
class visibility, because wanting your classes public and your comings and goings private is an
entirely reasonable position. Turning it off deletes what was collected rather than hiding it. At
KAL there is nothing to collect yet — see [Gym visits](#gym-visits).

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

KAL Pal stores each member's KAL password, encrypted with AES-256-GCM, and the key lives only in
`BIGBUDS_ENCRYPTION_KEY` rather than in the store.

This is a real liability and it is worth being clear about why it exists. Gladstone has no token
to hold: it takes the member's email and password as headers on *every* request. Without the
password, a member who books in the club's own app and does not open KAL Pal for a week is stale to
everyone else for that week — which is most of the value of the app gone — and auto-accept could
not exist at all.

The trade is deliberate rather than incidental:

- Passwords are never in the session cookie. That holds an id and display fields only; the live
  Gladstone client lives server-side, keyed off the member's record.
- The encryption key is separate from the store, so a leaked copy of the data alone is not enough.
- GCM is authenticated, so a tampered ciphertext fails to decrypt rather than decrypting to
  something chosen by whoever tampered with it.
- Changing your password at the club breaks the background sync rather than silently working —
  the failure is recorded against the member, and signing in again fixes it.

If you would rather not hold passwords at all, the sync can be cut back to sign-in and
post-booking only: drop `server/tasks/sync.ts` and store nothing but the session. Members then
appear to each other as of their last visit, and nobody gets waiting-list alerts.

## The API client

[`server/utils/gladstone.ts`](./server/utils/gladstone.ts) talks to Gladstone, the booking engine
behind the KAL app, at `kal.gs-signature.cloud/AWS`. The KAL app itself is an Innovatise
"MyFitApp" white-label shell; that layer only serves the app its config and home screen, so this
ignores it and goes straight to Gladstone. Nothing here is documented — it was worked out from the
app.

It deliberately keeps the *shape* of the Resamania client it replaced: the same `Client` methods,
the same `ClassEvent` / `Attendee` / `PlanningEntry` types, the same helper functions. That is why
the move between gyms touched one file and a few import lines rather than the whole app. Two facts
about Gladstone are absorbed at that boundary:

- **Timestamps are Unix epoch seconds.** Everything above the client speaks naive Europe/London
  wall-clock strings (see [Wall-clock times](#wall-clock-times)), so epochs are converted on the
  way out and back on the way in, and nothing downstream sees a `Date`.
- **Ids are bare strings.** The rest of the app keys everything by IRI, down to the store's
  filenames, so Gladstone ids are wrapped as `/gs/contacts/…`, `/gs/sessions/…`, `/gs/sites/…`
  and unwrapped again before they go back. A class *type* has no id at all, so notes and
  attendance are keyed on a slug of the class title, `/gs/activities/strength-development`.

And a few things worth knowing before changing it:

- **Auth is a fixed application key plus the member's credentials, per request.** Every call sends
  `AuthenticationKey` (the app's key, delivered to the KAL app in cleartext — it identifies the
  application, not the user) and the member's `user` and `pw` headers. The `tokenValue` the login
  call returns does not authenticate anything else.
- **The timetable is personalised.** Each session carries the viewer's own booking state, waiting
  list place and capacity inline. That is convenient — "am I booked" comes for free — but it means
  the planning cache is keyed per member, because a grid cached for one member would show another
  somebody else's bookings.
- **"My bookings" is read off the timetable.** `/api/booking/list` exists but yields no session id
  to cancel by, so `bookingsFrom` reads the next four weeks of timetable and keeps what the member
  holds. That is also why attendance cannot be rebuilt from history.
- **The timetable is drawn from one activity scope**, `FITC` (fitness classes), filtered to the
  member's home site. `KAL_SCOPE_IDS` overrides it.
- **Booking and joining a waiting list are the same request.** `/api/Book` decides based on space,
  so the client re-reads the session afterwards and reports what actually happened. Cancelling and
  leaving a list are likewise one call, `/api/Cancel`.

`POST /api/classes/cancel` re-reads the member's own bookings before acting, because the id
arrives from the browser and would otherwise cancel any booking at the club given its id.

## Gym visits

**Not available at KAL.** Gladstone has no badge-scan feed, so `client.entries()` returns nothing,
the People page shows no visits, and "who is usually around" stays empty. The code is kept because
it is self-contained and still correct; what follows is what was learned from BigBox's
`/bigbox/entries`, which returned a timestamp, a door, and nothing saying which way the member was
walking. Three things about it shaped `shared/visits.ts`:

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

## Notes

One note per member per class type, in that member's own file, keyed by activity IRI. Keyed that
way — rather than by class event — for the same reason the attendance count is: a note about Body
Pump is about Body Pump, not about one Tuesday's instance of it, and keying it to the event would
mean writing the same thing every week and watching all of it fall off the end of the timetable as
each class passed.

The timetable carries a `noteCount` per class and nothing else. A day holds sixty-odd classes and
a member opens one or two, so sending every note with the grid would be paying for the whole
feature on every page load — but sending *nothing* would leave the feature undiscoverable, because
a class name with four people's advice behind it would look exactly like one with nothing. The
count is computed in one pass over every member, which at a gym's scale is a loop over a few dozen
small objects.

Notes ignore the `visible` switch, deliberately. That setting is about whether your *bookings*
appear on other people's timetables — something that happens to you as a side effect of booking a
class. Writing a note is a deliberate act with a name attached, and the composer says so. Hiding
one behind the other setting would mean a member wrote something, was told it was posted, and it
silently was not.

## The calendar feed

`/calendar/<token>.ics`, outside the session entirely, because a calendar client sends no cookie
and cannot be asked for one. The token in the path is the whole of the authentication — 32 random
bytes, and the only revocation a URL can have is being replaced, so resetting issues a new one and
breaks every subscription to the old. Settings says as much in those words.

Three things about it are worth knowing before changing it:

- **It is served from the snapshot, not from KAL.** Calendar clients poll on their own
  schedule and there are several per member. Signing in as somebody to answer each poll would put
  the club's API under a load nobody is watching. The snapshot is refreshed every two minutes
  anyway, which is well inside how fresh a calendar needs to be.
- **Which is why a stored booking now carries its name.** The snapshot began as three fields,
  which is all the shared timetable needs — it already has the club's copy of every class in front
  of it and only wants to know who is on which. The feed has no such copy, so `StoredBooking`
  gained `name`, `endedAt`, `studio` and `coach`. They are optional, because records written
  before this existed do not have them; the feed leaves out a booking it cannot name rather than
  emitting an event called "Class", and one sync fixes it.
- **The times go out as they came in.** This is the one place the club's naive wall-clock strings
  leave the building, and iCalendar has somewhere honest to put them:
  `DTSTART;TZID=Europe/London:20260814T063000` says *06:30 in London*, which is exactly what the
  API meant. Converting to UTC would work and is what most exporters do, but it would mean this
  code computing an offset — the thing [`shared/naive.ts`](./shared/naive.ts) exists to avoid —
  and it would show the wrong hour to anybody who exported in August and read in January. The cost
  is that the feed has to define the zone it names, which is the `VTIMEZONE` block in
  [`shared/ics.ts`](./shared/ics.ts): two recurrence rules, unchanged since 1996, that say when
  Britain's clocks move.

The file is written by hand rather than with a library, for the same reason `favicon.ico` is: the
subset of RFC 5545 that a read-only feed of timed events needs is small and completely specified,
and the parts that are easy to get wrong — folding, escaping, the timezone — are exactly the parts
a library would hide. Folding is measured in octets rather than characters and splits between
codepoints, because a coach with an accent in their name costs two bytes and a split in the middle
of one produces mojibake. There are tests pinning that, and pinning that a real newline in a
description becomes the two characters `\n` — a literal one would start a new property and
silently truncate the rest of the member's calendar.

## Notices

Two kinds of news come out of comparing one sync's snapshot with the last, and both live in
[`shared/promotions.ts`](./shared/promotions.ts):

- **`space-available`** is the one that matters at KAL. A booking that is still `queued`, at a
  class that had no free places last time and has one now. Only the edge counts: a space that stays
  open is announced once, and one that closes and opens again is announced again, which is what the
  club's own email does. A snapshot from before free places were stored counts as unknown rather
  than full, so the first sync after an upgrade does not announce every open class at once. The
  banner clears itself once the space has gone or the member is no longer on the list, so it never
  sends anybody to a class that is full again.
- **`promoted`**: a booking that was `queued` and is now `booked`. BigBox did this automatically;
  KAL does not, so at KAL this is what auto-accept produces. Three transitions look similar and only
  that one is news — *absent → booked* is somebody pressing Book, and *absent → queued* is somebody
  joining a list; they both know already.

A class that has already started is left out of both. The sync fetches from the club's midnight,
so a 07:00 run still sees this morning's 06:30, and being told at 07:00 that a place opened up at
06:25 is worse than being told nothing.

**Auto-accept** happens in the scheduled sync, before anybody is told anything, and reads the
current snapshot rather than this run's notices — so a space first noticed by a sign-in or a
booking, which announce nothing, is still claimed. A claimed place updates the snapshot in the same
write, so the next sync does not see *queued → booked* and announce it a second time.

Every notice is announced twice, and both halves matter:

- **A push notification**, sent only from the scheduled sync. `syncMember` also runs on sign-in
  and straight after a booking, and a change detected on either of those is one the member is
  already looking at. The scheduled run is the path where nobody is looking, which is the whole
  reason to interrupt them.
- **A banner in the app**, from a record kept against the member, dismissed by hand rather than by
  having been rendered. Push is best-effort — it needs permission, it needs the app on the home
  screen before iOS will allow it at all, and a message can simply not arrive. Without the record,
  a member who never turns notifications on would get nothing from the one piece of news the app
  exists to give them. The record is dropped once the class starts, seen or not, which is also
  what stops the list growing without a bound anyone chose.

### Booked and cancelled for you

[`shared/notices.ts`](./shared/notices.ts) is the closed list, and it is closed on purpose: every
one of these interrupts somebody, so adding a kind should mean writing the sentence in that file
and arguing that it earns the interruption.

Alongside those two there are `booked-for-you` and `cancelled-for-you`, which arrive from the
opposite direction. There is nothing to detect — the request that did it is right there in
[`book.post.ts`](./server/api/classes/book.post.ts) — so the endpoint records and sends the notice
itself rather than waiting for a sync to notice. They fire only when the subject is not the person
making the request; booking your own class is not news.

Two details:

- **At most one notice per class, newest winning.** Somebody booking a member in and thinking
  better of it two minutes later would otherwise leave both sentences on screen at once — *"Sam
  booked you into Body Pump"* directly above *"Sam cancelled Body Pump for you"* — which is a
  banner arguing with itself about whether the member has a class.
- **Announcing never fails the request.** By the time the notice is written the class has already
  been booked or cancelled at the club. Reporting that as failed because a push service was slow
  is how somebody books the same class twice.

`promoted` and `space-available` have nobody's name on them. Neither is a person's decision about
this member, and saying "the club booked you in" would suggest it was.

The settings copy names these things and says nothing else is ever sent — no "a friend booked
something", no reminders about classes you booked yourself. That promise is the feature; keeping
it is what stops the switch being turned off.

### Migrating the record

Notices shipped first as a `promotions` array holding only promotions, so there are member files
carrying it. There are no migrations in this project — the store fills in fields as it loads — so
the conversion lives in `noticesFrom`, which is pure and pinned by tests rather than hoped about.
A member promoted before the upgrade keeps the notice.

### Why `web-push` is a dependency

Nearly everything else here that could have been a dependency was written out by hand. This one
is not, and the reason is the failure mode rather than the size.

A push message is a VAPID JWT plus an RFC 8291 payload: ECDH over P-256, HKDF twice, AES-128-GCM
with a particular record framing. All of it is in `node:crypto` and it is perhaps a hundred and
fifty lines. But there is no way to test it short of a live push service and a real device, and
every way of getting it subtly wrong produces the same symptom — the request is accepted, and the
notification never arrives. Silent non-delivery is the worst possible outcome for this feature: a
member waits for a message that was never going to come, and nothing anywhere says so.

`public/sw.js` is hand-written, though. A push can only be delivered to a service worker, so there
has to be one — but this app has nothing it wants to cache, so a PWA toolchain would bring a build
step, a precache manifest and a set of decisions about stale content for a file that handles two
events.

## Wall-clock times

[`shared/naive.ts`](./shared/naive.ts) keeps timestamps as naive Europe/London strings and never
turns them into a `Date`. Gladstone sends epochs, which the client converts at the boundary; the
string format is inherited from Resamania, which sent it natively, and turned out to be the right
thing to keep. The format is fixed-width and zero-padded, so lexicographic order *is*
chronological order and comparisons need no parsing at all.

This matters more than it looks. A naive London time passed through `new Date()` is reinterpreted
in whatever zone the code is running in — UTC on Railway, London on a laptop, something else
entirely for a member checking the timetable on holiday. The bug only appears for half the year,
and it tells someone their 06:30 class is at 07:30. There are tests pinning both a BST and a GMT
date for exactly this reason.

## Class categories

Gladstone files nearly the whole timetable under one activity group, `FITC` (fitness classes),
which is no use to browse by. So the categories and tags live in
[`shared/categories.ts`](./shared/categories.ts), hand-curated for KAL — a Les Mills–heavy
programme across nine sites — and checked against all 127 class titles the club was running when
it was written.

The club's names are messy: the same class turns up as `R P M`, `Rpm`, `R.P.M` and
`Virtual R P M Express`. So matching strips the recurring noise words (`virtual`, `les mills`,
`express`, `beginners`, `female only`, …) and the punctuation before looking a class up, and adds
the stripped facts back as tags so they stay searchable. A class that is not in the table falls
back to keyword matching on the name, so new classes still land somewhere sensible rather than
disappearing.

## App icon and metadata

The mark is Lucide's `boxes`, kept from the BigBox days — the same glyph the header uses as the
logo, so the tab icon and the thing at the top of the page are one drawing rather than two that
resemble each other — in lime-500 on the app's near-black, with the corner radius plates iOS and Android expect.

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
browser chrome matches the page, and the Open Graph tags — the way anybody joins KAL Pal is a
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

Sign in with a real KAL membership — there is no separate registration, because the membership
*is* the account. If a login is refused, try it on [KAL's own website][kal-portal] first; the login
screen links there too.

| Command | |
| --- | --- |
| `yarn dev` | development server on :3000 |
| `yarn test` | unit tests |
| `yarn lint` | eslint |
| `yarn icons` | redraws the app icons into `public/` |
| `yarn vapid` | generates a keypair for push notifications |

The tests cover the category table, search matching, the capacity and booking-state logic in the
API client, the wall-clock arithmetic across both DST transitions, grouping badge scans into
visits, which snapshot changes count as a promotion or an opened space, how notices collapse and
expire, the wording of each kind, the conversion of records written before notices had kinds, and
the iCalendar output, down to the octet-counted line folding and the escaping that stops a newline
in a note truncating somebody's calendar. They are all pure functions — nothing in the suite talks
to KAL. Auto-accept's booking step is the one piece of sync logic with no test, because it is a
real booking at the club.

Notifications are the one part with no unit test behind it, because there is nothing to assert
against short of a live push service and a real device. What can be checked instead is that the
message is assembled and sent: point `web-push` at a local HTTPS endpoint and confirm it posts
with a `vapid` authorization header, `content-encoding: aes128gcm`, and a body that is not the
plaintext.

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
   | `BIGBUDS_VAPID_PUBLIC_KEY` | optional; `yarn vapid` generates the pair. Without them the app still records every notice and shows it in-app — only the notification is missing |
   | `BIGBUDS_VAPID_PRIVATE_KEY` | the other half. Changing either invalidates every subscription, and members have to turn notifications on again |
   | `BIGBUDS_VAPID_SUBJECT` | optional; a `mailto:` for a push service with a complaint about this app |
   | `KAL_SCOPE_IDS` | optional; the Gladstone activity scope the timetable is drawn from, `FITC` by default |

The variables keep their `BIGBUDS_` prefix from before the rename. Changing them would mean
changing every deployment's configuration for no benefit.

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

`KAL_EMAIL` and `KAL_PASSWORD` are for poking the API by hand from a laptop. The deployed
app never reads them — there is no reason for them to exist as service variables.

`numReplicas` is deliberately 1. The 2-minute sync runs in-process, so a second replica would
sign in as every member a second time on the same schedule for no benefit. If you do need to scale
out, drop `nitro.scheduledTasks` from `nuxt.config.ts` and drive `POST /api/sync` from a Railway
cron service with `BIGBUDS_SYNC_TOKEN` as a bearer token instead.

[kal]: https://www.kal.org.uk/
[kal-portal]: https://kal.gs-signature.cloud/Connect/mrmLogin.aspx
[cosmic-app]: https://github.com/orta/bigbox-for-cosmic
