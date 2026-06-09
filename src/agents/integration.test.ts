/**
 * Integration tests for the Workflow Agents API.
 *
 * Unlike the unit tests (which mock QStash), these run a workflow END TO END:
 * a real local HTTP server hosts the workflow, a local QStash dev server drives
 * the steps, and a real OpenAI model powers the agents.
 *
 * Requirements (the tests fail loudly if these are missing):
 *   - OPENAI_API_KEY in the environment
 *   - a local QStash dev server reachable at QSTASH_URL (default 127.0.0.1:8080),
 *     e.g. `npx @upstash/qstash-cli dev`
 *
 * Run them on their own (they need the QStash port, which the unit tests' mock
 * server also uses, so the two can't run together):
 *
 *   bun run test:integration
 */
import { describe, test, expect, beforeAll } from "bun:test";
import { serve, Client, WorkflowContext } from "@upstash/workflow";
import { tool } from "ai";
import { z } from "zod";
import { agentWorkflow } from "..";

// These defaults are the well-known credentials printed by `@upstash/qstash-cli
// dev` for its built-in local user. They are intended ONLY as a convenience for
// running these integration tests against a local dev server; they are not real
// secrets and must not be reused outside local development. Set QSTASH_URL /
// QSTASH_TOKEN in the environment to point the tests at a different server.
const QSTASH_URL = process.env.QSTASH_URL ?? "http://127.0.0.1:8080";
const QSTASH_TOKEN =
  process.env.QSTASH_TOKEN ??
  "eyJVc2VySUQiOiJkZWZhdWx0VXNlciIsIlBhc3N3b3JkIjoiZGVmYXVsdFBhc3N3b3JkIn0=";
const MODEL = "gpt-4o-mini";

/**
 * Host the given agent logic as a workflow, trigger it through the local QStash
 * server, and resolve with the workflow's return value once the run finishes.
 *
 * The route function re-runs on every step; intermediate steps throw
 * WorkflowAbort (caught by `serve`), so the code after `logic(...)` — and the
 * `resolve` — only runs on the final, completed invocation.
 */
const runWorkflow = async <T>({
  port,
  logic,
  body,
  timeoutMs,
}: {
  port: number;
  logic: (context: WorkflowContext) => Promise<T>;
  body: unknown;
  timeoutMs: number;
}): Promise<T> => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const completed = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  const { handler } = serve(async (context) => {
    const result = await logic(context);
    resolve(result);
    return result;
  });

  const server = Bun.serve({ port, fetch: (request) => handler(request) });
  const timer = setTimeout(
    () => reject(new Error(`workflow did not finish within ${timeoutMs}ms`)),
    timeoutMs
  );

  try {
    const client = new Client({ baseUrl: QSTASH_URL, token: QSTASH_TOKEN });
    await client.trigger({ url: `http://127.0.0.1:${port}`, body });
    return await completed;
  } finally {
    clearTimeout(timer);
    server.stop(true);
  }
};

describe("agent integration (real OpenAI + local QStash)", () => {
  beforeAll(async () => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        "OPENAI_API_KEY is required for the agent integration tests."
      );
    }
    // Make sure `serve`'s internal QStash client targets the local server too.
    process.env.QSTASH_URL ??= QSTASH_URL;
    process.env.QSTASH_TOKEN ??= QSTASH_TOKEN;

    const reachable = await fetch(QSTASH_URL)
      .then(() => true)
      .catch(() => false);
    if (!reachable) {
      throw new Error(
        `Local QStash server not reachable at ${QSTASH_URL}. ` +
          "Start it with `npx @upstash/qstash-cli dev`."
      );
    }
  });

  test(
    "single agent calls a tool and completes the run",
    async () => {
      const SECRET = "PINEAPPLE-7";
      let toolCalled = false;

      const { text } = await runWorkflow({
        port: 3271,
        body: "What is the secret passcode? Reply with the passcode only.",
        timeoutMs: 110_000,
        logic: (context) => {
          const agents = agentWorkflow(context);
          const model = agents.openai(MODEL);
          const agent = agents.agent({
            model,
            name: "vault-agent",
            maxSteps: 4,
            background:
              "You report the secret passcode. You do NOT know it yourself — " +
              "you MUST call the getPasscode tool to retrieve it, then reply with it verbatim.",
            tools: {
              getPasscode: tool({
                description: "Returns the secret passcode.",
                inputSchema: z.object({}),
                execute: async () => {
                  toolCalled = true;
                  return SECRET;
                },
              }),
            },
          });
          return agents
            .task({ agent, prompt: (context.requestPayload as string) ?? "" })
            .run();
        },
      });

      expect(toolCalled).toBe(true);
      expect(text).toContain(SECRET);
    },
    120_000
  );

  test(
    "multi agent: manager delegates to a sub-agent that uses a tool",
    async () => {
      const SECRET = "COCONUT-9";
      let toolCalled = false;

      const { text } = await runWorkflow({
        port: 3272,
        body: "Find the secret passcode and reply with the passcode only.",
        timeoutMs: 170_000,
        logic: (context) => {
          const agents = agentWorkflow(context);
          const model = agents.openai(MODEL);
          const vault = agents.agent({
            model,
            name: "vault-agent",
            maxSteps: 4,
            background:
              "You look up the secret passcode. Always call the getPasscode tool, " +
              "then report the passcode verbatim.",
            tools: {
              getPasscode: tool({
                description: "Returns the secret passcode.",
                inputSchema: z.object({}),
                execute: async () => {
                  toolCalled = true;
                  return SECRET;
                },
              }),
            },
          });
          return agents
            .task({
              agents: [vault],
              model,
              maxSteps: 5,
              prompt: (context.requestPayload as string) ?? "",
            })
            .run();
        },
      });

      expect(toolCalled).toBe(true);
      expect(text).toContain(SECRET);
    },
    180_000
  );
});
