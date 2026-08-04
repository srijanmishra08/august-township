# Master Plan Preprocessing Runbook

**For:** Whoever preprocesses raw architect PNGs for Mapbox overlay use
**Time:** 1–2 hours per project
**Tools required:** Adobe Photoshop, Mapbox Studio account

---

## Step 1 — Remove White Background

Open the raw architect PNG in Photoshop.

1. Select **Magic Wand tool** (W). Set: Tolerance `20`, Contiguous `ON`, Anti-alias `ON`
2. Click the white background area. A marching-ants selection should surround the background
3. Press **Delete** to remove. Zoom in and check corners and edges
4. Repeat for any enclosed white areas inside the plan (courtyards, interior white fill)
5. Deselect (Cmd+D). Background should now show as a checkerboard (transparent)

If the background isn't fully removed: increase Magic Wand tolerance to 30 and retry. If plan has very light gray areas you want to keep, select only pure white (tolerance 10, Contiguous ON).

---

## Step 2 — Trim to Plot Boundary

Remove excess canvas outside the plan boundary.

1. **Image > Trim > Based on: Transparent Pixels** — click OK
2. Canvas trims to the plan's bounding box
3. Export as PNG to confirm result (no transparency lost)

---

## Step 3 — Color Tune to Project Palette

Goal: plan reads as a stylized overlay on satellite imagery, not a raw scan.

1. Add adjustment layer: **Layer > New Adjustment Layer > Hue/Saturation**
2. Set **Saturation: -20 to -30** (reduce color intensity)
3. Optional: add slight warm tint — Hue `+5`, Saturation `+5` on Reds/Yellows
4. Check at reduced opacity (50%): the plan should blend with satellite, not fight it
5. Flatten the adjustment layer into the image before export

---

## Step 4 — Export Variants

**Desktop version:**
1. **File > Export > Export As** — format: PNG
2. Set width to **2400px** (height adjusts proportionally)
3. Save as `master-plan.png`

**Mobile version:**
1. Same process — set width to **900px**
2. Save as `master-plan-mobile.png`

Both files: PNG format, transparency preserved, sRGB color profile.

---

## Step 5 — Upload to Mapbox Studio

1. Go to [mapbox.com/studio](https://mapbox.com/studio) — sign in
2. Navigate to **Tilesets** in the left sidebar
3. Click **New tileset > Upload raster PNG**
4. Upload `master-plan.png`
5. Wait for processing — typically 2–5 minutes
6. Note the tileset ID (format: `username.xxxxxxxx`) — you'll need it in Step 6

---

## Step 6 — Georeference in Mapbox Studio

Align the plan overlay to real-world satellite coordinates.

1. Open or create a map style in Mapbox Studio
2. Click **Layers > + Add layer > [your tileset]** to add the master plan as a raster layer
3. Switch the base layer to satellite (Mapbox Satellite Streets)
4. Open the **Georeferencer** tool: Studio > Style > **Georeferencer** (top toolbar)
5. Drag the 4 corner control points of the overlay onto matching features in the satellite view:
   - Match main road intersections at the site boundary
   - Match site boundary corners to satellite land parcels
   - Match any known landmarks (water towers, distinctive buildings)
6. Zoom to level 16+. Target: overlay should align within **<5px drift** at zoom 16

**Tips:**
- Zoom in on each corner before placing the control point — coarse placement at low zoom causes large drift
- If the plan was scanned at an angle, use all 4 corners independently (don't assume it's axis-aligned)
- If drift is >10px: check if the source PNG is the correct project — architect plans are sometimes mislabeled

---

## Step 7 — Record Corner Coordinates

After georeferencing is complete:

1. In Mapbox Studio Georeferencer, note the **lat/lng** of each of the 4 corners you placed
2. Open `data/projects/[slug]/config.json`
3. Update the `georef` block:

```json
"masterPlan": {
  "desktop": "assets/master-plan.png",
  "mobile": "assets/master-plan-mobile.png",
  "georef": {
    "topLeft": [lng, lat],
    "topRight": [lng, lat],
    "bottomRight": [lng, lat],
    "bottomLeft": [lng, lat]
  }
}
```

Note: coordinates are `[longitude, latitude]` (GeoJSON convention — lng first).

---

## Verification

After completing all 7 steps:

1. In Mapbox Studio, view the georeferenced raster layer on satellite at **zoom level 16**
2. Plot boundaries in the overlay should align with the satellite land parcels within **1–2 meters**
3. Check all 4 corners — not just the center — for consistent alignment
4. If any corner drifts >5px: return to Step 6 and re-place that corner's control point

**Deliver:**
- `master-plan.png` → `public/data/projects/[slug]/assets/`
- `master-plan-mobile.png` → `public/data/projects/[slug]/assets/`
- Updated `config.json` with `georef` coordinates committed to the repo

---

*For questions about delivery paths or config format, see ASSET-BRIEF.md or contact the dev team.*
