#!/usr/bin/env python3
"""Turn flat amenity clips into equirectangular 360 panoramas.

The source clips are ordinary 16:9 renders, so a full sphere of real pixels
does not exist in them. What does exist is whatever the camera swept across.
This pipeline recovers that and no more, then synthesises the remainder so the
result is a seamless, navigable sphere rather than a floating rectangle:

  1. ffprobe/OpenCV measure the camera motion in each clip.
  2. Clips that mostly *rotate* are stitched: frames are warped to a cylinder
     (where yaw becomes a horizontal shift), aligned, and feather-blended into
     one wide strip. Clips that mostly *dolly* cannot be stitched without
     parallax ghosting, so the single widest frame is used instead.
  3. ffmpeg's `v360` filter projects the strip (cylindrical) or frame (flat)
     into an equirectangular canvas, with `alpha_mask=1` marking exactly which
     pixels are real.
  4. The unseen region is filled by mirror-continuation with distance-based
     blur and pole convergence, so the periphery reads as out-of-focus room
     rather than a hard void.

Every panorama ships with a manifest recording how much of it is genuine.

Usage:
    python3 scripts/panorama/build_panoramas.py                # all clips
    python3 scripts/panorama/build_panoramas.py gym waitingroom
    python3 scripts/panorama/build_panoramas.py --hfov 75 --size 4096
"""
from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass, asdict
from pathlib import Path

import cv2
import numpy as np

# --- paths -------------------------------------------------------------------

REPO = Path(__file__).resolve().parents[2]
PROJECT = "august-township"
ASSETS = REPO / "public" / "data" / "projects" / PROJECT / "assets" / "amenities"
OUT_DIR = ASSETS / "panorama"
MANIFEST = OUT_DIR / "manifest.json"

# --- tuning ------------------------------------------------------------------

#: Horizontal field of view assumed for the source renders, in degrees. The
#: clips carry no lens metadata; 70 is typical for this kind of architectural
#: fly-through. It sets the angular scale of the real footage on the sphere.
DEFAULT_HFOV = 70.0
#: Output equirect width; height is always half (2:1 is required by the viewer).
DEFAULT_SIZE = 4096
#: Frames per second pulled out of each clip for stitching.
SAMPLE_FPS = 6
#: Working width for stitching. Larger is sharper but quadratically slower.
WORK_WIDTH = 1280

#: A clip is stitchable only if the camera swept a meaningful arc while
#: staying near a fixed point. Beyond this zoom the motion is a dolly and
#: frame-to-frame parallax makes a stitch ghost badly.
MIN_PAN_FOR_STITCH = 0.35   # in frame widths
#: Kept tight deliberately. A clip that changes scale has translated, and
#: translation means parallax: near and far geometry shift by different amounts,
#: so no single alignment registers them. Stitching such a clip produces comb
#: artifacts along every seam, which looks far worse than one honest frame.
MAX_ZOOM_FOR_STITCH = 1.12  # total scale change across the clip
#: Alignment quality floor; below this we stop extending the strip.
MIN_INLIER_RATIO = 0.25
MIN_MATCHES = 25
#: Never build a strip wider than this many degrees of yaw.
MAX_STRIP_DEG = 340.0
#: Exponent on each frame's centre-peaked blend profile. Higher keeps more
#: source detail (less cross-frame averaging) at the cost of shorter seams.
SEAM_SHARPNESS = 12.0


# --- motion analysis ---------------------------------------------------------

@dataclass
class Motion:
    frames: int
    net_pan: float      # frame widths, signed
    abs_pan: float      # frame widths, unsigned path length
    net_tilt: float     # frame heights, signed
    total_zoom: float   # multiplicative scale change across the clip


