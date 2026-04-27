export async function runConcurrent(
  count: number,
  concurrency: number,
  fn: (index: number) => Promise<void>,
): Promise<void> {
  const limit = Number.isFinite(concurrency) ? Math.max(1, concurrency) : 1;
  if (limit <= 1) {
    for (let i = 0; i < count; i++) await fn(i);
    return;
  }

  let next = 0;
  async function worker(): Promise<void> {
    while (next < count) {
      const i = next++;
      await fn(i);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, count) }, () => worker()));
}
