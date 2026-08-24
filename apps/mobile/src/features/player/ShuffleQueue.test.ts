import { describe, expect, it } from "vitest";
import { ShuffleQueue } from "./ShuffleQueue";

const tracks = [
  { id: "a" },
  { id: "b" },
  { id: "c" }
];

describe("ShuffleQueue", () => {
  it("plays every track once before reshuffling", () => {
    const queue = new ShuffleQueue(tracks, fixedRandom(0.9));

    const firstRound = [queue.next(), queue.next(), queue.next()].map(
      (track) => track?.id
    );
    const secondRoundFirst = queue.next()?.id;

    expect(new Set(firstRound)).toEqual(new Set(["a", "b", "c"]));
    expect(firstRound).toHaveLength(3);
    expect(secondRoundFirst).toBeDefined();
  });

  it("plays 100 tracks without repeats in one round", () => {
    const hundredTracks = Array.from({ length: 100 }, (_, index) => ({
      id: `track-${index + 1}`
    }));
    const queue = new ShuffleQueue(hundredTracks, fixedRandom(0.37));

    const round = Array.from({ length: 100 }, () => queue.next()?.id);

    expect(new Set(round).size).toBe(100);
    expect(round).not.toContain(undefined);
  });

  it("uses history for previous instead of drawing a new random track", () => {
    const queue = new ShuffleQueue(tracks, fixedRandom(0));
    const first = queue.next();
    const second = queue.next();

    expect(queue.previous()).toBe(first);
    expect(queue.getCurrent()).toBe(first);
    expect(second).toBeDefined();
  });

  it("avoids an immediate repeat when a new round starts", () => {
    const queue = new ShuffleQueue(tracks, fixedRandom(0));
    const firstRound = [queue.next(), queue.next(), queue.next()];
    const nextRoundFirst = queue.next();

    expect(nextRoundFirst?.id).not.toBe(firstRound[2]?.id);
  });
});

function fixedRandom(value: number) {
  return () => value;
}
