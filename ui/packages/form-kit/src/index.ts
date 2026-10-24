// The ONLY validation code in the UI repo, and it contains no rules. It knows how to ask for them:
//   contractResolver: run the BFF's downloaded schema in the browser ("downloaded" mode)
//   serverResolver:   send the form to the BFF and show what it says ("server" mode)
// Both return a react-hook-form Resolver, so switching modes is one line in a form.
import type { FieldErrors, FieldValues, Resolver, UseFormSetError, Path } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import type { StandardSchemaV1 } from '@standard-schema/spec'

export type Issue = { path: string, message: string }
export type Mode = 'downloaded' | 'server'

export function currentMode (): Mode {
  return new URLSearchParams(location.search).get('validation') === 'server' ? 'server' : 'downloaded'
}

/** Turns the BFF's flat issues ("bankDetails.accountNumber") into react-hook-form's nested error object. */
export function toFieldErrors<T extends FieldValues> (issues: Issue[]): FieldErrors<T> {
  const errors: Record<string, unknown> = {}
  for (const { path, message } of issues) {
    const keys = path.split('.')
    let node = errors
    keys.forEach((key, i) => {
      if (i === keys.length - 1) node[key] ??= { type: 'bff', message }
      else node = (node[key] ??= {}) as Record<string, unknown>
    })
  }
  return errors as FieldErrors<T>
}

/** After a 422 on submit: put the BFF's messages on the right inputs. */
export function applyIssues<T extends FieldValues> (setError: UseFormSetError<T>, issues: Issue[]) {
  for (const { path, message } of issues) setError(path as Path<T>, { type: 'bff', message })
}

/**
 * "Downloaded" mode. The schema is whatever the BFF currently serves at /contracts/v1. It's a Standard Schema
 * (zod implements the spec), so the UI never imports zod itself. If the download fails, client checks are
 * skipped and the BFF's 422 on submit still shows every error.
 */
export function contractResolver<T extends FieldValues> (load: () => Promise<StandardSchemaV1>): Resolver<T> {
  const schema = load().catch(err => { console.warn('contracts unavailable, relying on the BFF', err); return null })
  return async (values, context, options) => {
    const s = await schema
    if (!s) return { values, errors: {} }
    return standardSchemaResolver(s as StandardSchemaV1<T>)(values, context, options as never) as ReturnType<Resolver<T>>
  }
}

/** "Server" mode. No schema in the browser at all; the BFF validates and answers with field errors. */
export function serverResolver<T extends FieldValues> (url: string): Resolver<T> {
  return async values => {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(values) })
      if (!res.ok) return { values, errors: {} } // BFF unhappy or down: don't block typing; submit will tell
      const { issues } = await res.json() as { issues: Issue[] }
      return issues.length ? { values: {}, errors: toFieldErrors<T>(issues) } : { values, errors: {} }
    } catch {
      return { values, errors: {} }
    }
  }
}

/** Wraps a resolver to report how long each validation took (the latency the user feels). */
export function timed<T extends FieldValues> (resolver: Resolver<T>, report: (ms: number) => void): Resolver<T> {
  return async (values, context, options) => {
    const started = performance.now()
    try { return await resolver(values, context, options) } finally { report(Math.round(performance.now() - started)) }
  }
}
