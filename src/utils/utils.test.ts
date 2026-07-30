import { describe, test, expect } from "bun:test";
import { WorkflowAbort } from "@upstash/workflow";
import { getWorkflowRunId } from "./test-utils";
import { isInstanceOf, isWorkflowAbort } from "./error";

describe("getWorkflowRunId", () => {
  test("should return random with no id", () => {
    const workflowRunId = getWorkflowRunId();
    expect(workflowRunId.length).toBe(25);
    expect(workflowRunId.slice(0, 4)).toBe("wfr_");
  });

  test("should return with given id", () => {
    const workflowRunId = getWorkflowRunId("my-id");
    expect(workflowRunId.length).toBe(9);
    expect(workflowRunId).toBe("wfr_my-id");
  });
});

describe("isWorkflowAbort", () => {
  /**
   * Stands in for an abort coming out of a minified build: the constructor name
   * no longer matches `WorkflowAbort`, so `isInstanceOf` cannot recognise it,
   * but `name` is assigned a string literal and survives minification.
   */
  class MangledAbort extends Error {
    public readonly stepName = "Call Agent researcher";
    public readonly stepInfo = { headers: { authorization: "Bearer sk-secret" } };
    constructor(name: string) {
      super("Aborting workflow after executing step 'Call Agent researcher'.");
      this.name = name;
    }
  }

  test("should detect a WorkflowAbort", () => {
    expect(isWorkflowAbort(new WorkflowAbort("step", undefined))).toBe(true);
  });

  // Every WorkflowAbort subclass in @upstash/workflow reassigns `this.name`, so
  // checking only for "WorkflowAbort" lets these through and logs them as errors.
  const abortNames = [
    "WorkflowAbort",
    "WorkflowAuthError",
    "WorkflowCancelAbort",
    "WorkflowNonRetryableError",
    "WorkflowRetryAfterError",
  ];

  for (const name of abortNames) {
    test(`should detect a bundler-mangled ${name}`, () => {
      const error = new MangledAbort(name);
      // Guard the guard: if this ever becomes true the fixture has stopped
      // exercising the minified path and the assertion below proves nothing.
      expect(isInstanceOf(error, WorkflowAbort)).toBe(false);
      expect(isWorkflowAbort(error)).toBe(true);
    });
  }

  test("should not treat genuine failures as aborts", () => {
    expect(isWorkflowAbort(new TypeError("Expected request body to be a string"))).toBe(false);
    expect(isWorkflowAbort(new Error("connection refused"))).toBe(false);
  });

  test("should not treat non-Error values as aborts", () => {
    expect(isWorkflowAbort("WorkflowAbort")).toBe(false);
    expect(isWorkflowAbort(undefined)).toBe(false);
    expect(isWorkflowAbort(null)).toBe(false);
    // a plain object is not an abort no matter what it calls itself
    expect(isWorkflowAbort({ name: "WorkflowAbort" })).toBe(false);
  });
});
