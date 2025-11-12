import { z } from "zod";

import { generateText, stepCountIs, StepResult, StopCondition, tool, ToolSet } from "ai";
import { AgentParameters, AISDKTool, ManagerAgentParameters } from "./types";
import { AGENT_NAME_HEADER, MANAGER_AGENT_PROMPT } from "./constants";
import { WorkflowAbort, WorkflowContext } from "@upstash/workflow";
import { isDisabledWorkflowContext } from "../utils/error";

const getWorkflowAbortInfo = (steps: StepResult<ToolSet>[]) => {
  for (const step of steps) {
    if (step.finishReason === "tool-calls") {
      for (const item of step.content) {
        if (
          item.type === "tool-error" &&
          (item.error as Error).name === "WorkflowAbort"
        ) {
          return item.error as WorkflowAbort;
        }
      }
    }
  }
  return null;
}

const hasErrors: StopCondition<ToolSet> = ({ steps }) => {
  const result = getWorkflowAbortInfo(steps);
  return Boolean(result);
};

/**
 * An Agent which utilizes the model and tools available to it
 * to achieve a given task
 *
 * @param name Name of the agent
 * @param background Background of the agent
 * @param model LLM model to use
 * @param tools tools available to the agent
 * @param maxSteps number of times the agent can call the LLM at most. If
 *   the agent abruptly stops execution after calling tools, you may need
 *   to increase maxSteps
 * @param temparature temparature used when calling the LLM
 */
export class Agent {
  public readonly name: AgentParameters["name"];
  public readonly tools: AgentParameters["tools"];
  public readonly maxSteps: AgentParameters["maxSteps"];
  public readonly background: AgentParameters["background"];
  public readonly model: AgentParameters["model"];
  public readonly temparature: AgentParameters["temparature"];
  private readonly context: WorkflowContext;

  constructor(
    {
      tools,
      maxSteps,
      background,
      name,
      model,
      temparature = 0.1,
    }: AgentParameters,
    context: WorkflowContext
  ) {
    this.name = name;
    this.tools = tools ?? {};
    this.maxSteps = maxSteps;
    this.background = background;
    this.model = model;
    this.temparature = temparature;
    this.context = context;
  }

  /**
   * Trigger the agent by passing a prompt
   *
   * @param prompt task to assign to the agent
   * @returns Response as `{ text: string }`
   */
  public async call({ prompt }: { prompt: string }) {
    // eslint-disable-next-line no-useless-catch
    try {
      if (isDisabledWorkflowContext(this.context)) {
        // since the context is a disabled context, assume that the request has authenticated.
        // in order to authorize the request, run a mock step to throw WorkflowAbort.
        await this.context.sleep("abort", 0);
      }

      const result = await generateText({
        model: this.model,
        tools: this.tools,
        stopWhen: [stepCountIs(this.maxSteps), hasErrors],
        system: this.background,
        prompt: prompt,
        headers: {
          [AGENT_NAME_HEADER]: this.name,
        },
        temperature: this.temparature,
      });

      const abortError = getWorkflowAbortInfo(result.steps);
      if (abortError) {
        throw new WorkflowAbort(abortError.message, abortError.stepInfo, abortError.cancelWorkflow);
      }

      return { text: result.text };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Convert the agent to a tool which can be used by other agents.
   *
   * @returns the agent as a tool
   */
  public asTool(): AISDKTool {
    const toolDescriptions = Object.values(this.tools)
      .map((tool) => tool.description)
      .join("\n");
    return tool({
      inputSchema: z.object({ prompt: z.string() }),
      execute: async ({ prompt }) => {
        return await this.call({ prompt });
      },
      description:
        `An AI Agent with the following background: ${this.background}` +
        `Has access to the following tools: ${toolDescriptions}`,
    });
  }
}

export class ManagerAgent extends Agent {
  public agents: ManagerAgentParameters["agents"];

  /**
   * A manager agent which coordinates agents available to it to achieve a
   * given task
   *
   * @param name Name of the agent
   * @param background Background of the agent. If not passed, default will be used.
   * @param model LLM model to use
   * @param agents: List of agents available to the agent
   * @param maxSteps number of times the manager agent can call the LLM at most.
   *   If the agent abruptly stops execution after calling other agents, you may
   *   need to increase maxSteps
   */
  constructor(
    {
      agents,
      background = MANAGER_AGENT_PROMPT,
      model,
      maxSteps,
      name = "manager llm",
    }: ManagerAgentParameters,
    context: WorkflowContext
  ) {
    super(
      {
        background,
        maxSteps,
        tools: Object.fromEntries(
          agents.map((agent) => [agent.name, agent.asTool()])
        ),
        name,
        model,
      },
      context
    );
    this.agents = agents;
  }
}
