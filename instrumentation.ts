export async function register() {
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.ENABLE_SCHEDULER === 'true' &&
    process.env.ARITHMETICA_BUILD !== 'true' &&
    process.env.CENTERFLOW_BUILD !== 'true'
  ) {
    const { startJobs } = await import('./src/lib/jobs');
    startJobs();
  }
}