def analyse_motion(video: Path) -> Motion:
    """Track features across the clip to separate rotation from translation."""
    cap = cv2.VideoCapture(str(video))
    grays = []
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        grays.append(cv2.cvtColor(cv2.resize(frame, (640, 360)), cv2.COLOR_BGR2GRAY))
    cap.release()
    if len(grays) < 2:
        raise SystemExit(f"{video.name}: fewer than 2 frames")

    dxs, dys, scales = [], [], []
    for a, b in zip(grays, grays[1:]):
        pts = cv2.goodFeaturesToTrack(a, maxCorners=600, qualityLevel=0.01, minDistance=8)
        M = None
        if pts is not None and len(pts) >= 12:
            nxt, st, _ = cv2.calcOpticalFlowPyrLK(a, b, pts, None)
            if nxt is not None:
                ga, gb = pts[st == 1], nxt[st == 1]
                if len(ga) >= 12:
                    M, _ = cv2.estimateAffinePartial2D(ga, gb, method=cv2.RANSAC)
        if M is None:
            dxs.append(0.0); dys.append(0.0); scales.append(1.0)
        else:
            dxs.append(float(M[0, 2]))
            dys.append(float(M[1, 2]))
            scales.append(float(np.hypot(M[0, 0], M[1, 0])))

    dxs, dys = np.array(dxs), np.array(dys)
    return Motion(
        frames=len(grays),
        net_pan=float(dxs.sum()) / 640.0,
        abs_pan=float(np.abs(dxs).sum()) / 640.0,
        net_tilt=float(dys.sum()) / 360.0,
        total_zoom=float(np.prod(scales)),
    )


def pick_strategy(m: Motion) -> str:
    rotating = m.abs_pan >= MIN_PAN_FOR_STITCH
    steady = (1 / MAX_ZOOM_FOR_STITCH) <= m.total_zoom <= MAX_ZOOM_FOR_STITCH
    return "stitch" if (rotating and steady) else "single"


# --- frame extraction (ffmpeg) ----------------------------------------------

def extract_frames(video: Path, dest: Path, fps: int, width: int) -> list[Path]:
    dest.mkdir(parents=True, exist_ok=True)
    run([
        "ffmpeg", "-v", "error", "-y", "-i", str(video),
        "-vf", f"fps={fps},scale={width}:-2:flags=lanczos",
        "-q:v", "2", str(dest / "f_%04d.jpg"),
    ])
    return sorted(dest.glob("f_*.jpg"))


def run(cmd: list[str]) -> None:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise SystemExit(f"command failed: {' '.join(cmd)}\n{proc.stderr[-2000:]}")


# --- cylindrical stitching ---------------------------------------------------

def focal_from_hfov(width: int, hfov_deg: float) -> float:
    return (width / 2) / math.tan(math.radians(hfov_deg) / 2)


def cylindrical_warp(img: np.ndarray, f: float, hfov_deg: float) -> tuple[np.ndarray, np.ndarray]:
    """Reproject a pinhole frame onto a cylinder of focal length `f`.

    On the cylinder yaw is linear in x, so a camera rotation becomes a pure
    horizontal shift — which is what makes the incremental alignment below
    valid. Verified against ffmpeg's own `cylindrical` input convention.
    """
    h, w = img.shape[:2]
    cx, cy = w / 2, h / 2
    ow = int(round(f * math.radians(hfov_deg)))
    oh = h
    ocx, ocy = ow / 2, oh / 2

    xs, ys = np.meshgrid(np.arange(ow, dtype=np.float32), np.arange(oh, dtype=np.float32))
    theta = (xs - ocx) / f
    hh = (ys - ocy) / f
    X, Y, Z = np.sin(theta), hh, np.cos(theta)
    mx = (f * X / Z + cx).astype(np.float32)
    my = (f * Y / Z + cy).astype(np.float32)

    warped = cv2.remap(img, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    valid = ((mx >= 0) & (mx <= w - 1) & (my >= 0) & (my <= h - 1)).astype(np.uint8) * 255
    return warped, valid


def estimate_shift(a: np.ndarray, b: np.ndarray) -> tuple[float, float, float]:
    """Translation taking `a` onto `b`, plus the RANSAC inlier ratio."""
    ga = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY)
    gb = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY)
    sift = cv2.SIFT_create(nfeatures=3000)
    ka, da = sift.detectAndCompute(ga, None)
    kb, db = sift.detectAndCompute(gb, None)
    if da is None or db is None or len(ka) < MIN_MATCHES or len(kb) < MIN_MATCHES:
        return 0.0, 0.0, 0.0

    matcher = cv2.BFMatcher()
    raw = matcher.knnMatch(da, db, k=2)
    good = [m for pair in raw if len(pair) == 2 for m, n in [pair] if m.distance < 0.75 * n.distance]
    if len(good) < MIN_MATCHES:
        return 0.0, 0.0, 0.0

    pa = np.float32([ka[m.queryIdx].pt for m in good])
    pb = np.float32([kb[m.trainIdx].pt for m in good])
    # Translation-only model: on the cylinder that is what a yaw/pitch change is.
    deltas = pb - pa
    best, inliers = None, 0
    med = np.median(deltas, axis=0)
    resid = np.linalg.norm(deltas - med, axis=1)
    keep = resid < max(3.0, np.percentile(resid, 60))
    if keep.sum() >= MIN_MATCHES // 2:
        best = deltas[keep].mean(axis=0)
        inliers = int(keep.sum())
    if best is None:
        return 0.0, 0.0, 0.0
    return float(best[0]), float(best[1]), inliers / len(good)


