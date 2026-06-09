import { describe, test, expect } from "bun:test";
import { serve } from "bun";
import { Client } from "@upstash/qstash";
import { MOCK_QSTASH_SERVER_PORT, MOCK_QSTASH_SERVER_URL, mockQStashServer, WORKFLOW_ENDPOINT, getWorkflowRunId, nanoid } from "../utils/test-utils";
import { fetchWithContextCall, WorkflowTool, wrapTools } from "./adapters";
import { AGENT_NAME_HEADER } from "./constants";
import { tool } from "ai";
import { z } from "zod";
import { LangchainTool } from "./types";
import { WorkflowContext } from "@upstash/workflow";

describe("wrapTools", () => {
  const token = getWorkflowRunId();
  const workflowRunId = nanoid();
  const createContext = () =>
    new WorkflowContext({
      headers: new Headers({}) as Headers,
      initialPayload: "mock",
      qstashClient: new Client({ baseUrl: MOCK_QSTASH_SERVER_URL, token, enableTelemetry: false }),
      steps: [],
      url: WORKFLOW_ENDPOINT,
      workflowRunId,
      workflowRunCreatedAt: 1717000000000,
    });

  const aiSDKToolDescription = "ai sdk tool";
  const langChainToolDescription = "langchain sdk tool";
  const workflowToolDescription = "workflow tool";
  const inputSchema = z.object({ expression: z.string() });
  const execute = async ({ expression }: { expression: string }) => expression;

  const aiSDKTool = tool({
    description: aiSDKToolDescription,
    inputSchema,
    execute,
  });

  const langChainTool: LangchainTool = {
    description: langChainToolDescription,
    schema: inputSchema,
    invoke: execute,
  };

  const wrappedWorkflowTool = new WorkflowTool({
    description: workflowToolDescription,
    schema: inputSchema,
    invoke: execute,
    executeAsStep: true,
  });

  test("should wrap AI SDK tool with execute", async () => {
    const context = createContext();
    const wrappedTools = wrapTools({ context, tools: { aiSDKTool } });

    expect(Object.entries(wrappedTools).length).toBe(1);
    const wrappedTool = wrappedTools["aiSDKTool"];
    expect(wrappedTool.description).toBe(aiSDKToolDescription);

    await mockQStashServer({
      execute: () => {
        const execute = wrappedTool.execute;
        if (!execute) {
          throw new Error("execute is missing.");
        } else {
          const throws = () => execute({ expression: "hello" }, { messages: [], toolCallId: "id" });
          expect(throws).toThrowError(
            `Aborting workflow after executing step 'Run tool aiSDKTool'`
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
            body: '{"stepId":1,"stepName":"Run tool aiSDKTool","stepType":"Run","out":"\\"hello\\"","concurrent":1}',
            destination: WORKFLOW_ENDPOINT,
            headers: {
              "upstash-workflow-sdk-version": "1",
              "content-type": "application/json",
              "upstash-feature-set": "LazyFetch,InitialBody,WF_DetectTrigger,WF_TriggerOnConfig",
              "upstash-forward-upstash-workflow-sdk-version": "1",
              "upstash-method": "POST",
              "upstash-workflow-init": "false",
              "upstash-workflow-runid": workflowRunId,
              "upstash-workflow-url": WORKFLOW_ENDPOINT,
            },
          },
        ],
      },
    });
  });

  test("should wrap LangChain tool with execute", async () => {
    const context = createContext();
    const wrappedTools = wrapTools({ context, tools: { langChainTool } });

    expect(Object.entries(wrappedTools).length).toBe(1);
    const wrappedTool = wrappedTools["langChainTool"];
    expect(wrappedTool.description).toBe(langChainToolDescription);

    await mockQStashServer({
      execute: () => {
        const execute = wrappedTool.execute;
        if (!execute) {
          throw new Error("execute is missing.");
        } else {
          const throws = () => execute({ expression: "hello" }, { messages: [], toolCallId: "id" });
          expect(throws).toThrowError(
            `Aborting workflow after executing step 'Run tool langChainTool'`
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
            body: '{"stepId":1,"stepName":"Run tool langChainTool","stepType":"Run","out":"\\"hello\\"","concurrent":1}',
            destination: WORKFLOW_ENDPOINT,
            headers: {
              "upstash-workflow-sdk-version": "1",
              "content-type": "application/json",
              "upstash-feature-set": "LazyFetch,InitialBody,WF_DetectTrigger,WF_TriggerOnConfig",
              "upstash-forward-upstash-workflow-sdk-version": "1",
              "upstash-method": "POST",
              "upstash-workflow-init": "false",
              "upstash-workflow-runid": workflowRunId,
              "upstash-workflow-url": WORKFLOW_ENDPOINT,
            },
          },
        ],
      },
    });
  });

  test("should wrap multiple tools", async () => {
    const context = createContext();
    const wrappedTools = wrapTools({ context, tools: { langChainTool, aiSDKTool } });

    expect(Object.entries(wrappedTools).length).toBe(2);
    const wrappedLangChainTool = wrappedTools["langChainTool"];
    expect(wrappedLangChainTool.description).toBe(langChainToolDescription);

    const wrappedAiSDKTool = wrappedTools["aiSDKTool"];
    expect(wrappedAiSDKTool.description).toBe(aiSDKToolDescription);
  });

  test("should skip wrapping when wrap is false", async () => {
    const context = createContext();

    const nonwrappedWorkflowTool = new WorkflowTool({
      description: workflowToolDescription,
      schema: inputSchema,
      invoke: async ({ expression }) => {
        await context.sleep(`step ${expression}`, 1000);
      },
      executeAsStep: false,
    });

    const wrappedTools = wrapTools({ context, tools: { nonwrappedWorkflowTool } });

    expect(Object.entries(wrappedTools).length).toBe(1);
    const wrappedTool = wrappedTools["nonwrappedWorkflowTool"];
    expect(wrappedTool.description).toBe(workflowToolDescription);

    await mockQStashServer({
      execute: () => {
        const execute = wrappedTool.execute;
        if (!execute) {
          throw new Error("execute is missing.");
        } else {
          const expression = "hello";
          const throws = () => execute({ expression }, { messages: [], toolCallId: "id" });
          expect(throws).toThrow("Aborting workflow after executing step 'step hello'.");
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
            body: '{"stepId":1,"stepName":"step hello","stepType":"SleepFor","sleepFor":1000,"concurrent":1}',
            destination: WORKFLOW_ENDPOINT,
            headers: {
              "content-type": "application/json",
              "upstash-delay": "1000s",
              "upstash-feature-set": "LazyFetch,InitialBody,WF_DetectTrigger,WF_TriggerOnConfig",
              "upstash-forward-upstash-workflow-sdk-version": "1",
              "upstash-method": "POST",
              "upstash-workflow-init": "false",
              "upstash-workflow-runid": workflowRunId,
              "upstash-workflow-sdk-version": "1",
              "upstash-workflow-url": WORKFLOW_ENDPOINT,
            },
          },
        ],
      },
    });
  });

  test("should wrap when wrap is true", async () => {
    const context = createContext();
    const wrappedTools = wrapTools({ context, tools: { wrappedWorkflowTool } });

    expect(Object.entries(wrappedTools).length).toBe(1);
    const wrappedTool = wrappedTools["wrappedWorkflowTool"];
    expect(wrappedTool.description).toBe(workflowToolDescription);

    await mockQStashServer({
      execute: () => {
        const execute = wrappedTool.execute;
        if (!execute) {
          throw new Error("execute is missing.");
        } else {
          const throws = () => execute({ expression: "hello" }, { messages: [], toolCallId: "id" });
          expect(throws).toThrowError(
            `Aborting workflow after executing step 'Run tool wrappedWorkflowTool'`
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
            body: '{"stepId":1,"stepName":"Run tool wrappedWorkflowTool","stepType":"Run","out":"\\"hello\\"","concurrent":1}',
            destination: WORKFLOW_ENDPOINT,
            headers: {
              "content-type": "application/json",
              "upstash-feature-set": "LazyFetch,InitialBody,WF_DetectTrigger,WF_TriggerOnConfig",
              "upstash-forward-upstash-workflow-sdk-version": "1",
              "upstash-method": "POST",
              "upstash-workflow-init": "false",
              "upstash-workflow-runid": workflowRunId,
              "upstash-workflow-sdk-version": "1",
              "upstash-workflow-url": WORKFLOW_ENDPOINT,
            },
          },
        ],
      },
    });
  });
});

