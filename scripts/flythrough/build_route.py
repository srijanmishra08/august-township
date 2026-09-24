#!/usr/bin/env python3
"""
Generate the road-following camera route for the township flythrough.

The 3D masterplan has no road geometry — roads are simply the gaps between
plots. So we rasterise every plot from plots-3d.json into an occupancy grid,
dilate it slightly for camera clearance, and A* between stops through what is
left. That produces a path that follows the actual circulation of the site
instead of cutting across lots.

Stops are snapped to the nearest cell reachable from the entrance, so a stop
sitting inside a plot cluster still resolves to a standpoint on a road.

Usage:
    python3 scripts/flythrough/build_route.py [--project august-township]

Writes data/projects/<project>/flythrough.json.
"""

from __future__ import annotations

import argparse
import collections
import heapq
import json
import math
import pathlib
import sys

CELL = 0.40
BOUNDS = (-30.0, 40.0, -27.0, 30.0)  # x0, x1, z0, z1
DILATE = 1          # cells of clearance around each plot
SIMPLIFY = 0.5      # Douglas-Peucker tolerance, world units
SPEED = 11.0        # world units per unit of scroll duration
GATE = (-15.0, 10.5)
# Standing eye height. World scale is ~4.5 m per unit (plots run 2.3 x 1.4
# units for a ~10 m frontage), so 1.65 m of person is about 0.37 units.
EYE = 0.37

# id -> (rail label, amenity name in plots-3d.json or an (x, z) world point,
#        clip title or None, copy)
STOPS = [
    ("kids", "Game Room", "Kids Play", "Game Room",
     "Pool tables, air hockey, console stations and a lounge bar — a retreat for every age."),
    ("cricket", "Cricket Ground", "Box Cricket", "Cricket Ground",
     "A full-length turf pitch with floodlights, tiered resident seating and a practice net zone."),
    ("plaza", "Central Green", "Lawn & Plaza", "The Central Green",
     "Lawns, shaded walks and a sculpture court at the heart of the township."),
    # Not an amenity: a street among the plots. A coordinate instead of a name
    # makes the route target the nearest plot there, so the camera turns to
    # face a home rather than the road.
    ("villas", "The Residences", (11.0, 3.0), "The Residences",
     "Plots planned for independent villas, each behind its own landscaped frontage."),
    ("gym", "Green Gym", "Green Gym", "Green Gym",
     "State-of-the-art equipment, a free-weights zone and a mirrored studio for personal training."),
    ("clubhouse", "Clubhouse", "M-Purpose Court", "Multi-Functional Hall",
     "A grand event hall for up to 400 guests, with a stage, full AV and dedicated catering access."),
    # Same building as the hall. A zero-length leg becomes a pose rather than a
    # path, so the camera holds still between the two rooms.
    ("theatre", "Home Theatre", "M-Purpose Court", "Private Theatre",
     "Tiered recliners, a star-lit ceiling and a full cinema screen, reserved for residents."),
    ("pickleball", "Pickleball", "Pickle Ball", "Pickleball Courts",
     "Regulation all-weather courts with professional surfaces and landscaped courtside seating."),
    ("garden", "Pool & Garden", "Zen Garden", "Swimming Pool",
     "A temperature-controlled pool with a shaded deck, loungers and a separate splash zone."),
    ("lounge", "Members' Lounge", "Sit Out Park", "Members' Lounge",
     "A curated lounge with premium seating, library nooks and concierge service."),
]

# Real equirectangular 360s, by station id. A stop with one of these shows the
# photographic sphere instead of the clip — the visitor looks around the actual
# room rather than watching a pan of it.
PANOS = {
    "gateway": ("assets/amenities/pano/gate.webp", 150, -75),
    "clubhouse": ("assets/amenities/pano/banquet.webp", 160, -80),
    "theatre": ("assets/amenities/pano/theatre.webp", 150, -75),
    "kids":   ("assets/amenities/pano/gameroom.webp", 165, -80),
    "gym":    ("assets/amenities/pano/gym.webp", 160, -80),
    "garden": ("assets/amenities/pano/pool.webp", 155, -70),
    "lounge": ("assets/amenities/pano/lounge.webp", 150, -75),
}
# A 360 needs longer than a clip: the dwell is what sweeps the yaw.
PANO_DWELL = 2.2

