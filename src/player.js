/**
 * player.js — Pure data model; no Phaser dependency.
 *
 * Responsibilities:
 *  - Track hp, position (x/y), and base stats
 *  - Manage a 10-slot inventory (array of { item, quantity })
 *  - Manage equipment slots (head, chest, main_hand)
 *  - Provide helpers for inventory mutation and hotbar assignment
 *
 * Items are represented as plain objects whose shape is defined by items.json.
 * The Player never holds a reference to the JSON cache; the scene passes item
 * definitions in from its itemRegistry Map.
 */
export class Player {
  constructor(config = {}) {
    // ── Identity ────────────────────────────────────────────────────────────
    this.name     = config.name  ?? 'Hero';
    this.level    = 1;
    this.xp       = 0;
    this.xpToNext = 100;
    this.gold     = 0;

    // ── Base stats ──────────────────────────────────────────────────────────
    this.maxHp       = 100;
    this.hp          = this.maxHp;
    this.baseAttack  = 5;
    this.baseDefense = 2;
    this.speed       = config.speed ?? 200;   // px/s (used by physics in scene)

    // ── World position (owned by player; synced from physics body in scene) ─
    this.x = config.x ?? 0;
    this.y = config.y ?? 0;

    // ── Equipment: three slots as specified (head, chest, main_hand/weapon) ─
    // Each value is either null or a full item-definition object from items.json.
    this.equipment = {
      head:      null,
      chest:     null,
      main_hand: null,   // "weapon" slot; matches the "slot" field in items.json
    };

    // ── Inventory: max 10 slots, each entry is { item: itemDef, quantity: n } ─
    this.inventory         = [];
    this.maxInventorySlots = 10;

    // ── Hotbar: 8 item IDs pointing into inventory (null = empty) ────────────
    this.hotbar = Array(8).fill(null);
  }

  // ── Derived stats (base + equipment bonuses) ─────────────────────────────

  get attack()         { return this.baseAttack  + this._sumEquipStat('attack');  }
  get defense()        { return this.baseDefense + this._sumEquipStat('defense'); }
  get effectiveMaxHp() { return this.maxHp       + this._sumEquipStat('max_hp');  }

  /** Sum a stat across all equipped items. */
  _sumEquipStat(stat) {
    let total = 0;
    for (const item of Object.values(this.equipment)) {
      if (item?.stats?.[stat]) total += item.stats[stat];
    }
    return total;
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  /**
   * Add an item definition to inventory.
   * Stackable items (flagged in items.json) increase an existing stack's quantity.
   * Returns true on success, false if all 10 slots are occupied.
   */
  addItem(itemDef, quantity = 1) {
    if (itemDef.stackable) {
      const existing = this.inventory.find(s => s.item.id === itemDef.id);
      if (existing) {
        const cap = itemDef.max_stack ?? Infinity;
        if (existing.quantity >= cap) return false;
        existing.quantity = Math.min(existing.quantity + quantity, cap);
        return true;
      }
    }
    if (this.inventory.length >= this.maxInventorySlots) return false;
    this.inventory.push({ item: itemDef, quantity });
    return true;
  }

  /** Remove `quantity` of an item by id. Returns true if found. */
  removeItem(itemId, quantity = 1) {
    const idx = this.inventory.findIndex(s => s.item.id === itemId);
    if (idx === -1) return false;
    const slot = this.inventory[idx];
    slot.quantity -= quantity;
    if (slot.quantity <= 0) this.inventory.splice(idx, 1);
    return true;
  }

  /**
   * Give the player an item looked up from the scene's itemRegistry by id.
   * This is the preferred one-call API used by the pickup system:
   *
   *   const given = player.giveItem(this.itemRegistry, 'pickaxe_bronze');
   *   // → item def on success, null if unknown id or inventory full
   *
   * Internally calls loadItem() (module-level) then addItem().
   */
  giveItem(registry, id) {
    const itemDef = loadItem(registry, id);
    if (!itemDef) return null;
    return this.addItem(itemDef) ? itemDef : null;
  }

  // ── Equipment ─────────────────────────────────────────────────────────────

  /**
   * Move an item from inventory into its equipment slot.
   * The item's "slot" field (from items.json) must match a key in this.equipment.
   * Any previously equipped item in that slot is swapped back to inventory.
   * Returns the displaced item def, or null.
   */
  equip(itemId) {
    const invSlot = this.inventory.find(s => s.item.id === itemId);
    if (!invSlot) return null;

    const item      = invSlot.item;
    const slotKey   = item.slot;                         // e.g. "main_hand", "head"
    if (!slotKey || !(slotKey in this.equipment)) return null;

    const previous        = this.equipment[slotKey];    // what was there before
    this.equipment[slotKey] = item;
    this.removeItem(itemId, 1);
    if (previous) this.addItem(previous, 1);             // put old item back
    return previous;
  }

  /** Move equipped item in `slotKey` back to inventory. */
  unequip(slotKey) {
    const item = this.equipment[slotKey];
    if (!item || this.inventory.length >= this.maxInventorySlots) return false;
    this.equipment[slotKey] = null;
    this.addItem(item, 1);
    return true;
  }

  // ── Hotbar ────────────────────────────────────────────────────────────────

  /** Assign an inventory item id to a hotbar slot (0-4). */
  setHotbar(index, itemId) {
    if (index >= 0 && index < this.hotbar.length) this.hotbar[index] = itemId;
  }

  /** Return the inventory slot entry for hotbar index, or null if empty. */
  getHotbarItem(index) {
    const id = this.hotbar[index];
    if (!id) return null;
    return this.inventory.find(s => s.item.id === id) ?? null;
  }

  // ── XP / levelling ────────────────────────────────────────────────────────

  gainXp(amount) {
    this.xp += amount;
    while (this.xp >= this.xpToNext) {
      this.xp       -= this.xpToNext;
      this.xpToNext  = Math.floor(this.xpToNext * 1.5);
      this.level++;
      this.maxHp      += 10;
      this.hp          = Math.min(this.hp + 10, this.effectiveMaxHp);
      this.baseAttack  += 2;
      this.baseDefense += 1;
    }
  }

  // ── Debug ─────────────────────────────────────────────────────────────────

  summary() {
    return {
      name:      this.name,
      level:     this.level,
      gold:      this.gold,
      hp:        `${this.hp}/${this.effectiveMaxHp}`,
      attack:    this.attack,
      defense:   this.defense,
      equipment: Object.fromEntries(
        Object.entries(this.equipment).map(([k, v]) => [k, v?.name ?? '—'])
      ),
      inventory: this.inventory.map(s => `${s.item.name} ×${s.quantity}`),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility — used by player.giveItem() and by the scene's pickup handler.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Look up a single item definition from the scene's item registry.
 * The registry is a Map built from items.json: Map<id:string, itemDef:object>.
 *
 * @param   {Map<string, object>} registry - built in MainScene.create()
 * @param   {string}              id       - the item's "id" field from items.json
 * @returns {object|null}
 */
export function loadItem(registry, id) {
  return registry.get(id) ?? null;
}
