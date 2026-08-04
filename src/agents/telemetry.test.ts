import { describe, test, expect } from "bun:test";
import type { WorkflowContext } from "@upstash/workflow";
import { WorkflowAgents } from ".";
import { SDK_TELEMETRY, addTelemetry } from "./telemetry";

const contextWithTelemetry = (sdk?: string) =>
  ({
    executor: { telemetry: sdk === undefined ? undefined : { sdk } },
  }) as unknown as WorkflowContext;

describe("telemetry", () => {
  test("appends the sdk to the context telemetry, comma separated", () => {
    const context = contextWithTelemetry("@upstash/workflow@v1.3.3");

    new WorkflowAgents({ context });

    // @ts-expect-error accessing hidden fields
    expect(context.executor.telemetry.sdk).toBe(
      `@upstash/workflow@v1.3.3, ${SDK_TELEMETRY}`
    );
  });

  test("appends only once, no matter how many times the context is used", () => {
    const context = contextWithTelemetry("@upstash/workflow@v1.3.3");

    new WorkflowAgents({ context });
    new WorkflowAgents({ context });
    addTelemetry(context);

    // @ts-expect-error accessing hidden fields
    expect(context.executor.telemetry.sdk).toBe(
      `@upstash/workflow@v1.3.3, ${SDK_TELEMETRY}`
    );
  });

  test("leaves a context without telemetry untouched", () => {
    const context = contextWithTelemetry(undefined);

    new WorkflowAgents({ context });

    // @ts-expect-error accessing hidden fields
    expect(context.executor.telemetry).toBeUndefined();
  });

  test("never throws, even on a malformed context", () => {
    expect(() =>
      new WorkflowAgents({ context: {} as unknown as WorkflowContext })
    ).not.toThrow();
    expect(() =>
      new WorkflowAgents({
        context: {
          get executor() {
            throw new Error("telemetry down");
          },
        } as unknown as WorkflowContext,
      })
    ).not.toThrow();
  });
});
