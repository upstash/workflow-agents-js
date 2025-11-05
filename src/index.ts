import { WorkflowContext } from "@upstash/workflow";
import { WorkflowAgents } from "./agents";

export const agentWorkflow = (context: WorkflowContext) => {
  return new WorkflowAgents({ context });
}
