/**
 * game.js — Dungeon Crawler, Phase 5: Procedural Dungeons & Progression
 */

import { Player } from './player.js';
import { Chest } from './chest.js';
import { Enemy } from './enemy.js';
import { MapManager, MAP_COLS, MAP_ROWS } from './map-manager.js';
import { AssetManager } from './asset-manager.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const SWING_RANGE      = 95;
const SWING_ARC_DEG    = 68;
const KNOCKBACK_FORCE  = 390;
const ATTACK_COOLDOWN  = 550;
const IFRAMES_DURATION = 850;
const CONTACT_RADIUS   = 28;
const WORLD_PICKUP_R   = 36;
const PORTAL_RADIUS    = 32;

const HOTBAR_SLOTS   = 8;
const SLOT_SIZE      = 54;
const SLOT_GAP       = 6;
const HOTBAR_PAD     = 10;

const PLAYER_SPEED   = 220;
const PLAYER_ACCEL   = 1500;
const PLAYER_DRAG    = 1200;

const TORCH_RADIUS   = 210;
const DARKNESS_ALPHA = 0.91;
const FOG_ALPHA      = 1.0; 

const SAVE_KEY       = 'dungeon_crawler_save';
const HIGH_SCORE_KEY = 'dungeon_crawler_high_scores';
const INPUT_BUFFER_MS = 140;
const MOVE_COYOTE_MS = 90;
const FIREBALL_SPEED = 420;
const FIREBALL_COOLDOWN = 550;
const FIREBALL_DAMAGE = 16;
const LIGHTNING_RADIUS = 170;
const LIGHTNING_COOLDOWN = 2600;
const VOID_BALL_SPEED = 250;
const VOID_BALL_COOLDOWN = 3400;
const VOID_BALL_PULL_RADIUS = 94;
const VOID_BALL_PULL_FORCE = 255;
const LEVEL_INTRO_MS = 10000;

const ENEMY_ARROW_SPEED  = 280;
const ENEMY_ARROW_DAMAGE = 14;
const ENEMY_ARROW_LIFE   = 1300;
const BOMBER_EXPLODE_RADIUS = 72;
const TRAP_DAMAGE        = 12;
const TRAP_ACTIVE_MS     = 600;
const TRAP_IDLE_MS       = 2400;
const TRAP_WARN_MS       = 400;   // visual warning before activation
const SHOP_ITEM_COUNT    = 3;

const RARITY_COLOR = {
  common:    0x9ca3af,
  uncommon:  0x22c55e,
  rare:      0x3b82f6,
  epic:      0xa855f7,
  legendary: 0xf59e0b,
};

const STAT_LABEL = {
  attack:       'ATK',
  defense:      'DEF',
  max_hp:       'HP+',
  attack_speed: 'SPD',
  mining_power: 'PWR',
  heal:         'HEAL',
  radius:       'RAD',
  power:        'PWR',
  pull:         'PULL',
  duration:     'TIME',
};

function createRng(seed) {
  let s = seed >>> 0;
  return function rand() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function readSavedGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to read save data:', err);
    localStorage.removeItem(SAVE_KEY);
    return null;
  }
}

function removeSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {}
}

function showStartupError(message) {
  const root = document.getElementById('startup-error') || document.createElement('div');
  root.id = 'startup-error';
  root.style.position = 'fixed';
  root.style.inset = '0';
  root.style.display = 'flex';
  root.style.alignItems = 'center';
  root.style.justifyContent = 'center';
  root.style.background = 'rgba(3,7,18,0.94)';
  root.style.color = '#e5e7eb';
  root.style.fontFamily = 'monospace';
  root.style.fontSize = '14px';
  root.style.textAlign = 'center';
  root.style.padding = '24px';
  root.style.zIndex = '9999';
  root.innerHTML = `<div><div style="font-size:28px;color:#ef4444;margin-bottom:12px;">Load Error</div><div>${message}</div></div>`;
  if (!root.parentNode) document.body.appendChild(root);
}

// ─────────────────────────────────────────────────────────────────────────────
// Audio System (Procedural Web Audio)
// ─────────────────────────────────────────────────────────────────────────────
let _audioCtx = null;
function _getAC() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}

function _tone(freq, type, vol, dur, freqEnd = null, delay = 0) {
  const ac = _getAC();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.type = type;
  osc.frequency.value = freq;
  if (freqEnd !== null) osc.frequency.linearRampToValueAtTime(freqEnd, ac.currentTime + delay + dur);
  gain.gain.setValueAtTime(vol, ac.currentTime + delay);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + dur);
  osc.start(ac.currentTime + delay);
  osc.stop(ac.currentTime + delay + dur);
}

function _soundChestOpen()    { _tone(140, 'sine', 0.25, 0.12, 90); _tone(900, 'sine', 0.12, 0.45, 1400, 0.08); _tone(1200,'sine', 0.07, 0.30, 600, 0.20); }
function _soundItemPickup()   { _tone(660, 'sine', 0.18, 0.12); _tone(880, 'sine', 0.13, 0.12, null, 0.13); _tone(1320, 'sine', 0.09, 0.22, null, 0.24); }
function _soundEquip()        { _tone(200, 'square', 0.07, 0.04); _tone(550, 'sine', 0.14, 0.22, null, 0.05); }
function _soundInventoryFull(){ _tone(220, 'sawtooth', 0.14, 0.09); _tone(190, 'sawtooth', 0.14, 0.09, null, 0.14); }
function _soundAttack()       { _tone(200, 'sawtooth', 0.09, 0.04, 80); _tone(95, 'square', 0.13, 0.07, null, 0.03); }
function _soundEnemyHit()     { _tone(260, 'square', 0.15, 0.04, 110); }
function _soundEnemyDeath()   { _tone(310, 'sawtooth', 0.16, 0.08, 70); _tone(140, 'sine', 0.10, 0.18, 55, 0.08); }
function _soundPlayerHurt()   { _tone(160, 'sawtooth', 0.20, 0.09); _tone(110, 'sawtooth', 0.15, 0.11, null, 0.07); }
function _soundPortal()       { _tone(300, 'sine', 0.2, 0.8, 800); _tone(150, 'square', 0.1, 0.8, 50, 0.1); }
function _soundLevelUp()      { _tone(440, 'square', 0.1, 0.2); _tone(554, 'square', 0.1, 0.2, null, 0.2); _tone(659, 'square', 0.1, 0.4, null, 0.4); }

class AudioManager {
  constructor() {
    this.enabled = true;
    this.musicEvent = null;
    this.ambientEvent = null;
    this.scene = null;
  }

  attachScene(scene) {
    this.scene = scene;
  }

  toggleMuted() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  playSfx(name) {
    if (!this.enabled) return;
    const map = {
      chest: _soundChestOpen,
      pickup: _soundItemPickup,
      equip: _soundEquip,
      full: _soundInventoryFull,
      attack: _soundAttack,
      hit: _soundEnemyHit,
      death: _soundEnemyDeath,
      hurt: _soundPlayerHurt,
      portal: _soundPortal,
      levelup: _soundLevelUp,
      footstep_stone: () => _tone(120, 'triangle', 0.03, 0.04, 80),
      footstep_moss: () => _tone(180, 'sine', 0.02, 0.05, 120),
    };
    map[name]?.();
  }

  startMusic(scene) {
    this.stopMusic();
    this.attachScene(scene);
    this.musicEvent = scene.time.addEvent({
      delay: 1500,
      loop: true,
      callback: () => {
        if (!this.enabled) return;
        _tone(146, 'sine', 0.03, 1.2);
        _tone(219, 'triangle', 0.02, 1.0, null, 0.25);
        _tone(293, 'sine', 0.015, 0.8, null, 0.5);
      },
    });
    this.ambientEvent = scene.time.addEvent({
      delay: 6000,
      loop: true,
      callback: () => {
        if (!this.enabled) return;
        if (Math.random() > 0.5) _tone(400, 'sine', 0.015, 1.8, 520);
        else _tone(80, 'triangle', 0.02, 1.4, 60);
      },
    });
  }

  stopMusic() {
    this.musicEvent?.remove(false);
    this.ambientEvent?.remove(false);
    this.musicEvent = null;
    this.ambientEvent = null;
  }
}

const audioManager = new AudioManager();