def feather(mask: np.ndarray) -> np.ndarray:
    """Distance-to-edge weights so overlapping frames cross-fade smoothly."""
    d = cv2.distanceTransform((mask > 0).astype(np.uint8), cv2.DIST_L2, 5)
    if d.max() > 0:
        d = d / d.max()
    return d.astype(np.float32)


def stitch_pan(frames: list[Path], hfov_deg: float) -> tuple[np.ndarray, np.ndarray, float, float]:
    """Incrementally align cylindrically-warped frames into one wide strip.

    Returns the strip plus its own coverage mask — a stitched strip is not a
    clean rectangle, and the uncovered corners must not be mistaken for black
    scenery later on.
    """
    first = cv2.imread(str(frames[0]))
    h, w = first.shape[:2]
    f = focal_from_hfov(w, hfov_deg)

    warped: list[tuple[np.ndarray, np.ndarray]] = []
    offsets: list[tuple[float, float]] = []
    prev = None
    ox = oy = 0.0
    max_strip_px = f * math.radians(MAX_STRIP_DEG)

    for path in frames:
        img = cv2.imread(str(path))
        if img is None or img.shape[:2] != (h, w):
            continue
        cyl, valid = cylindrical_warp(img, f, hfov_deg)
        if prev is not None:
            dx, dy, ratio = estimate_shift(prev, cyl)
            if ratio < MIN_INLIER_RATIO:
                # Alignment lost — stop rather than smear garbage into the strip.
                break
            ox += dx
            oy += dy
            if abs(ox) > max_strip_px:
                break
        warped.append((cyl, valid))
        offsets.append((ox, oy))
        prev = cyl

    # Offsets are "how much later frames moved"; invert into canvas placement.
    px = [-x for x, _ in offsets]
    py = [-y for _, y in offsets]
    cw, ch = warped[0][0].shape[1], warped[0][0].shape[0]
    min_x, max_x = min(px), max(px) + cw
    min_y, max_y = min(py), max(py) + ch
    W = int(math.ceil(max_x - min_x))
    H = int(math.ceil(max_y - min_y))

    # Each output column is taken from the frame that saw it closest to its own
    # centre, rather than averaged across every frame covering it. The alignment
    # is translation-only, so residual per-frame error is inevitable; averaging
    # 30 slightly-misaligned sharp frames produces a smeared strip, while
    # winner-take-all keeps the source detail and confines blending to a narrow
    # band at each seam.
    acc = np.zeros((H, W, 3), np.float32)
    wsum = np.zeros((H, W), np.float32)
    half = cw / 2.0
    cols = np.arange(cw, dtype=np.float32)
    for (cyl, valid), x, y in zip(warped, px, py):
        xi, yi = int(round(x - min_x)), int(round(y - min_y))
        # Centre-peaked profile; the high power makes it effectively a nearest-
        # source pick with a short cross-fade where two frames tie.
        prof = np.clip(1.0 - np.abs(cols - half) / half, 1e-6, 1.0) ** SEAM_SHARPNESS
        wt = np.repeat(prof[None, :], ch, axis=0)
        # Keep a soft edge on the validity boundary so ragged corners fade out.
        edge = np.clip(cv2.distanceTransform((valid > 0).astype(np.uint8), cv2.DIST_L2, 5) / 6.0, 0, 1)
        wt = wt * edge
        acc[yi:yi + ch, xi:xi + cw] += cyl.astype(np.float32) * wt[..., None]
        wsum[yi:yi + ch, xi:xi + cw] += wt

    covered = wsum > 1e-6
    strip = np.zeros((H, W, 3), np.uint8)
    strip[covered] = np.clip(acc[covered] / wsum[covered][..., None], 0, 255).astype(np.uint8)
    # Pixels on the very edge of coverage are blended from almost no weight and
    # come out dark. Pull the mask in so that fringe is treated as unseen rather
    # than becoming a black outline around the real footage.
    mask = cv2.erode((covered.astype(np.uint8)) * 255, np.ones((17, 17), np.uint8))

    # Trim to the band that is mostly covered; the residual ragged corners stay
    # described by `mask` rather than being cropped away at the cost of arc.
    rows = np.where(covered.mean(axis=1) > 0.55)[0]
    cols = np.where(covered.mean(axis=0) > 0.55)[0]
    if len(rows) > 32 and len(cols) > 32:
        strip = strip[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1]
        mask = mask[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1]

    sh, sw = strip.shape[:2]
    strip_hfov = math.degrees(sw / f)
    strip_vfov = 2 * math.degrees(math.atan((sh / 2) / f))
    return strip, mask, strip_hfov, strip_vfov


