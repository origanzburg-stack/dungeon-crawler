/**
 * mapgen.js — Procedural dungeon layout generator.
 *
 * Produces a 20×15 tile map (0 = floor, 1 = wall) together with a list of
 * rectangular room descriptors.  Results are deterministic given the same
 * integer seed, so levels can be reproduced from a stored seed.
 *
 * Algorithm
 * ─────────
 *  1. Attempt to place MAP_ROOMS_MAX rooms (4–7 tiles wide, 3–5 tall) without
 *     overlap.  A 1-tile gap between rooms is enforced.
 *  2. Connect them in a random chain with L-shaped, 2-tile-wide corridors.
 *  3. Sort rooms by distance from the map centre so rooms[0] is the spawn
 *     (near centre) and rooms[last] is the farthest (portal destination).
 */

export const MAP_COLS = 20;
export const MAP_ROWS = 15;

// ── Seeded PRNG (Mulberry32) ──────────────────────────────────────────────────
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random integer in [min, max] inclusive. */
function ri(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** True if two rooms overlap (with optional cell margin on all sides). */
function overlaps(a, b, margin = 0) {
  return (
    a.x - margin < b.x + b.w + margin &&
    a.x + a.w + margin > b.x - margin &&
    a.y - margin < b.y + b.h + margin &&
    a.y + a.h + margin > b.y - margin
  );
}

/** Carve a filled rectangle into the map. Leaves a 1-tile wall border. */
function carveRect(map, x, y, w, h) {
  for (let r = y; r < y + h; r++) {
    for (let c = x; c < x + w; c++) {
      if (r > 0 && r < MAP_ROWS - 1 && c > 0 && c < MAP_COLS - 1) {
        map[r][c] = 0;
      }
    }
  }
}

/**
 * Carve an L-shaped 2-tile-wide corridor between two tile positions.
 * Direction (H-then-V or V-then-H) is chosen randomly.
 */
function carveTunnel(map, x1, y1, x2, y2, rng) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const carve = (r, c) => {
    if (r >= 0 && r < MAP_ROWS && c >= 0 && c < MAP_COLS) map[r][c] = 0;
  };

  if (rng() < 0.5) {
    // Horizontal segment (y = y1), then vertical segment (x = x2)
    const x0 = Math.min(x1, x2), x9 = Math.max(x1, x2);
    const y0 = Math.min(y1, y2), y9 = Math.max(y1, y2);
    for (let c = x0; c <= x9; c++) { carve(y1, c); carve(clamp(y1 + 1, 0, MAP_ROWS-1), c); }
    for (let r = y0; r <= y9; r++) { carve(r, x2); carve(r, clamp(x2 - 1, 0, MAP_COLS-1)); }
  } else {
    // Vertical segment (x = x1), then horizontal segment (y = y2)
    const x0 = Math.min(x1, x2), x9 = Math.max(x1, x2);
    const y0 = Math.min(y1, y2), y9 = Math.max(y1, y2);
    for (let r = y0; r <= y9; r++) { carve(r, x1); carve(r, clamp(x1 + 1, 0, MAP_COLS-1)); }
    for (let c = x0; c <= x9; c++) { carve(y2, c); carve(clamp(y2 + 1, 0, MAP_ROWS-1), c); }
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Generate a dungeon map for the given integer seed.
 *
 * @param   {number} seed  — integer seed (same seed → same map)
 * @returns {{ map: number[][], rooms: Room[] }}
 *
 * Room shape: { x, y, w, h, cx, cy }
 *   (x,y) = top-left tile; (cx,cy) = approximate centre tile.
 *   rooms[0]  = spawn room (closest to map centre)
 *   rooms[last] = portal room (farthest from map centre)
 */
export function generateDungeon(seed) {
  const rng = mulberry32(seed >>> 0);
  const map = Array.from({ length: MAP_ROWS }, () => new Array(MAP_COLS).fill(1));
  const rooms = [];

  const target = 5 + Math.floor(rng() * 3);   // 5–7 rooms

  for (let attempt = 0; attempt < 500 && rooms.length < target; attempt++) {
    const w  = ri(rng, 4, 7);
    const h  = ri(rng, 3, 5);
    const x  = ri(rng, 1, MAP_COLS - w - 2);
    const y  = ri(rng, 1, MAP_ROWS - h - 2);
    const cx = x + Math.floor(w / 2);
    const cy = y + Math.floor(h / 2);
    const room = { x, y, w, h, cx, cy };

    if (!rooms.some(r => overlaps(r, room, 1))) {
      rooms.push(room);
      carveRect(map, x, y, w, h);
    }
  }

  // Fallback: guarantee at least one room
  if (rooms.length === 0) {
    const r = { x: 7, y: 4, w: 6, h: 5, cx: 10, cy: 6 };
    rooms.push(r);
    carveRect(map, r.x, r.y, r.w, r.h);
  }

  // Connect rooms in a chain (guarantees full reachability)
  for (let i = 1; i < rooms.length; i++) {
    carveTunnel(map, rooms[i - 1].cx, rooms[i - 1].cy,
                     rooms[i].cx,     rooms[i].cy, rng);
  }

  // Extra cross-connection for variety (loop prevention: only if 4+ rooms)
  if (rooms.length >= 4) {
    const a = Math.floor(rng() * rooms.length);
    const b = (a + 2 + Math.floor(rng() * (rooms.length - 2))) % rooms.length;
    if (a !== b) {
      carveTunnel(map, rooms[a].cx, rooms[a].cy, rooms[b].cx, rooms[b].cy, rng);
    }
  }

  // Sort: rooms[0] = nearest to map centre (spawn); rooms[last] = farthest (portal)
  const midX = MAP_COLS / 2, midY = MAP_ROWS / 2;
  rooms.sort((a, b) =>
    Math.hypot(a.cx - midX, a.cy - midY) - Math.hypot(b.cx - midX, b.cy - midY)
  );

  return { map, rooms };
}