# Exterior films that belong to a station rather than an amenity. All-intra
# encodes, because the dwell scrubs them frame by frame.
STATION_VIDEOS = {
    "gate": "assets/exterior/arrival-scrub.mp4",
    "plaza": "assets/exterior/green-scrub.mp4",
    "villas": "assets/exterior/villas-scrub.mp4",
}
VIDEO_DWELL = 1.8
# Travel between two stops in the same building. Short, and the camera does
# not move, so the beat reads as stepping into the next room.
ROOM_STEP = 0.35

NEIGHBOURS = [
    (1, 0, 1.0), (-1, 0, 1.0), (0, 1, 1.0), (0, -1, 1.0),
    (1, 1, 1.4142), (1, -1, 1.4142), (-1, 1, 1.4142), (-1, -1, 1.4142),
]


class Grid:
    def __init__(self, plots):
        self.x0, self.x1, self.z0, self.z1 = BOUNDS
        self.w = int((self.x1 - self.x0) / CELL)
        self.h = int((self.z1 - self.z0) / CELL)
        solid = [[False] * self.w for _ in range(self.h)]
        for p in plots:
            gx0, gz0 = self.to_cell(p["cx"] - p["width"] / 2, p["cz"] - p["depth"] / 2)
            gx1, gz1 = self.to_cell(p["cx"] + p["width"] / 2, p["cz"] + p["depth"] / 2)
            for gz in range(max(0, gz0), min(self.h, gz1 + 1)):
                for gx in range(max(0, gx0), min(self.w, gx1 + 1)):
                    solid[gz][gx] = True
        self.blocked = [row[:] for row in solid]
        for gz in range(self.h):
            for gx in range(self.w):
                if not solid[gz][gx]:
                    continue
                for dz in range(-DILATE, DILATE + 1):
                    for dx in range(-DILATE, DILATE + 1):
                        z, x = gz + dz, gx + dx
                        if 0 <= z < self.h and 0 <= x < self.w:
                            self.blocked[z][x] = True

    def to_cell(self, x, z):
        return int((x - self.x0) / CELL), int((z - self.z0) / CELL)

    def to_world(self, gx, gz):
        return (self.x0 + (gx + 0.5) * CELL, self.z0 + (gz + 0.5) * CELL)

    def free(self, cell):
        gx, gz = cell
        return 0 <= gx < self.w and 0 <= gz < self.h and not self.blocked[gz][gx]

    def reachable_from(self, cell):
        seen = {cell}
        queue = collections.deque([cell])
        while queue:
            cur = queue.popleft()
            for dx, dz, _ in NEIGHBOURS:
                nxt = (cur[0] + dx, cur[1] + dz)
                if nxt not in seen and self.free(nxt):
                    seen.add(nxt)
                    queue.append(nxt)
        return seen

    def astar(self, start, goal):
        openh = [(0.0, start)]
        cost = {start: 0.0}
        came = {}
        while openh:
            _, cur = heapq.heappop(openh)
            if cur == goal:
                path = [cur]
                while cur in came:
                    cur = came[cur]
                    path.append(cur)
                return path[::-1]
            for dx, dz, step in NEIGHBOURS:
                nxt = (cur[0] + dx, cur[1] + dz)
                if not self.free(nxt):
                    continue
                g = cost[cur] + step
                if g < cost.get(nxt, math.inf):
                    cost[nxt] = g
                    came[nxt] = cur
                    heapq.heappush(openh, (g + math.hypot(nxt[0] - goal[0], nxt[1] - goal[1]), nxt))
        return None


