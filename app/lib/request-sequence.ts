// Invalidate every response started before navigation, logout or a mutation.
// This is a request counter, so cleanup intentionally increments its latest value.
export function invalidateSequence(sequence: { current: number }) {
  sequence.current++;
}
