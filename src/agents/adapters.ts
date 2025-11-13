/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * this file contains adapters which convert tools and models
 * to workflow tools and models.
 */
import { HTTPMethods } from "@upstash/qstash";
import { tool } from "ai";
import { AgentCallParams, AISDKTool, LangchainTool, ProviderFunction } from "./types";
import { AGENT_NAME_HEADER } from "./constants";
import { z, ZodType } from "zod";
import { WorkflowAbort, WorkflowContext } from "@upstash/workflow";
import { isInstanceOf } from "../utils/error";

export const fetchWithContextCall = async (
  context: WorkflowContext,
  agentCallParams?: AgentCallParams,
  ...params: Parameters<typeof fetch>
) => {
  const [input, init] = params;
  try {
    // Prepare headers from init.headers
    const headers = init?.headers ? Object.fromEntries(new Headers(init.headers).entries()) : {};

    // Prepare body from init.body
    const body = init?.body ? JSON.parse(init.body as string) : undefined;

    // create step name
    const agentName = headers[AGENT_NAME_HEADER] as string | undefined;
    const stepName = agentName ? `Call Agent ${agentName}` : "Call Agent";

    // Make network call
    const responseInfo = await context.call(stepName, {
      url: input.toString(),
      method: init?.method as HTTPMethods,
      headers,
      body,
      timeout: agentCallParams?.timeout,
      retries: agentCallParams?.retries,
      retryDelay: agentCallParams?.retryDelay,
      flowControl: agentCallParams?.flowControl,
    });

    // Construct headers for the response
    const responseHeaders = new Headers(
      Object.entries(responseInfo.header).reduce(
        (acc, [key, values]) => {
          acc[key] = values.join(", ");
          return acc;
        },
        {} as Record<string, string>
      )
    );

    // Return the constructed response
    return new Response(JSON.stringify(responseInfo.body), {
      status: responseInfo.status,
      headers: responseHeaders,
    });
  } catch (error) {
    if (error instanceof Error && isInstanceOf(error, WorkflowAbort)) {
      throw error;
    } else {
      console.error("Error in fetch implementation:", error);
      throw error; // Rethrow error for further handling
    }
  }
};

export const createWorkflowModel = <TProvider extends ProviderFunction>({
  context,
  provider,
  providerParams,
  agentCallParams,
}: {
  context: WorkflowContext;
  provider: TProvider;
  providerParams?: Omit<Required<Parameters<TProvider>>[0], "fetch">;
  agentCallParams?: AgentCallParams;
}): ReturnType<TProvider> => {
  return provider({
    fetch: ((...params) => fetchWithContextCall(context, agentCallParams, ...params)) as typeof fetch,
    ...providerParams,
  });
};

/**
 * converts LangChain tools to AI SDK tools and updates
 * the execute method of these tools by wrapping it with
 * context.run.
 *
 * @param context workflow context
 * @param tools map of AI SDK or LangChain tools and their names
 * @returns
 */
export const wrapTools = ({
  context,
  tools,
}: {
  context: WorkflowContext;
  tools: Record<string, AISDKTool | LangchainTool | WorkflowTool>;
}): Record<string, AISDKTool> => {
  return Object.fromEntries(
    Object.entries(tools).map((toolInfo) => {
      const [toolName, tool] = toolInfo;

      const executeAsStep = "executeAsStep" in tool ? tool.executeAsStep : true;
      const aiSDKTool: AISDKTool = convertToAISDKTool(tool, context, toolName, executeAsStep);

      return [toolName, aiSDKTool];
    })
  );
};

/**
 * Converts tools to AI SDK tool if it already isn't
 *
 * @param tool LangChain or AI SDK Tool
 * @param context workflow context
 * @param toolName name of the tool
 * @param executeAsStep whether to wrap the execute method with context.run
 * @returns AI SDK Tool
 */
const convertToAISDKTool = (
  tool: AISDKTool | LangchainTool,
  context: WorkflowContext,
  toolName: string,
  executeAsStep: boolean
): AISDKTool => {
  const isLangchainTool = "invoke" in tool;
  return isLangchainTool
    ? convertLangchainTool(tool as LangchainTool, context, toolName, executeAsStep)
    : convertAISDKTool(tool as AISDKTool, context, toolName, executeAsStep);
};

/**
 * converts a langchain tool to AI SDK tool
 *
 * @param langchainTool
 * @param context workflow context
 * @param toolName name of the tool
 * @param executeAsStep whether to wrap the execute method with context.run
 * @returns AI SDK Tool
 */
const convertLangchainTool = (
  langchainTool: LangchainTool,
  context: WorkflowContext,
  toolName: string,
  executeAsStep: boolean
): AISDKTool => {
  return tool({
    description: langchainTool.description,
    inputSchema: langchainTool.schema,
    execute: executeAsStep
      ? async (...param: unknown[]) => {
          return context.run(`Run tool ${toolName}`, () => langchainTool.invoke(...param));
        }
      : async (...param: unknown[]) => langchainTool.invoke(...param),
  });
};

/**
 * converts an AI SDK tool to a new AI SDK tool with wrapped execution
 *
 * @param aiSDKTool
 * @param context workflow context
 * @param toolName name of the tool
 * @param executeAsStep whether to wrap the execute method with context.run
 * @returns AI SDK Tool
 */
const convertAISDKTool = (
  aiSDKTool: AISDKTool,
  context: WorkflowContext,
  toolName: string,
  executeAsStep: boolean
): AISDKTool => {
  const originalExecute = aiSDKTool.execute;
  
  return tool({
    description: aiSDKTool.description,
    inputSchema: aiSDKTool.inputSchema,
    execute: originalExecute && executeAsStep
      ? async (...params: Parameters<typeof originalExecute>) => {
          return context.run(`Run tool ${toolName}`, () => originalExecute(...params));
        }
      : originalExecute,
  });
};

export class WorkflowTool<TSchema extends ZodType = ZodType> implements LangchainTool {
  /**
   * description of the tool
   */
  public readonly description: string;
  /**
   * schema of the tool
   */
  public readonly schema: TSchema;
  /**
   * function to invoke the tool
   */
  public readonly invoke: (params: z.infer<TSchema>) => any;
  /**
   * whether the invoke method of the tool is to be wrapped with `context.run`
   */
  public readonly executeAsStep: boolean;

  /**
   *
   * @param description description of the tool
   * @param schema schema of the tool
   * @param invoke function to invoke the tool
   * @param executeAsStep whether the invoke method of the tool is to be wrapped with `context.run`
   */
  constructor(params: {
    /**
     * description of the tool
     */
    description: string;
    /**
     * schema of the tool
     */
    schema: TSchema;
    /**
     * invoke function to invoke the tool
     */
    invoke: (params: z.infer<TSchema>) => any;
    /**
     * whether the invoke method is to be wrapped with `context.run`.
     *
     * When you pass a LangChain, AI SDK tool or a WorkflowTool to your agent,
     * the execute/invoke method of the tool is wrapped with `context.run` by default.
     *
     * This option allows you to disable this behavior.
     *
     * You may want to disable wrapping with context.run if you want to run context.run,
     * context.call or any other workflow step yourself in the execute/invoke method
     * of the tool.
     *
     * @default true
     */
    executeAsStep?: boolean;
  }) {
    this.description = params.description;
    this.schema = params.schema;
    this.invoke = params.invoke;
    this.executeAsStep = params.executeAsStep ?? true;
  }
}
