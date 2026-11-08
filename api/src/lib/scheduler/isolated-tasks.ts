/** Run independently while preserving one failed scheduled-event outcome. */
export async function runScheduledTasks(tasks: { stage: string; run: () => Promise<unknown> }[]) {
  let failures = 0;
  for (const task of tasks) {
    const started = Date.now();
    try { await task.run(); }
    catch {
      failures++;
      console.error(JSON.stringify({ event: "scheduled_task_failed", stage: task.stage,
        errorCode: "task_failed", durationMs: Date.now() - started }));
    }
  }
  if (failures) throw new Error(`scheduled_tasks_failed:${failures}`);
}
