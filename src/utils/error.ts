import { WorkflowAbort, type WorkflowContext } from "@upstash/workflow";

function getConstructorName(obj: unknown): string | null {
  if (obj === null || obj === undefined) {
    return null;
  }
  const ctor = obj.constructor;
  if (!ctor || ctor.name === "Object") {
    return null;
  }
  return ctor.name;
}

function getConstructorNames(obj: unknown): string[] {
  const proto = Object.getPrototypeOf(obj);
  const name = getConstructorName(proto);
  if (name === null) {
    return [];
  }
  return [name, ...getConstructorNames(proto)];
}

export function isInstanceOf<T>(
  v: unknown,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctor: new (...args: any[]) => T
): v is T {
  return getConstructorNames(v).includes(ctor.name);
}

/**
 * `name` of every WorkflowAbort in @upstash/workflow. Each subclass reassigns
 * `this.name`, so checking for "WorkflowAbort" alone misses all four of them.
 *
 * Keep in sync with the error classes in @upstash/workflow when it adds a new
 * WorkflowAbort subclass.
 */
const WORKFLOW_ABORT_NAMES = new Set([
  "WorkflowAbort",
  "WorkflowAuthError",
  "WorkflowCancelAbort",
  "WorkflowNonRetryableError",
  "WorkflowRetryAfterError",
]);

/**
 * Whether an error is an expected workflow suspend rather than a real failure.
 *
 * `isInstanceOf` compares constructor names, which a bundler rewrites — so a
 * suspend from a minified build falls through it. `name` is assigned a string
 * literal in each constructor, so it survives minification; we check it first
 * and keep `isInstanceOf` as the fallback for any subclass not listed above.
 */
export const isWorkflowAbort = (error: unknown): error is WorkflowAbort =>
  error instanceof Error &&
  (WORKFLOW_ABORT_NAMES.has(error.name) || isInstanceOf(error, WorkflowAbort));

export const isDisabledWorkflowContext = (context: WorkflowContext & ({ disabled: true } | {disabled?: never})) => {
  return "disabled" in context && context.disabled;
};
