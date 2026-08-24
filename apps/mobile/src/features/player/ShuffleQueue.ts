export type RandomSource = () => number;

export class ShuffleQueue<T extends { id: string }> {
  private current?: T;
  private history: T[] = [];
  private queue: T[] = [];
  private readonly tracks: T[];

  constructor(
    tracks: readonly T[],
    private readonly random: RandomSource = Math.random
  ) {
    this.tracks = [...tracks];
    this.refillQueue();
  }

  getCurrent() {
    return this.current;
  }

  next() {
    if (this.tracks.length === 0) {
      return undefined;
    }

    if (this.queue.length === 0) {
      this.refillQueue();
    }

    const nextTrack = this.queue.shift();
    if (!nextTrack) {
      return undefined;
    }

    if (this.current) {
      this.history.push(this.current);
    }
    this.current = nextTrack;
    return nextTrack;
  }

  previous() {
    const previousTrack = this.history.pop();
    if (!previousTrack) {
      return this.current;
    }

    this.current = previousTrack;
    return previousTrack;
  }

  private refillQueue() {
    this.queue = shuffle(this.tracks, this.random);
    this.avoidImmediateRepeat();
  }

  private avoidImmediateRepeat() {
    if (!this.current || this.queue.length < 2) {
      return;
    }

    if (this.queue[0]?.id !== this.current.id) {
      return;
    }

    const swapIndex = this.queue.findIndex((track) => track.id !== this.current?.id);
    if (swapIndex > 0) {
      [this.queue[0], this.queue[swapIndex]] = [this.queue[swapIndex], this.queue[0]];
    }
  }
}

function shuffle<T>(items: readonly T[], random: RandomSource) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}
