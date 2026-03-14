/**
 * enemy.js — Enemy entities for the dungeon crawler.
 *
 * Types:
 *   slime    — small, slow, low HP, low damage
 *   skeleton — taller, faster, higher HP, higher damage
 *   archer   — ranged, keeps distance, fires arrows
 *   mage     — ranged caster, keeps distance, fires magic bolts
 *   bomber   — rushes player, primes, then explodes on contact
 *   boss     — large, high HP, two phases (melee + ranged spread)
 *
 * AI states:
 *   idle   — brief pauses between wander steps
 *   chase  — moves directly toward the player
 *   attack — enters melee range and swings on a cooldown
 *   (archer-specific) backpedal — backs away when player too close
 *   (bomber-specific) priming   — countdown before explosion
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
   * @param {Phaser.Scene}                                       scene
   * @param {number}                                             worldX
   * @param {number}                                             worldY
   * @param {'slime'|'skeleton'|'archer'|'mage'|'bomber'|'boss'} type
   */
  constructor(scene, worldX, worldY, type) {
    this.scene = scene;
    this.type  = type;
    this.dead  = false;
    this._deathHandled = false;

    // ── Stats per type ───────────────────────────────────────────────────────
    if (type === 'slime') {
      this.maxHp          = 30;
      this.damage         = 8;
      this.speed          = 62;
      this.aggroRadius    = 160;
      this.attackRange    = 38;
      this.attackCooldown = 1100;
      this.xpReward       = 15;
    } else if (type === 'skeleton') {
      this.maxHp          = 55;
      this.damage         = 15;
      this.speed          = 95;
      this.aggroRadius    = 230;
      this.attackRange    = 52;
      this.attackCooldown = 900;
      this.xpReward       = 28;
    } else if (type === 'archer') {
      this.maxHp          = 40;
      this.damage         = 14;   // arrow damage (handled by game.js)
      this.speed          = 55;
      this.aggroRadius    = 280;
      this.attackRange    = 210;  // fires when dist <= this
      this.minRange       = 95;   // backs away when dist < this
      this.attackCooldown = 2100;
      this.xpReward       = 32;
    } else if (type === 'mage') {
      this.maxHp          = 50;
      this.damage         = 20;   // bolt damage (handled by game.js)
      this.speed          = 58;
      this.aggroRadius    = 340;
      this.attackRange    = 230;  // fires when dist <= this
      this.minRange       = 90;   // backs away when dist < this
      this.attackCooldown = 2200;
      this.xpReward       = 40;
      this._charging      = 0;    // ms remaining in charge-up visual (not blocking)
    } else if (type === 'bomber') {
      this.maxHp          = 22;
      this.damage         = 42;   // explosion damage (handled by game.js)
      this.speed          = 128;
      this.aggroRadius    = 220;
      this.attackRange    = 46;
      this.attackCooldown = 0;
      this.xpReward       = 35;
      this._priming       = false;
      this._primeTimer    = 0;
      this._primeFlash    = 0;
    } else {                      // boss
      this.maxHp          = 320;
      this.damage         = 22;
      this.speed          = 68;
      this.aggroRadius    = 360;
      this.attackRange    = 65;
      this.attackCooldown = 1300;
      this.xpReward       = 200;
      this._phase         = 1;
      this._shootTimer    = 3200;
      this._shootAngles   = [];   // set by update before wantsShoot fires
    }
    this.hp = this.maxHp;

    // ── AI state ─────────────────────────────────────────────────────────────
    this._state        = type === 'mage' ? (Math.random() > 0.5 ? 'strafeLeft' : 'strafeRight') : 'idle';
    this._wanderTimer  = 600 + Math.random() * 800;
    this._wanderVx     = 0;
    this._wanderVy     = 0;
    this._attackTimer  = Math.random() * 400;
    this._wantsAttack  = false;
    this._wantsShoot   = false;
    this._wantsExplode = false;

    // ── Hit/knockback state ──────────────────────────────────────────────────
    this._knockbackTimer = 0;

    // ── Flash state (red when damaged) ──────────────────────────────────────
    this._flashTimer = 0;

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
    this._physBody.setDrag(200, 200).setMaxVelocity(500, 500);

    if (type === 'slime') {
      this._physBody.setSize(30, 22).setOffset(-15, -11);
    } else if (type === 'archer' || type === 'mage') {
      this._physBody.setSize(22, 30).setOffset(-11, -15);
    } else if (type === 'bomber') {
      this._physBody.setSize(26, 26).setOffset(-13, -13);
    } else if (type === 'boss') {
      this._physBody.setSize(48, 56).setOffset(-24, -28);
    } else {
      this._physBody.setSize(24, 32).setOffset(-12, -16);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get isAlive() { return !this.dead; }

  get wantsAttack()  { return this._wantsAttack; }
  get wantsShoot()   { return this._wantsShoot; }
  get wantsExplode() { return this._wantsExplode; }

  /**
   * Called once per frame by the scene.
   * @param {number} dt      — delta time in ms
   * @param {number} playerX — world X of the player
   * @param {number} playerY — world Y of the player
   */
  update(dt, playerX, playerY) {
    if (this.dead) return;
    this._wantsAttack  = false;
    this._wantsShoot   = false;
    this._wantsExplode = false;

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
    } else {
      // ── AI movement (branched by type) ────────────────────────────────────
      if (this.type === 'archer') {
        this._updateArcherAI(dt, playerX, playerY);
      } else if (this.type === 'mage') {
        this._updateMageAI(dt, playerX, playerY);
      } else if (this.type === 'bomber') {
        this._updateBomberAI(dt, playerX, playerY);
      } else if (this.type === 'boss') {
        this._updateBossAI(dt, playerX, playerY);
      } else {
        this._updateMeleeAI(dt, playerX, playerY);
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

    this._drawHpBar();
    // Mage and bomber need per-frame redraw for their animated visuals
    if (this.type === 'mage' || this.type === 'bomber') {
      this._draw(this._flashTimer > 0);
    }
  }

  /**
   * Apply damage; apply knockback impulse; trigger red flash.
   */
  takeDamage(amount, kbVx = 0, kbVy = 0) {
    if (this.dead) return;

    this.hp = Math.max(0, this.hp - amount);

    this._flashTimer = 190;
    this._draw(true);
    this.scene.tweens.add({ targets: this.container, scaleX: this.container.scaleX * 1.08, scaleY: 0.9, duration: 70, yoyo: true });

    if (Math.hypot(kbVx, kbVy) > 0) {
      this._physBody.setVelocity(kbVx, kbVy);
      this._knockbackTimer = 260;
    }

    if (this.hp <= 0) this._die();
  }

  // ── Private AI ─────────────────────────────────────────────────────────────

  _updateMeleeAI(dt, playerX, playerY) {
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
        this._physBody.setVelocity((dx / dist) * this.speed, (dy / dist) * this.speed);
      }
    } else {
      this._wander(dt);
    }
  }

  _updateArcherAI(dt, playerX, playerY) {
    const dx   = playerX - this.container.x;
    const dy   = playerY - this.container.y;
    const dist = Math.hypot(dx, dy);

    this._attackTimer -= dt;

    if (dist < this.minRange) {
      // Too close — back away
      this._state = 'backpedal';
      this._physBody.setVelocity(-(dx / dist) * this.speed, -(dy / dist) * this.speed);
    } else if (dist <= this.attackRange && dist < this.aggroRadius) {
      // In sweet spot — stop and shoot
      this._state = 'attack';
      this._physBody.setVelocity(0, 0);
      if (this._attackTimer <= 0) {
        this._attackTimer = this.attackCooldown;
        this._shootAngle  = Math.atan2(dy, dx);
        this._wantsShoot  = true;
      }
    } else if (dist < this.aggroRadius) {
      // Chase to get in range
      this._state = 'chase';
      if (dist > 1) {
        this._physBody.setVelocity((dx / dist) * this.speed, (dy / dist) * this.speed);
      }
    } else {
      this._wander(dt);
    }
  }

  _updateMageAI(dt, playerX, playerY) {
    const dx   = playerX - this.container.x;
    const dy   = playerY - this.container.y;
    const dist = Math.hypot(dx, dy);

    this._attackTimer -= dt;
    if (this._charging > 0) this._charging -= dt;

    if (dist < this.minRange) {
      // Too close — back away
      this._state = 'backpedal';
      this._physBody.setVelocity(-(dx / dist) * this.speed, -(dy / dist) * this.speed);
    } else if (dist <= this.attackRange && dist < this.aggroRadius) {
      // Sweet spot — strafe sideways slightly, fire when ready
      const perp = this._state === 'strafeLeft' ? 1 : -1;
      this._physBody.setVelocity((-dy / dist) * this.speed * 0.35 * perp, (dx / dist) * this.speed * 0.35 * perp);
      if (this._wanderTimer <= 0) {
        this._state = this._state === 'strafeLeft' ? 'strafeRight' : 'strafeLeft';
        this._wanderTimer = 900 + Math.random() * 700;
      }
      if (this._attackTimer <= 0) {
        this._attackTimer = this.attackCooldown;
        this._shootAngle  = Math.atan2(dy, dx);
        this._wantsShoot  = true;
        this._charging    = 300;
      }
    } else if (dist < this.aggroRadius) {
      // Too far — move closer
      this._state = 'chase';
      if (dist > 1) {
        this._physBody.setVelocity((dx / dist) * this.speed, (dy / dist) * this.speed);
      }
    } else {
      this._wander(dt);
    }
  }

  _updateBomberAI(dt, playerX, playerY) {
    const dx   = playerX - this.container.x;
    const dy   = playerY - this.container.y;
    const dist = Math.hypot(dx, dy);

    if (this._priming) {
      this._physBody.setVelocity(0, 0);
      this._primeTimer -= dt;
      this._primeFlash -= dt;
      if (this._primeFlash <= 0) {
        this._primeFlash = 160;
        this._draw(!this._bodyGfx._flashOn);
        this._bodyGfx._flashOn = !this._bodyGfx._flashOn;
      }
      if (this._primeTimer <= 0) {
        this._wantsExplode = true;
        this._priming = false;
      }
      return;
    }

    if (dist < this.aggroRadius) {
      if (dist <= this.attackRange) {
        // Start priming
        this._priming    = true;
        this._primeTimer = 1400;
        this._primeFlash = 0;
        this._physBody.setVelocity(0, 0);
      } else {
        this._state = 'chase';
        if (dist > 1) {
          this._physBody.setVelocity((dx / dist) * this.speed, (dy / dist) * this.speed);
        }
      }
    } else {
      this._wander(dt);
    }
  }

  _updateBossAI(dt, playerX, playerY) {
    const dx   = playerX - this.container.x;
    const dy   = playerY - this.container.y;
    const dist = Math.hypot(dx, dy);

    // Phase transition
    const newPhase = this.hp / this.maxHp <= 0.5 ? 2 : 1;
    if (newPhase !== this._phase) {
      this._phase = newPhase;
      // Enrage: speed and cooldown boost
      this.speed          = 68 * (newPhase === 2 ? 1.6 : 1);
      this.attackCooldown = 1300 * (newPhase === 2 ? 0.65 : 1);
    }

    this._attackTimer -= dt;
    this._shootTimer  -= dt;

    if (dist <= this.attackRange) {
      this._state = 'attack';
      this._physBody.setVelocity(0, 0);
      if (this._attackTimer <= 0) {
        this._attackTimer = this.attackCooldown;
        this._wantsAttack = true;
      }
    } else {
      this._state = 'chase';
      if (dist > 1) {
        this._physBody.setVelocity((dx / dist) * this.speed, (dy / dist) * this.speed);
      }
    }

    // Ranged burst — always fires regardless of distance
    const shootInterval = this._phase === 2 ? 2000 : 3200;
    if (this._shootTimer <= 0) {
      this._shootTimer = shootInterval;
      const baseAngle   = Math.atan2(dy, dx);
      const spreadCount = this._phase === 2 ? 5 : 3;
      const spreadStep  = (Math.PI * 2) / spreadCount;
      this._shootAngles = Array.from({ length: spreadCount }, (_, i) =>
        baseAngle + (i - Math.floor(spreadCount / 2)) * spreadStep * 0.38
      );
      this._wantsShoot = true;
    }
  }

  _wander(dt) {
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

  // ── Private ────────────────────────────────────────────────────────────────

  _die() {
    this.dead = true;
    if (this._physBody) this._physBody.setVelocity(0, 0);

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
   * @param {boolean} flashing — true = paint red/orange (hit flash)
   */
  _draw(flashing) {
    const g = this._bodyGfx;
    g.clear();

    if (this.type === 'slime') {
      const body  = flashing ? 0xff3333 : 0x22cc44;
      const belly = flashing ? 0xcc0000 : 0x16a34a;
      g.fillStyle(0x000000, 0.28); g.fillEllipse(2, 16, 36, 12);
      g.fillStyle(body, 1);        g.fillEllipse(0, 0, 38, 30);
      g.fillStyle(belly, 0.55);    g.fillEllipse(0, 7, 30, 14);
      g.fillStyle(0xffffff, flashing ? 0.05 : 0.22); g.fillEllipse(-8, -8, 12, 8);
      g.fillStyle(0xffffff, 1); g.fillCircle(-9, -3, 5); g.fillCircle(9, -3, 5);
      g.fillStyle(0x111111, 1); g.fillCircle(-8, -3, 3); g.fillCircle(10, -3, 3);
      g.fillStyle(0xffffff, 1); g.fillCircle(-7, -4, 1); g.fillCircle(11, -4, 1);

    } else if (this.type === 'skeleton') {
      const bone = flashing ? 0xff3333 : 0xdde1e7;
      const dark = flashing ? 0xcc0000 : 0x94a3b8;
      g.fillStyle(0x000000, 0.28); g.fillEllipse(2, 26, 28, 10);
      g.fillStyle(bone, 1); g.fillRect(-11, 12, 9, 16); g.fillRect(2, 12, 9, 16);
      g.fillStyle(dark, 1); g.fillRect(-11, 18, 9, 3);  g.fillRect(2, 18, 9, 3);
      g.fillStyle(bone, 1); g.fillRect(-13, -10, 26, 24);
      g.lineStyle(1, dark, 0.6);
      for (let i = 0; i < 3; i++) { const ry = -5 + i * 6; g.lineBetween(-11, ry, 11, ry); }
      g.fillStyle(bone, 1); g.fillRect(-20, -8, 9, 18); g.fillRect(11, -8, 9, 18);
      g.fillStyle(bone, 1); g.fillRect(-10, -30, 20, 22); g.fillRoundedRect(-10, -34, 20, 14, { tl: 8, tr: 8, bl: 0, br: 0 });
      g.fillStyle(0x111111, 1); g.fillRect(-8, -28, 6, 7); g.fillRect(2, -28, 6, 7);
      g.fillStyle(flashing ? 0xffffff : 0xff4444, 1); g.fillCircle(-5, -25, 2); g.fillCircle(5, -25, 2);
      g.fillStyle(bone, 1); g.fillRect(-8, -12, 16, 4);
      g.fillStyle(dark, 1);
      for (let t = 0; t < 4; t++) g.fillRect(-7 + t * 4, -10, 3, 3);

    } else if (this.type === 'mage') {
      const charging = (this._charging ?? 0) > 0;
      const robe  = flashing ? 0xff3333 : 0x6d28d9;
      const dark  = flashing ? 0xcc0000 : 0x4c1d95;
      const glow  = flashing ? 0xffffff : (charging ? 0x67e8f9 : 0xa78bfa);
      // Shadow
      g.fillStyle(0x000000, 0.28); g.fillEllipse(2, 28, 26, 10);
      // Robe (long)
      g.fillStyle(robe, 1); g.fillRect(-12, 0, 24, 28);
      // Robe hem detail
      g.fillStyle(dark, 0.6); g.fillRect(-12, 22, 24, 6);
      // Body
      g.fillStyle(robe, 1); g.fillRect(-11, -14, 22, 16);
      // Arms
      g.fillStyle(dark, 1); g.fillRect(-19, -12, 10, 16); g.fillRect(9, -12, 10, 16);
      // Staff (right hand)
      g.lineStyle(3, flashing ? 0xff3333 : 0x78350f, 1); g.lineBetween(18, -12, 18, -40);
      // Orb at staff tip — pulses when charging
      g.fillStyle(glow, charging ? 1 : 0.7); g.fillCircle(18, -42, charging ? 8 : 5);
      g.fillStyle(0xffffff, charging ? 0.9 : 0.3); g.fillCircle(18, -42, charging ? 4 : 2);
      if (charging) {
        g.lineStyle(2, 0x67e8f9, 0.6); g.strokeCircle(18, -42, 12);
      }
      // Runes on robe (lit when charging)
      if (charging) {
        g.lineStyle(1, 0x67e8f9, 0.8);
        g.lineBetween(-8, 4, -2, 4); g.lineBetween(-8, 10, -2, 10);
        g.lineBetween(2, 4, 8, 4);   g.lineBetween(2, 10, 8, 10);
      }
      // Head
      g.fillStyle(0xfde68a, 1); g.fillEllipse(0, -22, 18, 18);
      // Pointed hood
      g.fillStyle(dark, 1);
      g.fillTriangle(-10, -28, 10, -28, 0, -50);
      g.fillRect(-10, -32, 20, 6);
      // Eyes — glow when charging
      g.fillStyle(charging ? glow : 0x111111, 1); g.fillCircle(-4, -22, 2); g.fillCircle(4, -22, 2);
      // Charging aura around body
      if (charging) {
        g.lineStyle(2, 0x67e8f9, 0.4); g.strokeCircle(0, -22, 14);
        g.lineStyle(1, 0xa78bfa, 0.25); g.strokeCircle(0, 0, 22);
      }

    } else if (this.type === 'archer') {
      const skin = flashing ? 0xff3333 : 0xd97706;
      const hood = flashing ? 0xcc0000 : 0x064e3b;
      const bow  = flashing ? 0xff6600 : 0x92400e;
      // Shadow
      g.fillStyle(0x000000, 0.28); g.fillEllipse(2, 24, 26, 10);
      // Legs
      g.fillStyle(skin, 1); g.fillRect(-8, 8, 7, 18); g.fillRect(1, 8, 7, 18);
      // Cloak body
      g.fillStyle(hood, 1); g.fillRect(-11, -8, 22, 18);
      // Arms
      g.fillStyle(skin, 1); g.fillRect(-18, -6, 9, 14); g.fillRect(9, -6, 9, 14);
      // Hood
      g.fillStyle(hood, 1); g.fillRoundedRect(-9, -26, 18, 20, { tl: 8, tr: 8, bl: 0, br: 0 });
      // Face
      g.fillStyle(skin, 1); g.fillEllipse(0, -16, 14, 14);
      // Eyes
      g.fillStyle(flashing ? 0xffffff : 0x111111, 1); g.fillCircle(-3, -18, 2); g.fillCircle(3, -18, 2);
      // Bow (right side)
      g.lineStyle(3, bow, 1); g.strokeEllipse(16, -2, 10, 22);
      // Bowstring
      g.lineStyle(1, 0xfef3c7, 1); g.lineBetween(16, -11, 16, 9);

    } else if (this.type === 'bomber') {
      const priming = this._priming;
      const body  = flashing || priming ? 0xff6600 : 0xf97316;
      const dark  = flashing || priming ? 0xcc3300 : 0xc2410c;
      // Shadow
      g.fillStyle(0x000000, 0.28); g.fillEllipse(2, 18, 32, 11);
      // Round bomb body
      g.fillStyle(body, 1); g.fillCircle(0, 0, 17);
      // Stripe detail
      g.fillStyle(dark, 0.6); g.fillRect(-17, -4, 34, 8);
      // Clamp circle back
      g.fillStyle(body, 1); g.fillCircle(0, 0, 17);
      g.lineStyle(2, dark, 1); g.strokeCircle(0, 0, 17);
      // X eyes (menacing)
      g.lineStyle(3, flashing ? 0xffffff : 0x1a0500, 1);
      g.lineBetween(-8, -5, -4, -1); g.lineBetween(-4, -5, -8, -1);
      g.lineBetween(4, -5, 8, -1);   g.lineBetween(8, -5, 4, -1);
      // Fuse
      g.lineStyle(2, priming ? 0xfbbf24 : 0x78350f, 1);
      g.lineBetween(0, -17, 4, -26);
      // Spark at fuse tip
      if (priming) {
        g.fillStyle(0xfef08a, 1); g.fillCircle(4, -26, 4);
        g.fillStyle(0xfb923c, 0.8); g.fillCircle(4, -26, 2.5);
      } else {
        g.fillStyle(0xfbbf24, 0.9); g.fillCircle(4, -26, 2.5);
      }

    } else {   // boss
      const primary   = flashing ? 0xff3333 : 0x7c3aed;
      const secondary = flashing ? 0xcc0000 : 0x4c1d95;
      const accent    = flashing ? 0xff9900 : 0xfbbf24;
      const phase2    = this._phase === 2;
      // Shadow
      g.fillStyle(0x000000, 0.4); g.fillEllipse(2, 36, 52, 16);
      // Legs
      g.fillStyle(secondary, 1); g.fillRect(-22, 14, 14, 24); g.fillRect(8, 14, 14, 24);
      g.fillStyle(primary, 0.6);  g.fillRect(-22, 20, 14, 4);  g.fillRect(8, 20, 14, 4);
      // Torso
      g.fillStyle(primary, 1); g.fillRect(-22, -16, 44, 32);
      // Rune lines on torso
      g.lineStyle(2, accent, phase2 ? 0.9 : 0.4);
      g.lineBetween(-16, -8, -4, -8); g.lineBetween(-16, -1, -4, -1); g.lineBetween(-16, 6, -4, 6);
      g.lineBetween(4, -8, 16, -8);   g.lineBetween(4, -1, 16, -1);   g.lineBetween(4, 6, 16, 6);
      // Arms (big)
      g.fillStyle(secondary, 1); g.fillRect(-38, -14, 18, 28); g.fillRect(20, -14, 18, 28);
      // Claws
      g.fillStyle(accent, 1);
      g.fillTriangle(-38, 14, -42, 28, -34, 24);
      g.fillTriangle(38, 14, 34, 28, 42, 24);
      // Head — large skull with horns
      g.fillStyle(secondary, 1); g.fillRect(-20, -50, 40, 36);
      g.fillRoundedRect(-20, -56, 40, 18, { tl: 12, tr: 12, bl: 0, br: 0 });
      // Horns
      g.fillStyle(accent, 1);
      g.fillTriangle(-18, -52, -26, -68, -10, -54);
      g.fillTriangle(18, -52, 26, -68, 10, -54);
      // Eye sockets
      g.fillStyle(0x0a0010, 1); g.fillRect(-14, -46, 10, 12); g.fillRect(4, -46, 10, 12);
      // Glowing eyes
      g.fillStyle(phase2 ? 0xff0000 : accent, 1);
      g.fillCircle(-9, -41, 4); g.fillCircle(9, -41, 4);
      if (phase2) {
        // Extra glow rings
        g.lineStyle(2, 0xff6600, 0.7); g.strokeCircle(-9, -41, 7); g.strokeCircle(9, -41, 7);
      }
      // Mouth / teeth
      g.fillStyle(secondary, 1); g.fillRect(-14, -30, 28, 6);
      g.fillStyle(accent, 0.8);
      for (let t = 0; t < 5; t++) g.fillRect(-12 + t * 5, -28, 4, 5);
    }
  }

  /** Draw the enemy's HP bar above its sprite. */
  _drawHpBar() {
    const g = this._hpBarGfx;
    g.clear();
    if (this.hp >= this.maxHp) return;

    const isBoss = this.type === 'boss';
    const bw     = isBoss ? 56 : 34;
    const bh     = isBoss ? 6  : 4;
    const bx     = -bw / 2;
    const by     = this.type === 'slime'   ? -24
                 : this.type === 'archer'  ? -36
                 : this.type === 'mage'    ? -60
                 : this.type === 'bomber'  ? -36
                 : this.type === 'boss'    ? -70
                 : -42;
    const ratio  = this.hp / this.maxHp;
    const col    = ratio > 0.5 ? 0x22c55e : ratio > 0.25 ? 0xeab308 : 0xef4444;

    g.fillStyle(0x111111, 0.9); g.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    g.fillStyle(0x1f1f1f, 1);   g.fillRect(bx, by, bw, bh);
    g.fillStyle(col, 1);        g.fillRect(bx, by, Math.max(bw * ratio, 1), bh);
  }
}
