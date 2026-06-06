/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface JournalEntry {
  day: number;
  date: string;
  quote: string;
  content: string;
  starX: number; // custom visual coordinates for constellation rendering
  starY: number;
  constellationId: number; // group into distinct visual constellations
  starSize: number; // visual radius
}

export interface AppState {
  targetName: string;
  entries: JournalEntry[];
  activeView: 'dedication' | 'main' | 'archives';
}