describe("fetchWithContextCall", () => {
  const token = getWorkflowRunId();
  const workflowRunId = nanoid();
  const agentName = "researcher";

  const createContext = () =>
    new WorkflowContext({
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

  // An OpenAI-style request body whose `input` array has `turns` items.
  const makeBody = (turns: number) =>
    JSON.stringify({
      model: "gpt-4o-mini",
      input: Array.from({ length: turns }, (_, index) => ({
        role: index === 0 ? "system" : "user",
        content: "x",
      })),
    });

  // Run fetchWithContextCall against a tiny mock QStash and capture the single
  // batched message that the underlying context.call publishes.
  const capturePublishedMessage = async (
    body: string
  ): Promise<{ body: string; stepName: string }> => {
    let message: { body: string; headers: Record<string, string> } | undefined;
    const server = serve({
      port: MOCK_QSTASH_SERVER_PORT,
      async fetch(request) {
        const batch = (await request.json()) as {
          body: string;
          headers: Record<string, string>;
        }[];
        message = batch[0];
        return new Response(JSON.stringify("msgId"), { status: 200 });
      },
    });

    try {
      await fetchWithContextCall(
        createContext(),
        undefined,
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          headers: { "content-type": "application/json", [AGENT_NAME_HEADER]: agentName },
          body,
        }
      );
    } catch {
      // context.call throws WorkflowAbort after publishing the step; expected.
    } finally {
      server.stop(true);
    }

    if (!message) throw new Error("no message was published to QStash");
    return {
      body: message.body,
      stepName: message.headers["upstash-callback-forward-upstash-workflow-stepname"],
    };
  };

  test("forwards the request body to context.call as an unmodified string", async () => {
    const body = makeBody(2);
    const published = await capturePublishedMessage(body);
    // Regression guard: the body must be the exact string passed in, not an
    // object or a double-encoded string (the QStash "cannot unmarshal object
    // into ...body of type string" bug). It is published verbatim.
    expect(published.body).toBe(body);
  });

  test("uses a unique, conversation-length-based step name per call", async () => {
    const twoTurns = await capturePublishedMessage(makeBody(2));
    const fourTurns = await capturePublishedMessage(makeBody(4));

    expect(twoTurns.stepName).toBe(`Call Agent ${agentName} (turn 2)`);
    expect(fourTurns.stepName).toBe(`Call Agent ${agentName} (turn 4)`);
    // Repeated LLM calls in an agent loop must NOT share a step name, or QStash
    // dedupes the publishes and the agent stalls after its first tool call.
    expect(twoTurns.stepName).not.toBe(fourTurns.stepName);
  });
});
