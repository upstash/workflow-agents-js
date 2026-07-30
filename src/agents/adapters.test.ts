import { describe, test, expect, spyOn } from "bun:test";
import { serve } from "bun";
import { Client } from "@upstash/qstash";
import { MOCK_QSTASH_SERVER_PORT, MOCK_QSTASH_SERVER_URL, mockQStashServer, WORKFLOW_ENDPOINT, getWorkflowRunId, nanoid } from "../utils/test-utils";
import { fetchWithContextCall, WorkflowTool, wrapTools } from "./adapters";
import { AGENT_NAME_HEADER } from "./constants";
import { tool } from "ai";
import { z } from "zod";
import { LangchainTool } from "./types";
import { WorkflowAbort, WorkflowContext } from "@upstash/workflow";
import { isWorkflowAbort } from "../utils/error";

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

  describe("error handling", () => {
    // What a WorkflowAbort carries and must never reach the logs: `stepInfo`
    // holds the provider `authorization` header and the whole conversation.
    const SECRET = "Bearer sk-super-secret";
    const CONVERSATION = "the entire private conversation";
    const stepInfo = {
      headers: { authorization: SECRET },
      body: `{"messages":[{"role":"user","content":"${CONVERSATION}"}]}`,
    };

    /**
     * A context whose `call` fails with the given error, so the catch block can
     * be driven with an arbitrary error without a QStash server.
     */
    const contextThatThrows = (error: unknown) =>
      ({
        call: async () => {
          throw error;
        },
      }) as unknown as WorkflowContext;

    /**
     * Runs fetchWithContextCall with console.error captured.
     *
     * @returns what it threw, plus every console.error argument list
     */
    const runCapturingLogs = async (context: WorkflowContext, body: unknown = makeBody(2)) => {
      const errorSpy = spyOn(console, "error").mockImplementation(() => {});
      let thrown: unknown;
      try {
        await fetchWithContextCall(context, undefined, "https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { "content-type": "application/json", [AGENT_NAME_HEADER]: agentName },
          body: body as string,
        });
      } catch (error) {
        thrown = error;
      }
      const calls = errorSpy.mock.calls;
      errorSpy.mockRestore();
      return { thrown, calls };
    };

    test("does not log an expected WorkflowAbort", async () => {
      const abort = new WorkflowAbort("Call Agent researcher", stepInfo as never);
      const { thrown, calls } = await runCapturingLogs(contextThatThrows(abort));

      // The abort must still propagate so the workflow can suspend...
      expect(thrown).toBe(abort);
      // ...but it is expected, so it must never be logged.
      expect(calls).toEqual([]);
    });

    // Every WorkflowAbort subclass reassigns `this.name`, and a bundler rewrites
    // the constructor names `isInstanceOf` compares — so each of these reached
    // the log path (leaking `stepInfo`) from a minified build.
    const mangledAbortNames = [
      "WorkflowAbort",
      "WorkflowAuthError",
      "WorkflowCancelAbort",
      "WorkflowNonRetryableError",
      "WorkflowRetryAfterError",
    ];

    for (const name of mangledAbortNames) {
      test(`does not log a bundler-mangled ${name}`, async () => {
        class MangledAbort extends Error {
          public readonly stepName = "Call Agent researcher";
          public readonly stepInfo = stepInfo;
          constructor() {
            super("Aborting workflow after executing step 'Call Agent researcher'.");
            this.name = name;
          }
        }
        const abort = new MangledAbort();
        const { thrown, calls } = await runCapturingLogs(contextThatThrows(abort));

        expect(thrown).toBe(abort);
        expect(calls).toEqual([]);
      });
    }

    test("logs a genuine failure without leaking error properties", async () => {
      // A non-abort failure that nonetheless carries sensitive own properties.
      const failure = Object.assign(new Error("connection refused"), { stepInfo });
      const { thrown, calls } = await runCapturingLogs(contextThatThrows(failure));

      expect(thrown).toBe(failure);
      expect(calls.length).toBe(1);
      const [label, logged] = calls[0] as [string, string];
      expect(label).toBe("Error in fetch implementation:");
      // `stack`, not the error itself: console.error(error) prints own
      // properties, which is how `stepInfo` used to leak.
      expect(typeof logged).toBe("string");
      expect(logged).toContain("connection refused");
      expect(logged).not.toContain(SECRET);
      expect(logged).not.toContain(CONVERSATION);
      expect(logged).not.toContain("stepInfo");
    });

    test("logs the non-string body guard failure", async () => {
      // Fails before context.call is ever reached.
      const { thrown, calls } = await runCapturingLogs(contextThatThrows(new Error("unreachable")), {
        not: "a string",
      });

      expect(thrown).toBeInstanceOf(TypeError);
      expect(calls.length).toBe(1);
      const [, logged] = calls[0] as [string, string];
      expect(typeof logged).toBe("string");
      expect(logged).toContain("Expected request body to be a string");
    });

    test("logs a thrown non-Error value as-is", async () => {
      const { thrown, calls } = await runCapturingLogs(contextThatThrows("plain string failure"));

      expect(thrown).toBe("plain string failure");
      expect(calls.length).toBe(1);
      expect(calls[0][1]).toBe("plain string failure");
    });

    test("suspending through a real context does not log", async () => {
      // End-to-end: the abort is the real one raised by context.call after it
      // publishes the step, not a hand-built stand-in.
      const errorSpy = spyOn(console, "error").mockImplementation(() => {});
      const server = serve({
        port: MOCK_QSTASH_SERVER_PORT,
        fetch: async () => new Response(JSON.stringify("msgId"), { status: 200 }),
      });

      let thrown: unknown;
      try {
        await fetchWithContextCall(createContext(), undefined, "https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { "content-type": "application/json", [AGENT_NAME_HEADER]: agentName },
          body: makeBody(2),
        });
      } catch (error) {
        thrown = error;
      } finally {
        server.stop(true);
      }
      const calls = errorSpy.mock.calls;
      errorSpy.mockRestore();

      expect(isWorkflowAbort(thrown)).toBe(true);
      expect(calls).toEqual([]);
    });
  });
});
