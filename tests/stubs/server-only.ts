// `server-only` is a build-time guard: importing it from a Client Component
// makes the bundler fail. It has no runtime behaviour, and its package entry
// is resolvable only through Next's bundler conditions — under plain Vitest it
// throws "Cannot find package 'server-only'".
//
// Aliased to this empty module in vitest.config.ts and
// vitest.integration.config.ts so server-only modules (credential decryption,
// event dispatch, the AI key resolver) stay testable without dropping the
// guard that keeps them off the client.
export {};
