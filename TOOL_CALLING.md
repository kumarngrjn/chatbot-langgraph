# Tool Calling in LangGraph

This document explains how tool calling works in this chatbot application, demonstrating a key LangGraph concept: **agent loops with tool execution**.

## What is Tool Calling?

Tool calling allows the LLM (Claude) to use external tools to perform specific tasks like calculations, weather lookups, or web searches. Instead of just generating text, the LLM can:

1. Decide when a tool is needed
2. Choose which tool to use
3. Provide the correct arguments
4. Use the tool's result to formulate a final response

## Architecture Overview

The tool calling system creates an **agent loop** in the graph:

```
User Question
    ↓
analyzeIntent (detect "question")
    ↓
handleQuestion (Claude with tools bound)
    ↓
shouldContinue (check for tool_calls)
    ├─ If tool_calls exist → callTools → back to handleQuestion
    └─ If no tool_calls → END
```

## Implementation Details

### 1. Tool Definitions ([src/tools.ts](src/tools.ts))

Tools are defined using the `tool()` function from `@langchain/core/tools`:

```typescript
export const calculatorTool = tool(
  async ({ operation, a, b }) => {
    // Tool implementation
  },
  {
    name: "calculator",
    description: "Performs basic arithmetic operations",
    schema: z.object({
      operation: z.enum(["add", "subtract", "multiply", "divide"]),
      a: z.number(),
      b: z.number(),
    }),
  }
);
```

**Available Tools:**
- **calculator** - Performs arithmetic (add, subtract, multiply, divide)
- **get_weather** - Gets weather for major cities (mock data)
- **web_search** - Searches for information (mock implementation)

### 2. Binding Tools to the Model ([src/chatbot.ts:95-99](src/chatbot.ts#L95-L99))

Tools are bound to the Claude model using `.bindTools()`:

```typescript
const model = new ChatAnthropic({
  modelName: "claude-haiku-4-5-20251001",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  maxTokens: 1024,
  temperature: 0.5,
}).bindTools(tools);
```

When tools are bound:
- Claude can see the tool descriptions and schemas
- Claude decides autonomously when to use tools
- Tool calls are included in the AI message response

### 3. Tool Execution Node ([src/chatbot.ts:117-161](src/chatbot.ts#L117-L161))

The `callTools` node executes tools requested by the LLM:

```typescript
async function callTools(state: ChatState) {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  const toolCalls = lastMessage.tool_calls || [];

  const toolMessages: ToolMessage[] = [];

  for (const toolCall of toolCalls) {
    const tool = tools.find(t => t.name === toolCall.name);
    const result = await tool.invoke(toolCall.args);

    toolMessages.push(
      new ToolMessage({
        content: result,
        tool_call_id: toolCall.id!,
      })
    );
  }

  return { messages: toolMessages };
}
```

**Key Points:**
- Extracts tool calls from the last AI message
- Executes each tool with the provided arguments
- Returns tool results as `ToolMessage` objects
- These messages are added to the conversation history

### 4. Conditional Routing ([src/chatbot.ts:187-198](src/chatbot.ts#L187-L198))

The `shouldContinue` router creates the agent loop:

```typescript
function shouldContinue(state: ChatState) {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  const toolCalls = lastMessage.tool_calls || [];

  if (toolCalls.length > 0) {
    return "tools";  // Execute tools
  } else {
    return END;  // Finish
  }
}
```

This enables the flow:
- Question → Claude (with tool calls) → Execute tools → Claude (final answer) → End

### 5. Graph Configuration ([src/chatbot.ts:211-235](src/chatbot.ts#L211-L235))

The graph is configured to support the agent loop:

```typescript
const graph = new StateGraph(ChatStateAnnotation)
  .addNode("question", handleQuestion)
  .addNode("tools", callTools)
  .addConditionalEdges("question", shouldContinue)
  .addEdge("tools", "question");  // Loop back!
```

The edge from "tools" back to "question" creates the loop that allows:
1. Initial question processing
2. Tool execution
3. Processing with tool results
4. Final response

## Example Execution Flow

### User asks: "What is 25 times 4?"

**Step 1: Initial Processing**
- Intent detected as "question"
- Routes to `handleQuestion` node
- Claude analyzes: "I need to use the calculator tool"

**Step 2: Tool Call Generated**
```json
{
  "name": "calculator",
  "args": {
    "operation": "multiply",
    "a": 25,
    "b": 4
  }
}
```

**Step 3: Router Decision**
- `shouldContinue` detects tool call
- Routes to `callTools` node

**Step 4: Tool Execution**
- Calculator tool is invoked
- Returns: "25 * 4 = 100"
- Result added to messages as `ToolMessage`

