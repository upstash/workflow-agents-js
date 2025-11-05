import { WorkflowContext } from "@upstash/workflow";

const NANOID_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";
const NANOID_LENGTH = 21;

function getRandomInt() {
  return Math.floor(Math.random() * NANOID_CHARS.length);
}

export function nanoid() {
  return Array.from({ length: NANOID_LENGTH })
    .map(() => NANOID_CHARS[getRandomInt()])
    .join("");
}

export function getWorkflowRunId(id?: string): string {
  return `wfr_${id ?? nanoid()}`;
}

export const isDisabledWorkflowContext = (context: WorkflowContext & ({ disabled: true } | {disabled?: never})) => {
  return "disabled" in context && context.disabled;
};