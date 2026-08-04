import type { WorkflowContext } from "@upstash/workflow";
import { version } from "../../package.json";

export const SDK_TELEMETRY = `@upstash/workflow-agents@v${version}`;

/**
 * Appends the workflow-agents sdk to the telemetry of the workflow context,
 * comma separated:
 *
 * `Upstash-Telemetry-Sdk: @upstash/workflow@v1.3.3,@upstash/workflow-agents@v0.3.1`
 *
 * Respects the telemetry opt-out (`disableTelemetry` in serve): a context
 * without telemetry is left untouched.
 *
 * The telemetry object is created once per serve endpoint and shared by every
 * request it handles, so the append is idempotent.
 */
export function addTelemetry(context: WorkflowContext) {
  try {
    // @ts-expect-error executor and telemetry are intentionally hidden from the public types
    const telemetry = context.executor?.telemetry as { sdk?: string } | undefined;
    if (!telemetry?.sdk || telemetry.sdk.includes("@upstash/workflow-agents")) {
      return;
    }
    telemetry.sdk = [telemetry.sdk, SDK_TELEMETRY].join(",");
  } catch {
    // telemetry must never break the sdk
  }
}
