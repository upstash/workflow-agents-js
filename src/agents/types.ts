import type { ModelMessage, Tool, UserModelMessage, generateText } from "ai";

/**
 * What a task/agent accepts as its prompt: a plain string, or the full user
 * message content (text parts plus image/file parts — e.g. an image URL the
 * user attached). Either way it becomes the conversation's next user message.
 */
export type PromptContent = UserModelMessage["content"];
import { Agent } from "./agent";
import { WorkflowTool } from "./adapters";
import { createOpenAI } from "@ai-sdk/openai";
import { WorkflowContext } from "@upstash/workflow";

export type AISDKTool = Tool;
export type LangchainTool = {
  description: string;
  schema: AISDKTool["inputSchema"];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoke: (...params: any[]) => any;
};

type CallSettings = Parameters<WorkflowContext["call"]>[1];

type GenerateTextParams = Parameters<typeof generateText>[0];

export type Model = GenerateTextParams["model"];

export type AgentParameters<TTool extends AISDKTool | LangchainTool | WorkflowTool = AISDKTool> = {
  /**
   * number of times the agent can call the LLM at most. If
   * the agent abruptly stops execution after calling tools, you may need
   * to increase maxSteps
   */
  maxSteps: number;
  /**
   * Background of the agent
   */
  background: string;
  /**
   * tools available to the agent
   */
  tools: Record<string, TTool>;
  /**
   * Name of the agent
   */
  name: string;
  /**
   * LLM model to use
   */
  model: Model;
  /**
   * temparature used when calling the LLM
   *
   * @default 0.1
   */
  temparature?: number;
};

type TaskParams = {
  /**
   * task assigned to the agent — a string, or user message content parts
   * (text + images/files)
   */
  prompt: PromptContent;
  /**
   * Prior conversation to continue from. When passed, the prompt is appended
   * to it as a new user message and the model sees the full history — useful
   * for follow-up runs that must remember earlier turns (including tool
   * results such as screenshots).
   */
  history?: ModelMessage[];
};
export type SingleAgentTaskParams = TaskParams & {
  /**
   * agent to perform the task
   */
  agent: Agent;
};
export type MultiAgentTaskParams = TaskParams & {
  /**
   * Agents which will collaborate to achieve the task
   */
  agents: Agent[];
  /**
   * number of times the manager agent can call the LLM at most.
   * If the agent abruptly stops execution after calling other agents, you may
   * need to increase maxSteps
   */
  maxSteps: number;
  /**
   * LLM model to use
   */
  model: Model;
  /**
   * Background of the agent. If not passed, default will be used.
   */
  background?: string;
};

export type ManagerAgentParameters = {
  /**
   * agents which will coordinate to achieve a given task
   */
  agents: Agent[];
  /**
   * model to use when coordinating the agents
   */
  model: Model;
} & Pick<Partial<AgentParameters>, "name" | "background"> &
  Pick<AgentParameters, "maxSteps">;

  type ProviderSettings = Exclude<Parameters<typeof createOpenAI>[0], "fetch">;
  type ModelParams = Parameters<ReturnType<typeof createOpenAI>>[0];

export type AgentCallParams = Pick<
  CallSettings,
  "flowControl" | "retries" | "timeout" | "retryDelay"
>;

type CustomModelSetings = ProviderSettings & {
  callSettings: AgentCallParams;
}
export type CustomModelParameters = [ModelParams, CustomModelSetings?];

export type ProviderFunction = (params: {
  fetch: typeof fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) => any;