def simplify(points, eps):
    """Douglas-Peucker. Keeps corners, drops the staircase A* leaves behind."""
    if len(points) < 3:
        return points
    (ax, az), (bx, bz) = points[0], points[-1]
    span = math.hypot(bx - ax, bz - az) or 1.0
    worst, idx = 0.0, 0
    for i in range(1, len(points) - 1):
        px, pz = points[i]
        dist = abs((bx - ax) * (az - pz) - (ax - px) * (bz - az)) / span
        if dist > worst:
            worst, idx = dist, i
    if worst <= eps:
        return [points[0], points[-1]]
    return simplify(points[:idx + 1], eps)[:-1] + simplify(points[idx:], eps)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", default="august-township")
    ap.add_argument("--scroll-per-unit", type=float, default=0.6)
    args = ap.parse_args()

    root = pathlib.Path(__file__).resolve().parents[2]
    src = root / "data" / "projects" / args.project / "plots-3d.json"
    data = json.loads(src.read_text())
    amenities = {a["name"]: (a["cx"], a["cz"]) for a in data["amenities"]}

    grid = Grid(data["plots"])
    gate_cell = grid.to_cell(*GATE)
    if not grid.free(gate_cell):
        print(f"gate {GATE} is inside a plot", file=sys.stderr)
        return 1
    component = grid.reachable_from(gate_cell)
    print(f"{len(component)} cells reachable from the entrance")

    def snap(x, z):
        gx, gz = grid.to_cell(x, z)
        return min(component, key=lambda c: (c[0] - gx) ** 2 + (c[1] - gz) ** 2)

    # Open on the whole site so the visitor reads the masterplan before being
    # put on the ground, then descend into the entrance.
    gate_xy = [round(GATE[0], 2), round(GATE[1], 2)]
    gate_station = {
        "id": "gate", "label": "Arrival", "title": "The Arrival",
        "description": "You turn in off the highway, past the water wall and "
                       "into the arrival court.",
        "at": gate_xy, "eye": EYE, "lookHeight": EYE,
        "duration": 2.4, "ease": "power3.inOut", "dwell": 0.8,
    }
    if "gate" in STATION_VIDEOS:
        gate_station.update(video=STATION_VIDEOS["gate"], dwell=VIDEO_DWELL)
    # Same spot as the arrival, so the pose is identical and nothing moves:
    # the film of driving in hands straight to the sphere at the gate.
    gateway_station = {
        "id": "gateway", "label": "The Gateway", "title": "The Gateway",
        "description": "The main gate, framed by planting and cascading water: "
                       "the threshold to August White Lotus.",
        "at": gate_xy, "eye": EYE, "lookHeight": EYE,
        "duration": ROOM_STEP, "ease": "none", "dwell": 0.8,
    }
    if "gateway" in PANOS:
        src, sweep, start = PANOS["gateway"]
        gateway_station.update(panorama=src, panoSweep=sweep, panoStart=start,
                               dwell=PANO_DWELL)
    stations = [
        {
            "id": "overview", "label": "The Masterplan", "title": "August Township",
            "description": "One hundred and eighteen plots around a central spine of "
                           "open green, clubhouse and sport.",
            # Offset from the point it aims at: a camera looking straight down
            # has no defined roll, and three.js resolves that to a scrambled
            # orientation. An oblique aerial also just reads better.
            "at": [5.0, 52.0], "lookAt": [5.0, 0.0], "lookHeight": 0.0,
            "eye": 38, "fov": 46, "duration": 0, "dwell": 0.9,
        },
        gate_station,
        gateway_station,
    ]

    cursor = snap(*GATE)
    for sid, label, amenity, clip, copy in STOPS:
        if isinstance(amenity, tuple):
            # A coordinate: face the nearest plot, so the stop looks at a home.
            ax, az = amenity
            near = min(data["plots"], key=lambda p: (p["cx"] - ax) ** 2 + (p["cz"] - az) ** 2)
            target = (near["cx"], near["cz"])
            amenity_name = None
        elif amenity in amenities:
            target = amenities[amenity]
            amenity_name = amenity
        else:
            print(f"  skipping {sid}: no amenity named {amenity!r}", file=sys.stderr)
            continue

        goal = snap(*target)
        path = grid.astar(cursor, goal)
        if not path:
            print(f"  no path to {sid}", file=sys.stderr)
            continue
        world = [grid.to_world(*c) for c in path]
        length = sum(math.dist(world[i], world[i + 1]) for i in range(len(world) - 1))
        pts = simplify(world, SIMPLIFY)

        station = {
            "id": sid, "label": label, "title": clip or label, "description": copy,
            "target": [round(target[0], 2), round(target[1], 2)],
            "eye": EYE,
            "ease": "power1.inOut",
            "dwell": 1.6 if clip else 0.7,
        }
        if amenity_name:
            station["amenity"] = amenity_name

        if len(pts) < 2:
            # Nowhere to drive: the stop shares a standpoint with the one before
            # it. Match that stop's rest pose exactly — same position, same aim
            # at the same height — so the blend between them is a no-op.
            gx, gz = grid.to_world(*goal)
            station.update(
                at=[round(gx, 2), round(gz, 2)],
                lookAt=[round(target[0], 2), round(target[1], 2)],
                lookHeight=round(EYE * 1.5, 3),
                duration=ROOM_STEP, ease="none",
            )
        else:
            station.update(
                points=[[round(x, 2), round(z, 2)] for x, z in pts],
                duration=round(max(0.5, length / SPEED), 2),
            )

        if clip and amenity_name:
            station["fullscreenVideo"] = True
        if sid in STATION_VIDEOS:
            station.update(video=STATION_VIDEOS[sid], dwell=VIDEO_DWELL)
        if sid in PANOS:
            src, sweep, start = PANOS[sid]
            station.update(panorama=src, panoSweep=sweep, panoStart=start,
                           dwell=PANO_DWELL)
        stations.append(station)
        kind = "360" if "panorama" in station else "film" if ("video" in station or station.get("fullscreenVideo")) else "-"
        print(f"  {sid:11} {length:6.1f}u  {len(pts):3d} pts  {kind}")
        cursor = goal

    # Aim the entrance down its own road, so the descent lands already facing
    # the direction of travel instead of snapping round on the first leg.
    first_leg = next((s for s in stations if s.get("points")), None)
    if first_leg and len(first_leg["points"]) > 1:
        gate_station["lookAt"] = first_leg["points"][1]
        gateway_station["lookAt"] = first_leg["points"][1]

    stations.append({
        "id": "lift", "label": "Explore", "title": "Walk the Plots Yourself",
        "description": "Step into the interactive masterplan to check availability, "
                       "facing and pricing, plot by plot.",
        "at": [5.0, 44.0], "lookAt": [5.0, 2.0], "eye": 46, "fov": 50,
        "duration": 2.2, "ease": "power3.inOut", "dwell": 0.6, "isExit": True,
    })

    config = {
        "_readme": [
            "GENERATED by scripts/flythrough/build_route.py — edit there, not here,",
            "or your changes will be overwritten on the next run.",
            "",
            "`points` is the driving path to each station, A*'d through the gaps",
            "between plots in plots-3d.json so the camera follows roads.",
            "Stations with a panorama, a video, or fullscreenVideo take the whole",
            "screen on arrival. Scroll sweeps the 360 or scrubs the clip, then",
            "hands back to the 3D drive.",
        ],
        "scrollPerUnit": args.scroll_per_unit,
        "lookAhead": 0.06,
        "stations": stations,
    }

    out = root / "data" / "projects" / args.project / "flythrough.json"
    out.write_text(json.dumps(config, indent=2) + "\n")
    units = sum((s.get("duration") or 0) + (s.get("dwell") or 0) for s in stations)
    print(f"wrote {out.relative_to(root)} — {len(stations)} stations, "
          f"{units * args.scroll_per_unit:.1f} viewport-heights of scroll")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
