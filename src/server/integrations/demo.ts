import "server-only";

/**
 * Demo adapter. It never contacts a platform. Publishing in a demo workspace
 * ends in the `simulated` state, and the UI always says nothing was posted.
 */
export type SimulatedPublish = { outcome: "simulated"; note: string };

export function simulatePublish(): SimulatedPublish {
  return { outcome: "simulated", note: "Demo workspace: nothing was sent to any social platform." };
}

/** Deterministic PRNG (mulberry32) so demo data is reproducible per workspace. */
export function seededRandom(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let state = h >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
