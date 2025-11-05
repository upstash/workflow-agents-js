import type { WorkflowContext } from "@upstash/workflow";

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

export const isDisabledWorkflowContext = (context: WorkflowContext & ({ disabled: true } | {disabled?: never})) => {
  return "disabled" in context && context.disabled;
};