def widest_frame(frames: list[Path], m: Motion) -> Path:
    """For a dolly, the widest view of the room is at whichever end is furthest out."""
    return frames[-1] if m.total_zoom < 1.0 else frames[0]


# --- projection (ffmpeg v360) -----------------------------------------------

def _v360(src: Path, in_fmt: str, ih_fov: float, iv_fov: float, size: int,
          dest: Path) -> np.ndarray:
    run([
        "ffmpeg", "-v", "error", "-y", "-i", str(src),
        "-vf", (f"v360={in_fmt}:equirect:ih_fov={ih_fov:.4f}:iv_fov={iv_fov:.4f}"
                f":w={size}:h={size // 2}:alpha_mask=1:interp=lanczos"),
        "-frames:v", "1", "-pix_fmt", "rgba", str(dest),
    ])
    img = cv2.imread(str(dest), cv2.IMREAD_UNCHANGED)
    if img is None or img.ndim != 3 or img.shape[2] != 4:
        raise SystemExit(f"projection produced no alpha: {dest}")
    return img


def project_to_equirect(src: Path, mask_src: Path | None, in_fmt: str, ih_fov: float,
                        iv_fov: float, size: int, workdir: Path,
                        stem: str) -> tuple[np.ndarray, np.ndarray]:
    """Map a flat frame or cylindrical strip onto an equirect canvas.

    `alpha_mask=1` makes ffmpeg mark pixels outside the source rectangle
    transparent. That covers the frame boundary but not holes *inside* a
    stitched strip, so when a coverage mask exists it is pushed through the
    identical projection and combined — otherwise uncovered corners would be
    read as genuine black scenery and smeared across the sphere.
    """
    img = _v360(src, in_fmt, ih_fov, iv_fov, size, workdir / f"{stem}_eq.png")
    real = img[:, :, 3] > 128
    if mask_src is not None:
        m = _v360(mask_src, in_fmt, ih_fov, iv_fov, size, workdir / f"{stem}_eqmask.png")
        real &= (m[:, :, 0] > 128) & (m[:, :, 3] > 128)
    # Lanczos resampling rings at the boundary; drop that fringe too.
    real = cv2.erode(real.astype(np.uint8), np.ones((11, 11), np.uint8)).astype(bool)
    return img, real


# --- filling the unseen sphere ----------------------------------------------

