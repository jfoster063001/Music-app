# Song Clash starter

Cloudflare Workers + D1 + R2 music tournament starter for local live events.

## Install

```bash
npm install
cp .dev.vars.example .dev.vars
```

Set these in `.dev.vars`:

- `HOST_SECRET`: required to unlock `/host` controls and delete songs.
- `UPLOAD_SECRET`: required for direct host uploads from the host page.

## Create/apply D1 schema locally

```bash
npx wrangler d1 execute music-db --local --file=./schema.sql
```

For your real D1 database:

```bash
npx wrangler d1 execute music-db --remote --file=./schema.sql
```

## Start development server

```bash
npx wrangler dev
```

Open:

- http://localhost:8787/
- http://localhost:8787/host
- http://localhost:8787/display
- http://localhost:8787/voting
- http://localhost:8787/upload

## Event flow

- Landing page (`/`) shows uploaded song titles only.
- Artists are hidden from public live matchup payloads until tournament end standings.
- Host page (`/host`) requires `HOST_SECRET` and supports duplicate cleanup.
- Host can create one-time upload codes for players.
- Player upload page (`/upload`) requires a valid one-time code and allows one song upload one time.
- Each player upload requires song title, artist, and audio file.

## One-time player upload flow

- Unlock `/host` with `HOST_SECRET`.
- In "Player upload codes", create a code per player (or auto-generate).
- Share `/upload` and the player's code.
- The code is consumed after one successful song upload.

## Current tournament behavior

- Round Robin schedules every pair once.
- Double Elimination dynamically pairs remaining songs, preferring songs with the same loss count.
- A song is eliminated after its second loss.
- This is a working double-loss tournament engine, but it is not yet a canonical graphical winners/losers bracket tree.
