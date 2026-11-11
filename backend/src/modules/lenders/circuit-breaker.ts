export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  halfOpenSuccessThreshold?: number;
  maxHalfOpenConcurrent?: number;
}

export interface CircuitPermit {
  allowed: boolean;
  epoch: number;
  state: CircuitState;
  recordSuccess: () => void;
  recordFailure: () => void;
  release: () => void;
}

const NOOP = (): void => undefined;

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private nextAttemptAt = 0;
  private halfOpenInFlight = 0;
  private epoch = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenSuccessThreshold: number;
  private readonly maxHalfOpenConcurrent: number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30000;
    this.halfOpenSuccessThreshold = options.halfOpenSuccessThreshold ?? 2;
    this.maxHalfOpenConcurrent = Math.max(1, options.maxHalfOpenConcurrent ?? 1);
  }

  getState(): CircuitState {
    if (this.state === 'OPEN' && Date.now() >= this.nextAttemptAt) {
      this.state = 'HALF_OPEN';
      this.successCount = 0;
      this.halfOpenInFlight = 0;
      this.epoch += 1;
    }
    return this.state;
  }

  canExecute(): boolean {
    const currentState = this.getState();
    if (currentState === 'CLOSED') {
      return true;
    }
    if (currentState === 'HALF_OPEN') {
      return this.halfOpenInFlight < this.maxHalfOpenConcurrent;
    }
    return false;
  }

  /**
   * Reserves execution permission atomically. In HALF_OPEN state at most
   * `maxHalfOpenConcurrent` trial probes are admitted concurrently; every
   * caller receives an epoch-bound permit whose release() is idempotent.
   */
  tryAcquire(): CircuitPermit {
    const currentState = this.getState();
    if (currentState === 'OPEN') {
      return {
        allowed: false,
        epoch: this.epoch,
        state: 'OPEN',
        recordSuccess: NOOP,
        recordFailure: NOOP,
        release: NOOP,
      };
    }

    if (currentState === 'HALF_OPEN') {
      if (this.halfOpenInFlight >= this.maxHalfOpenConcurrent) {
        return {
          allowed: false,
          epoch: this.epoch,
          state: 'HALF_OPEN',
          recordSuccess: NOOP,
          recordFailure: NOOP,
          release: NOOP,
        };
      }
      this.halfOpenInFlight += 1;
    }

    const acquiredEpoch = this.epoch;
    const isHalfOpenPermit = currentState === 'HALF_OPEN';
    let released = false;
    let settled = false;

    const release = (): void => {
      if (released) return;
      released = true;
      if (isHalfOpenPermit && this.halfOpenInFlight > 0) {
        this.halfOpenInFlight -= 1;
      }
    };

    return {
      allowed: true,
      epoch: acquiredEpoch,
      state: currentState,
      release,
      recordSuccess: (): void => {
        if (settled) return;
        settled = true;
        release();
        this.recordSuccess(acquiredEpoch);
      },
      recordFailure: (): void => {
        if (settled) return;
        settled = true;
        release();
        this.recordFailure(acquiredEpoch);
      },
    };
  }

  recordSuccess(expectedEpoch?: number): void {
    const currentState = this.getState();
    if (expectedEpoch !== undefined && expectedEpoch !== this.epoch) {
      return;
    }
    if (currentState === 'HALF_OPEN') {
      this.successCount += 1;
      if (this.successCount >= this.halfOpenSuccessThreshold) {
        this.reset();
      }
    } else if (currentState === 'CLOSED') {
      this.failureCount = 0;
    }
  }

  recordFailure(expectedEpoch?: number): void {
    const currentState = this.getState();
    if (expectedEpoch !== undefined && expectedEpoch !== this.epoch) {
      return;
    }
    if (currentState === 'OPEN') {
      return;
    }

    this.failureCount += 1;
    if (currentState === 'HALF_OPEN' || this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttemptAt = Date.now() + this.resetTimeoutMs;
      this.successCount = 0;
      this.halfOpenInFlight = 0;
      this.epoch += 1;
    }
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttemptAt = 0;
    this.halfOpenInFlight = 0;
    this.epoch += 1;
  }
}

