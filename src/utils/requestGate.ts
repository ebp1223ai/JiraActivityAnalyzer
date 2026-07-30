export function createRequestGate() {
  let current = 0;
  return {
    next() {
      current += 1;
      return current;
    },
    isCurrent(requestId: number) {
      return requestId === current;
    },
    invalidate() {
      current += 1;
      return current;
    },
    current() {
      return current;
    }
  };
}
