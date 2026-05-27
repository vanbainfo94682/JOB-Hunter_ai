export class AsyncQueue {
  private queue: (() => Promise<void>)[] = [];
  private isProcessing = false;

  async enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try { 
          resolve(await task()); 
        }
        catch (err) { 
          reject(err); 
        }
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        try {
          await task();
        } catch (e) {
          console.error("Queue task failed:", e);
        }
      }
    }
    this.isProcessing = false;
  }
}

// Global singleton instance for Playwright tasks (concurrency = 1)
export const playwrightQueue = new AsyncQueue();
