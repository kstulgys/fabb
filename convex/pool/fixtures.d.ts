// Vite/Vitest `?raw` imports: load a file's contents as a string at build time.
// Used by the pool parser tests to read recorded HTML fixtures without any
// filesystem access (which the Convex/edge test runtime does not provide).
declare module "*?raw" {
  const content: string;
  export default content;
}
