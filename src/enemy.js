/**
 * enemy.js — Enemy entities for the dungeon crawler.
 *
 * Two types:
 *   slime    — small, slow, low HP, low damage
 *   skeleton — taller, faster, higher HP, higher damage
 *
 * AI states:
 *   idle   — brief pauses between wander steps
 *   chase  — moves directly toward the player
 *   attack — enters melee range and swings on a cooldown
 *
 * Physics: each enemy gets a Phaser Arcade physics body attached to its
 * Container so it collides with the same _wallGroup as the player.
 *
 * The scene is responsible for calling enemy.update(dt, px, py) each frame
 * and for adding wall colliders after construction.
 *
 * Depth: enemies sit at depth 8 (below player at depth 10, above floor at 0–2).
 */

export class Enemy {
  /**
   * @param {Phaser.Scene}       scene
   * @param {number}             worldX
   * @param {number}             worldY
   * @param {'slime'|'skeleton'} type
   */
  constructor(scene, worldX, worldY, type) {
    this.scene = scene;
    this.type  = type;
    this.dead  = false;
    this._deathHandled = false;

    // ── Stats per type ───────────────────────────────────────────────────────
    if (type === 'slime') {
      this.maxHp       = 30;
      this.damage      = 8;
      this.speed       = 62;
      this.aggroRadius = 160;
      this.attackRange = 38;
      this.attackCooldown = 1100;
      this.xpReward    = 15;
    } else {                    // skeleton
      this.maxHp       = 55;
      this.damage      = 15;
      this.speed       = 95;
      this.aggroRadius = 230;
      this.attackRange = 52;
      this.attackCooldown = 900;
      this.xpReward    = 28;
    }
    this.hp = this.maxHp;

    // ── AI state ─────────────────────────────────────────────────────────────
    this._state        = 'idle';
    this._wanderTimer  = Math.random() * 1500;   // stagger initial direction change
    this._wanderVx     = 0;
    this._wanderVy     = 0;
    this._attackTimer  = Math.random() * 400;
    this._wantsAttack  = false;

    // ── Hit/knockback state ──────────────────────────────────────────────────
    this._knockbackTimer = 0;    // ms remaining of knockback

    // ── Flash state (red when damaged) ──────────────────────────────────────
    this._flashTimer = 0;        // ms remaining of red flash

    // ── Visuals ──────────────────────────────────────────────────────────────
    this.container = scene.add.container(worldX, worldY).setDepth(8);
    this._bodyGfx  = scene.add.graphics().setName('body');
    this._hpBarGfx = scene.add.graphics().setName('hpbar');
    this.container.add([this._bodyGfx, this._hpBarGfx]);
    this._draw(false);
    this._drawHpBar();

    // ── Physics ──────────────────────────────────────────────────────────────
    scene.physics.add.existing(this.container);
    /** @type {Phaser.Physics.Arcade.Body} */
    this._physBody = this.container.body;
    this._physBody.setDrag(200, 200).setMaxVelocity(400, 400);

    if (type === 'slime') {
      this._physBody.setSize(30, 22).setOffset(-15, -11);
    } else {
      this._physBody.setSize(24, 32).setOffset(-12, -16);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** True while the enemy is alive and its container still exists. */
  get isAlive() { return !this.dead; }

  /**
   * Called once per frame by the scene.
   * @param {number} dt      — delta time in ms
   * @param {number} playerX — world X of the player
   * @param {number} playerY — world Y of the player
   */
  update(dt, playerX, playerY) {
    if (this.dead) return;
    this._wantsAttack = false;

    // ── Flash decay ──────────────────────────────────────────────────────────
    if (this._flashTimer > 0) {
      this._flashTimer -= dt;
      if (this._flashTimer <= 0) {
        this._flashTimer = 0;
        this._draw(false);
      }
    }

    // ── Knockback: let physics drag handle deceleration ──────────────────────
    if (this._knockbackTimer > 0) {
      this._knockbackTimer -= dt;
      // Do NOT override velocity — physics drag decelerates naturally
    } else {
      // ── AI movement ───────────────────────────────────────────────────────
      const dx   = playerX - this.container.x;
      const dy   = playerY - this.container.y;
      const dist = Math.hypot(dx, dy);

      this._attackTimer -= dt;
      if (dist <= this.attackRange) {
        this._state = 'attack';
        this._physBody.setVelocity(0, 0);
        if (this._attackTimer <= 0) {
          this._attackTimer = this.attackCooldown;
          this._wantsAttack = true;
        }
      } else if (dist < this.aggroRadius) {
        this._state = 'chase';
        if (dist > 1) {
          this._physBody.setVelocity(
            (dx / dist) * this.speed,
            (dy / dist) * this.speed,
          );
        }
      } else {
        this._wanderTimer -= dt;
        if (this._wanderTimer <= 0) {
          if (this._state === 'idle') {
            const angle       = Math.random() * Math.PI * 2;
            const ws          = this.speed * 0.42;
            this._wanderVx    = Math.cos(angle) * ws;
            this._wanderVy    = Math.sin(angle) * ws;
            this._wanderTimer = 900 + Math.random() * 900;
            this._state = 'wander';
          } else {
            this._wanderVx = 0;
            this._wanderVy = 0;
            this._wanderTimer = 450 + Math.random() * 800;
            this._state = 'idle';
          }
        }
        this._physBody.setVelocity(this._wanderVx, this._wanderVy);
      }
    }

    // Flip sprite left/right
    const vx = this._physBody.velocity.x;
    if (vx < -8)  this.container.setScale(-1, 1);
    if (vx >  8)  this.container.setScale( 1, 1);
    const motion = Math.min(1, Math.hypot(this._physBody.velocity.x, this._physBody.velocity.y) / Math.max(this.speed, 1));
    const sx = (this.container.scaleX < 0 ? -1 : 1) * (1 + motion * 0.04);
    const sy = 1 - motion * 0.05;
    this.container.setScale(sx, sy);

    // Redraw HP bar every frame so it tracks damage
    this._drawHpBar();
  }

  get wantsAttack() {
    return this._wantsAttack;
  }

  /**
   * Apply damage; apply knockback impulse; trigger red flash.
   * @param {number} amount      — hit points to subtract
   * @param {number} kbVx        — knockback velocity X (px/s)
   * @param {number} kbVy        — knockback velocity Y (px/s)
   */
  takeDamage(amount, kbVx = 0, kbVy = 0) {
    if (this.dead) return;

    this.hp = Math.max(0, this.hp - amount);

    // Red flash
    this._flashTimer = 190;
    this._draw(true);
    this.scene.tweens.add({ targets: this.container, scaleX: this.container.scaleX * 1.08, scaleY: 0.9, duration: 70, yoyo: true });

    // Knockback — set velocity directly; drag will decelerate it
    if (Math.hypot(kbVx, kbVy) > 0) {
      this._physBody.setVelocity(kbVx, kbVy);
      this._knockbackTimer = 260;
    }

    if (this.hp <= 0) this._die();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _die() {
    this.dead = true;
    if (this._physBody) this._physBody.setVelocity(0, 0);

    // Fade-out tween then destroy
    this.scene.tweens.add({
      targets:  this.container,
      alpha:    0,
      duration: 320,
      ease:     'Quad.easeIn',
      onComplete: () => {
        if (this.container.scene) this.container.destroy();
      },
    });
  }

  /**
   * Redraw body graphics.
   * @param {boolean} flashing — true = paint red (hit flash)
   */
  _draw(flashing) {
    const g = this._bodyGfx;
    g.clear();

    if (this.type === 'slime') {
      const body  = flashing ? 0xff3333 : 0x22cc44;
      const belly = flashing ? 0xcc0000 : 0x16a34a;

      // Drop shadow
      g.fillStyle(0x000000, 0.28);
      g.fillEllipse(2, 16, 36, 12);

      // Main blob
      g.fillStyle(body, 1);
      g.fillEllipse(0, 0, 38, 30);

      // Belly sheen
      g.fillStyle(belly, 0.55);
      g.fillEllipse(0, 7, 30, 14);

      // Highlight
      g.fillStyle(0xffffff, flashing ? 0.05 : 0.22);
      g.fillEllipse(-8, -8, 12, 8);

      // Eyes
      g.fillStyle(0xffffff, 1);
      g.fillCircle(-9, -3, 5);
      g.fillCircle( 9, -3, 5);
      g.fillStyle(0x111111, 1);
      g.fillCircle(-8, -3, 3);
      g.fillCircle(10, -3, 3);
      // Pupils
      g.fillStyle(0xffffff, 1);
      g.fillCircle(-7, -4, 1);
      g.fillCircle(11, -4, 1);

    } else {   // skeleton
      const bone = flashing ? 0xff3333 : 0xdde1e7;
      const dark = flashing ? 0xcc0000 : 0x94a3b8;

      // Drop shadow
      g.fillStyle(0x000000, 0.28);
      g.fillEllipse(2, 26, 28, 10);

      // Legs
      g.fillStyle(bone, 1);
      g.fillRect(-11, 12, 9, 16);
      g.fillRect(  2, 12, 9, 16);
      // Knee joints
      g.fillStyle(dark, 1);
      g.fillRect(-11, 18, 9, 3);
      g.fillRect(  2, 18, 9, 3);

      // Torso
      g.fillStyle(bone, 1);
      g.fillRect(-13, -10, 26, 24);
      // Ribcage lines
      g.lineStyle(1, dark, 0.6);
      for (let i = 0; i < 3; i++) {
        const ry = -5 + i * 6;
        g.lineBetween(-11, ry, 11, ry);
      }

      // Arms
      g.fillStyle(bone, 1);
      g.fillRect(-20, -8, 9, 18);
      g.fillRect( 11, -8, 9, 18);

      // Head — skull shape
      g.fillStyle(bone, 1);
      g.fillRect(-10, -30, 20, 22);
      g.fillRoundedRect(-10, -34, 20, 14, { tl: 8, tr: 8, bl: 0, br: 0 });

      // Eye sockets (dark)
      g.fillStyle(0x111111, 1);
      g.fillRect(-8, -28, 6, 7);
      g.fillRect( 2, -28, 6, 7);

      // Glowing eye dots
      g.fillStyle(flashing ? 0xffffff : 0xff4444, 1);
      g.fillCircle(-5, -25, 2);
      g.fillCircle( 5, -25, 2);

      // Jaw / teeth
      g.fillStyle(bone, 1);
      g.fillRect(-8, -12, 16, 4);
      g.fillStyle(dark, 1);
      for (let t = 0; t < 4; t++) {
        g.fillRect(-7 + t * 4, -10, 3, 3);
      }
    }
  }

  /** Draw the enemy's HP bar above its sprite (hidden at full health). */
  _drawHpBar() {
    const g = this._hpBarGfx;
    g.clear();
    if (this.hp >= this.maxHp) return;

    const bw    = 34;
    const bh    = 4;
    const bx    = -bw / 2;
    const by    = this.type === 'slime' ? -24 : -42;
    const ratio = this.hp / this.maxHp;
    const col   = ratio > 0.5 ? 0x22c55e : ratio > 0.25 ? 0xeab308 : 0xef4444;

    g.fillStyle(0x111111, 0.9);
    g.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    g.fillStyle(0x1f1f1f, 1);
    g.fillRect(bx, by, bw, bh);
    g.fillStyle(col, 1);
    g.fillRect(bx, by, Math.max(bw * ratio, 1), bh);
  }
}
