# @upstash/workflow-agents

A powerful library for building AI agent workflows with Upstash Workflow. This package provides a flexible API for creating single and multi-agent systems that can collaborate to complete complex tasks.

📚 Read the full documentation at [Upstash Workflow Agents](https://upstash.com/docs/workflow/agents/overview).

## Installation

```bash
npm install @upstash/workflow-agents @upstash/workflow
```

For defining tools, you may also need:

```bash
npm install ai mathjs zod
```

## Quick Start

Start with setting up your environment variables. If you are going to use OpenAI models, set the `OPENAI_API_KEY` variable:

```
OPENAI_API_KEY="<OPENAI_API_KEY>"
```

Next, set the QStash env variables. For local development, the easiest option is to let `@upstash/workflow` automatically download and connect to the [QStash local development server](https://upstash.com/docs/workflow/howto/local-development/development-server). Just set the following in your environment:

```ts
QSTASH_DEV=true
```

With `QSTASH_DEV=true`, the dev server is started for you and the required credentials are configured automatically — no manual setup needed.

See the [development server docs](https://upstash.com/docs/workflow/howto/local-development/development-server) for more details.

Next, define your agent workflow in a Next.js API route:

```ts
import { serve } from "@upstash/workflow/nextjs";
import { agentWorkflow } from "@upstash/workflow-agents";

export const { POST } = serve(async (context) => {
  const agents = agentWorkflow(context);
  
  const model = agents.openai('gpt-3.5-turbo');
  
  const agent = agents.agent({
    model,
    name: 'assistant',
    maxSteps: 2,
    tools: {},
    background: 'You are a helpful assistant.',
  });
  
  const task = agents.task({
    agent,
    prompt: "Hello, what can you help me with?",
  });
  
  const { text } = await task.run();
  console.log("Result:", text);
});
```

## Models

The `model` is responsible for deciding which tools to call and generating the final response.

### OpenAI

```ts
import { agentWorkflow } from "@upstash/workflow-agents";

const agents = agentWorkflow(context);
const model = agents.openai('gpt-3.5-turbo');
```

### OpenAI-Compatible Providers

```ts
const model = agents.openai('deepseek-chat', {
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY
});
```

### AI SDK Providers

```ts
import { createAnthropic } from "@ai-sdk/anthropic";

const model = agents.AISDKModel({
  context,
  provider: createAnthropic,
  providerParams: {
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
});
```

### Configuring LLM Calls

```ts
const model = agents.openai('gpt-3.5-turbo', {
  callSettings: {
    timeout: 1000,       // optional request timeout
    retries: 0,          // optional retries
    flowControl: {       // optional flow control
      key: "flow-control-key",
      rate: 10,
      period: "10s",
      parallelism: 10,
    },
  }
});
```

The same `callSettings` parameter is available in `agents.AISDKModel` as the `agentCallParams` parameter.

## Tools

The Agents API is compatible with both **AI SDK** and **LangChain** tools. You can use existing tools or define your own custom tools.

### WorkflowTool (Custom)

```ts
import { WorkflowTool } from "@upstash/workflow-agents";
import { z } from 'zod';
import * as mathjs from 'mathjs';

const mathTool = new WorkflowTool({
  description:
    'A tool for evaluating mathematical expressions. ' +
    'Example expressions: ' +
    "'1.2 * (2 + 4.5)', '12.7 cm to inch', 'sin(45 deg) ^ 2'.",
  schema: z.object({ expression: z.string() }),
  invoke: async ({ expression }) => mathjs.evaluate(expression),
});
```

### AI SDK Tool (Custom)

```ts
import { z } from 'zod';
import { tool } from 'ai';
import * as mathjs from 'mathjs';

const mathTool = tool({
  description:
    'A tool for evaluating mathematical expressions. ' +
    'Example expressions: ' +
    "'1.2 * (2 + 4.5)', '12.7 cm to inch', 'sin(45 deg) ^ 2'.",
  parameters: z.object({ expression: z.string() }),
  execute: async ({ expression }) => mathjs.evaluate(expression),
});
```

### Agentic Tools

```ts
import { createAISDKTools } from '@agentic/ai-sdk';
import { WeatherClient } from '@agentic/weather';

const weather = new WeatherClient();
const tools = createAISDKTools(weather);
```

### LangChain Tools (Custom)

```ts
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

const numberGenerator = new DynamicStructuredTool({
  name: "random-number-generator",
  description: "generates a random number between two input numbers",
  schema: z.object({
    low: z.number().describe("The lower bound of the generated number"),
    high: z.number().describe("The upper bound of the generated number"),
  }),
  func: async ({ low, high }) =>
    (Math.random() * (high - low) + low).toString(), // Outputs must be strings
});
```

### LangChain Tools

```ts
import { WikipediaQueryRun } from '@langchain/community/tools/wikipedia_query_run';

const wikiTool = new WikipediaQueryRun({
  topKResults: 1,
  maxDocContentLength: 500,
});
```

For more tools, explore:
- [LangChain Toolkits](https://js.langchain.com/v0.1/docs/modules/agents/tools/toolkits/)
- [Agentic AI SDK Tools](https://agentic.so/sdks/ai-sdk)

### Using Workflow Steps Inside Tools

By default, the Workflow SDK wraps tool execute/invoke methods with `context.run` to run them as workflow steps. If you want to use other workflow steps (like `context.call`, `context.notify`) inside your tool, set `executeAsStep: false`:

```ts
const tool = new WorkflowTool({
  description: "...",
  schema: z.object({ /* ... */ }),
  invoke: async (input) => {
    // Now you can use context.call and other steps inside the tool
    await context.call("my-api", async () => {
      // Make HTTP call or use other workflow features
    });
  },
  executeAsStep: false
});
```

## Agents

Agents are LLM models with access to a set of tools and background knowledge.

```ts
import { serve } from "@upstash/workflow/nextjs";
import { agentWorkflow } from "@upstash/workflow-agents";
import { WikipediaQueryRun } from "@langchain/community/tools/wikipedia_query_run";

export const { POST } = serve(async (context) => {
  const agents = agentWorkflow(context);
  const model = agents.openai('gpt-3.5-turbo');

  const researcherAgent = agents.agent({
    model,
    name: 'academic',
    maxSteps: 2,
    tools: {
      wikiTool: new WikipediaQueryRun({
        topKResults: 1,
        maxDocContentLength: 500,
      })
    },
    background:
      'You are researcher agent with access to Wikipedia. ' +
      'Utilize Wikipedia as much as possible for correct information',
  });
});
```

### Agent Parameters

- **`model`**: The LLM model that the agent will use
- **`name`**: The name of the agent (used when naming workflow steps)
- **`maxSteps`**: Maximum number of times the agent can call the LLM
- **`tools`**: Object containing tools available to the agent
- **`background`**: System prompt describing the agent's behavior and context

## Tasks

Tasks assign work to agents. There are two types: single-agent tasks and multi-agent tasks.

### Single Agent Task

A task is assigned to a single agent, which completes it using its available tools:

```ts
import { serve } from "@upstash/workflow/nextjs";
import { agentWorkflow } from "@upstash/workflow-agents";
import { WikipediaQueryRun } from "@langchain/community/tools/wikipedia_query_run";

export const { POST } = serve(async (context) => {
  const agents = agentWorkflow(context);
  const model = agents.openai('gpt-3.5-turbo');

  const researcherAgent = agents.agent({
    model,
    name: 'academic',
    maxSteps: 2,
    tools: {
      wikiTool: new WikipediaQueryRun({
        topKResults: 1,
        maxDocContentLength: 500,
      })
    },
    background:
      'You are researcher agent with access to Wikipedia. ' +
      'Utilize Wikipedia as much as possible for correct information',
  });

  const task = agents.task({
    agent: researcherAgent,
    prompt: "Tell me about 5 topics in advanced physics.",
  });
  
  const { text } = await task.run();
  console.log("Result:", text);
});
```

**Example Output:**

```
Here are summaries of 5 topics in advanced physics:

1. **Quantum Mechanics**: Quantum mechanics is a fundamental theory that describes 
   the behavior of nature at and below the scale of atoms. It is the foundation of 
   all quantum physics, including quantum chemistry, quantum field theory, quantum 
   technology, and quantum information science.

2. **General Relativity**: General relativity, also known as Einstein's theory of 
   gravity, is the geometric theory of gravitation published by Albert Einstein in 
   1915. It provides a unified description of gravity as a geometric property of 
   space and time.

3. **Particle Physics**: Particle physics, also known as high-energy physics, is 
   the study of fundamental particles and forces that constitute matter and radiation. 
   Fundamental particles are classified in the Standard Model as fermions (matter 
   particles) and bosons (force-carrying particles).

4. **Astrophysics**: Astrophysics is a science that applies the methods and principles 
   of physics and chemistry to the study of astronomical objects and phenomena. 
   Subjects studied include the Sun, stars, galaxies, and the universe.

5. **String Theory**: String theory is a theoretical framework in physics where 
   point-like particles are replaced by one-dimensional objects called strings. 
   On distance scales larger than the string scale, a string behaves like a particle.
```

In the workflow logs, you'll see the agent calling the `wikiTool` multiple times in parallel, then summarizing the results into a final response.

### Multi-Agent Task

A manager agent coordinates multiple specialized agents to complete complex tasks:

```ts
import { serve } from "@upstash/workflow/nextjs";
import { agentWorkflow } from "@upstash/workflow-agents";
import { WikipediaQueryRun } from "@langchain/community/tools/wikipedia_query_run";
import { tool } from "ai";
import { z } from "zod";
import * as mathjs from 'mathjs';

export const { POST } = serve(async (context) => {
  const agents = agentWorkflow(context);
  const model = agents.openai('gpt-4o');

  const researcherAgent = agents.agent({
    model,
    name: 'academic',
    maxSteps: 2,
    tools: {
      wikiTool: new WikipediaQueryRun({
        topKResults: 1,
        maxDocContentLength: 500,
      })
    },
    background:
      'You are researcher agent with access to Wikipedia. ' +
      'Utilize Wikipedia as much as possible for correct information',
  });

  const mathAgent = agents.agent({
    model,
    name: "mathematician",
    maxSteps: 2,
    tools: {
      calculate: tool({
        description:
          'A tool for evaluating mathematical expressions. ' +
          'Example expressions: ' +
          "'1.2 * (2 + 4.5)', '12.7 cm to inch', 'sin(45 deg) ^ 2'." +
          "Only call this tool if you need to calculate a mathematical expression. " +
          "When writing an expression, don't use words like 'thousand' or 'million'",
        parameters: z.object({ expression: z.string() }),
        execute: async ({ expression }) => mathjs.evaluate(expression),
      }),
    },
    background:
      "You are a mathematician agent which can utilize " +
      "a calculator to compute expressions"
  });

  const task = agents.task({
    model,
    maxSteps: 3,
    agents: [researcherAgent, mathAgent],
    prompt: "Tell me about 3 cities in Japan and calculate the sum of their populations",
  });
  
  const { text } = await task.run();
  console.log("Result:", text);
});
```

**Example Output:**

```
Here is a brief overview of three cities in Japan:

### Tokyo
- **Official Name**: Tokyo Metropolis
- **Population**: Over 14 million in the city proper as of 2023.
- **Significance**: Capital of Japan and one of the most populous urban areas in the world.

### Osaka
- **Japanese Name**: 大阪市 (Ōsaka-shi)
- **Population**: 2.7 million as per the 2020 census.
- **Significance**: Capital and most populous city in Osaka Prefecture, 
  third-most populous city in Japan.

### Kyoto
- **Japanese Name**: 京都市 (Kyōto-shi)
- **Population**: 1.46 million as of 2020.
- **Significance**: Capital city of Kyoto Prefecture, ninth-most populous city in Japan.

The sum of their populations is approximately 18.16 million.
```

#### How Multi-Agent Tasks Work

The Manager LLM coordinates the specialized agents:
1. **First**, it calls the `academic` agent to research Japanese cities using Wikipedia
2. **Then**, it calls the `mathematician` agent to calculate the total population
3. **Finally**, it combines the results into a comprehensive response

The manager makes decisions about which agents to use and in what order based on:
- The task prompt
- Each agent's background description
- The tools available to each agent

## Resources

- [Upstash Workflow Documentation](https://upstash.com/docs/workflow)
- [LangChain Toolkits](https://js.langchain.com/v0.1/docs/modules/agents/tools/toolkits/)
- [Agentic AI SDK Tools](https://agentic.so/sdks/ai-sdk)
- [AI SDK Documentation](https://sdk.vercel.ai/docs)

## License

MIT
