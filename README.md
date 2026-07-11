# Workout Coach

A personal AI workout app: chat with a coach that knows your goals, logs your workouts, remembers what it learns, and pulls in activities from Strava (and Garmin via Strava).

## What's inside

- **Chat** (`/`) — talk to your coach. It reads your goals, guardrails, saved notes, and last 30 workouts on every message. When you tell it about a workout, it logs it. When it learns something durable (injury, PR, preference), it saves a note.
- **Dashboard** (`/dashboard`) — weekly stats, training volume chart, full workout log, and a Sync Strava button. Swims get SWOLF + strokes/length computed from Strava lap data automatically.
- **Settings** (`/settings`) — goals and guardrails are individual editable records: add, edit inline, mark achieved, pause a rule without deleting it. Coach notes live here too. The coach can also change goals and guardrails from chat, but only when you explicitly ask.

## Setup (about 20 minutes)

### 1. Supabase (database)

1. Create a free account at [supabase.com](https://supabase.com) and make a new project.
2. Open **SQL Editor**, paste the contents of `supabase/schema.sql`, and run it.
3. In a new query, paste `supabase/seed.sql` and run it — this loads your training history, goals, guardrails, and benchmarks from the ChatGPT export, so the coach knows everything from the first message.
4. Go to **Settings → API** and copy the **Project URL** and the **service_role key**.

### 2. Anthropic API key

1. Sign up at [console.anthropic.com](https://console.anthropic.com).
2. Add a payment method (usage-based; light personal use runs a few dollars a month).
3. Create an API key under **API Keys**.

### 3. Strava app

1. Go to [strava.com/settings/api](https://www.strava.com/settings/api) and create an app.
2. Set **Authorization Callback Domain** to `localhost` for now (change to your Vercel domain after deploying).
3. Copy the **Client ID** and **Client Secret**.

**Garmin users:** link Garmin Connect to Strava (Garmin Connect app → Settings → Connected Apps → Strava). Garmin activities then flow into Strava automatically, and this app picks them up on sync. No Garmin API needed.

### 4. Run locally

```bash
cd workout-coach
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. Deploy to Vercel

1. Push this folder to a GitHub repo.
2. Import the repo at [vercel.com/new](https://vercel.com/new).
3. Add the four env vars from `.env.local` in the Vercel project settings.
4. After the first deploy, update your Strava app's **Authorization Callback Domain** to your Vercel domain (e.g. `workout-coach.vercel.app`).

## How memory works

Three layers, all in Supabase:

1. **Goals + guardrails** — individual database records, editable in Settings, injected into the system prompt on every chat turn. The AI can manage them via `manage_goal` / `manage_guardrail` tools, but only on explicit request. Coach notes are freeform memory the AI maintains via `save_coach_note`.
2. **Workouts** — every logged or synced workout. The last 30 go into the prompt; all of them feed the dashboard.
3. **Messages** — chat history. The last 20 messages provide conversational context.

## Ideas for later

- Strava webhooks so activities appear without hitting Sync
- Auth (currently single-user, no login — fine for a personal app, but don't share the URL)
- Planned-vs-actual tracking: coach writes a weekly plan, dashboard shows adherence
- Weekly email summary via a Vercel cron job