def wrap_blur(img: np.ndarray, sigma: float) -> np.ndarray:
    """Gaussian blur that wraps in yaw and reflects in pitch.

    Equirect images are cyclic horizontally; blurring without wrapping leaves a
    bright/dark stripe at the 360deg seam.
    """
    pad = max(1, int(sigma * 3))
    pad = min(pad, img.shape[1] // 2)
    wide = np.concatenate([img[:, -pad:], img, img[:, :pad]], axis=1)
    tall = np.concatenate([wide[:pad][::-1], wide, wide[-pad:][::-1]], axis=0)
    out = cv2.GaussianBlur(tall, (0, 0), sigmaX=sigma, sigmaY=sigma)
    return out[pad:pad + img.shape[0], pad:pad + img.shape[1]]


def diffuse_fill(bgr: np.ndarray, real: np.ndarray, lw: int = 512) -> np.ndarray:
    """Propagate the real footage into the unseen sphere by weighted diffusion.

    Works coarse-to-fine on a low-resolution copy: every level normalises a
    blurred colour sum by a blurred weight sum, then re-stamps the real pixels
    as ground truth. Colour therefore flows outward from the edges of the real
    region, which is what carries the floor/wall/ceiling banding around the
    sphere. Unlike mirror-tiling this cannot duplicate recognisable objects, and
    because every blur wraps in yaw the result is seamless at 360deg.
    """
    lh = lw // 2
    # Mask-weighted downsample: holes must not darken the average.
    m = real.astype(np.float32)
    num = cv2.resize(bgr * m[..., None], (lw, lh), interpolation=cv2.INTER_AREA)
    den = cv2.resize(m, (lw, lh), interpolation=cv2.INTER_AREA)
    seed_ok = den > 1e-3
    seed = np.zeros_like(num)
    seed[seed_ok] = num[seed_ok] / den[seed_ok][..., None]

    base = None
    for level_w in (32, 64, 128, 256, lw):
        level_h = level_w // 2
        s = cv2.resize(seed, (level_w, level_h), interpolation=cv2.INTER_AREA)
        k = cv2.resize(seed_ok.astype(np.float32), (level_w, level_h),
                       interpolation=cv2.INTER_AREA)
        known = k > 0.05
        cur = np.zeros_like(s) if base is None else cv2.resize(base, (level_w, level_h),
                                                              interpolation=cv2.INTER_CUBIC)
        w = np.where(known, 1.0, 0.0).astype(np.float32)
        cur = np.where(known[..., None], s, cur)
        for _ in range(24):
            num_b = wrap_blur(cur * w[..., None], 1.2)
            den_b = wrap_blur(w, 1.2)
            ok = den_b > 1e-5
            nxt = cur.copy()
            nxt[ok] = num_b[ok] / den_b[ok][..., None]
            cur = np.where(known[..., None], s, nxt)
            w = np.maximum(w, np.where(ok, 1.0, 0.0).astype(np.float32))
        base = cur
    return base


def fill_sphere(rgba: np.ndarray, real: np.ndarray) -> tuple[np.ndarray, float]:
    """Complete the sphere around the real footage.

    Real pixels are copied through untouched. The rest is the diffusion field,
    upscaled (so it is inherently soft, reading as out-of-focus periphery),
    dimmed with angular distance from real data, and flattened toward a single
    tone at the poles.
    """
    H, W = rgba.shape[:2]
    bgr = rgba[:, :, :3].astype(np.float32)
    coverage = float(real.mean())
    if not real.any():
        raise SystemExit("no real pixels in projection")

    synth = diffuse_fill(bgr, real)
    synth = cv2.resize(synth, (W, H), interpolation=cv2.INTER_CUBIC)

    # Angular distance from the real region drives dimming and the edge feather.
    dist_deg = cv2.distanceTransform((~real).astype(np.uint8), cv2.DIST_L2, 5) * (360.0 / W)
    # Periphery sits progressively darker so the eye stays on the real view.
    dim = 1.0 - 0.22 * np.clip(dist_deg / 55.0, 0, 1)[..., None].astype(np.float32)
    synth = synth * dim

    # Short feather so sharp footage does not butt against soft fill.
    feather_deg = 2.5
    a = np.clip(dist_deg / feather_deg, 0, 1).astype(np.float32)[..., None]
    out = bgr * (1 - a) + synth * a
    out = np.where(real[..., None], bgr, out)

    # Poles: converge each row toward its own mean so zenith/nadir reads flat.
    pitch = 90.0 - (np.arange(H, dtype=np.float32) + 0.5) * (180.0 / H)
    pole = np.clip((np.abs(pitch) - 62.0) / 28.0, 0, 1) ** 1.5
    for y in range(H):
        k = float(pole[y])
        if k > 0.001:
            out[y] = out[y] * (1 - k) + out[y].mean(axis=0) * k

    return np.clip(out, 0, 255).astype(np.uint8), coverage


# --- driver -----------------------------------------------------------------

@dataclass
class Result:
    clip: str
    output: str
    strategy: str
    real_hfov_deg: float
    real_vfov_deg: float
    real_coverage_pct: float
    frames_used: int
    motion: dict


def build(clip: Path, hfov: float, size: int, workdir: Path) -> Result:
    print(f"\n=== {clip.name} ===", flush=True)
    m = analyse_motion(clip)
    strategy = pick_strategy(m)
    print(f"  motion: pan={m.abs_pan:.2f}w zoom={m.total_zoom:.2f}x -> {strategy}", flush=True)

    stem = clip.stem
    frames = extract_frames(clip, workdir / stem, SAMPLE_FPS, WORK_WIDTH)
    print(f"  extracted {len(frames)} frames", flush=True)

    if strategy == "stitch":
        strip, strip_mask, s_hfov, s_vfov = stitch_pan(frames, hfov)
        src = workdir / f"{stem}_strip.png"
        mask_src = workdir / f"{stem}_strip_mask.png"
        cv2.imwrite(str(src), strip)
        cv2.imwrite(str(mask_src), cv2.cvtColor(strip_mask, cv2.COLOR_GRAY2BGR))
        in_fmt = "cylindrical"
        print(f"  strip {strip.shape[1]}x{strip.shape[0]}  hfov={s_hfov:.1f} vfov={s_vfov:.1f}", flush=True)
        frames_used = len(frames)
    else:
        src = widest_frame(frames, m)
        mask_src = None
        img = cv2.imread(str(src))
        s_hfov = hfov
        s_vfov = 2 * math.degrees(math.atan((img.shape[0] / 2) / focal_from_hfov(img.shape[1], hfov)))
        in_fmt = "flat"
        print(f"  single frame {src.name}  hfov={s_hfov:.1f} vfov={s_vfov:.1f}", flush=True)
        frames_used = 1

    if s_hfov >= 360.0:
        s_hfov = 359.9
    proj, real = project_to_equirect(src, mask_src, in_fmt, s_hfov, s_vfov, size, workdir, stem)
    pano, coverage = fill_sphere(proj, real)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{stem}.jpg"
    cv2.imwrite(str(out), pano, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
    kb = out.stat().st_size / 1024
    print(f"  wrote {out.relative_to(REPO)}  {pano.shape[1]}x{pano.shape[0]}  "
          f"{kb:.0f}KB  real={coverage*100:.1f}%", flush=True)

    return Result(
        clip=clip.name, output=f"assets/amenities/panorama/{stem}.jpg", strategy=strategy,
        real_hfov_deg=round(s_hfov, 2), real_vfov_deg=round(s_vfov, 2),
        real_coverage_pct=round(coverage * 100, 2), frames_used=frames_used,
        motion=asdict(m),
    )


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("clips", nargs="*", help="clip stems to build (default: all)")
    ap.add_argument("--hfov", type=float, default=DEFAULT_HFOV,
                    help=f"assumed source horizontal FOV in degrees (default {DEFAULT_HFOV})")
    ap.add_argument("--size", type=int, default=DEFAULT_SIZE,
                    help=f"equirect width, height is half (default {DEFAULT_SIZE})")
    ap.add_argument("--keep-temp", action="store_true", help="retain intermediate frames")
    args = ap.parse_args()

    if not shutil.which("ffmpeg"):
        raise SystemExit("ffmpeg not found on PATH")

    # Source clips are the full-res ones; the `-scrub` variants are UI assets.
    all_clips = sorted(p for p in ASSETS.glob("*.mp4") if not p.stem.endswith("-scrub"))
    if args.clips:
        wanted = set(args.clips)
        clips = [p for p in all_clips if p.stem in wanted]
        missing = wanted - {p.stem for p in clips}
        if missing:
            raise SystemExit(f"unknown clips: {', '.join(sorted(missing))}")
    else:
        clips = all_clips
    if not clips:
        raise SystemExit(f"no clips found in {ASSETS}")

    tmp = Path(tempfile.mkdtemp(prefix="pano-"))
    results = []
    try:
        for clip in clips:
            results.append(build(clip, args.hfov, args.size, tmp))
    finally:
        if args.keep_temp:
            print(f"\ntemp kept at {tmp}")
        else:
            shutil.rmtree(tmp, ignore_errors=True)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    existing = {}
    if MANIFEST.exists():
        existing = {r["clip"]: r for r in json.loads(MANIFEST.read_text()).get("panoramas", [])}
    for r in results:
        existing[r.clip] = asdict(r)
    MANIFEST.write_text(json.dumps({
        "generatedBy": "scripts/panorama/build_panoramas.py",
        "assumedSourceHfovDeg": args.hfov,
        "equirectWidth": args.size,
        "note": ("real_coverage_pct is the share of the sphere backed by actual "
                 "footage; the remainder is synthesised continuation."),
        "panoramas": [existing[k] for k in sorted(existing)],
    }, indent=2) + "\n")
    print(f"\nmanifest -> {MANIFEST.relative_to(REPO)}")

    print("\n  clip                       strategy  real hfov   real %")
    for r in results:
        print(f"  {r.clip:<26} {r.strategy:<9} {r.real_hfov_deg:>7.1f}°  {r.real_coverage_pct:>6.1f}%")


if __name__ == "__main__":
    sys.exit(main())
