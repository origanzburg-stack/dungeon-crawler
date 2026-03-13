# The JSON Crawler

A Phaser-based dungeon crawler with procedural floors, persistent progression, hotbar/equipment systems, fog of war, save/continue, loot logging, pause/debug tools, and seeded dungeon sharing.

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start the local server:

```bash
npm run dev
```

3. Open `http://localhost:4173`.

## Build

```bash
npm run build
```

The build output is written to `dist/`.

## Controls

- `WASD` or arrow keys: move
- Mouse click: attack / interact with hotbar slots
- `1-5`: select hotbar slots
- `F`: open nearby chest
- `Esc`: pause menu
- `` ` ``: debug console

## Debug commands

- `/spawn <item_id>`: add an item from `assets/data/items.json`
- `/god`: toggle invincibility
- `/next`: skip to the next floor

## Save system

- The game auto-saves to `localStorage`
- `Continue` resumes the last run
- Shared seeds work via URLs like `index.html?seed=12345`
