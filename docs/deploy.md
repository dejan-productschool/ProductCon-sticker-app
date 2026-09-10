# Deploying

Two halves. The hosted app holds the queue and talks to phones; the booth agent
runs next to the printer.

## 1. Hosted app on Vercel

The repo is already pushed, so this is an import rather than a setup:

1. **vercel.com/new** -> import `dejan-productschool/ProductCon-sticker-app`
2. Framework preset: **Other**. No build command, no output directory - the
   `api/` function and `public/` static files are picked up as they are.
3. **Storage -> Create Database -> Postgres** (Neon) and attach it to the
   project. That sets `DATABASE_URL` for you. The app starts in a degraded
   "no database" state until this exists.
4. Environment variables:

   | name | value |
   |---|---|
   | `STICKER_AGENT_TOKEN` | a long random string - the booth agent must match it |
   | `STICKER_JOIN_URL` | the deployment's own URL, e.g. `https://shipit.productschool.com` |
   | `STICKER_SECONDS` | measured hand-to-hand seconds from the print spike |

   `VERCEL` is set automatically, which is what puts the app in hosted mode: it
   stops trying to print and waits for the agent.

Generate a token with:

    node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"

## 2. Booth agent on the mini PC

On the Windows machine with the VC-500W attached:

    git clone https://github.com/dejan-productschool/ProductCon-sticker-app.git
    cd ProductCon-sticker-app
    npm install

    set STICKER_API=https://<your-deployment>.vercel.app
    set STICKER_AGENT_TOKEN=<the same token>
    set STICKER_PRINTER=Brother VC-500W
    npm run agent

It prints what it can see on start-up. If no printer is configured it says so
and reports the booth as down rather than pretending.

## 3. The screens

Point browsers at the deployment:

    /join/     the QR, on a booth screen or printed on foam board
    /wall/     screen two
    /approve/  the volunteer's tablet

## Check it end to end

    curl https://<deployment>/api/health

`printer.ok` is false and `capacity.state` is `down` until the agent checks in.
That is correct: **silence from the booth counts as down**, and the queue stops
accepting rather than taking work nobody can print.

Then scan the QR with a phone and ship one.

## If the venue network is bad

The whole thing also runs on one machine with no internet:

    npm start

SQLite, local printer, QR pointing at the booth machine's LAN address. Phones
have to be on the same network - a travel router at the booth is worth the
suitcase space. This is the fallback if the hall's connectivity is a disaster.
