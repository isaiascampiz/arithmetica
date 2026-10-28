import { repository } from './repository';
import { runDueJobs } from './reports';
const runtime = globalThis as typeof globalThis & { centerJobs?: ReturnType<typeof setInterval> };
export function startJobs() {
  if (runtime.centerJobs) return;
  const tick = () =>
    repository
      .transaction((db) => runDueJobs(db))
      .catch((e) =>
        console.error('Arithmetica scheduled jobs need attention:', (e as Error).message),
      );
  void tick();
  runtime.centerJobs = setInterval(() => void tick(), 60000);
  runtime.centerJobs.unref();
}
