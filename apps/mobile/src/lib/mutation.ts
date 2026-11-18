import type { MutateOptions, UseMutationResult } from '@tanstack/react-query';

/**
 * Stamps idempotency keys (ids, timestamps) onto a mutation's variables when the caller calls `mutate`,
 * never inside `mutationFn`: a retry or a resumed offline mutation re-runs `mutationFn` with the SAME
 * variables, so the server sees the same id and never grants twice.
 */
export function withKeys<TData, TError, TVars extends object, TKeys extends Partial<TVars>, TContext>(
  m: UseMutationResult<TData, TError, TVars, TContext>,
  keys: () => TKeys,
) {
  type Input = Omit<TVars, keyof TKeys> & Partial<TKeys>;
  const stamp = (v: Input) => ({ ...keys(), ...v }) as unknown as TVars;
  return {
    ...m,
    mutate: (v: Input, o?: MutateOptions<TData, TError, TVars, TContext>) => m.mutate(stamp(v), o),
    mutateAsync: (v: Input, o?: MutateOptions<TData, TError, TVars, TContext>) => m.mutateAsync(stamp(v), o),
  };
}
