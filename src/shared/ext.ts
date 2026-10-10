// Firefox provides the promise-based `browser` namespace. Chrome's MV3 `chrome` namespace returns promises too, so
// both are used the same way and typed with @types/chrome. Read from globalThis so importing this outside an
// extension (unit tests) doesn't throw.
const globals = globalThis as { browser?: typeof chrome; chrome?: typeof chrome }

export const ext = (globals.browser ?? globals.chrome) as typeof chrome
