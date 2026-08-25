/**
 * Cross-cutting types only.
 *
 * Feature-owned types live in `@/features/<module>/types` and must NOT be
 * re-exported here — shared code may not depend on a feature.
 */
export * from './auth';
export * from './domain';
export * from './inertia';
export * from './navigation';
export * from './subscriptions';
