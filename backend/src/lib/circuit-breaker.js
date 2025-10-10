export class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = Number(options.failureThreshold || 5);
    this.resetTimeoutMs = Number(options.resetTimeoutMs || 30000);
    this.state = 'closed';
    this.failureCount = 0;
    this.nextAttemptAt = 0;
  }

  canExecute() {
    if (this.state === 'open') {
      if (Date.now() >= this.nextAttemptAt) {
        this.state = 'half-open';
        return true;
      }
      return false;
    }
    return true;
  }

  success() {
    this.failureCount = 0;
    this.state = 'closed';
  }

  failure() {
    this.failureCount += 1;
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
      this.nextAttemptAt = Date.now() + this.resetTimeoutMs;
    }
  }
}
