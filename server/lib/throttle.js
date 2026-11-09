import { sleep } from './common.js';

// Kayan pencere: herhangi bir `windowMs` aralığında en fazla `limit` istek geçirir.
// API-Football'un dakikalık limiti aşılırsa hesabı askıya alabildiği için istekler bundan önce burada bekletilir.
export class Throttle {
  constructor(limit, windowMs = 60e3) {
    this.limit = Math.max(1, limit);
    this.windowMs = windowMs;
    this.times = [];
  }

  setLimit(limit) {
    this.limit = Math.max(1, limit);
  }

  async wait() {
    for (;;) {
      const now = Date.now();
      this.times = this.times.filter((t) => now - t < this.windowMs);
      if (this.times.length < this.limit) {
        this.times.push(now);
        return;
      }
      await sleep(this.times[0] + this.windowMs - now + 20);
    }
  }
}
