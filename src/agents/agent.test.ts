import { describe, test, expect, beforeEach, spyOn } from "bun:test";
import * as ai from "ai";
import { Agent, ManagerAgent } from "./agent";
import {
  MOCK_QSTASH_SERVER_URL,
  mockQStashServer,
  WORKFLOW_ENDPOINT,
  getWorkflowRunId,
  nanoid,
} from "../utils/test-utils";
import { Client } from "@upstash/qstash";
import { WorkflowAgents } from ".";
import { tool } from "ai";
import { z } from "zod";
import { getAgentsApi } from "./task.test";
import { WorkflowContext } from "@upstash/workflow";

describe("agents", () => {
  const openaiToken = nanoid();
  beforeEach(() => {
    process.env["OPENAI_API_KEY"] = openaiToken;
  });

  const token = getWorkflowRunId();
  const workflowRunId = nanoid();
  const context = new WorkflowContext({
    headers: new Headers({}) as Headers,
    initialPayload: "mock",
    qstashClient: new Client({
      baseUrl: MOCK_QSTASH_SERVER_URL,
      token,
      enableTelemetry: false,
    }),
    steps: [],
    url: WORKFLOW_ENDPOINT,
    workflowRunId,
    workflowRunCreatedAt: 1717000000000,
  });

  const agentsApi = new WorkflowAgents({ context });

  const background = "an agent";
  const maxSteps = 2;
  const name = "my agent";
  const temparature = 0.4;

  const flowControlKey = "flowControlKey";
  const model = agentsApi.openai("gpt-4", {
    callSettings: {
      flowControl: {
        key: flowControlKey,
        parallelism: 2,
      },
      retries: 5,
      timeout: 10,
      retryDelay: "1000",
    },
  });

  const agent = new Agent(
    {
      tools: {
        tool: tool({
          description: "ai sdk tool",
          inputSchema: z.object({ expression: z.string() }),
          execute: async ({ expression }) => expression,
        }),
      },
      background,
      maxSteps,
      name,
      model,
      temparature,
    },
    context
  );

  describe("single agent", () => {
    test("should initialize and call agent", async () => {
      expect(agent.background).toBe(background);
      expect(agent.maxSteps).toBe(maxSteps);
      expect(agent.name).toBe(name);
      expect(agent.temparature).toBe(temparature);
      expect(Object.entries(agent.tools).length).toBe(1);
      expect(agent.tools["tool"]).toBeDefined();

      await mockQStashServer({
        execute: () => {
          const throws = async () => agent.call({ prompt: "my prompt" });
          expect(throws).toThrowError(
            `Aborting workflow after executing step 'Call Agent my agent (turn 2)'`
          );
        },
        responseFields: {
          status: 200,
          body: "msgId",
        },
        receivesRequest: {
          method: "POST",
          url: `${MOCK_QSTASH_SERVER_URL}/v2/batch`,
          token,
          body: [
            {
              body: '{"model":"gpt-4","input":[{"role":"system","content":"an agent"},{"role":"user","content":[{"type":"input_text","text":"my prompt"}]}],"temperature":0.4,"tools":[{"type":"function","name":"tool","description":"ai sdk tool","parameters":{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"expression":{"type":"string"}},"required":["expression"],"additionalProperties":false}}],"tool_choice":"auto"}',
              destination: "https://api.openai.com/v1/responses",
              headers: {
                "upstash-workflow-sdk-version": "1",
                "content-type": "application/json",
                "upstash-callback": WORKFLOW_ENDPOINT,
                "upstash-callback-feature-set":
                  "LazyFetch,InitialBody,WF_DetectTrigger,WF_TriggerOnConfig",
                "upstash-callback-forward-upstash-workflow-callback": "true",
                "upstash-callback-forward-upstash-workflow-concurrent": "1",
                "upstash-callback-forward-upstash-workflow-contenttype":
                  "application/json",
                "upstash-callback-forward-upstash-workflow-stepid": "1",
                "upstash-callback-forward-upstash-workflow-stepname":
                  "Call Agent my agent (turn 2)",
                "upstash-callback-forward-upstash-workflow-steptype": "Call",
                "upstash-callback-workflow-calltype": "fromCallback",
                "upstash-callback-workflow-init": "false",
                "upstash-callback-workflow-runid": workflowRunId,
                "upstash-callback-workflow-url": WORKFLOW_ENDPOINT,
                "upstash-feature-set": "WF_NoDelete,InitialBody",
                "upstash-forward-authorization": `Bearer ${openaiToken}`,
                "upstash-forward-content-type": "application/json",
                "upstash-forward-upstash-agent-name": "my agent",
                "upstash-method": "POST",
                "upstash-workflow-calltype": "toCallback",
                "upstash-workflow-init": "false",
                "upstash-workflow-runid": workflowRunId,
                "upstash-workflow-url": WORKFLOW_ENDPOINT,
                "upstash-flow-control-key": "flowControlKey",
                "upstash-flow-control-value": "parallelism=2",
                "upstash-retries": "5",
                "upstash-retry-delay": "1000",
                "upstash-timeout": "10",
                "upstash-forward-user-agent": expect.any(String),
              },
            },
          ],
        },
      });
    });

    test("should convert agent to tool", async () => {
      const agentTool = agent.asTool();

      expect(agentTool.description).toBe(
        "An AI Agent with the following background: an agentHas access to the following tools: ai sdk tool"
      );

      await mockQStashServer({
        execute: () => {
          const execute = agentTool.execute;
          if (!execute) {
            throw new Error("execute is missing.");
          } else {
            const throws = () =>
              execute({ prompt: "hello" }, { messages: [], toolCallId: "id" });
            expect(throws).toThrowError(
              `Aborting workflow after executing step 'Call Agent my agent (turn 2)'`
            );
          }
        },
        responseFields: {
          status: 200,
          body: "msgId",
        },
        receivesRequest: {
          method: "POST",
          url: `${MOCK_QSTASH_SERVER_URL}/v2/batch`,
          token,
          body: [
            {
              body: '{"model":"gpt-4","input":[{"role":"system","content":"an agent"},{"role":"user","content":[{"type":"input_text","text":"hello"}]}],"temperature":0.4,"tools":[{"type":"function","name":"tool","description":"ai sdk tool","parameters":{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"expression":{"type":"string"}},"required":["expression"],"additionalProperties":false}}],"tool_choice":"auto"}',
              destination: "https://api.openai.com/v1/responses",
              headers: {
                "upstash-workflow-sdk-version": "1",
                "content-type": "application/json",
                "upstash-callback": WORKFLOW_ENDPOINT,
                "upstash-callback-feature-set":
                  "LazyFetch,InitialBody,WF_DetectTrigger,WF_TriggerOnConfig",
                "upstash-callback-forward-upstash-workflow-callback": "true",
                "upstash-callback-forward-upstash-workflow-concurrent": "1",
                "upstash-callback-forward-upstash-workflow-contenttype":
                  "application/json",
                "upstash-callback-forward-upstash-workflow-stepid": "2",
                "upstash-callback-forward-upstash-workflow-stepname":
                  "Call Agent my agent (turn 2)",
                "upstash-callback-forward-upstash-workflow-steptype": "Call",
                "upstash-callback-workflow-calltype": "fromCallback",
                "upstash-callback-workflow-init": "false",
                "upstash-callback-workflow-runid": workflowRunId,
                "upstash-callback-workflow-url": WORKFLOW_ENDPOINT,
                "upstash-feature-set": "WF_NoDelete,InitialBody",
                "upstash-forward-authorization": `Bearer ${openaiToken}`,
                "upstash-forward-content-type": "application/json",
                "upstash-forward-upstash-agent-name": "my agent",
                "upstash-method": "POST",
                "upstash-workflow-calltype": "toCallback",
                "upstash-workflow-init": "false",
                "upstash-workflow-runid": workflowRunId,
                "upstash-workflow-url": WORKFLOW_ENDPOINT,
                "upstash-flow-control-key": "flowControlKey",
                "upstash-flow-control-value": "parallelism=2",
                "upstash-retries": "5",
                "upstash-retry-delay": "1000",
                "upstash-timeout": "10",
                "upstash-forward-user-agent": expect.any(String),
              },
            },
          ],
        },
      });
    });
  });

  test("multi agent", async () => {
    const managerAgent = new ManagerAgent(
      {
        agents: [agent],
        maxSteps: 2,
        model,
      },
      context
    );

    await mockQStashServer({
      execute: () => {
        const throws = async () => managerAgent.call({ prompt: "my prompt" });
        expect(throws).toThrowError(
          `Aborting workflow after executing step 'Call Agent manager llm (turn 2)'`
        );
      },
      responseFields: {
        status: 200,
        body: "msgId",
      },
      receivesRequest: {
        method: "POST",
        url: `${MOCK_QSTASH_SERVER_URL}/v2/batch`,
        token,
        body: [
          {
            body: '{"model":"gpt-4","input":[{"role":"system","content":"You are an agent orchestrating other AI Agents.\\n\\nThese other agents have tools available to them.\\n\\nGiven a prompt, utilize these agents to address requests.\\n\\nDon\'t always call all the agents provided to you at the same time. You can call one and use it\'s response to call another.\\n\\nAvoid calling the same agent twice in one turn. Instead, prefer to call it once but provide everything\\nyou need from that agent.\\n"},{"role":"user","content":[{"type":"input_text","text":"my prompt"}]}],"temperature":0.1,"tools":[{"type":"function","name":"my agent","description":"An AI Agent with the following background: an agentHas access to the following tools: ai sdk tool","parameters":{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"prompt":{"type":"string"}},"required":["prompt"],"additionalProperties":false}}],"tool_choice":"auto"}',
            destination: "https://api.openai.com/v1/responses",
            headers: {
              "upstash-workflow-sdk-version": "1",
              "content-type": "application/json",
              "upstash-callback": WORKFLOW_ENDPOINT,
              "upstash-callback-feature-set":
                "LazyFetch,InitialBody,WF_DetectTrigger,WF_TriggerOnConfig",
              "upstash-callback-forward-upstash-workflow-callback": "true",
              "upstash-callback-forward-upstash-workflow-concurrent": "1",
              "upstash-callback-forward-upstash-workflow-contenttype":
                "application/json",
              "upstash-callback-forward-upstash-workflow-stepid": "3",
              "upstash-callback-forward-upstash-workflow-stepname":
                "Call Agent manager llm (turn 2)",
              "upstash-callback-forward-upstash-workflow-steptype": "Call",
              "upstash-callback-workflow-calltype": "fromCallback",
              "upstash-callback-workflow-init": "false",
              "upstash-callback-workflow-runid": workflowRunId,
              "upstash-callback-workflow-url": WORKFLOW_ENDPOINT,
              "upstash-feature-set": "WF_NoDelete,InitialBody",
              "upstash-forward-authorization": `Bearer ${openaiToken}`,
              "upstash-forward-content-type": "application/json",
              "upstash-forward-upstash-agent-name": "manager llm",
              "upstash-method": "POST",
              "upstash-workflow-calltype": "toCallback",
              "upstash-workflow-init": "false",
              "upstash-workflow-runid": workflowRunId,
              "upstash-workflow-url": WORKFLOW_ENDPOINT,
              "upstash-flow-control-key": "flowControlKey",
              "upstash-flow-control-value": "parallelism=2",
              "upstash-retries": "5",
              "upstash-retry-delay": "1000",
              "upstash-timeout": "10",
              "upstash-forward-user-agent": expect.any(String),
            },
          },
        ],
      },
    });
  });

  test("call enables multi-step tool use via stopWhen", async () => {
    const spy = spyOn(ai, "generateText").mockResolvedValue({
      text: "done",
      steps: [],
    } as unknown as Awaited<ReturnType<typeof ai.generateText>>);
    try {
      const result = await agent.call({ prompt: "my prompt" });
      expect(result.text).toBe("done");
      expect(spy).toHaveBeenCalledTimes(1);
      const args = spy.mock.calls[0][0] as { stopWhen?: unknown };
      // Without stopWhen the AI SDK runs a single step, so the agent would call
      // one tool and then stop. This guards against that regression.
      expect(args.stopWhen).toBeDefined();
    } finally {
      spy.mockRestore();
    }
  });

  test("call threads history into messages and returns the updated conversation", async () => {
    const generated: ai.ModelMessage[] = [{ role: "assistant", content: "done" }];
    const spy = spyOn(ai, "generateText").mockResolvedValue({
      text: "done",
      steps: [],
      response: { messages: generated },
    } as unknown as Awaited<ReturnType<typeof ai.generateText>>);
    try {
      const history: ai.ModelMessage[] = [
        { role: "user", content: "earlier prompt" },
        { role: "assistant", content: "earlier answer" },
      ];
      const result = await agent.call({ prompt: "follow-up", history });

      const args = spy.mock.calls[0][0] as {
        prompt?: string;
        messages?: ai.ModelMessage[];
      };
      // The prompt travels as the last user message of the conversation.
      expect(args.prompt).toBeUndefined();
      expect(args.messages).toEqual([...history, { role: "user", content: "follow-up" }]);
      // What the caller persists to continue the conversation later.
      expect(result.messages).toEqual([
        ...history,
        { role: "user", content: "follow-up" },
        ...generated,
      ]);
    } finally {
      spy.mockRestore();
    }
  });

  describe("disabled context", () => {
    const { agent } = getAgentsApi({ disabledContext: true });
    test("should throw abort when empty prompt", async () => {
      // @ts-expect-error for testing purposes, prompt is object
      const prompt: string = { some: "object" };

      await mockQStashServer({
        execute: async () => {
          const throws = () => agent.call({ prompt });
          expect(throws).toThrow("Aborting workflow after executing step");
        },
        receivesRequest: false,
        responseFields: {
          body: "",
          status: 200,
        },
      });
    });

    test("should throw abort when object prompt", async () => {
      // @ts-expect-error for testing purposes, prompt is undefiend
      const prompt: string = undefined;

      await mockQStashServer({
        execute: async () => {
          const throws = () => agent.call({ prompt });
          expect(throws).toThrow("Aborting workflow after executing step");
        },
        receivesRequest: false,
        responseFields: {
          body: "",
          status: 200,
        },
      });
    });
  });
  test("disabled context with empty or object prompt should throw abort", async () => {});
});
