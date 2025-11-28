export type Handler = (payload: any, meta: { jobId: string }) => Promise<void>;

const handlers: Record<string, Handler> = {
  sendEmail: async (payload, { jobId }) => {
    console.log(`[handler sendEmail] job=${jobId} to=${payload?.to}`);
    await new Promise((r) => setTimeout(r, 300));
    // Place for real email integration
  },

  // Testing handler: fails until payload.failUntil attempts reached
  failOnce: async (payload: any, { jobId }) => {
    payload._failCount = (payload._failCount || 0) + 1;
    console.log(`[handler failOnce] job=${jobId} attempt=${payload._failCount}`);
    if (payload._failCount < (payload.failUntil || 2)) {
      throw new Error('simulated failure (failOnce)');
    }
  }
};

export function getHandler(type: string): Handler | undefined {
  return handlers[type];
}
