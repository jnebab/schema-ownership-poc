// Small helpers shared by the MFEs. No rules live here: the rules are the BFF's schemas, compiled in.
import type { FieldValues, Resolver, UseFormSetError, Path } from 'react-hook-form'

// The resolver that runs a BFF schema in the browser. It speaks the Standard Schema spec (which zod
// implements), so form code never depends on which validation library the BFF chose.
export { standardSchemaResolver as schemaResolver } from '@hookform/resolvers/standard-schema'

/** The BFF's error shape on a 422, the same for every endpoint. */
export type Issue = { path: string, message: string }

/** After a 422 on submit (rare: bypassed browser, private rule, drift), put the BFF's messages on the right inputs. */
export function applyIssues<T extends FieldValues> (setError: UseFormSetError<T>, issues: Issue[]) {
  for (const { path, message } of issues) setError(path as Path<T>, { type: 'bff', message })
}

/** Wraps a resolver to report how long each validation took (what the user feels). */
export function timed<T extends FieldValues> (resolver: Resolver<T>, report: (ms: number) => void): Resolver<T> {
  return async (values, context, options) => {
    const started = performance.now()
    try { return await resolver(values, context, options) } finally { report(Math.round(performance.now() - started)) }
  }
}
