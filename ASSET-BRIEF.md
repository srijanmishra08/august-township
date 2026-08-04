# Asset Brief — August Township Projects

**For:** Asset production team
**Prepared by:** Dev team
**Date:** 2026-05-22
**Status:** Active

---

## Master Plan Overlays

One set of overlays per project (3 total).

| Attribute | Spec |
|-----------|------|
| Format | PNG with transparent background |
| Desktop | Min 2400×1800px — named `master-plan.png` |
| Mobile | Max 900px wide — named `master-plan-mobile.png` |
| Content | Trimmed to plot boundary; white background removed; color-tuned to project palette |
| Deliver to | `public/data/projects/[slug]/assets/` |

**Notes:**
- Remove all white fill — final PNG must have transparent background where no content exists
- Tuning goal: overlay reads as a stylized plan layer over satellite imagery, not a raw architect scan
- For georeferencing guidance see `docs/PREPROCESSING-RUNBOOK.md`

---

## Amenity Videos

8–12 clips per project (24–36 total).

| Attribute | Spec |
|-----------|------|
| Format | MP4, H.264 codec |
| Audio | No audio track (muted) |
| Resolution | 1920×1080 |
| Duration | 5–8 seconds, seamless loop |
| File size | <8MB per clip |
| Quantity | 8–12 clips per project |
| Naming | Amenity slug — e.g. `clubhouse.mp4`, `pool.mp4`, `playground.mp4` |
| Deliver to | `public/data/projects/[slug]/assets/amenities/` |

**Common amenity slugs (confirm per project):**
`clubhouse`, `pool`, `playground`, `gym`, `park`, `tennis-court`, `jogging-track`, `amphitheatre`

---

## Landing Page Loops

One loop per project (3 total).

| Attribute | Spec |
|-----------|------|
| Format | MP4, H.264, muted |
| Resolution | 1920×1080 |
| Duration | 6–12 seconds, seamless loop |
| File size | <15MB |
| Named | `landing-loop.mp4` |
| Deliver to | `public/data/projects/[slug]/assets/` |

**Notes:**
- Cinematic aerial or ground-level sweep of the project site
- Must loop seamlessly — no visible cut or flash at loop point
- Will autoplay muted as background video on the landing card

---

## Delivery Structure

Deliver all assets into the following directory tree (already created in the repo):

```
public/
  data/
    projects/
      august-township/
        assets/
          master-plan.png          ← desktop overlay
          master-plan-mobile.png   ← mobile overlay
          landing-loop.mp4         ← landing card background
          amenities/
            clubhouse.mp4
            pool.mp4
            ...
      project-2/
        assets/
          (same structure)
      project-3/
        assets/
          (same structure)
```

---

## Timeline

| Asset | Deadline | Blocks |
|-------|----------|--------|
| Landing loops (all 3) | End of Week 1 | Phase 1 Plan 02 landing page — cards will show dark fallback until delivered |
| Master plans (pilot project — august-township) | End of Week 1 | Phase 2 — Mapbox georeferencing cannot start without pilot master plan |
| Master plans (projects 2 & 3) | End of Week 3 | Phase 7 — Replicate projects |
| Amenity videos (pilot project) | End of Week 3 | Phase 3 — Scroll choreography + amenity card system |
| Amenity videos (projects 2 & 3) | End of Week 5 | Phase 7 |

**Critical path:** Pilot project master plan → dev team must have it by end of Week 1 to stay on schedule.

---

## Naming Convention

- All filenames: lowercase, hyphen-separated. No spaces. No underscores.
- Amenity filenames must match the slug exactly as agreed (dev team will confirm list per project)
- Examples: `landing-loop.mp4`, `master-plan.png`, `tennis-court.mp4`

---

*Questions? Contact the dev team before starting production to avoid rework.*