// ─────────────────────────────────────────────────────────────────────────────
// BootScene
// ─────────────────────────────────────────────────────────────────────────────
class BootScene extends Phaser.Scene {
  constructor() { super({ key: 'BootScene' }); }
  preload() {
    if (window.location.protocol === 'file:') {
      showStartupError('Open the game through a local server, not directly from the file system. Run `npm install` and then `npm run dev`, then open http://localhost:4173.');
      return;
    }
    const { width, height } = this.scale;
    const cx = width / 2, cy = height / 2;
    const barBg = this.add.graphics().fillStyle(0x1a1a2e, 1).fillRect(cx - 160, cy - 16, 320, 32);
    const bar = this.add.graphics();
    this.add.text(cx, cy - 40, 'Loading…', { fontFamily: 'monospace', fontSize: '14px', color: '#a0a0c0' }).setOrigin(0.5);
    this.load.on('progress', v => { bar.clear().fillStyle(0x7c3aed, 1).fillRect(cx - 158, cy - 14, 316 * v, 28); });
    this.load.on('loaderror', (file) => {
      if (file.key === 'items') {
        showStartupError('Failed to load assets/data/items.json. Make sure you are serving the project from a local server and the file exists.');
      }
    });
    this.load.json('items', 'assets/data/items.json');
  }
  create() {
    if (window.location.protocol === 'file:') return;
    const raw = this.cache.json.get('items');
    if (!raw?.items) {
      showStartupError('items.json did not load correctly. Start the game from a local server.');
      return;
    }
    const items = Array.isArray(raw?.items) ? raw.items : [];
    const atlasKeys = [...new Set(items.map(item => item.atlas_key).filter(Boolean))];
    if (atlasKeys.length === 0) {
      this.scene.start('MenuScene');
      return;
    }

    let queued = 0;
    for (const key of atlasKeys) {
      if (this.textures.exists(key)) continue;
      this.load.image(key, `assets/sprites/${key}.png`);
      queued++;
    }

    if (queued === 0) {
      this.scene.start('MenuScene');
      return;
    }

    this.load.once('complete', () => this.scene.start('MenuScene'));
    this.load.start();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MenuScene
// ─────────────────────────────────────────────────────────────────────────────
class MenuScene extends Phaser.Scene {
  constructor() { super({ key: 'MenuScene' }); }
  create() {
    const { width, height } = this.scale;
    const cx = width / 2, cy = height / 2;
    audioManager.startMusic(this);

    this.add.text(cx, cy - 80, 'THE DUNGEON CRAWLER', {
      fontFamily: 'monospace', fontSize: '38px', color: '#a855f7', stroke: '#000000', strokeThickness: 6
    }).setOrigin(0.5);

    const hasSave = !!readSavedGame();
    let best = null;
    try {
      best = JSON.parse(localStorage.getItem(HIGH_SCORE_KEY) || '[]')[0] || null;
    } catch {
      best = null;
    }
    if (best) {
      this.add.text(cx, cy - 24, `Best Run  Floor ${best.floor}  Lv.${best.level}  Gold ${best.gold}`, {
        fontFamily: 'monospace', fontSize: '12px', color: '#fbbf24'
      }).setOrigin(0.5);
    }

    this.add.text(cx, cy + 4, 'Choose Difficulty', {
      fontFamily: 'monospace', fontSize: '12px', color: '#a5b4fc'
    }).setOrigin(0.5);

    this._createBtn(cx - 90, cy + 44, 'Easy', true, () => {
      localStorage.removeItem(SAVE_KEY);
      this.scene.start('MainScene', { isNewGame: true, worldState: { difficulty: 'easy', openedChests: [], defeatedEnemies: [], brokenWalls: [], performanceVisible: false, godMode: false } });
    }, 140);

    this._createBtn(cx + 90, cy + 44, 'Hard', true, () => {
      localStorage.removeItem(SAVE_KEY);
      this.scene.start('MainScene', { isNewGame: true, worldState: { difficulty: 'hard', openedChests: [], defeatedEnemies: [], brokenWalls: [], performanceVisible: false, godMode: false } });
    }, 140);

    this._createBtn(cx, cy + 102, 'Continue', hasSave, () => {
      if (hasSave) this.scene.start('MainScene', { isNewGame: false });
    });

    this._createBtn(cx, cy + 160, 'Instructions', true, () => {
      this.scene.start('InstructionsScene');
    }, 220);
  }

  _createBtn(x, y, text, active, onClick, btnW = 200) {
    const btnH = 44;
    const btnBg = this.add.graphics();
    const color = active ? 0x7c3aed : 0x333333;
    const hoverColor = active ? 0x6d28d9 : 0x333333;

    const draw = (c) => {
      btnBg.clear().fillStyle(c, 1).fillRoundedRect(x - btnW/2, y - btnH/2, btnW, btnH, 9);
    };
    draw(color);

    const txt = this.add.text(x, y, text, {
      fontFamily: 'monospace', fontSize: '18px', color: active ? '#ffffff' : '#888888'
    }).setOrigin(0.5);

    if (active) {
      txt.setInteractive({ useHandCursor: true })
         .on('pointerover', () => draw(hoverColor))
         .on('pointerout', () => draw(color))
         .on('pointerdown', () => {
           this.cameras.main.fadeOut(260, 0, 0, 0);
           this.cameras.main.once('camerafadeoutcomplete', onClick);
         });
    }
  }
}

class InstructionsScene extends Phaser.Scene {
  constructor() { super({ key: 'InstructionsScene' }); }

  create() {
    const { width, height } = this.scale;
    const cx = width / 2;
    this.add.rectangle(cx, height / 2, width, height, 0x070b16, 1);
    this.add.text(cx, 74, 'HOW TO PLAY', {
      fontFamily: 'monospace',
      fontSize: '30px',
      color: '#f8fafc',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    const body = [
      'Move: WASD or Arrow Keys',
      'Mouse Click: melee attack / use hotbar slot',
      '1-8: select hotbar slots',
      'F: cast a fireball',
      'Q: clear selected hotbar slot',
      'R: lightning strike',
      'E: void ball',
      'F near a chest or shop: interact',
      'Rooms: shop (buy with XP), trap (spikes!), treasure (better loot)',
      'Every 5 floors: boss room',
      'Esc: pause menu',
      '` : debug console',
      'Easy: fully visible map',
      'Hard: darkness + more monsters',
      'Kill every monster to unlock the next floor',
    ].join('\n');

    this.add.text(cx, height / 2 - 40, body, {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#cbd5e1',
      align: 'center',
      lineSpacing: 8,
    }).setOrigin(0.5);

    this._createBtn(cx, height - 90, 'Back', () => this.scene.start('MenuScene'));
  }

  _createBtn(x, y, text, onClick) {
    const bg = this.add.graphics();
    const draw = (hover) => bg.clear().fillStyle(hover ? 0x6d28d9 : 0x312e81, 1).fillRoundedRect(x - 90, y - 22, 180, 44, 9);
    draw(false);
    const label = this.add.text(x, y, text, { fontFamily: 'monospace', fontSize: '18px', color: '#ffffff' }).setOrigin(0.5);
    label.setInteractive({ useHandCursor: true })
      .on('pointerover', () => draw(true))
      .on('pointerout', () => draw(false))
      .on('pointerdown', onClick);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MainScene
// ─────────────────────────────────────────────────────────────────────────────
class MainScene extends Phaser.Scene {
  constructor() { super({ key: 'MainScene' }); }

  init(data) {
    this.isNewGame = data.isNewGame !== false;
    this.dungeonLevel = data.level || 1;
    const urlSeed = Number(new URLSearchParams(window.location.search).get('seed'));
    this.seed = data.seed || (Number.isFinite(urlSeed) && urlSeed > 0 ? urlSeed : Math.floor(Math.random() * 9999999));
    this._incomingPlayerState = data.playerState || null;
    this._incomingWorldState = data.worldState || null;
  }

  create() {
    const { width, height } = this.scale;
    audioManager.attachScene(this);

    // Item Registry
    const raw = this.cache.json.get('items');
    if (!raw?.items || !Array.isArray(raw.items)) {
      this._showFatalError('items.json failed to load or is invalid.');
      return;
    }
    this.itemRegistry = new Map(raw.items.map(item => [item.id, item]));
    this.assetManager = new AssetManager(this);
    this._worldState = {
      openedChests: [],
      defeatedEnemies: [],
      brokenWalls: [],
      difficulty: 'hard',
      performanceVisible: false,
      godMode: false,
      ...(this._incomingWorldState || {}),
    };

    // Initialize Player
    this.player = new Player({ name: 'Hero', speed: PLAYER_SPEED });
    
    // Load Save or Setup New Game
    if (this._incomingPlayerState) {
      this._restorePlayerState(this._incomingPlayerState);
    } else if (this.isNewGame) {
      this.player.addItem(this.itemRegistry.get('sword_iron'));
      this.player.addItem(this.itemRegistry.get('potion_health'), 2);
      this.player.equip('sword_iron');
      this.player.setHotbar(0, 'potion_health');
    } else {
      const saved = readSavedGame();
      if (saved?.player) {
        this.dungeonLevel = saved.level || this.dungeonLevel;
        this.seed = saved.seed || this.seed;
        this._worldState = { ...this._worldState, ...(saved.world || {}) };
        this._restorePlayerState(saved.player);
      }
    }

    // Procedural Generation
    this.floorSeed = (this.seed + this.dungeonLevel * 1337) >>> 0;
    this._rng = createRng(this.floorSeed);
    this.mapManager = new MapManager(this.floorSeed);
    this.rooms = this.mapManager.rooms;
    this._buildTilemap(width, height, this.mapManager.map);

    // Player Physics & Sprite
    this._playerContainer = this._buildPlayerSprite();
    this._attachPhysics();
    this._prevMainHand = this.player.equipment.main_hand?.id ?? null;
    
    // State Variables
    this._walkCycle = 0;
    this._flickerTime = 0;
    this._attackCooldown = 0;
    this._fireballCooldown = 0;
    this._lightningCooldown = 0;
    this._voidBallCooldown = 0;
    this._iframes = 0;
    this._attackBuffer = null;
    this._worldItems = [];
    this._fireballs = [];
    this._voidBalls = [];
    this._enemyArrows = [];
    this._traps = [];
    this._shopNpcs = [];
    this._shopUiOpen = false;
    this._gameOver = false;
    this._levelingUp = false;
    this._levelIntroActive = false;
    this._epicTrailTimer = 0;
    this._lastInputTimes = { left: 0, right: 0, up: 0, down: 0 };
    this._facing = 1;

    // Lighting & Fog of War
    this._torchGlow = this.add.graphics().setDepth(15);
    this._torchTexKey = this._buildTorchTexture(TORCH_RADIUS);
    this._darknessRT = this.add.renderTexture(0, 0, width, height).setOrigin(0, 0).setDepth(20).setScrollFactor(0);
    // Fog of war (permanent until erased)
    this._fogRT = this.add.renderTexture(0, 0, width, height).setOrigin(0, 0).setDepth(21).setScrollFactor(0);
    this._fogRT.fill(0x000000, FOG_ALPHA);

    this._buildParticleTexture();

    // Inputs
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({ W: 'W', A: 'A', S: 'S', D: 'D' });
    this.fKey = this.input.keyboard.addKey('F');
    this.qKey = this.input.keyboard.addKey('Q');
    this.rKey = this.input.keyboard.addKey('R');
    this.eKey = this.input.keyboard.addKey('E');
    this.escKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.backtickKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.BACKTICK);
    this._numKeys = Array.from({ length: HOTBAR_SLOTS }, (_, i) => this.input.keyboard.addKey(`${i + 1}`));
    this.input.on('pointerdown', ptr => this._onPointerDown(ptr.x, ptr.y));
    this.cameras.main.fadeIn(350, 0, 0, 0);

    // UI
    this.activeSlot = 0;
    this._activeGlowGfx = this.add.graphics().setDepth(92).setScrollFactor(0);
    this._buildHotbar(width, height);
    this._buildTooltip();
    this._buildHud(width, height);
    this._buildLootLog(width, height);
    this._buildPerformancePanel(width);
    this._buildVignette(width, height);
    this._paused = false;
    this._pauseUi = [];
    
    this._toastText = this.add.text(width / 2, height - this._hotbarTotalH() - 20, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#fbbf24', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(200).setScrollFactor(0).setAlpha(0);

    // Auto-save at the start of the level
    this._saveGame();
    this._autosaveEvent = this.time.addEvent({
      delay: 5000,
      loop: true,
      callback: () => this._saveGame(),
    });

    this._logEvent(`Floor ${this.dungeonLevel} started`);
    this._startDust();
    this._openLevelIntro();

    this.scale.on('resize', this._handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this._handleResize, this);
      this._autosaveEvent?.remove(false);
      this._dustEvent?.remove(false);
      if (!this._gameOver) this._saveGame();
    });
  }

  update(time, delta) {
    if (Phaser.Input.Keyboard.JustDown(this.escKey)) this._togglePauseMenu();
    if (Phaser.Input.Keyboard.JustDown(this.backtickKey)) this._openDebugConsole();
    this._updatePerformancePanel();

    this._updateLevelIntroTimer();
    if (this._paused) return;
    if (this._levelIntroActive) return;
    if (this._levelingUp || this._gameOver) return;

    const { width, height } = this.scale;
    const playH = height - this._hotbarTotalH();

    // Movement
    const isLeft = this.cursors.left.isDown || this.wasd.A.isDown;
    const isRight = this.cursors.right.isDown || this.wasd.D.isDown;
    const isUp = this.cursors.up.isDown || this.wasd.W.isDown;
    const isDown = this.cursors.down.isDown || this.wasd.S.isDown;

    if (isLeft) this._lastInputTimes.left = time;
    if (isRight) this._lastInputTimes.right = time;
    if (isUp) this._lastInputTimes.up = time;
    if (isDown) this._lastInputTimes.down = time;

    const moveLeft = isLeft || time - this._lastInputTimes.left < MOVE_COYOTE_MS;
    const moveRight = isRight || time - this._lastInputTimes.right < MOVE_COYOTE_MS;
    const moveUp = isUp || time - this._lastInputTimes.up < MOVE_COYOTE_MS;
    const moveDown = isDown || time - this._lastInputTimes.down < MOVE_COYOTE_MS;

    let ax = 0, ay = 0;
    if (moveLeft) ax -= PLAYER_ACCEL;
    if (moveRight) ax += PLAYER_ACCEL;
    if (moveUp) ay -= PLAYER_ACCEL;
    if (moveDown) ay += PLAYER_ACCEL;
    if (ax !== 0 && ay !== 0) { ax *= 0.7071; ay *= 0.7071; }

    this._physBody.setAcceleration(ax, ay);
    this.player.x = Phaser.Math.Clamp(this._playerContainer.x, 0, width);
    this.player.y = Phaser.Math.Clamp(this._playerContainer.y, 0, playH);

    // Animation
    const isMoving = moveLeft || moveRight || moveUp || moveDown;
    if (isMoving) this._walkCycle += delta * 0.007;
    if (isMoving && Math.floor(time / 280) !== this._lastFootstepBeat) {
      this._lastFootstepBeat = Math.floor(time / 280);
      audioManager.playSfx(this._getSurfaceAtPlayer() === 'moss' ? 'footstep_moss' : 'footstep_stone');
    }
    const bob = isMoving ? Math.sin(this._walkCycle) * 2.5 : 0;
    const bodyGfx = this._playerContainer.getByName('body');
    const weaponGfx = this._playerContainer.getByName('weapon');
    if (bodyGfx) bodyGfx.y = bob;
    if (weaponGfx) weaponGfx.y = bob;
    if (moveLeft) this._facing = -1;
    if (moveRight) this._facing = 1;
    const squash = isMoving ? Math.min(0.08, this._physBody.velocity.length() / PLAYER_SPEED * 0.08) : 0;
    this._playerContainer.setScale((this._facing || 1) * (1 + squash), 1 - squash);

    const curMain = this.player.equipment.main_hand?.id ?? null;
    if (curMain !== this._prevMainHand) {
      this._redrawWeapon();
      this._prevMainHand = curMain;
    }

    // Update Lighting & Fog
    this._updateTorch(delta);

    // Interaction Checks
    const px = this.player.x, py = this.player.y;
    for (const chest of this._chests) chest.setPromptVisible(chest.isNearPlayer(px, py));
    if (Phaser.Input.Keyboard.JustDown(this.fKey)) this._handleFKey();
    if (Phaser.Input.Keyboard.JustDown(this.qKey)) this._clearActiveHotbarSlot();
    if (Phaser.Input.Keyboard.JustDown(this.rKey)) this._castLightningStrike();
    if (Phaser.Input.Keyboard.JustDown(this.eKey)) this._castVoidBall();

    // Check Portal
    if (this._portal && this._portalUnlocked() && Math.hypot(px - this._portal.x, py - this._portal.y) < PORTAL_RADIUS) {
      this._nextLevel();
    }

    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      if (Phaser.Input.Keyboard.JustDown(this._numKeys[i])) { this._setActiveSlot(i); break; }
    }

    this._updateTooltip();
    this._updateHud();
    this._updateEpicTrail(delta);

    if (this._toastText.alpha > 0) this._toastText.setAlpha(Math.max(0, this._toastText.alpha - delta / 1800));
    if (this._attackCooldown > 0) this._attackCooldown -= delta;
    if (this._fireballCooldown > 0) this._fireballCooldown -= delta;
    if (this._lightningCooldown > 0) this._lightningCooldown -= delta;
    if (this._voidBallCooldown > 0) this._voidBallCooldown -= delta;
    if (this._iframes > 0) this._iframes -= delta;
    if (this._attackBuffer && time >= this._attackBuffer.executeAt && this._attackCooldown <= 0) {
      const buffered = this._attackBuffer;
      this._attackBuffer = null;
      this._doAttack(buffered.x, buffered.y, true);
    } else if (this._attackBuffer && time > this._attackBuffer.discardAt) {
      this._attackBuffer = null;
    }

    // Enemies
    const allIds = Array.from(this.itemRegistry.keys());
    for (let i = this._enemies.length - 1; i >= 0; i--) {
      const enemy = this._enemies[i];
      if (enemy.dead) {
        if (!enemy._deathHandled) {
          enemy._deathHandled = true;
          if (enemy.saveId && !this._worldState.defeatedEnemies.includes(enemy.saveId)) {
            this._worldState.defeatedEnemies.push(enemy.saveId);
          }
          audioManager.playSfx('death');
          this._spawnDeathParticles(enemy.container.x, enemy.container.y, enemy.type);
          this._giveXp(enemy.xpReward);
          const goldDrop = enemy.type === 'boss'     ? this._randInt(30, 50)
                         : enemy.type === 'mage'     ? this._randInt(8, 14)
                         : enemy.type === 'archer'   ? this._randInt(6, 12)
                         : enemy.type === 'bomber'   ? this._randInt(3, 7)
                         : enemy.type === 'skeleton' ? this._randInt(4, 9)
                         : this._randInt(2, 5);
          this.player.gold += goldDrop;
          this._updateHud();
          this._logEvent(`${enemy.type} defeated (+${enemy.xpReward} XP)`);
          this._showToast(`+${goldDrop} gold`);
          
          if (this._randFloat() < 0.5) {
            const id = allIds[this._randInt(0, allIds.length - 1)];
            const itemDef = this.itemRegistry.get(id);
            if (itemDef) this._spawnWorldItem(enemy.container.x, enemy.container.y, itemDef);
          }
        }
        if (!enemy.container.scene) this._enemies.splice(i, 1);
        continue;
      }

      enemy.update(delta, this.player.x, this.player.y);
      if (enemy.wantsAttack && enemy._knockbackTimer <= 0 && Math.hypot(enemy.container.x - px, enemy.container.y - py) < CONTACT_RADIUS + 18) {
        this._playerTakeDamage(enemy.damage);
      }
      // Archer / mage / boss: fire projectile toward player
      if (enemy.wantsShoot) {
        if (enemy.type === 'boss') {
          for (const angle of (enemy._shootAngles || [])) {
            this._spawnEnemyArrow(enemy.container.x, enemy.container.y, angle, true);
          }
        } else {
          const isBolt = enemy.type === 'mage';
          this._spawnEnemyArrow(enemy.container.x, enemy.container.y, enemy._shootAngle ?? 0, isBolt);
        }
      }
      // Bomber: explode — area damage + self-destruct
      if (enemy.wantsExplode) {
        this._bomberExplode(enemy);
      }
    }

    // World Items
    for (let i = this._worldItems.length - 1; i >= 0; i--) {
      const wi = this._worldItems[i];
      if (wi.collected) { this._worldItems.splice(i, 1); continue; }
      if (Math.hypot(wi.x - px, wi.y - py) < WORLD_PICKUP_R) {
        this._collectWorldItem(wi);
        this._worldItems.splice(i, 1);
      }
    }

    for (let i = this._fireballs.length - 1; i >= 0; i--) {
      const fireball = this._fireballs[i];
      if (!fireball.active) {
        fireball.g.destroy();
        this._fireballs.splice(i, 1);
        continue;
      }
      fireball.x += fireball.vx * (delta / 1000);
      fireball.y += fireball.vy * (delta / 1000);
      fireball.life -= delta;
      fireball.g.setPosition(fireball.x, fireball.y);

      const col = Math.floor(fireball.x / this._tileW);
      const row = Math.floor(fireball.y / this._tileH);
      if (fireball.life <= 0 || this._wallTileMap.has(`${col},${row}`)) {
        fireball.active = false;
        this._spawnPickupParticles(fireball.x, fireball.y, 0xf97316);
        continue;
      }

      for (const enemy of this._enemies) {
        if (!enemy.isAlive) continue;
        const dist = Math.hypot(enemy.container.x - fireball.x, enemy.container.y - fireball.y);
        if (dist > 28) continue;
        enemy.takeDamage(FIREBALL_DAMAGE, fireball.vx * 0.3, fireball.vy * 0.3);
        this._showDamageNumber(enemy.container.x, enemy.container.y - 24, FIREBALL_DAMAGE, false, false);
        this._spawnPickupParticles(fireball.x, fireball.y, 0xfb923c);
        fireball.active = false;
        break;
      }
    }

    for (let i = this._voidBalls.length - 1; i >= 0; i--) {
      const orb = this._voidBalls[i];
      if (!orb.active) {
        orb.g.destroy();
        this._voidBalls.splice(i, 1);
        continue;
      }

      orb.x += orb.vx * (delta / 1000);
      orb.y += orb.vy * (delta / 1000);
      orb.life -= delta;
      orb.g.setPosition(orb.x, orb.y);

      const col = Math.floor(orb.x / this._tileW);
      const row = Math.floor(orb.y / this._tileH);
      if (orb.life <= 0 || this._wallTileMap.has(`${col},${row}`)) {
        orb.active = false;
        this._spawnPickupParticles(orb.x, orb.y, 0x67e8f9);
        continue;
      }

      for (const enemy of this._enemies) {
        if (!enemy.isAlive) continue;
        const dx = orb.x - enemy.container.x;
        const dy = orb.y - enemy.container.y;
        const dist = Math.hypot(dx, dy);
        if (dist > VOID_BALL_PULL_RADIUS || dist <= 0.001) continue;
        const pull = 1 - dist / VOID_BALL_PULL_RADIUS;
        enemy._physBody?.setVelocity(
          (dx / dist) * VOID_BALL_PULL_FORCE * pull,
          (dy / dist) * VOID_BALL_PULL_FORCE * pull,
        );
        enemy._knockbackTimer = Math.max(enemy._knockbackTimer || 0, 80);
        if (dist < 18 && !orb.hitIds.has(enemy.saveId || enemy.type)) {
          orb.hitIds.add(enemy.saveId || enemy.type);
          enemy.takeDamage(8, (dx / dist) * 80, (dy / dist) * 80);
          this._showDamageNumber(enemy.container.x, enemy.container.y - 24, 8, false, false);
        }
      }
    }

    // ── Enemy Arrows ──────────────────────────────────────────────────────────
    for (let i = this._enemyArrows.length - 1; i >= 0; i--) {
      const arrow = this._enemyArrows[i];
      if (!arrow.active) { arrow.g.destroy(); this._enemyArrows.splice(i, 1); continue; }
      arrow.x    += arrow.vx * (delta / 1000);
      arrow.y    += arrow.vy * (delta / 1000);
      arrow.life -= delta;
      arrow.g.setPosition(arrow.x, arrow.y).setRotation(Math.atan2(arrow.vy, arrow.vx));
      const col = Math.floor(arrow.x / this._tileW);
      const row = Math.floor(arrow.y / this._tileH);
      if (arrow.life <= 0 || this._wallTileMap.has(`${col},${row}`)) {
        arrow.active = false;
        continue;
      }
      if (this._iframes <= 0 && Math.hypot(arrow.x - px, arrow.y - py) < 20) {
        this._playerTakeDamage(arrow.damage);
        arrow.active = false;
      }
    }

    // ── Trap Spikes ───────────────────────────────────────────────────────────
    for (const trap of this._traps) {
      trap.timer -= delta;
      if (trap.timer <= 0) {
        trap.active = !trap.active;
        trap.timer  = trap.active ? TRAP_ACTIVE_MS : TRAP_IDLE_MS;
        this._drawTrap(trap);
      } else if (!trap.active && trap.timer < TRAP_WARN_MS) {
        // Warning flash before activation
        const flashOn = Math.floor(trap.timer / 80) % 2 === 0;
        this._drawTrap(trap, flashOn);
      }
      if (trap.active && this._iframes <= 0) {
        if (Math.hypot(trap.x - px, trap.y - py) < trap.radius) {
          this._playerTakeDamage(TRAP_DAMAGE);
        }
      }
    }

    // ── Shop NPC prompts ──────────────────────────────────────────────────────
    if (this._shopNpcs) {
      for (const shop of this._shopNpcs) {
        const near = Math.hypot(shop.x - px, shop.y - py) < 72;
        shop.promptText.setAlpha(near && !this._shopUiOpen ? 1 : 0);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Save & Load
  // ─────────────────────────────────────────────────────────────────────────────
  _saveGame() {
    const data = {
      level: this.dungeonLevel,
      seed: this.seed,
      player: this._serializePlayerState(),
      world: this._serializeWorldState(),
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (err) {
      console.warn('Failed to save game:', err);
    }
  }

  _serializePlayerState() {
    return {
      x: this.player.x,
      y: this.player.y,
      hp: this.player.hp,
      level: this.player.level,
      xp: this.player.xp,
      xpToNext: this.player.xpToNext,
      maxHp: this.player.maxHp,
      baseAttack: this.player.baseAttack,
      baseDefense: this.player.baseDefense,
      gold: this.player.gold,
      inventory: this.player.inventory.map(s => ({ id: s.item.id, qty: s.quantity })),
      hotbar: [...this.player.hotbar],
      equipment: {
        head: this.player.equipment.head?.id || null,
        chest: this.player.equipment.chest?.id || null,
        main_hand: this.player.equipment.main_hand?.id || null,
      },
    };
  }

  _restorePlayerState(state) {
    if (!state) return;

    this.player.inventory = [];
    this.player.hotbar = Array(HOTBAR_SLOTS).fill(null);
    this.player.equipment = { head: null, chest: null, main_hand: null };

    this.player.hp = state.hp ?? this.player.hp;
    this.player.x = state.x ?? this.player.x;
    this.player.y = state.y ?? this.player.y;
    this.player.level = state.level ?? this.player.level;
    this.player.xp = state.xp ?? this.player.xp;
    this.player.xpToNext = state.xpToNext ?? this.player.xpToNext;
    this.player.maxHp = state.maxHp ?? this.player.maxHp;
    this.player.baseAttack = state.baseAttack ?? this.player.baseAttack;
    this.player.baseDefense = state.baseDefense ?? this.player.baseDefense;
    this.player.gold = state.gold ?? this.player.gold;

    for (const entry of state.inventory || []) {
      const itemDef = this.itemRegistry.get(entry.id);
      if (itemDef) this.player.addItem(itemDef, entry.qty || 1);
    }

    if (Array.isArray(state.hotbar)) {
      for (let i = 0; i < HOTBAR_SLOTS; i++) this.player.hotbar[i] = state.hotbar[i] ?? null;
    }

    const equipment = state.equipment || {};
    if (equipment.head) this.player.equipment.head = this.itemRegistry.get(equipment.head) || null;
    if (equipment.chest) this.player.equipment.chest = this.itemRegistry.get(equipment.chest) || null;
    if (equipment.main_hand) this.player.equipment.main_hand = this.itemRegistry.get(equipment.main_hand) || null;

    this.player.hp = Math.min(this.player.hp, this.player.effectiveMaxHp);
  }

  _handleResize() {
    this.scene.restart({
      isNewGame: false,
      level: this.dungeonLevel,
      seed: this.seed,
      playerState: this._serializePlayerState(),
      worldState: this._serializeWorldState(),
    });
  }

  _serializeWorldState() {
    return {
      openedChests: [...(this._worldState?.openedChests || [])],
      defeatedEnemies: [...(this._worldState?.defeatedEnemies || [])],
      brokenWalls: [...(this._worldState?.brokenWalls || [])],
      difficulty: this._worldState?.difficulty || 'hard',
      performanceVisible: !!this._worldState?.performanceVisible,
      godMode: !!this._worldState?.godMode,
    };
  }

  _getSurfaceAtPlayer() {
    const col = Math.floor(this.player.x / this._tileW);
    const row = Math.floor(this.player.y / this._tileH);
    return this._surfaceMap?.get(`${col},${row}`) || 'stone';
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Map Generation & Spawning
  // ─────────────────────────────────────────────────────────────────────────────
  _buildTilemap(width, height, map) {
    const playH = height - this._hotbarTotalH();
    const TILE_W = Math.floor(width / MAP_COLS);
    const TILE_H = Math.floor(playH / MAP_ROWS);
    this._tileW = TILE_W;
    this._tileH = TILE_H;
    this._mapGrid = map;

    const spawnRoom = this.rooms[0];
    const wantsSavedPosition = Number.isFinite(this._incomingPlayerState?.x) && Number.isFinite(this._incomingPlayerState?.y);
    const desiredX = wantsSavedPosition ? this._incomingPlayerState.x : (spawnRoom.cx + 0.5) * TILE_W;
    const desiredY = wantsSavedPosition ? this._incomingPlayerState.y : (spawnRoom.cy + 0.5) * TILE_H;

    if (!this.textures.exists('__wt__')) {
      const _wt = this.textures.createCanvas('__wt__', 1, 1);
      const _wtCtx = _wt.getContext();
      _wtCtx.fillStyle = '#ffffff';
      _wtCtx.fillRect(0, 0, 1, 1);
      _wt.refresh();
    }
    this._wallGroup = this.physics.add.staticGroup();
    this._floorGfx = this.add.graphics().setDepth(0);
    this._wallTileMap = new Map();
    this._surfaceMap = new Map();

    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        const wx = col * TILE_W, wy = row * TILE_H;
        const wallId = `floor:${this.dungeonLevel}:wall:${col}:${row}`;
        const broken = this._worldState.brokenWalls.includes(wallId);
        if (map[row][col] === 1 && !broken) {
          const wall = this.add.graphics().setDepth(1);
          wall.fillStyle(0x1a1832, 1).fillRect(wx, wy, TILE_W, TILE_H);
          wall.fillStyle(0x1e1b4b, 0.6).fillRect(wx + 2, wy + 2, TILE_W - 4, TILE_H - 4);
          wall.lineStyle(1, 0x2d2b5e, 0.4).strokeRect(wx, wy, TILE_W, TILE_H);
          const body = this.physics.add.staticImage(wx + TILE_W / 2, wy + TILE_H / 2, '__wt__');
          body.setDisplaySize(TILE_W, TILE_H).setAlpha(0).refreshBody();
          this._wallGroup.add(body);
          this._wallTileMap.set(`${col},${row}`, { wall, body, col, row, wallId });
        } else {
          this._drawFloorTile(col, row);
        }
      }
    }

    const safeSpawn = this._findSafeWorldPosition(desiredX, desiredY, spawnRoom);
    this.player.x = safeSpawn.x;
    this.player.y = safeSpawn.y;

    this._spawnChests();
    this._spawnEnemies();
    this._spawnPortal();
    this._spawnShops();
    this._spawnTraps();
  }

  _findSafeWorldPosition(worldX, worldY, preferredRoom = null) {
    const preferredCol = Phaser.Math.Clamp(Math.floor(worldX / this._tileW), 0, MAP_COLS - 1);
    const preferredRow = Phaser.Math.Clamp(Math.floor(worldY / this._tileH), 0, MAP_ROWS - 1);
    const isFloor = (col, row) => {
      if (row < 0 || row >= MAP_ROWS || col < 0 || col >= MAP_COLS) return false;
      return this._mapGrid?.[row]?.[col] === 0 && !this._wallTileMap.has(`${col},${row}`);
    };

    if (isFloor(preferredCol, preferredRow)) {
      return { x: (preferredCol + 0.5) * this._tileW, y: (preferredRow + 0.5) * this._tileH };
    }

    for (let radius = 1; radius <= Math.max(MAP_COLS, MAP_ROWS); radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const col = preferredCol + dx;
          const row = preferredRow + dy;
          if (!isFloor(col, row)) continue;
          return { x: (col + 0.5) * this._tileW, y: (row + 0.5) * this._tileH };
        }
      }
    }

    if (preferredRoom) {
      return { x: (preferredRoom.cx + 0.5) * this._tileW, y: (preferredRoom.cy + 0.5) * this._tileH };
    }
    return { x: this._tileW * 1.5, y: this._tileH * 1.5 };
  }

  _drawFloorTile(col, row) {
    const wx = col * this._tileW;
    const wy = row * this._tileH;
    const moss = (row * 11 + col * 7 + this.dungeonLevel) % 9 === 0;
    const base = moss ? 0x1b2b22 : ((row + col) % 2 === 0 ? 0x1c1c2e : 0x171726);
    const accent = moss ? 0x355e3b : 0x22223a;
    this._surfaceMap.set(`${col},${row}`, moss ? 'moss' : 'stone');
    this._floorGfx.fillStyle(base, 1).fillRect(wx, wy, this._tileW - 1, this._tileH - 1);
    this._floorGfx.fillStyle(accent, 0.12).fillRect(wx + 4, wy + 4, this._tileW - 8, this._tileH - 8);
  }

  _spawnChests() {
    this._chests = [];
    const allIds = Array.from(this.itemRegistry.keys()).filter(id => !id.startsWith('spell_'));
    const spellIds = Array.from(this.itemRegistry.keys()).filter(id => id.startsWith('spell_') && !this._playerOwnsItem(id));
    for (let i = 1; i < this.rooms.length - 1; i++) {
      const r = this.rooms[i];
      // Trap rooms have no chest (traps are their own challenge)
      if (r.type === 'trap') continue;
      const chestId = `floor:${this.dungeonLevel}:chest:${i}`;
      if (this._worldState.openedChests.includes(chestId)) continue;
      const cx = (r.cx + 0.5) * this._tileW, cy = (r.cy + 0.5) * this._tileH;
      // Treasure rooms: offset chest slightly + guaranteed rare loot + more choices
      const isTreasure = r.type === 'treasure';
      const loot = [allIds[this._randInt(0, allIds.length - 1)], 'potion_health'];
      if (isTreasure) {
        // Add 2 extra items to the loot pool for more interesting picks
        loot.push(allIds[this._randInt(0, allIds.length - 1)]);
        if (spellIds.length > 0) loot.push(spellIds[this._randInt(0, spellIds.length - 1)]);
      } else if (spellIds.length > 0 && this._randFloat() < 0.28) {
        loot.push(spellIds[this._randInt(0, spellIds.length - 1)]);
      }
      const chest = new Chest(this, cx, cy, loot);
      chest.saveId    = chestId;
      chest.rollIndex = this._randInt(0, loot.length - 1);
      chest.isTreasure = isTreasure;
      this._chests.push(chest);
      // Visual marker for treasure room: gold ring on floor
      if (isTreasure) this._drawTreasureRoomMarker(r);
    }
  }

  _spawnEnemies() {
    this._enemies = [];
    const isBossFloor = this.dungeonLevel % 5 === 0;
    for (let i = 1; i < this.rooms.length; i++) {
      const r = this.rooms[i];
      // No enemies in shop rooms — safe zone for buying
      if (r.type === 'shop') continue;
      // Boss floor: portal room gets the boss instead of regular enemies
      if (isBossFloor && r.type === 'portal') {
        this._spawnBoss(r, i);
        continue;
      }
      const bonus = this._worldState.difficulty === 'hard' ? 2 : 0;
      const cap   = this._worldState.difficulty === 'hard' ? 5 : 3;
      // Trap rooms have fewer enemies (traps are the main hazard)
      const roomCap = r.type === 'trap' ? Math.min(cap, 2) : cap;
      const count = Math.min(roomCap, Math.ceil(this.dungeonLevel / 2) + this._randInt(0, 1) + bonus);
      for (let e = 0; e < count; e++) {
        const enemyId = `floor:${this.dungeonLevel}:enemy:${i}:${e}`;
        if (this._worldState.defeatedEnemies.includes(enemyId)) continue;
        const x = (r.x + 1 + this._randFloat() * (r.w - 2)) * this._tileW;
        const y = (r.y + 1 + this._randFloat() * (r.h - 2)) * this._tileH;
        // Enemy type variety scales with dungeon level
        const roll = this._randFloat();
        let type;
        if (this.dungeonLevel >= 3 && roll > 0.82) {
          type = 'bomber';
        } else if (roll > 0.62) {
          type = 'mage';      // ~38% — mages from floor 1
        } else if (roll > 0.38) {
          type = 'archer';    // ~24%
        } else if (roll > 0.18) {
          type = 'skeleton';  // ~20%
        } else {
          type = 'slime';     // ~18%
        }
        // Treasure room: first enemy is always a mage guardian
        if (r.type === 'treasure' && e === 0) type = 'mage';
        const enemy = new Enemy(this, x, y, type);
        enemy.saveId = enemyId;
        // Scale enemy stats based on Dungeon Level
        enemy.maxHp = Math.floor(enemy.maxHp * (1 + (this.dungeonLevel - 1) * 0.2));
        enemy.hp    = enemy.maxHp;
        enemy.damage = Math.floor(enemy.damage * (1 + (this.dungeonLevel - 1) * 0.15));
        this.physics.add.collider(enemy.container, this._wallGroup);
        this._enemies.push(enemy);
      }
    }
  }

  _spawnBoss(room, roomIndex) {
    const bossId = `floor:${this.dungeonLevel}:boss:${roomIndex}`;
    if (this._worldState.defeatedEnemies.includes(bossId)) return;
    const x = (room.cx + 0.5) * this._tileW;
    const y = (room.cy + 0.5) * this._tileH;
    const boss = new Enemy(this, x, y, 'boss');
    boss.saveId = bossId;
    boss.maxHp  = Math.floor(boss.maxHp * (1 + (this.dungeonLevel - 1) * 0.15));
    boss.hp     = boss.maxHp;
    boss.damage = Math.floor(boss.damage * (1 + (this.dungeonLevel - 1) * 0.1));
    this.physics.add.collider(boss.container, this._wallGroup);
    this._enemies.push(boss);
    // Show boss warning toast
    this.time.delayedCall(800, () => {
      this._showToast('⚠ BOSS FLOOR ⚠');
      this._logEvent(`Boss awakens on floor ${this.dungeonLevel}!`);
    });
  }

  _spawnPortal() {
    const portalRoom = this.rooms[this.rooms.length - 1];
    const px = (portalRoom.cx + 0.5) * this._tileW;
    const py = (portalRoom.cy + 0.5) * this._tileH;

    this._portal = { x: px, y: py };
    const pg = this.add.graphics().setDepth(4).setPosition(px, py);
    this._portalLabel = null;

    this.tweens.addCounter({
      from: 0, to: 360, duration: 3000, repeat: -1,
      onUpdate: tween => {
        pg.clear();
        const a = Phaser.Math.DegToRad(tween.getValue());
        const unlocked = this._portalUnlocked();
        pg.fillStyle(unlocked ? 0xa855f7 : 0x475569, 0.2).fillCircle(0, 0, PORTAL_RADIUS);
        pg.fillStyle(unlocked ? 0x7c3aed : 0x64748b, 0.4).fillCircle(Math.cos(a)*5, Math.sin(a)*5, PORTAL_RADIUS * 0.7);
        pg.fillStyle(0xffffff, 0.8).fillCircle(Math.cos(-a)*2, Math.sin(-a)*2, PORTAL_RADIUS * 0.3);
      }
    });
  }

  _portalUnlocked() {
    return this._enemies?.every(enemy => enemy.dead || !enemy.container.scene) ?? false;
  }

  // ── Enemy projectiles ─────────────────────────────────────────────────────

  _spawnEnemyArrow(originX, originY, angle, isBolt = false) {
    const g = this.add.graphics().setDepth(9).setPosition(originX, originY);
    if (isBolt) {
      // Magic bolt: glowing orb
      g.fillStyle(0x7c3aed, 0.4); g.fillCircle(0, 0, 10);
      g.fillStyle(0xa855f7, 0.8); g.fillCircle(0, 0, 7);
      g.fillStyle(0xe9d5ff, 1);   g.fillCircle(0, 0, 4);
    } else {
      // Arrow: thin elongated shape pointing in travel direction
      g.fillStyle(0xfcd34d, 1); g.fillRect(-8, -2, 16, 4);
      g.fillStyle(0x92400e, 1); g.fillTriangle(8, -3, 14, 0, 8, 3);
      g.setRotation(angle);
    }
    const speed = isBolt ? 190 : ENEMY_ARROW_SPEED;
    this._enemyArrows.push({
      g,
      x: originX, y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      damage: isBolt ? 20 : ENEMY_ARROW_DAMAGE,
      life: ENEMY_ARROW_LIFE,
      active: true,
      isBolt,
    });
  }

  _bomberExplode(enemy) {
    const ex = enemy.container.x;
    const ey = enemy.container.y;
    // Visual explosion burst
    this._spawnPickupParticles(ex, ey, 0xf97316);
    this._spawnPickupParticles(ex, ey, 0xfbbf24);
    // Camera shake
    this.cameras.main.shake(350, 0.02);
    // Area damage to player
    if (Math.hypot(ex - this.player.x, ey - this.player.y) < BOMBER_EXPLODE_RADIUS) {
      this._playerTakeDamage(enemy.damage);
    }
    // Kill the bomber
    enemy.takeDamage(9999);
  }

  // ── Room special features ─────────────────────────────────────────────────

  _spawnShops() {
    this._shopNpcs = [];
    const allIds  = Array.from(this.itemRegistry.keys());
    for (const room of this.rooms) {
      if (room.type !== 'shop') continue;
      const nx = (room.cx + 0.5) * this._tileW;
      const ny = (room.cy + 0.5) * this._tileH;
      // Pick 3 random items for sale; price = item value or xp cost
      const items = Array.from({ length: SHOP_ITEM_COUNT }, () => {
        const id  = allIds[this._randInt(0, allIds.length - 1)];
        const def = this.itemRegistry.get(id);
        return { id, def, xpCost: def ? Math.max(20, Math.floor((def.value || 40) * 0.6)) : 20 };
      });
      // NPC graphic
      const g = this.add.graphics().setDepth(6).setPosition(nx, ny);
      this._drawShopNpc(g);
      // Prompt text
      const promptText = this.add.text(nx, ny - 54, '[F] Shop', {
        fontFamily: 'monospace', fontSize: '12px', color: '#fbbf24',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(32).setAlpha(0);
      this._shopNpcs.push({ x: nx, y: ny, items, g, promptText });
    }
  }

  _drawShopNpc(g) {
    g.clear();
    // Shadow
    g.fillStyle(0x000000, 0.28); g.fillEllipse(2, 30, 36, 12);
    // Legs
    g.fillStyle(0x78350f, 1); g.fillRect(-10, 10, 9, 20); g.fillRect(1, 10, 9, 20);
    // Apron (front)
    g.fillStyle(0xfef3c7, 1); g.fillRect(-10, -4, 20, 16);
    // Stocky body
    g.fillStyle(0x92400e, 1); g.fillRect(-13, -16, 26, 28);
    // Arms (holding something)
    g.fillStyle(0x92400e, 1); g.fillRect(-22, -14, 11, 18); g.fillRect(11, -14, 11, 18);
    // Bag of gold in left hand
    g.fillStyle(0xfbbf24, 1); g.fillCircle(-18, 6, 7);
    g.lineStyle(2, 0xca8a04, 1); g.strokeCircle(-18, 6, 7);
    g.fillStyle(0xfef08a, 0.8); g.fillCircle(-18, 6, 4);
    // Head (round, friendly)
    g.fillStyle(0xfde68a, 1); g.fillEllipse(0, -24, 22, 20);
    // Merchant cap (flat brim, not pointed)
    g.fillStyle(0x78350f, 1); g.fillRect(-14, -34, 28, 6); g.fillRect(-10, -40, 20, 8);
    g.fillStyle(0xca8a04, 1); g.fillRect(-14, -36, 28, 3);
    // Eyes (friendly, smiling)
    g.fillStyle(0x111111, 1); g.fillCircle(-5, -25, 2); g.fillCircle(5, -25, 2);
    // Smile
    g.lineStyle(2, 0x78350f, 1);
    g.strokeEllipse(0, -19, 10, 6);
    // Apron tie
    g.lineStyle(2, 0xca8a04, 1); g.lineBetween(-4, -4, -4, 12); g.lineBetween(4, -4, 4, 12);
  }

  _openShopUi(shop) {
    if (this._shopUiOpen) return;
    this._shopUiOpen = true;
    const { width, height } = this.scale;
    const cx = width / 2, cy = height / 2;
    const elements = [];

    const overlay = this.add.graphics().setDepth(500).setScrollFactor(0);
    overlay.fillStyle(0x000000, 0.82).fillRect(0, 0, width, height);
    elements.push(overlay);

    const title = this.add.text(cx, cy - 160, 'MERCHANT', {
      fontFamily: 'monospace', fontSize: '26px', color: '#fbbf24',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(501).setScrollFactor(0);
    elements.push(title);

    const sub = this.add.text(cx, cy - 128, 'Spend XP to buy items', {
      fontFamily: 'monospace', fontSize: '13px', color: '#94a3b8',
    }).setOrigin(0.5).setDepth(501).setScrollFactor(0);
    elements.push(sub);

    const closeAll = () => {
      elements.forEach(e => e.destroy());
      this._shopUiOpen = false;
    };

    shop.items.forEach((shopItem, idx) => {
      const iy = cy - 70 + idx * 68;
      const def = shopItem.def;
      if (!def) return;
      const rarityCol = { common: '#9ca3af', uncommon: '#22c55e', rare: '#3b82f6', epic: '#a855f7', legendary: '#f59e0b' }[def.rarity] || '#9ca3af';
      const bg = this.add.graphics().setDepth(501).setScrollFactor(0);
      const drawBg = (hover) => {
        bg.clear();
        bg.fillStyle(hover ? 0x1e293b : 0x0f172a, 0.95).fillRoundedRect(cx - 200, iy - 24, 400, 52, 8);
        bg.lineStyle(2, hover ? 0x3b82f6 : 0x334155, 1).strokeRoundedRect(cx - 200, iy - 24, 400, 52, 8);
      };
      drawBg(false);
      elements.push(bg);

      const nameText = this.add.text(cx - 180, iy - 10, def.name, {
        fontFamily: 'monospace', fontSize: '14px', color: rarityCol, stroke: '#000', strokeThickness: 2,
      }).setDepth(502).setScrollFactor(0);
      elements.push(nameText);

      const descText = this.add.text(cx - 180, iy + 8, def.description?.slice(0, 45) ?? '', {
        fontFamily: 'monospace', fontSize: '10px', color: '#64748b',
      }).setDepth(502).setScrollFactor(0);
      elements.push(descText);

      const priceText = this.add.text(cx + 190, iy, `${shopItem.xpCost} XP`, {
        fontFamily: 'monospace', fontSize: '13px', color: '#fbbf24',
      }).setOrigin(1, 0.5).setDepth(502).setScrollFactor(0);
      elements.push(priceText);

      // Invisible hit zone
      const hitZone = this.add.zone(cx, iy, 400, 52).setDepth(503).setScrollFactor(0).setInteractive();
      elements.push(hitZone);
      hitZone.on('pointerover', () => drawBg(true));
      hitZone.on('pointerout',  () => drawBg(false));
      hitZone.on('pointerdown', () => {
        if (this.player.xp < shopItem.xpCost) {
          this._showToast('Not enough XP!');
          return;
        }
        const added = this.player.addItem(def, 1);
        if (!added) { this._showToast('Inventory full!'); return; }
        this.player.xp -= shopItem.xpCost;
        this._updateHud();
        this._logEvent(`Bought ${def.name} for ${shopItem.xpCost} XP`);
        this._showToast(`Bought: ${def.name}`);
        closeAll();
      });
    });

    const closeBtn = this.add.text(cx, cy + 140, '[ESC or click] Close', {
      fontFamily: 'monospace', fontSize: '12px', color: '#64748b',
    }).setOrigin(0.5).setDepth(502).setScrollFactor(0).setInteractive();
    elements.push(closeBtn);
    closeBtn.on('pointerdown', closeAll);

    // Close on ESC
    const escHandler = this.input.keyboard.once('keydown-ESC', closeAll);
    elements.push({ destroy: () => { /* escHandler cleanup handled by once */ } });
  }

  _spawnTraps() {
    this._traps = [];
    for (const room of this.rooms) {
      if (room.type !== 'trap') continue;
      this._drawTrapRoomMarker(room);
      // Place spikes in a pattern across the room floor
      const tileW = this._tileW, tileH = this._tileH;
      for (let row = room.y + 1; row < room.y + room.h - 1; row++) {
        for (let col = room.x + 1; col < room.x + room.w - 1; col++) {
          if ((row + col) % 2 !== 0) continue;  // checkerboard pattern
          const tx = (col + 0.5) * tileW;
          const ty = (row + 0.5) * tileH;
          const g = this.add.graphics().setDepth(2).setPosition(tx, ty);
          const trap = { x: tx, y: ty, g, active: false, timer: TRAP_IDLE_MS * (0.4 + Math.random() * 0.6), radius: 18 };
          this._drawTrap(trap);
          this._traps.push(trap);
        }
      }
    }
  }

  _drawTrap(trap, warn = false) {
    const g = trap.g;
    g.clear();
    if (trap.active) {
      // Active spikes (dangerous) — bright red
      g.fillStyle(0xef4444, 1); g.fillRect(-7, -7, 14, 14);
      g.fillStyle(0xfca5a5, 0.8);
      g.fillTriangle(-6, 7, 0, -8, 6, 7);   // up spike
      g.fillTriangle(-8, -6, 7, 0, -8, 6);  // side spike
    } else if (warn) {
      // Warning (about to activate) — amber glow
      g.fillStyle(0xf59e0b, 0.7); g.fillRect(-5, -5, 10, 10);
    } else {
      // Dormant — subtle floor marking
      g.fillStyle(0x374151, 0.5); g.fillRect(-5, -5, 10, 10);
      g.lineStyle(1, 0x4b5563, 0.5);
      g.lineBetween(-5, 0, 5, 0); g.lineBetween(0, -5, 0, 5);
    }
  }

  _drawTreasureRoomMarker(room) {
    const g = this.add.graphics().setDepth(1);
    const tileW = this._tileW, tileH = this._tileH;
    // Gold-tinted overlay on floor tiles
    for (let row = room.y; row < room.y + room.h; row++) {
      for (let col = room.x; col < room.x + room.w; col++) {
        g.fillStyle(0xfbbf24, 0.07).fillRect(col * tileW, row * tileH, tileW - 1, tileH - 1);
      }
    }
    // Corner gems
    const corners = [
      [room.x, room.y], [room.x + room.w - 1, room.y],
      [room.x, room.y + room.h - 1], [room.x + room.w - 1, room.y + room.h - 1],
    ];
    for (const [c, r] of corners) {
      const wx = (c + 0.5) * tileW, wy = (r + 0.5) * tileH;
      g.fillStyle(0xfbbf24, 0.6).fillRect(wx - 4, wy - 4, 8, 8);
      g.fillStyle(0xfef08a, 0.8).fillRect(wx - 2, wy - 2, 4, 4);
    }
  }

  _drawTrapRoomMarker(room) {
    const g = this.add.graphics().setDepth(1);
    const tileW = this._tileW, tileH = this._tileH;
    // Red-tinted overlay on floor tiles
    for (let row = room.y; row < room.y + room.h; row++) {
      for (let col = room.x; col < room.x + room.w; col++) {
        g.fillStyle(0xef4444, 0.07).fillRect(col * tileW, row * tileH, tileW - 1, tileH - 1);
      }
    }
  }

  _nextLevel() {
    if (this._levelingUp || this._gameOver) return;
    this._levelingUp = true; // Block input
    this._saveGame();
    audioManager.playSfx('portal');
    this._logEvent(`Descending to floor ${this.dungeonLevel + 1}`);
    this.cameras.main.fadeOut(800, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      const nextPlayerState = this._serializePlayerState();
      nextPlayerState.x = null;
      nextPlayerState.y = null;
      this.scene.restart({
        isNewGame: false,
        level: this.dungeonLevel + 1,
        seed: this.seed,
        playerState: nextPlayerState,
        worldState: this._serializeWorldState(),
      });
    });
  }

  _randFloat() {
    return this._rng ? this._rng() : Math.random();
  }

  _randInt(min, max) {
    return min + Math.floor(this._randFloat() * (max - min + 1));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Core Systems (Player, Physics, Lighting)
  // ─────────────────────────────────────────────────────────────────────────────
  _hotbarTotalH() { return SLOT_SIZE + HOTBAR_PAD * 2 + 24; }

  _buildPlayerSprite() {
    const c = this.add.container(this.player.x, this.player.y).setDepth(10);
    const body = this.add.graphics().setName('body');
    body.fillStyle(0x000000, 0.35).fillEllipse(0, 30, 36, 12);
    body.fillStyle(0x3b1473, 1).fillRect(-10, 12, 8, 18).fillRect(2, 12, 8, 18);
    body.fillStyle(0x5b21b6, 1).fillRect(-13, -14, 26, 28);
    body.fillStyle(0x2e1065, 1).fillRect(-13, 6, 26, 5);
    body.fillStyle(0x7c3aed, 1).fillRect(-17, -14, 8, 8).fillRect(9, -14, 8, 8);
    body.fillStyle(0xfbbf24, 1).fillCircle(0, -26, 14);
    body.fillStyle(0x1e1b4b, 1).fillCircle(-5, -26, 3).fillCircle(5, -26, 3);
    const armor = this.add.graphics().setName('armor');
    const helmet = this.add.graphics().setName('helmet');
    const weapon = this.add.graphics().setName('weapon');
    this._drawArmorGfx(armor, helmet);
    this._drawWeaponGfx(weapon);
    c.add([body, armor, helmet, weapon]);
    return c;
  }

  _attachPhysics() {
    this.physics.add.existing(this._playerContainer);
    this._physBody = this._playerContainer.body;
    this._physBody.setDrag(PLAYER_DRAG, PLAYER_DRAG).setMaxVelocity(PLAYER_SPEED, PLAYER_SPEED).setSize(22, 28).setOffset(-11, -10);
    this.physics.add.collider(this._playerContainer, this._wallGroup);
  }

  _drawWeaponGfx(g) {
    g.clear();
    const item = this.player.equipment.main_hand;
    if (!item) return;
    if (item.type === 'weapon') {
      g.fillStyle(0xd1d5db, 1).fillRect(16, -32, 5, 42);
      g.fillStyle(0xca8a04, 1).fillRect(9, -12, 18, 6);
    } else if (item.type === 'tool') {
      g.fillStyle(0x92400e, 1).fillRect(15, -10, 5, 38);
      g.fillStyle(0x64748b, 1).fillRect(6, -28, 24, 10);
    }
  }

  _redrawWeapon() {
    const w = this._playerContainer.getByName('weapon');
    if (w) this._drawWeaponGfx(w);
    const armor = this._playerContainer.getByName('armor');
    const helmet = this._playerContainer.getByName('helmet');
    if (armor && helmet) this._drawArmorGfx(armor, helmet);
  }

  _drawArmorGfx(armor, helmet) {
    armor.clear();
    helmet.clear();
    if (this.player.equipment.chest) {
      const col = this.player.equipment.chest.rarity === 'epic' ? 0xa855f7 : 0x8b5cf6;
      armor.fillStyle(col, 0.9).fillRect(-14, -8, 28, 18);
      armor.lineStyle(2, 0xe9d5ff, 0.45).strokeRect(-14, -8, 28, 18);
    }
    if (this.player.equipment.head) {
      const col = this.player.equipment.head.rarity === 'rare' ? 0x60a5fa : 0x94a3b8;
      helmet.fillStyle(col, 0.95).fillRect(-12, -38, 24, 10);
      helmet.fillStyle(0x1f2937, 0.7).fillRect(-10, -31, 20, 4);
    }
  }

  _buildTorchTexture(radius) {
    const key = '__torch__';
    if (this.textures.exists(key)) this.textures.remove(key);
    const tex = this.textures.createCanvas(key, radius * 2, radius * 2);
    const ctx = tex.getContext();
    const grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
    grad.addColorStop(0, 'rgba(255,255,255,1.00)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.8, 'rgba(255,255,255,0.3)');
    grad.addColorStop(1, 'rgba(255,255,255,0.00)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, radius * 2, radius * 2);
    tex.refresh();
    return key;
  }

  _updateTorch(delta) {
    if (this._worldState?.difficulty === 'easy') {
      this._torchGlow.clear();
      this._darknessRT.clear();
      this._fogRT.clear();
      return;
    }
    this._flickerTime += delta;
    const px = this._playerContainer.x, py = this._playerContainer.y;
    
    // Sine wave flicker
    const flicker = Math.sin(this._flickerTime * 0.005) * 6 + Math.sin(this._flickerTime * 0.012) * 3;
    const currentRad = TORCH_RADIUS + flicker;
    
    this._torchGlow.clear()
      .fillStyle(0xff8c00, 0.07).fillCircle(px, py, currentRad * 1.15)
      .fillStyle(0xff7700, 0.04).fillCircle(px, py, currentRad * 0.6);

    this._darknessRT.clear().fill(0x000000, DARKNESS_ALPHA);
    
    // Erase darkness for current torch view
    this._darknessRT.erase(this._torchTexKey, px - TORCH_RADIUS, py - TORCH_RADIUS);
    
    // Permanently erase fog of war (uses same texture for soft edges)
    this._fogRT.erase(this._torchTexKey, px - TORCH_RADIUS, py - TORCH_RADIUS);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UI & Interaction
  // ─────────────────────────────────────────────────────────────────────────────
  _tryOpenNearbyChest() {
    const px = this.player.x, py = this.player.y;
    const chest = this._chests.find(c => !c.opened && c.isNearPlayer(px, py));
    if (!chest) return;
    const previewItem = chest.peekLoot(this.itemRegistry);
    if (this._isDuplicatePickup(previewItem)) {
      const msg = this._hasBetterItemFor(previewItem) ? 'Already have better gear' : `Already carrying ${previewItem.name}`;
      this._showToast(msg);
      audioManager.playSfx('full');
      return;
    }
    const itemDef = chest.tryOpen(this.player, this.itemRegistry);
    if (!itemDef) { this._showToast('Inventory full!'); audioManager.playSfx('full'); return; }
    
    const emptyHotbar = this.player.hotbar.findIndex(s => s === null);
    if (emptyHotbar !== -1) this.player.setHotbar(emptyHotbar, itemDef.id);
    this.player.gold += this._randInt(4, 12);
    if (chest.saveId && !this._worldState.openedChests.includes(chest.saveId)) this._worldState.openedChests.push(chest.saveId);
    this._playLootReveal(chest.x, chest.y, itemDef, emptyHotbar !== -1 ? emptyHotbar : this.activeSlot);
    this._refreshHotbar();
    this._updateHud();
    this._saveGame();
    this._spawnPickupParticles(chest.x, chest.y, RARITY_COLOR[itemDef.rarity] || RARITY_COLOR.common);
    audioManager.playSfx('chest');
    this._logEvent(`You found a ${itemDef.rarity} ${itemDef.name}`);
    this._showToast(`Found: ${itemDef.name}!`);
  }

  _playerOwnsItem(itemId) {
    if (this.player.inventory.some(slot => slot.item.id === itemId)) return true;
    return Object.values(this.player.equipment).some(item => item?.id === itemId);
  }

  _playerHasSpell(itemId) {
    return this._playerOwnsItem(itemId) || this.player.hotbar.includes(itemId);
  }

  _hasBetterItemFor(itemDef) {
    if (!itemDef?.slot) return false;
    const newVal = itemDef.value ?? 0;
    const equipped = this.player.equipment[itemDef.slot];
    if (equipped && (equipped.value ?? 0) >= newVal) return true;
    return this.player.inventory.some(s => s.item.slot === itemDef.slot && (s.item.value ?? 0) >= newVal);
  }

  _isDuplicatePickup(itemDef) {
    if (!itemDef) return false;
    if (itemDef.stackable) {
      // Block only if already at max stack
      if (itemDef.max_stack) {
        const slot = this.player.inventory.find(s => s.item.id === itemDef.id);
        return slot ? slot.quantity >= itemDef.max_stack : false;
      }
      return false;
    }
    if (this._playerOwnsItem(itemDef.id)) return true;
    return this._hasBetterItemFor(itemDef);
  }

  _clearActiveHotbarSlot() {
    if (this._levelIntroActive || this._paused || this._gameOver || this._levelingUp) return;
    if (!this.player.hotbar[this.activeSlot]) return;
    this.player.hotbar[this.activeSlot] = null;
    this._refreshHotbar();
    this._hideTooltip();
    this._saveGame();
    this._showToast(`Cleared slot ${this.activeSlot + 1}`);
  }

  _handleFKey() {
    const px = this.player.x;
    const py = this.player.y;
    const chestNearby = this._chests.find(c => !c.opened && c.isNearPlayer(px, py));
    if (chestNearby) {
      this._tryOpenNearbyChest();
      return;
    }
    const shopNearby = this._shopNpcs?.find(s => Math.hypot(s.x - px, s.y - py) < 72);
    if (shopNearby) {
      this._openShopUi(shopNearby);
      return;
    }
    this._castFireball();
  }

  _castFireball() {
    if (this._fireballCooldown > 0) return;
    this._fireballCooldown = FIREBALL_COOLDOWN;
    const ptr = this.input.activePointer;
    const targetX = ptr.worldX ?? ptr.x;
    const targetY = ptr.worldY ?? ptr.y;
    const angle = Math.atan2(targetY - this.player.y, targetX - this.player.x);
    const g = this.add.graphics().setDepth(12).setPosition(this.player.x, this.player.y);
    g.fillStyle(0xfb923c, 1).fillCircle(0, 0, 10);
    g.fillStyle(0xfef08a, 0.8).fillCircle(0, 0, 5);
    this._fireballs.push({
      g,
      x: this.player.x,
      y: this.player.y,
      vx: Math.cos(angle) * FIREBALL_SPEED,
      vy: Math.sin(angle) * FIREBALL_SPEED,
      life: 1100,
      active: true,
    });
    this._spawnPickupParticles(this.player.x, this.player.y, 0xfb923c);
  }

  _castLightningStrike() {
    if (!this._playerHasSpell('spell_lightning_strike') || this._lightningCooldown > 0) return;
    this._lightningCooldown = LIGHTNING_COOLDOWN;
    const originX = this.player.x;
    const originY = this.player.y;
    let hitAny = false;

    for (const enemy of this._enemies) {
      if (!enemy.isAlive) continue;
      const dist = Math.hypot(enemy.container.x - originX, enemy.container.y - originY);
      if (dist > LIGHTNING_RADIUS) continue;
      const dmg = Math.max(1, Math.ceil(enemy.hp * 0.5));
      hitAny = true;
      const bolt = this.add.graphics().setDepth(13);
      bolt.lineStyle(3, 0xfef08a, 0.95);
      bolt.lineBetween(enemy.container.x, enemy.container.y - 90, enemy.container.x, enemy.container.y + 8);
      this.tweens.add({ targets: bolt, alpha: 0, duration: 180, onComplete: () => bolt.destroy() });
      enemy.takeDamage(dmg, 0, 0);
      this._showDamageNumber(enemy.container.x, enemy.container.y - 30, dmg, false, true);
      this._spawnPickupParticles(enemy.container.x, enemy.container.y, 0xfde047);
    }

    if (hitAny) {
      audioManager.playSfx('hit');
      this._showToast('Lightning Strike');
      this.cameras.main.flash(130, 255, 245, 180, true);
    } else {
      this._showToast('No enemies nearby');
    }
  }

  _castVoidBall() {
    if (!this._playerHasSpell('spell_void_ball') || this._voidBallCooldown > 0) return;
    this._voidBallCooldown = VOID_BALL_COOLDOWN;
    const ptr = this.input.activePointer;
    const targetX = ptr.worldX ?? ptr.x;
    const targetY = ptr.worldY ?? ptr.y;
    const angle = Math.atan2(targetY - this.player.y, targetX - this.player.x);
    const g = this.add.graphics().setDepth(12).setPosition(this.player.x, this.player.y);
    g.fillStyle(0x0f172a, 1).fillCircle(0, 0, 14);
    g.lineStyle(2, 0x67e8f9, 0.95).strokeCircle(0, 0, 14);
    g.fillStyle(0x67e8f9, 0.35).fillCircle(0, 0, 7);
    this._voidBalls.push({
      g,
      x: this.player.x,
      y: this.player.y,
      vx: Math.cos(angle) * VOID_BALL_SPEED,
      vy: Math.sin(angle) * VOID_BALL_SPEED,
      life: 1400,
      active: true,
      hitIds: new Set(),
    });
    this._spawnPickupParticles(this.player.x, this.player.y, 0x67e8f9);
    this._showToast('Void Ball');
  }

  _buildHotbar(width, height) {
    const totalW = HOTBAR_SLOTS * SLOT_SIZE + (HOTBAR_SLOTS - 1) * SLOT_GAP + HOTBAR_PAD * 2;
    const totalH = SLOT_SIZE + HOTBAR_PAD * 2;
    this._hotbarStartX = (width - totalW) / 2;
    this._hotbarStartY = height - totalH - 14;

    const panel = this.add.graphics().setDepth(90).setScrollFactor(0);
    panel.fillStyle(0x060614, 0.93).fillRoundedRect(this._hotbarStartX - 4, this._hotbarStartY - 4, totalW + 8, totalH + 8, 14);
    panel.lineStyle(1, 0x1e1b4b, 1).strokeRoundedRect(this._hotbarStartX - 4, this._hotbarStartY - 4, totalW + 8, totalH + 8, 14);

    this._hotbarSlotData = [];
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      const sx = this._hotbarStartX + HOTBAR_PAD + i * (SLOT_SIZE + SLOT_GAP), sy = this._hotbarStartY + HOTBAR_PAD;
      const bg = this.add.graphics().setDepth(91).setScrollFactor(0);
      const icon = this.add.image(sx + SLOT_SIZE / 2, sy + SLOT_SIZE / 2 - 10, '__spark__').setDepth(93).setScrollFactor(0).setDisplaySize(24, 24).setVisible(false);
      const numLabel = this.add.text(sx + 6, sy + 5, `${i + 1}`, { fontFamily: 'monospace', fontSize: '10px', color: '#4b5563' }).setDepth(93).setScrollFactor(0);
      const itemLabel = this.add.text(sx + SLOT_SIZE / 2, sy + SLOT_SIZE / 2 + 4, '', { fontFamily: 'monospace', fontSize: '10px', color: '#e2e8f0', align: 'center', wordWrap: { width: SLOT_SIZE - 8 } }).setOrigin(0.5).setDepth(93).setScrollFactor(0);
      this._hotbarSlotData.push({ bg, icon, numLabel, itemLabel, sx, sy });
    }
    this._refreshHotbar();
  }

  _drawSlotBg(g, sx, sy, slotIndex) {
    g.clear();
    const itemId = this.player.hotbar[slotIndex];
    const item = itemId ? this.itemRegistry.get(itemId) : null;
    if (item) {
      const col = RARITY_COLOR[item.rarity] ?? RARITY_COLOR.common;
      if (item.rarity === 'rare' || item.rarity === 'epic') {
        g.fillStyle(col, item.rarity === 'epic' ? 0.16 : 0.1).fillRoundedRect(sx - 3, sy - 3, SLOT_SIZE + 6, SLOT_SIZE + 6, 10);
      }
      g.fillStyle(0x1a0f3a, 1).fillRoundedRect(sx, sy, SLOT_SIZE, SLOT_SIZE, 8);
      g.fillStyle(col, 0.28).fillRoundedRect(sx + 1, sy + SLOT_SIZE - 12, SLOT_SIZE - 2, 11, { tl: 0, tr: 0, bl: 7, br: 7 });
      g.lineStyle(1.5, col, 0.6).strokeRoundedRect(sx, sy, SLOT_SIZE, SLOT_SIZE, 8);
    } else {
      g.fillStyle(0x0c0c1e, 1).fillRoundedRect(sx, sy, SLOT_SIZE, SLOT_SIZE, 8);
      g.lineStyle(1, 0x1c1c3a, 1).strokeRoundedRect(sx, sy, SLOT_SIZE, SLOT_SIZE, 8);
    }
  }

  _refreshSlotLabel(labelText, i) {
    labelText.setText('');
  }

  _setActiveSlot(index, force = false) {
    if (index === this.activeSlot && !force) return;
    this.activeSlot = index;
    const g = this._activeGlowGfx.clear();
    const slot = this._hotbarSlotData[index];
    const { sx, sy } = slot;
    g.lineStyle(3, 0xffffff, 0.1).strokeRoundedRect(sx - 4, sy - 4, SLOT_SIZE + 8, SLOT_SIZE + 8, 10);
    g.lineStyle(2, 0xffffff, 1.0).strokeRoundedRect(sx, sy, SLOT_SIZE, SLOT_SIZE, 8);
    this.tweens.add({
      targets: [slot.icon, slot.itemLabel],
      scaleX: 1.12,
      scaleY: 1.12,
      duration: 90,
      yoyo: true,
    });
  }

  _refreshHotbar() {
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      this._drawSlotBg(this._hotbarSlotData[i].bg, this._hotbarSlotData[i].sx, this._hotbarSlotData[i].sy, i);
      this._refreshSlotLabel(this._hotbarSlotData[i].itemLabel, i);
      const itemId = this.player.hotbar[i];
      const item = itemId ? this.itemRegistry.get(itemId) : null;
      const icon = this._hotbarSlotData[i].icon;
      if (item) {
        const key = this.assetManager.ensureItemTexture(item, 36);
        icon.setTexture(key).setVisible(true);
      } else {
        icon.setVisible(false);
      }
    }
    this._setActiveSlot(this.activeSlot, true);
  }

  _onPointerDown(mx, my) {
    if (this._gameOver || this._levelingUp) return;
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      const { sx, sy } = this._hotbarSlotData[i];
      if (mx >= sx && mx <= sx + SLOT_SIZE && my >= sy && my <= sy + SLOT_SIZE) return this._equipFromHotbar(i);
    }
    if (this._attackCooldown > 0) {
      const now = this.time.now;
      this._attackBuffer = {
        x: mx,
        y: my,
        executeAt: now + Math.min(this._attackCooldown, INPUT_BUFFER_MS),
        discardAt: now + INPUT_BUFFER_MS,
      };
      return;
    }
    this._doAttack(mx, my);
  }

  _equipFromHotbar(slotIdx) {
    const itemId = this.player.hotbar[slotIdx];
    if (!itemId) return;
    const itemDef = this.itemRegistry.get(itemId);
    if (!itemDef) return;

    if (itemDef.type === 'spell') {
      this._setActiveSlot(slotIdx);
      this._showToast(`Press ${itemDef.use_key || '?'} to cast ${itemDef.name}`);
      return;
    }

    if (!itemDef.slot) {
      this._useConsumable(slotIdx, itemDef);
      return;
    }

    const displaced = this.player.equip(itemId);
    if (displaced === null && this.player.equipment[itemDef.slot]?.id !== itemId) return;
    this.player.hotbar[slotIdx] = displaced?.id ?? null;
    this._refreshHotbar();
    this._redrawWeapon();
    this._updateHud();
    this._saveGame();
    audioManager.playSfx('equip');
  }

  _useConsumable(slotIdx, itemDef) {
    if (itemDef.type !== 'consumable') return;

    const heal = itemDef.stats?.heal || 0;
    if (heal > 0) {
      this.player.hp = Math.min(this.player.effectiveMaxHp, this.player.hp + heal);
      this._showToast(`Recovered ${heal} HP`);
    }

    this.player.removeItem(itemDef.id, 1);
    const remaining = this.player.inventory.find(s => s.item.id === itemDef.id);
    if (!remaining) this.player.hotbar[slotIdx] = null;

    this._refreshHotbar();
    this._updateHud();
    this._saveGame();
    audioManager.playSfx('pickup');
  }

  _buildTooltip() {
    this._ttPanel = this.add.graphics().setDepth(95).setScrollFactor(0).setVisible(false);
    this._ttNameTxt = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '12px', color: '#ffffff' }).setDepth(96).setScrollFactor(0).setVisible(false);
    this._ttBodyTxt = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '10px', color: '#94a3b8', wordWrap: { width: 180 } }).setDepth(96).setScrollFactor(0).setVisible(false);
    this._ttLoreTxt = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '10px', color: '#c4b5fd', fontStyle: 'italic', wordWrap: { width: 180 } }).setDepth(96).setScrollFactor(0).setVisible(false);
    this._ttHoveredSlot = -1;
  }

  _updateTooltip() {
    const ptr = this.input.activePointer;
    let hovered = -1;
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      const { sx, sy } = this._hotbarSlotData[i];
      if (ptr.x >= sx && ptr.x <= sx + SLOT_SIZE && ptr.y >= sy && ptr.y <= sy + SLOT_SIZE && this.player.hotbar[i]) { hovered = i; break; }
    }
    if (hovered !== this._ttHoveredSlot) {
      this._ttHoveredSlot = hovered;
      hovered >= 0 ? this._showTooltip(hovered) : this._hideTooltip();
    }
  }

  _showTooltip(slotIdx) {
    const item = this.itemRegistry.get(this.player.hotbar[slotIdx]);
    if (!item) return;
    const { sx, sy } = this._hotbarSlotData[slotIdx];
    const colHex = '#' + (RARITY_COLOR[item.rarity] ?? RARITY_COLOR.common).toString(16).padStart(6, '0');
    
    this._ttNameTxt.setText(item.name).setColor(colHex);
    const statLines = Object.entries(item.stats || {}).map(([k, v]) => `  ${(STAT_LABEL[k]||k).padEnd(5)}  ${v>=0?'+':''}${v}`).join('\n');
    const spellHint = item.type === 'spell' ? `\nUse Key: ${item.use_key || '?'}` : '';
    this._ttBodyTxt.setText(`${item.type.toUpperCase()} · ${item.rarity}${spellHint}\n\n${item.description}\n${statLines ? '\n'+statLines : ''}`);
    this._ttLoreTxt.setText(item.lore ? item.lore : '');
    
    const loreH = item.lore ? this._ttLoreTxt.height + 14 : 0;
    const w = 210, h = 18 + this._ttBodyTxt.height + 28 + loreH;
    const tx = Phaser.Math.Clamp(sx + SLOT_SIZE/2 - w/2, 4, this.scale.width - w - 4), ty = sy - h - 8;
    
    this._ttPanel.clear().fillStyle(0x04040f, 0.97).fillRoundedRect(tx, ty, w, h, 8).lineStyle(1.5, RARITY_COLOR[item.rarity] || RARITY_COLOR.common, 0.85).strokeRoundedRect(tx, ty, w, h, 8);
    this._ttNameTxt.setPosition(tx + 10, ty + 8).setVisible(true);
    this._ttBodyTxt.setPosition(tx + 10, ty + 32).setVisible(true);
    this._ttLoreTxt.setPosition(tx + 10, ty + 38 + this._ttBodyTxt.height).setVisible(!!item.lore);
    this._ttPanel.setVisible(true);
  }

  _hideTooltip() { this._ttPanel.setVisible(false); this._ttNameTxt.setVisible(false); this._ttBodyTxt.setVisible(false); this._ttLoreTxt.setVisible(false); }

  _buildHud(width, height) {
    const pad = 14;
    this._hpBarContainer = this.add.container(0, 0).setDepth(110).setScrollFactor(0);
    this._hpTrack = this.add.graphics().fillStyle(0x0f172a, 1).fillRoundedRect(pad, pad, 200, 20, 5).lineStyle(1, 0x334155, 1).strokeRoundedRect(pad, pad, 200, 20, 5);
    this._hpFill = this.add.graphics();
    this._hpText = this.add.text(pad + 6, pad + 3, '', { fontFamily: 'monospace', fontSize: '11px', color: '#f1f5f9' });
    this._hpBarContainer.add([this._hpTrack, this._hpFill, this._hpText]);

    this._lvlText = this.add.text(pad, pad + 26, '', { fontFamily: 'monospace', fontSize: '12px', color: '#a78bfa' }).setDepth(112).setScrollFactor(0);
    this._statText = this.add.text(pad, pad + 44, '', { fontFamily: 'monospace', fontSize: '10px', color: '#6b7280' }).setDepth(112).setScrollFactor(0);
    
    // Level display
    this._floorText = this.add.text(width / 2, 14, `FLOOR ${this.dungeonLevel}`, { fontFamily: 'monospace', fontSize: '16px', color: '#a855f7', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5, 0).setDepth(112).setScrollFactor(0);

    this._equipTxt = this.add.text(width - pad, pad, '', { fontFamily: 'monospace', fontSize: '11px', color: '#9ca3af', align: 'right' }).setOrigin(1, 0).setDepth(112).setScrollFactor(0);
    this._updateHud();
  }

  _updateHud() {
    const p = this.player;
    const ratio = p.hp / p.effectiveMaxHp;
    const col = ratio > 0.5 ? 0x16a34a : ratio > 0.25 ? 0xca8a04 : 0xdc2626;
    this._hpFill.clear().fillStyle(col, 1);
    if (ratio > 0) this._hpFill.fillRoundedRect(14, 14, Math.max(200 * ratio, 4), 20, 5);
    
    this._hpText.setText(`HP  ${p.hp} / ${p.effectiveMaxHp}`);
    this._lvlText.setText(`${p.name}  Lv.${p.level}  [XP: ${p.xp}/${p.xpToNext}]`);
    this._statText.setText(`ATK ${p.attack}   DEF ${p.defense}   GOLD ${p.gold}`);
    this._equipTxt.setText(Object.entries(p.equipment).map(([k, v]) => `${k.padEnd(10)}  ${v?.name ?? '—'}`).join('\n'));
  }

  _buildLootLog(width, height) {
    this._lootLines = [];
    this._lootPanel = this.add.graphics().setDepth(111).setScrollFactor(0);
    this._lootPanel.fillStyle(0x050814, 0.84).fillRoundedRect(width - 246, 80, 226, 190, 10).lineStyle(1, 0x22304d, 1).strokeRoundedRect(width - 246, 80, 226, 190, 10);
    this._lootTitle = this.add.text(width - 233, 90, 'Loot Log', { fontFamily: 'monospace', fontSize: '12px', color: '#f8fafc' }).setDepth(112).setScrollFactor(0);
    this._lootText = this.add.text(width - 233, 112, '', { fontFamily: 'monospace', fontSize: '10px', color: '#93c5fd', wordWrap: { width: 200 } }).setDepth(112).setScrollFactor(0);
  }

  _logEvent(msg) {
    if (!this._lootLines) return;
    this._lootLines.unshift(`[${this.dungeonLevel}] ${msg}`);
    this._lootLines = this._lootLines.slice(0, 10);
    this._lootText.setText(this._lootLines.join('\n'));
  }

  _buildPerformancePanel(width) {
    this._perfText = this.add.text(width - 16, 12, '', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#86efac',
      align: 'right',
    }).setOrigin(1, 0).setDepth(150).setScrollFactor(0).setVisible(!!this._worldState.performanceVisible);
  }

  _updatePerformancePanel() {
    if (!this._perfText) return;
    this._perfText.setVisible(!!this._worldState.performanceVisible);
    if (!this._worldState.performanceVisible) return;
    const fps = this.game.loop.actualFps?.toFixed(0) || '0';
    const heap = performance?.memory?.usedJSHeapSize ? `${Math.round(performance.memory.usedJSHeapSize / 1048576)} MB` : 'n/a';
    this._perfText.setText(`FPS ${fps}\nMEM ${heap}`);
  }

  _updateEpicTrail(delta) {
    this._epicTrailTimer += delta;
    const epicEquipped = Object.values(this.player.equipment).some(item => item?.rarity === 'epic');
    if (!epicEquipped || this._epicTrailTimer < 240) return;
    this._epicTrailTimer = 0;
    this._spawnPickupParticles(this.player.x + this._randInt(-8, 8), this.player.y + this._randInt(-10, 10), 0xa855f7);
  }

  _togglePauseMenu() {
    if (this._gameOver || this._levelingUp || this._levelIntroActive) return;
    this._paused ? this._closePauseMenu() : this._openPauseMenu();
  }

  _openPauseMenu() {
    this._paused = true;
    this.physics.world.pause();
    const { width, height } = this.scale;
    const cx = width / 2;
    const panelY = height / 2 - 150;
    const overlay = this.add.graphics().setDepth(500).setScrollFactor(0);
    overlay.fillStyle(0x000000, 0.72).fillRect(0, 0, width, height);
    const panel = this.add.graphics().setDepth(501).setScrollFactor(0);
    panel.fillStyle(0x090b16, 0.96).fillRoundedRect(cx - 170, panelY, 340, 320, 16).lineStyle(2, 0x7c3aed, 0.9).strokeRoundedRect(cx - 170, panelY, 340, 320, 16);
    const title = this.add.text(cx, panelY + 28, 'PAUSED', { fontFamily: 'monospace', fontSize: '28px', color: '#f8fafc' }).setOrigin(0.5).setDepth(502).setScrollFactor(0);
    const sub = this.add.text(cx, panelY + 58, `Seed ${this.seed} · Floor ${this.dungeonLevel}`, { fontFamily: 'monospace', fontSize: '11px', color: '#a5b4fc' }).setOrigin(0.5).setDepth(502).setScrollFactor(0);

    const buttons = [
      { label: 'Resume', onClick: () => this._closePauseMenu() },
      { label: audioManager.enabled ? 'Sound: On' : 'Sound: Off', onClick: () => { audioManager.toggleMuted(); this._closePauseMenu(); this._openPauseMenu(); } },
      { label: this._worldState.performanceVisible ? 'Performance: On' : 'Performance: Off', onClick: () => { this._worldState.performanceVisible = !this._worldState.performanceVisible; this._closePauseMenu(); this._openPauseMenu(); } },
      { label: 'Share Seed', onClick: () => this._shareSeed() },
      { label: 'Quit To Menu', onClick: () => { this._saveGame(); this.scene.start('MenuScene'); } },
    ];
    this._pauseUi = [overlay, panel, title, sub];
    buttons.forEach((button, idx) => {
      const y = panelY + 112 + idx * 42;
      const bg = this.add.graphics().setDepth(502).setScrollFactor(0);
      const draw = (hover) => bg.clear().fillStyle(hover ? 0x6d28d9 : 0x312e81, 1).fillRoundedRect(cx - 120, y, 240, 32, 8);
      draw(false);
      const txt = this.add.text(cx, y + 16, button.label, { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff' }).setOrigin(0.5).setDepth(503).setScrollFactor(0);
      txt.setInteractive({ useHandCursor: true }).on('pointerover', () => draw(true)).on('pointerout', () => draw(false)).on('pointerdown', button.onClick);
      this._pauseUi.push(bg, txt);
    });
  }

  _closePauseMenu() {
    this._paused = false;
    this.physics.world.resume();
    for (const node of this._pauseUi) node?.destroy?.();
    this._pauseUi = [];
  }

  _shareSeed() {
    const url = `${window.location.origin}${window.location.pathname}?seed=${this.seed}`;
    navigator.clipboard?.writeText(url);
    this._showToast('Seed URL copied');
    this._logEvent(`Share seed copied: ${this.seed}`);
  }

  _openDebugConsole() {
    const input = window.prompt('Debug command', '/spawn potion_health');
    if (!input) return;
    const [command, arg] = input.trim().split(/\s+/);
    if (command === '/spawn' && arg) {
      const item = this.itemRegistry.get(arg);
      if (!item) return this._showToast(`Unknown item: ${arg}`);
      this.player.addItem(item, 1);
      const emptySlot = this.player.hotbar.findIndex(s => s === null);
      if (emptySlot !== -1) this.player.setHotbar(emptySlot, item.id);
      this._refreshHotbar();
      this._saveGame();
      this._logEvent(`Debug spawned ${item.name}`);
      return this._showToast(`Spawned ${item.name}`);
    }
    if (command === '/god') {
      this._worldState.godMode = !this._worldState.godMode;
      this._saveGame();
      this._logEvent(`God mode ${this._worldState.godMode ? 'enabled' : 'disabled'}`);
      return this._showToast(`God mode ${this._worldState.godMode ? 'ON' : 'OFF'}`);
    }
    if (command === '/next') {
      this._nextLevel();
      return;
    }
    this._showToast('Unknown debug command');
  }

  _showFatalError(message) {
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, width, height, 0x040404, 1);
    this.add.text(width / 2, height / 2 - 18, 'LOAD ERROR', {
      fontFamily: 'monospace',
      fontSize: '26px',
      color: '#ef4444',
    }).setOrigin(0.5);
    this.add.text(width / 2, height / 2 + 18, message, {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#e5e7eb',
      wordWrap: { width: width - 80 },
      align: 'center',
    }).setOrigin(0.5);
  }

  _buildVignette(width, height) {
    this._vignette = this.add.graphics().setDepth(140).setScrollFactor(0);
    for (let i = 0; i < 7; i++) {
      this._vignette.lineStyle(24, 0x000000, 0.05);
      this._vignette.strokeRect(i * 2, i * 2, width - i * 4, height - i * 4);
    }
  }

  _startDust() {
    this._dustEvent = this.time.addEvent({
      delay: 1400,
      loop: true,
      callback: () => {
        const y = this._randInt(24, this.scale.height - this._hotbarTotalH() - 24);
        const x = this._randFloat() > 0.5 ? -20 : this.scale.width + 20;
        const txt = this.add.text(x, y, '·', {
          fontFamily: 'monospace',
          fontSize: '18px',
          color: '#cbd5e1',
        }).setDepth(19).setAlpha(0.12);
        this.tweens.add({
          targets: txt,
          x: x < 0 ? this.scale.width + 24 : -24,
          alpha: 0,
          duration: 7000 + this._randInt(0, 2000),
          onComplete: () => txt.destroy(),
        });
      },
    });
  }

  _saveHighScore() {
    const current = {
      floor: this.dungeonLevel,
      level: this.player.level,
      gold: this.player.gold,
      timestamp: Date.now(),
    };
    let scores = [];
    try {
      scores = JSON.parse(localStorage.getItem(HIGH_SCORE_KEY) || '[]');
    } catch {
      scores = [];
    }
    scores.push(current);
    scores.sort((a, b) => b.floor - a.floor || b.level - a.level || b.gold - a.gold);
    localStorage.setItem(HIGH_SCORE_KEY, JSON.stringify(scores.slice(0, 5)));
    return scores[0];
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Combat & Experience
  // ─────────────────────────────────────────────────────────────────────────────
  _doAttack(mx, my, fromBuffer = false) {
    if (this._attackCooldown > 0 && !fromBuffer) return;
    const weapon = this.player.equipment.main_hand;
    if (!weapon) { this._showToast('Equip a weapon first!'); return; }
    
    this._attackCooldown = ATTACK_COOLDOWN;
    audioManager.playSfx('attack');

    const worldX = mx + this.cameras.main.scrollX, worldY = my + this.cameras.main.scrollY;
    const px = this.player.x, py = this.player.y;
    const atkAngle = Math.atan2(worldY - py, worldX - px);
    this._drawSwingArc(px, py, atkAngle);

    if (weapon.type === 'tool') this._tryMineWall(worldX, worldY, weapon);

    const dmg = Math.max(1, Math.round((weapon.stats?.attack || 0) + this.player.baseAttack * 0.4));
    let didHit = false;

    for (const enemy of this._enemies) {
      if (!enemy.isAlive) continue;
      const ex = enemy.container.x, ey = enemy.container.y;
      const dist = Math.hypot(ex - px, ey - py);
      if (dist > SWING_RANGE) continue;

      let diff = Math.abs(Math.atan2(ey - py, ex - px) - atkAngle);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff > (SWING_ARC_DEG * Math.PI) / 180) continue;

      enemy.takeDamage(dmg, ((ex - px)/dist) * KNOCKBACK_FORCE, ((ey - py)/dist) * KNOCKBACK_FORCE);
      this._showDamageNumber(ex, ey - 24, dmg, false, dmg >= 18);
      audioManager.playSfx('hit');
      didHit = true;
    }
    if (didHit) this.cameras.main.shake(120, 0.005);
  }

  _drawSwingArc(px, py, angle) {
    const arcRad = (SWING_ARC_DEG * Math.PI) / 180;
    const weapon = this.player.equipment.main_hand;
    const color = weapon?.particle_color ? Number(`0x${weapon.particle_color.replace('#', '')}`) : 0xffffff;
    const g = this.add.graphics().setDepth(11);
    g.fillStyle(color, 0.16).beginPath().moveTo(px, py).arc(px, py, SWING_RANGE, angle - arcRad, angle + arcRad, false).closePath().fillPath();
    this.tweens.add({ targets: g, alpha: 0, duration: 230, onComplete: () => g.destroy() });
  }

  _tryMineWall(worldX, worldY, tool) {
    const miningPower = tool.stats?.mining_power || 0;
    if (miningPower <= 0) return;
    const col = Math.floor(worldX / this._tileW);
    const row = Math.floor(worldY / this._tileH);
    const key = `${col},${row}`;
    const wall = this._wallTileMap.get(key);
    if (!wall) return;
    const dist = Math.hypot(worldX - this.player.x, worldY - this.player.y);
    if (dist > this._tileW * 1.7) return;
    if (!this.mapManager.carve(col, row)) return;

    if (wall.wallId && !this._worldState.brokenWalls.includes(wall.wallId)) {
      this._worldState.brokenWalls.push(wall.wallId);
    }
    wall.wall.destroy();
    wall.body.destroy();
    this._wallTileMap.delete(key);
    this._drawFloorTile(col, row);
    this._saveGame();
    this._logEvent(`Wall broken with ${tool.name}`);
    this._showToast('Wall broken');
  }

  _playerTakeDamage(amount) {
    if (this._iframes > 0 || this._gameOver || this._worldState?.godMode) return;
    const mitigated = Math.max(1, amount - Math.floor(this.player.defense * 0.6));
    this.player.hp = Math.max(0, this.player.hp - mitigated);
    this._iframes = IFRAMES_DURATION;
    
    audioManager.playSfx('hurt');
    this.cameras.main.flash(90, 255, 0, 0, true);
    this.cameras.main.shake(220, 0.011);
    this._showDamageNumber(this.player.x, this.player.y - 38, mitigated, true);
    this._updateHud();

    if (this.player.hp <= 0) this._triggerGameOver();
    else this._saveGame();
  }

  _giveXp(amount) {
    const oldLevel = this.player.level;
    this.player.gainXp(amount);
    this._updateHud();
    
    if (this.player.level > oldLevel) {
      this._saveGame();
      this._showLevelUpChoice();
    }
  }

  _showLevelUpChoice() {
    this._levelingUp = true;
    audioManager.playSfx('levelup');
    this._logEvent(`Level ${this.player.level} reached`);
    
    const { width, height } = this.scale;
    const cx = width / 2, cy = height / 2;

    const overlay = this.add.graphics().setDepth(400).setScrollFactor(0);
    overlay.fillStyle(0x000000, 0.85).fillRect(0, 0, width, height);
    
    const title = this.add.text(cx, cy - 80, 'LEVEL UP!', { fontFamily: 'monospace', fontSize: '32px', color: '#fbbf24', stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5).setDepth(401).setScrollFactor(0);
    const subtitle = this.add.text(cx, cy - 40, 'Choose a stat bonus:', { fontFamily: 'monospace', fontSize: '14px', color: '#e2e8f0' }).setOrigin(0.5).setDepth(401).setScrollFactor(0);

    const choices = [
      { text: '+5 Max HP', apply: () => { this.player.maxHp += 5; this.player.hp += 5; } },
      { text: '+2 Attack', apply: () => { this.player.baseAttack += 2; } },
      { text: '+1 Defense', apply: () => { this.player.baseDefense += 1; } }
    ];

    const btns = [];
    choices.forEach((c, i) => {
      const y = cy + i * 50;
      const btnBg = this.add.graphics().setDepth(401).setScrollFactor(0);
      
      const drawBtn = (hover) => {
        btnBg.clear().fillStyle(hover ? 0x6d28d9 : 0x7c3aed, 1).fillRoundedRect(cx - 100, y - 20, 200, 40, 8);
      };
      drawBtn(false);

      const txt = this.add.text(cx, y, c.text, { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff' }).setOrigin(0.5).setDepth(402).setScrollFactor(0);
      txt.setInteractive({ useHandCursor: true })
         .on('pointerover', () => drawBtn(true))
         .on('pointerout', () => drawBtn(false))
         .on('pointerdown', () => {
           c.apply();
           overlay.destroy();
           btns.forEach(b => { b.bg.destroy(); b.txt.destroy(); });
           title.destroy();
           subtitle.destroy();
           this._levelingUp = false;
           this._updateHud();
           this._saveGame();
         });
         
      btns.push({ bg: btnBg, txt: txt });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Visuals & Game Over
  // ─────────────────────────────────────────────────────────────────────────────
  _buildParticleTexture() {
    const key = '__spark__';
    if (this.textures.exists(key)) this.textures.remove(key);
    const tex = this.textures.createCanvas(key, 8, 8);
    const ctx = tex.getContext();
    const grad = ctx.createRadialGradient(4, 4, 0, 4, 4, 4);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 8, 8);
    tex.refresh();
  }

  _spawnPickupParticles(x, y, rarityHex) {
    const emitter = this.add.particles(x, y, '__spark__', {
      speed: { min: 55, max: 195 }, angle: { min: 0, max: 360 }, scale: { start: 0.9, end: 0 },
      alpha: { start: 1, end: 0 }, lifespan: 650, gravityY: 90, tint: rarityHex, emitting: false,
    }).setDepth(18);
    emitter.explode(22, x, y);
    this.time.delayedCall(750, () => emitter.destroy());
  }

  _spawnDeathParticles(x, y, type) {
    const col = type === 'slime'    ? 0x22cc44
              : type === 'mage'     ? 0xa855f7
              : type === 'archer'   ? 0xd97706
              : type === 'bomber'   ? 0xf97316
              : type === 'boss'     ? 0x7c3aed
              : 0xe2e8f0;
    this._spawnPickupParticles(x, y, col);
    if (type === 'bomber' || type === 'boss') {
      // Extra burst
      this._spawnPickupParticles(x, y, 0xfbbf24);
    }
  }

  _showDamageNumber(x, y, amount, isPlayer, isCrit = false) {
    const txt = this.add.text(x, y, `${isPlayer ? '-' : ''}${amount}`, {
      fontFamily: 'monospace', fontSize: isPlayer ? '16px' : '13px', color: isPlayer ? '#ef4444' : (isCrit ? '#fbbf24' : '#fde68a'), stroke: '#000000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(22);
    this.tweens.add({ targets: txt, y: y - 44, alpha: 0, duration: 870, onComplete: () => txt.destroy() });
  }

  _spawnWorldItem(x, y, itemDef) {
    if (this._isDuplicatePickup(itemDef)) return;
    const col = RARITY_COLOR[itemDef.rarity] ?? RARITY_COLOR.common;
    const iconKey = this.assetManager.ensureItemTexture(itemDef, 28);
    const g = this.add.graphics().setDepth(6).fillStyle(col, 0.1).fillCircle(x, y, 22).fillStyle(col, 0.45).fillCircle(x, y, 9).fillStyle(0xffffff, 0.85).fillCircle(x, y, 4);
    const icon = this.add.image(x, y, iconKey).setDepth(7).setDisplaySize(18, 18);
    const label = this.add.text(x, y - 20, itemDef.name, { fontFamily: 'monospace', fontSize: '9px', color: '#' + col.toString(16).padStart(6, '0'), stroke: '#000000', strokeThickness: 2 }).setOrigin(0.5).setDepth(32);
    this.tweens.add({ targets: label, y: y - 30, duration: 1100, yoyo: true, repeat: -1 });
    this.tweens.add({ targets: g, alpha: { from: 0.7, to: 1 }, duration: 700, yoyo: true, repeat: -1 });
    this._worldItems.push({ x, y, itemDef, g, icon, label, collected: false });
  }

  _collectWorldItem(wi) {
    wi.collected = true;
    this.tweens.killTweensOf(wi.g); this.tweens.killTweensOf(wi.label);
    wi.g.destroy(); wi.icon?.destroy(); wi.label.destroy();
    if (this._isDuplicatePickup(wi.itemDef)) {
      const msg = this._hasBetterItemFor(wi.itemDef) ? 'Already have better gear' : `Already carrying ${wi.itemDef.name}`;
      this._showToast(msg);
      return;
    }
    if (!this.player.addItem(wi.itemDef, 1)) return this._showToast('Inventory full!');
    const emptySlot = this.player.hotbar.findIndex(s => s === null);
    if (emptySlot !== -1) this.player.setHotbar(emptySlot, wi.itemDef.id);
    this._refreshHotbar();
    this._saveGame();
    this._spawnPickupParticles(wi.x, wi.y, RARITY_COLOR[wi.itemDef.rarity] || RARITY_COLOR.common);
    audioManager.playSfx('pickup');
    this._logEvent(`Picked up ${wi.itemDef.name}`);
    this._showToast(`Picked up: ${wi.itemDef.name}`);
  }

  _showToast(msg) {
    if (this._levelIntroActive) return;
    this._toastText.setPosition(this.scale.width / 2, this.scale.height - this._hotbarTotalH() - 20).setText(msg).setAlpha(1);
  }

  _openLevelIntro() {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2 + 28;
    this._levelIntroActive = true;
    this._levelIntroEndsAt = this.time.now + LEVEL_INTRO_MS;

    const spellSummary = ['Fireball [F]'];
    if (this._playerHasSpell('spell_lightning_strike')) spellSummary.push('Lightning Strike [R]');
    if (this._playerHasSpell('spell_void_ball')) spellSummary.push('Void Ball [E]');

    const loadout = [
      `Weapon: ${this.player.equipment.main_hand?.name ?? 'None'}`,
      `Chest: ${this.player.equipment.chest?.name ?? 'None'}`,
      `Head: ${this.player.equipment.head?.name ?? 'None'}`,
      `Spells: ${spellSummary.join(', ')}`,
      `Hotbar: ${this.player.hotbar.map(id => this.itemRegistry.get(id)?.name || 'Empty').join(' | ')}`,
    ].join('\n');

    const overlay = this.add.graphics().setDepth(450).setScrollFactor(0);
    overlay.fillStyle(0x000000, 0.94).fillRect(0, 0, width, height);
    const panel = this.add.graphics().setDepth(451).setScrollFactor(0);
    panel.fillStyle(0x070b16, 0.98).fillRoundedRect(cx - 270, cy - 168, 540, 336, 14).lineStyle(2, 0x7c3aed, 0.9).strokeRoundedRect(cx - 270, cy - 168, 540, 336, 14);
    const title = this.add.text(cx, cy - 124, `FLOOR ${this.dungeonLevel}`, { fontFamily: 'monospace', fontSize: '30px', color: '#f8fafc' }).setOrigin(0.5).setDepth(452).setScrollFactor(0);
    const sub = this.add.text(cx, cy - 90, 'Look over your loadout before the floor goes live.', { fontFamily: 'monospace', fontSize: '12px', color: '#c4b5fd' }).setOrigin(0.5).setDepth(452).setScrollFactor(0);
    const body = this.add.text(cx, cy - 18, loadout, {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#cbd5e1',
      align: 'center',
      lineSpacing: 8,
      wordWrap: { width: 470 },
    }).setOrigin(0.5).setDepth(452).setScrollFactor(0);
    const timerText = this.add.text(cx, cy + 102, '', { fontFamily: 'monospace', fontSize: '16px', color: '#fde68a' }).setOrigin(0.5).setDepth(452).setScrollFactor(0);
    const skipBg = this.add.graphics().setDepth(452).setScrollFactor(0);
    const drawSkip = (hover) => skipBg.clear().fillStyle(hover ? 0x6d28d9 : 0x312e81, 1).fillRoundedRect(cx - 90, cy + 124, 180, 40, 8);
    drawSkip(false);
    const skipLabel = this.add.text(cx, cy + 144, 'Skip Countdown', { fontFamily: 'monospace', fontSize: '15px', color: '#ffffff' }).setOrigin(0.5).setDepth(453).setScrollFactor(0);
    skipLabel.setInteractive({ useHandCursor: true })
      .on('pointerover', () => drawSkip(true))
      .on('pointerout', () => drawSkip(false))
      .on('pointerdown', () => this._closeLevelIntro());

    this._levelIntroUi = [overlay, panel, title, sub, body, timerText, skipBg, skipLabel];
    this._levelIntroTimerText = timerText;
    this._hideTooltip();
    this._toastText.setAlpha(0);
    this._updateLevelIntroTimer();
  }

  _updateLevelIntroTimer() {
    if (!this._levelIntroActive || !this._levelIntroTimerText) return;
    const remainingMs = Math.max(0, this._levelIntroEndsAt - this.time.now);
    const seconds = Math.ceil(remainingMs / 1000);
    this._levelIntroTimerText.setText(`Starting in ${seconds}s`);
    if (remainingMs <= 0) this._closeLevelIntro();
  }

  _closeLevelIntro() {
    if (!this._levelIntroActive) return;
    this._levelIntroActive = false;
    this._levelIntroEndsAt = 0;
    for (const node of this._levelIntroUi || []) node?.destroy?.();
    this._levelIntroUi = [];
    this._levelIntroTimerText = null;
  }

  _playLootReveal(x, y, itemDef, slotIndex) {
    const key = this.assetManager.ensureItemTexture(itemDef, 32);
    const beam = this.add.graphics().setDepth(40);
    beam.fillStyle(0xffffff, 0.18).fillRect(x - 8, y - 64, 16, 60);
    const icon = this.add.image(x, y - 22, key).setDisplaySize(26, 26).setDepth(41);
    const target = this._hotbarSlotData?.[Math.max(0, slotIndex)] || this._hotbarSlotData?.[0];
    this.tweens.add({
      targets: icon,
      y: y - 56,
      duration: 180,
      yoyo: true,
      onComplete: () => {
        this.tweens.add({
          targets: icon,
          x: target.sx + SLOT_SIZE / 2,
          y: target.sy + SLOT_SIZE / 2 - 10,
          scaleX: 0.5,
          scaleY: 0.5,
          alpha: 0.2,
          duration: 320,
          onComplete: () => icon.destroy(),
        });
      },
    });
    this.tweens.add({ targets: beam, alpha: 0, duration: 520, onComplete: () => beam.destroy() });
  }

  _triggerGameOver() {
    if (this._gameOver) return;
    this._gameOver = true;
    this._autosaveEvent?.remove(false);
    this._dustEvent?.remove(false);
    for (const e of this._enemies) if (!e.dead && e._physBody) e._physBody.setVelocity(0, 0);
    this._physBody.setVelocity(0, 0).setAcceleration(0, 0);
    this.cameras.main.flash(600, 220, 0, 0, false);
    const bestScore = this._saveHighScore();
    
    // Clear save on death
    removeSave();
    
    this.time.delayedCall(700, () => {
      const { width, height } = this.scale;
      const cx = width / 2, cy = height / 2;
      this.add.graphics().setDepth(300).setScrollFactor(0).fillStyle(0x000000, 0.78).fillRect(0, 0, width, height);
      
      const pW = 360, pH = 260, pX = cx - pW/2, pY = cy - pH/2;
      this.add.graphics().setDepth(301).setScrollFactor(0).fillStyle(0x080817, 0.98).fillRoundedRect(pX, pY, pW, pH, 16).lineStyle(2, 0x7c3aed, 0.85).strokeRoundedRect(pX, pY, pW, pH, 16);
      
      this.add.text(cx, pY + 46, 'GAME OVER', { fontFamily: 'monospace', fontSize: '34px', color: '#dc2626', stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5).setDepth(302).setScrollFactor(0);
      this.add.text(cx, pY + 102, `Floor ${this.dungeonLevel} · Lv.${this.player.level}`, { fontFamily: 'monospace', fontSize: '13px', color: '#9ca3af' }).setOrigin(0.5).setDepth(302).setScrollFactor(0);
      this.add.text(cx, pY + 126, `Gold ${this.player.gold} · Best Floor ${bestScore?.floor || this.dungeonLevel}`, { fontFamily: 'monospace', fontSize: '12px', color: '#fbbf24' }).setOrigin(0.5).setDepth(302).setScrollFactor(0);
      
      // Menu Button
      const btnW = 160, btnH = 44, btnX = cx - btnW/2, btnY = pY + pH - 76;
      const btnBg = this.add.graphics().setDepth(302).setScrollFactor(0);
      const drawBtn = (hover) => { btnBg.clear().fillStyle(hover ? 0x6d28d9 : 0x7c3aed, 1).fillRoundedRect(btnX, btnY, btnW, btnH, 9); };
      drawBtn(false);
      
      const btnTxt = this.add.text(cx, btnY + btnH/2, 'Main Menu', { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff' }).setOrigin(0.5).setDepth(303).setScrollFactor(0);
      btnTxt.setInteractive({ useHandCursor: true }).on('pointerover', () => drawBtn(true)).on('pointerout', () => drawBtn(false)).on('pointerdown', () => this.scene.start('MenuScene'));
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────────────────────
const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 1280,
  height: 720,
  backgroundColor: '#0d0d1a',
  pixelArt: true,
  roundPixels: true,
  physics: { default: 'arcade', arcade: { gravity: { y: 0 }, debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, MenuScene, InstructionsScene, MainScene],
};

new Phaser.Game(config);
