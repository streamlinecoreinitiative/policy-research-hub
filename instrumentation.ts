/**
 * Next.js Instrumentation — runs once on server startup.
 * Auto-starts the scheduler so it doesn't require a manual API hit.
 */
export async function register() {
  // Only run on the server (not edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initScheduler } = await import('@/lib/scheduler');
    console.log('[instrumentation] Auto-starting scheduler on server boot...');
    await initScheduler();
    console.log('[instrumentation] Scheduler initialized.');
  }
}