**Step 5: Back to Question Handler**
- Edge from "tools" → "question" is followed
- Claude receives the tool result
- Claude generates final response: "25 times 4 equals **100**."

**Step 6: No More Tools**
- `shouldContinue` sees no tool calls
- Routes to END

## UI Integration

### Backend Response ([src/server.ts:67-82](src/server.ts#L67-L82))

The server extracts and returns which tools were used:

```typescript
const toolsUsed: string[] = [];
for (const msg of conversation.messages) {
  if (msg._getType() === "ai") {
    const aiMsg = msg as AIMessage;
    if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
      aiMsg.tool_calls.forEach(tc => {
        if (!toolsUsed.includes(tc.name)) {
          toolsUsed.push(tc.name);
        }
      });
    }
  }
}
```

### Frontend Display ([client/src/App.tsx:189-200](client/src/App.tsx#L189-L200))

The UI shows tool usage with badges:

```typescript
{msg.toolsUsed && msg.toolsUsed.length > 0 && (
  <span className="message-tool">
    {msg.toolsUsed.map(tool => getToolEmoji(tool)).join(' ')}
    {msg.toolsUsed.map(tool => getToolDisplayName(tool)).join(', ')}
  </span>
)}
```

Tool badges appear next to intent badges, showing:
- 🧮 Calculator
- 🌤️ Weather
- 🔍 Search

## Testing Tool Calling

### Test Calculator
```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is 42 divided by 6?", "sessionId": "test-123"}'
```

**Expected Response:**
```json
{
  "response": "42 divided by 6 is **7**.",
  "intent": "question",
  "conversationCount": 2,
  "toolsUsed": ["calculator"],
  "timestamp": "2026-01-28T..."
}
```

### Test Weather
```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the weather in Tokyo?", "sessionId": "test-456"}'
```

### Test in Web UI

1. Start the backend: `npm run server`
2. Start the frontend: `cd client && npm run dev`
3. Open http://localhost:5173
4. Try these queries:
   - "What's 25 times 4?"
   - "What's the weather in Tokyo?"
   - "Search for information about TypeScript"

You'll see tool badges (🧮 Calculator, 🌤️ Weather, etc.) appear with the bot's response.

## Key LangGraph Concepts Demonstrated

### 1. Agent Loop Pattern
The graph creates a loop that allows the agent to:
- Make a decision (call a tool)
- Take an action (execute the tool)
- Observe the result (get tool output)
- Make another decision (generate final answer)

This is the foundation of agentic behavior.

### 2. Conditional Edges
The `shouldContinue` router demonstrates dynamic flow control based on state.

### 3. Tool Integration
Shows how to:
- Define tools with schemas
- Bind tools to LLMs
- Execute tools based on LLM decisions
- Feed tool results back to the LLM

### 4. Message Types
Uses multiple message types:
- `HumanMessage` - User input
- `AIMessage` - LLM responses (can include tool_calls)
- `ToolMessage` - Tool execution results

## Extending the System

### Adding a New Tool

1. **Define the tool** in [src/tools.ts](src/tools.ts):

```typescript
export const myNewTool = tool(
  async ({ param1, param2 }) => {
    // Implementation
    return "result";
  },
  {
    name: "my_tool",
    description: "Description for Claude",
    schema: z.object({
      param1: z.string().describe("What is this"),
      param2: z.number().describe("What is this"),
    }),
  }
);

// Add to exports
export const tools = [..., myNewTool];
```

2. **Add emoji mapping** in [client/src/App.tsx](client/src/App.tsx):

```typescript
const getToolEmoji = (toolName: string) => {
  switch (toolName) {
    case 'my_tool': return '⚡';
    // ... other cases
  }
};
```

3. **Test it!** The tool is automatically available to Claude.

## Benefits of This Approach

1. **Declarative** - Tools are declared with schemas, LLM decides when to use them
2. **Flexible** - Easy to add new tools without changing the graph structure
3. **Observable** - Each step is logged and visible in the UI
4. **Composable** - Tools can be mixed and matched
5. **Type-Safe** - Zod schemas provide runtime validation

## Next Steps

Try implementing:
- Real API integrations (OpenWeatherMap, Tavily Search, etc.)
- Multiple tool calls in sequence
- Parallel tool execution
- Error handling and retries
- Tool call history and analytics
- Custom tool calling strategies

## Learn More

- [LangGraph Tool Calling Guide](https://langchain-ai.github.io/langgraph/how-tos/tool-calling/)
- [LangChain Tools Documentation](https://js.langchain.com/docs/modules/agents/tools/)
- [Anthropic Tool Use Guide](https://docs.anthropic.com/claude/docs/tool-use)
