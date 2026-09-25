process.env.NODE_ENV ??= 'test'
// Fixed test-only signing secret so every suite stays hermetic; never use it outside tests.
process.env.JWT_SECRET ??= 'vitest-only-secret-0123456789abcdef0123456789abcdef'
