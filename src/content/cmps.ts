// Known consent tools ("CMPs"): how to spot each one's banner and which button rejects
// everything. The entries live in data/cmps.json; this file gives them their type.
//
// Selectors drift as vendors ship updates. Fixes and new CMPs are very welcome as PRs.
import cmps from "./data/cmps.json" with { type: "json" };

export interface Cmp {
  name: string;
  /** Selector for the banner or dialog; it must be visible for the entry to apply. */
  detect: string;
  /** Buttons that reject everything, tried in order. */
  reject: string[];
  /** The "manage preferences" route, for banners without a reject button. */
  settings?: string;
  panel?: string;
  save?: string[];
  /** Host element whose open shadow root contains the banner. */
  shadowHost?: string;
}

export const CMPS: readonly Cmp[] = cmps;
