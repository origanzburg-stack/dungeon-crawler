/**
 * chest.js — Lootable chest world-object.
 *
 * Each Chest lives at a fixed world position and holds a loot table: an array
 * of item ids (from items.json).  When the player presses F within range the
 * chest opens, a random item is selected from the table, and the caller is
 * given the item def so it can be added to the player's inventory.
 *
 * Visual states:
 *   Closed — warm gold/brown chest with lock; faint amber glow underneath
 *   Open   — dark interior, lid propped back, muted colours
 *
 * The interaction prompt ("[F] Open") is shown/hidden by the scene each frame
 * via setPromptVisible(), keeping the Chest class free of per-frame logic.
 */

export const CHEST_INTERACT_RADIUS = 72;   // px — proximity required to open

export class Chest {
  /**
   * @param {Phaser.Scene}  scene
   * @param {number}        worldX   centre x in world space
   * @param {number}        worldY   centre y in world space
   * @param {string[]}      lootIds  item ids (from items.json) to draw from on open
   */
  constructor(scene, worldX, worldY, lootIds) {
    this.scene   = scene;
    this.x       = worldX;
    this.y       = worldY;
    this.lootIds = lootIds;
    this.opened  = false;

    // ── Visuals ──────────────────────────────────────────────────────────────
    // Container depth 5 — above floor/walls (depth 0–2), below player (depth 10)
    this.container = scene.add.container(worldX, worldY).setDepth(5);

    this._glowGfx = scene.add.graphics();   // amber ambient halo (closed only)
    this._bodyGfx = scene.add.graphics();   // main chest art
    this.container.add([this._glowGfx, this._bodyGfx]);

    this._draw(false);   // initial closed state

    // ── Interaction prompt ───────────────────────────────────────────────────
    // Positioned above the chest in world space; shown by the scene on approach.
    this.promptText = scene.add
      .text(worldX, worldY - 54, '[F] Open', {
        fontFamily: 'monospace',
        fontSize:   '12px',
        color:      '#fbbf24',
        stroke:     '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(32)
      .setAlpha(0);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Returns true when the player is close enough to interact. */
  isNearPlayer(px, py) {
    return Math.hypot(px - this.x, py - this.y) < CHEST_INTERACT_RADIUS;
  }

  /**
   * Show or hide the "[F] Open" prompt.
   * The scene calls this every frame based on proximity.
   */
  setPromptVisible(visible) {
    // Never show the prompt if the chest is already open
    this.promptText.setAlpha(visible && !this.opened ? 1 : 0);
  }

  /**
   * Try to open the chest and give the player a random item.
   *
   * Returns the itemDef from the registry on success.
   * Returns null (without opening) if:
   *  - chest is already open
   *  - the chosen item id is not in the registry
   *  - player.addItem() returns false (inventory full)
   *
   * The caller is responsible for: placing the item in the hotbar, refreshing
   * the UI, spawning particles, playing sounds, and showing a toast.
   *
   * @param {Player}             player
   * @param {Map<string,object>} registry  — the scene's itemRegistry Map
   * @returns {object|null}
   */
  tryOpen(player, registry) {
    if (this.opened) return null;

    // Pick a random item id from this chest's loot table
    const pickIndex = Number.isInteger(this.rollIndex) ? this.rollIndex : Math.floor(Math.random() * this.lootIds.length);
    const id      = this.lootIds[pickIndex];
    const itemDef = registry.get(id);
    if (!itemDef) return null;

    // Attempt to add to inventory; fails gracefully if full (chest stays closed)
    const added = player.addItem(itemDef, 1);
    if (!added) return null;

    // Commit the open state
    this.opened = true;
    this._draw(true);
    this.promptText.setAlpha(0);

    return itemDef;
  }

  peekLoot(registry) {
    const pickIndex = Number.isInteger(this.rollIndex) ? this.rollIndex : Math.floor(Math.random() * this.lootIds.length);
    const id = this.lootIds[pickIndex];
    return registry.get(id) ?? null;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Redraw the chest graphics.
   * @param {boolean} opened
   */
  _draw(opened) {
    this._glowGfx.clear();
    this._bodyGfx.clear();
    const g = this._bodyGfx;

    if (!opened) {
      // ── Closed chest ─────────────────────────────────────────────────────
      // Ambient gold glow (below darkness layer depth 20, revealed by torch)
      this._glowGfx.fillStyle(0xfbbf24, 0.09);
      this._glowGfx.fillCircle(0, 6, 36);
      this._glowGfx.fillStyle(0xff8c00, 0.05);
      this._glowGfx.fillCircle(0, 6, 50);

      // Chest base (lower half)
      g.fillStyle(0x78350f, 1);
      g.fillRect(-22, 2, 44, 20);

      // Lid (upper half)
      g.fillStyle(0x92400e, 1);
      g.fillRect(-22, -16, 44, 20);

      // Gold border
      g.lineStyle(2, 0xca8a04, 1);
      g.strokeRect(-22, -16, 44, 38);

      // Lid / base seam
      g.lineStyle(1, 0xca8a04, 0.5);
      g.lineBetween(-22, 2, 22, 2);

      // Corner studs
      for (const [cx, cy] of [[-18, -14], [16, -14], [-18, 18], [16, 18]]) {
        g.fillStyle(0xca8a04, 1);
        g.fillCircle(cx, cy, 3);
      }

      // Lock hasp plate
      g.fillStyle(0xca8a04, 1);
      g.fillRect(-5, -4, 10, 10);

      // Lock shackle
      g.fillStyle(0xfbbf24, 1);
      g.fillCircle(0, -2, 3.5);

      // Keyhole slot
      g.fillStyle(0x1a0a00, 1);
      g.fillRect(-1.5, -1, 3, 5);

    } else {
      // ── Opened chest ─────────────────────────────────────────────────────
      // Chest base (now empty)
      g.fillStyle(0x2a1200, 1);
      g.fillRect(-22, -2, 44, 24);

      // Dark interior
      g.fillStyle(0x0a0500, 1);
      g.fillRect(-17, 0, 34, 16);

      // Propped-open lid (angled slightly back)
      g.fillStyle(0x3f2000, 1);
      g.fillRect(-22, -20, 44, 12);

      // Dull border
      g.lineStyle(2, 0x4a2800, 1);
      g.strokeRect(-22, -20, 44, 46);

      // Dull corner studs
      for (const [cx, cy] of [[-18, -18], [16, -18], [-18, 20], [16, 20]]) {
        g.fillStyle(0x4a3000, 1);
        g.fillCircle(cx, cy, 3);
      }

      // Dull broken lock
      g.fillStyle(0x444444, 1);
      g.fillRect(-5, -6, 10, 10);
    }
  }
}
