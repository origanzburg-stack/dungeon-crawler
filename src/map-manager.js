import { generateDungeon, MAP_COLS, MAP_ROWS } from './mapgen.js';

export class MapManager {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.layout = generateDungeon(this.seed);
  }

  get map() {
    return this.layout.map;
  }

  get rooms() {
    return this.layout.rooms;
  }

  isWall(col, row) {
    if (row < 0 || row >= MAP_ROWS || col < 0 || col >= MAP_COLS) return true;
    return this.layout.map[row][col] === 1;
  }

  carve(col, row) {
    if (row < 0 || row >= MAP_ROWS || col < 0 || col >= MAP_COLS) return false;
    if (this.layout.map[row][col] !== 1) return false;
    this.layout.map[row][col] = 0;
    return true;
  }
}

export { MAP_COLS, MAP_ROWS };
