export async function ingestionBatches() {
  return ['test-one', 'test-two', 'test-three'];
}
export async function ingestSource(source: string) {
  // Real batches complete in separate network turns. Let an erroneous
  // intermediate list invalidation become observable in browser tests.
  await new Promise((resolve) => setTimeout(resolve, 100));
  return { source, status: 'complete' as const, count: 2 };
}
export async function finishIngestion() {
  return { ok: true };
}
