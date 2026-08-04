# August Township — Handoff

Last updated: 2026-08-04

This is the working copy. **`/Users/s/Documents/August` is a stale duplicate** —
its `node_modules` is a truncated install (389 MB vs 726 MB) left by a disk-full
crash, and `next dev` dies silently there. Everything current lives here. Delete
the duplicate once you're satisfied nothing you want is left in it.

---

## What the project is

A premium sales site for a plotted township. A visitor clicks a project on the
landing page and lands in a **scroll-driven first-person walkthrough of the 3D
masterplan**, which drives along the roads, stops at each amenity, plays that
amenity's film fullscreen, and finally hands off to the interactive plot
explorer.

Route: `/projects/[slug]` → `ProjectExperience` picks a mode:

| mode | component | when |
|---|---|---|
| `flyover` | `TownshipFlythrough3D` | `flythrough.json` exists (default) |
| `flyover` | `TownshipFlyover` | only `flyover.json` exists (flat-plan fallback) |
| `showcase` | `ProjectShowcase` | neither — the original scroll-video page |
| `explore` | `PlotExplorer3D` | user exits the walkthrough |

---

## The walkthrough

`components/flyover/TownshipFlythrough3D.tsx`

- GSAP `ScrollTrigger` with `scrub`, plus Lenis for wheel smoothing.
- The timeline mutates one plain `FlyCam` object. `CameraController` →
  `Plot3DScene.setCamera()` writes it to the three.js camera each tick.
  **React state is never touched during a scrub** — only the active station
  index, which changes rarely.
- Each leg is a `CatmullRomCurve3` through that station's `points`. The camera
  aims a little further along its own path (`lookAhead`), which is what makes it
  read as *driving* rather than sliding sideways.
- On arrival: the camera turns to face the subject, an arrival card names the
  place, then the amenity clip takes the whole screen and **scroll scrubs it**.

### Config is data, not code

`data/projects/august-township/flythrough.json` is **generated**. Edit
`scripts/flythrough/build_route.py` and re-run:

```bash
python3 scripts/flythrough/build_route.py
```

That script is the interesting part. The 3D model has **no road geometry** —
roads are only the gaps between plots. So it rasterises every plot footprint
into an occupancy grid, dilates it for camera clearance, and **A\*s between
stops through what's left**, then Douglas-Peucker simplifies the result. Stops
snap to the nearest cell reachable from the entrance, so an amenity buried in a
plot cluster still resolves to a standpoint on a road.

To change the tour, edit `STOPS` in that script. To retime it, change `SPEED`
(units of world per unit of scroll) or `--scroll-per-unit`.

---

## The 3D world

`lib/massing.ts` — everything built is **derived from plot footprints**. Nothing
is hand-modelled and nothing is imported.

- `buildBuildings` — one villa per plot, inset for a garden, 2–3 storeys by
  sector, pitched or flat roofs mixed
- `buildAmenityBlocks` — clubhouse / gym / lounge / game room volumes
- `buildWalls` — boundary walls (this is what makes streets read as streets)
- `buildRoads` — carriageway quads, from the same free-space logic as the route
- `buildTrees` — garden trees, inside plot boundaries

All deterministic: variation comes from an FNV-1a hash of the plot id, never
`Math.random`. Same layout always produces the same town, so SSR and client
agree and reloads don't reshuffle the skyline. Rendered as ~6 `InstancedMesh`es.

### ⚠️ World scale — read this before touching dimensions

Plots run about **2.3 × 1.4 world units**. For a plotted township that's roughly
a 10 m frontage, so **1 unit ≈ 4.5 m**. There is a `METRE = 1/4.5` constant in
`lib/massing.ts` and everything derives from it.

Getting this wrong is not subtle — an earlier pass used a 3.1-unit storey and
every house came out as a 14-storey tower. Standing eye height is **0.37 units**
(`EYE` in `build_route.py`).

---

## Video

Two encodes per amenity, and they are **not interchangeable**:

| file | encode | used for |
|---|---|---|
| `gym.mp4` | normal inter-frame | ordinary playback (modals) |
| `gym-scrub.mp4` | **all-intra**, every frame a keyframe | scroll scrubbing |

Scrubbing an inter-frame file forces the decoder back to the previous keyframe
on every `currentTime` write. The masters here have **1 keyframe per 169
frames** — that was the original "videos are glitchy" bug. `amenities.json`
carries both paths (`videoPath`, `scrubVideoPath`); `plots-3d.json` carries the
scrub path in `amenity.video`.

To regenerate a scrub encode:

```bash
ffmpeg -i input.mp4 -c:v libx264 -g 1 -keyint_min 1 -crf 20 -an output-scrub.mp4
```

---

## Known issues / next steps

1. **Amenity ↔ clip mismatches in `plots-3d.json`.** *Zen Garden* points at
   `swimmingpool`, *Kids Play* points at `gameroom`. Titles in the flythrough
   currently describe what the clip actually shows. Fix the data and the tour
   follows automatically.
2. **`tsc --noEmit` has never been run clean** in this project. It timed out
   repeatedly. Do this before shipping:
   ```bash
   npx tsc --noEmit
   ```
3. **The look is stylised massing, not photoreal**, and shouldn't pretend
   otherwise. Photoreal needs real assets from the architect — a procurement
   question, not a code one. Cheap wins available first: night lighting with
   emissive windows, water material in the pool, street lamps, parked cars.
4. **Panorama pipeline exists but is not wired into the walkthrough.**
   `scripts/panorama/` builds 360° equirects from the amenity clips; 7 valid
   4096×2048 JPGs sit in `public/data/.../assets/amenities/panorama/` and are
   referenced by `plots-3d.json`. Only ~70–102° of each is real footage — the
   source clips are dolly shots, not rotations, so the rest is synthesized. See
   `ASSET-BRIEF.md` for what to request from the visualiser to do this properly.
5. **Mobile is untested.** The walkthrough has responsive CSS but has only been
   verified at 1280×800 and 1440×900 desktop.

---

## Running it

```bash
npm run dev
```

Port 3000. There is a `.claude/launch.json` in the parent directory with an
attach config if you're driving it from Claude Code.

## Environment

`_env.local` (note the underscore — it is gitignored, along with `.env*`).
Required keys are listed in `.env.local.example`:

```
NEXT_PUBLIC_MAPBOX_TOKEN
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
REVALIDATE_SECRET
```

These must be set in Vercel for the deployment to work. `SUPABASE_SERVICE_ROLE_KEY`
and `RESEND_API_KEY` are secrets — server-side only, never expose them with a
`NEXT_PUBLIC_` prefix.
