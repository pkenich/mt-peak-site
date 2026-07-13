/* ESM loader hooks: replace '@neondatabase/serverless' with a mock whose
   neon() returns globalThis.__MOCK_SQL__, so API handlers run their real
   code against a fake DB. Catches ReferenceErrors, destructuring mismatches,
   bad response shapes — the class of bug that browser-stubbed tests miss. */
export async function resolve(specifier, context, next) {
  if (specifier === '@neondatabase/serverless')
    return { url: 'mock:neon', shortCircuit: true };
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url === 'mock:neon')
    return { format: 'module', shortCircuit: true,
      source: 'export function neon(){ return globalThis.__MOCK_SQL__; }' };
  return next(url, context);
}
