#!/usr/bin/env python3
"""Attach generated panoramas to the amenities in plots-3d.json.

Each amenity already names the clip it was authored from via its `video` field,
which is what maps it onto a panorama built by build_panoramas.py. On top of
that this wires a small tour graph: every panorama gets hotspots pointing at its
two nearest neighbours on the site plan, so a visitor can walk between amenities
without going back to the map.

Hotspot yaw is deliberately kept inside the arc that is backed by real footage —
a marker floating in the synthesised periphery would look broken. The yaw values
are layout choices, not surveyed bearings: the render camera's heading relative
to the site plan is unknown, so pretending to encode a true compass bearing
would be false precision.

Idempotent — safe to re-run after rebuilding panoramas.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PROJECT = "august-township"
PLOTS = REPO / "data" / "projects" / PROJECT / "plots-3d.json"
MANIFEST = (REPO / "public" / "data" / "projects" / PROJECT / "assets"
            / "amenities" / "panorama" / "manifest.json")

#: How many neighbours to link from each panorama.
LINKS = 2
#: Hotspots sit this far below the horizon so they read as floor-level markers.
HOTSPOT_PITCH = -6
#: Fraction of the real half-arc at which to place hotspots, keeping them well
#: inside genuine footage rather than out in the synthesised fill.
ARC_FRACTION = 0.62


def main() -> None:
    if not MANIFEST.exists():
        raise SystemExit(f"missing {MANIFEST}; run build_panoramas.py first")

    manifest = json.loads(MANIFEST.read_text())
    by_stem = {Path(p["clip"]).stem: p for p in manifest["panoramas"]}

    doc = json.loads(PLOTS.read_text())
    amenities = doc["amenities"]

    # Match amenities to panoramas through the clip they were authored from.
    linked: list[dict] = []
    for a in amenities:
        video = a.get("video")
        if not video:
            continue
        stem = Path(video).stem.removesuffix("-scrub")
        pano = by_stem.get(stem)
        if not pano:
            continue
        a["panorama"] = pano["output"]
        a["_stem"] = stem
        linked.append(a)

    if not linked:
        raise SystemExit("no amenities matched a generated panorama")

    # Nearest neighbours on the site plan drive the tour graph.
    for a in linked:
        others = sorted(
            (o for o in linked if o is not a),
            key=lambda o: math.hypot(o["cx"] - a["cx"], o["cz"] - a["cz"]),
        )[:LINKS]
        half_arc = by_stem[a["_stem"]]["real_hfov_deg"] / 2.0
        offset = round(half_arc * ARC_FRACTION)
        # Spread the links either side of the opening view.
        yaws = [-offset, offset] if len(others) > 1 else [0]
        a["hotspots"] = [
            {"yaw": y, "pitch": HOTSPOT_PITCH, "label": o["name"], "target": o["name"]}
            for o, y in zip(others, yaws)
        ]

    for a in linked:
        a.pop("_stem", None)

    PLOTS.write_text(json.dumps(doc, indent=2) + "\n")

    print(f"wired {len(linked)} panoramas into {PLOTS.relative_to(REPO)}\n")
    print(f"  {'amenity':<18} {'panorama':<24} {'real arc':>9}  links")
    for a in linked:
        arc = by_stem[Path(a['video']).stem.removesuffix('-scrub')]["real_hfov_deg"]
        links = ", ".join(h["target"] for h in a["hotspots"])
        print(f"  {a['name']:<18} {Path(a['panorama']).name:<24} {arc:>7.0f}°  {links}")

    unmatched = [a["name"] for a in amenities
                 if not a.get("panorama") and (a.get("video") or a.get("hotspots"))]
    if unmatched:
        print(f"\n  no panorama: {', '.join(unmatched)}")


if __name__ == "__main__":
    main()
