process.env.NODE_ENV ??= 'test'
// Fixed test-only signing secret so every suite stays hermetic; never use it outside tests.
process.env.JWT_SECRET ??= 'vitest-only-secret-0123456789abcdef0123456789abcdef'
// Force every test file onto an isolated in-memory PGlite database. Assigned, not
// defaulted, so a DATABASE_URL inherited from the shell can never leak into tests.
process.env.DATABASE_TYPE = 'pglite'
process.env.DATABASE_URL = 'memory://'
