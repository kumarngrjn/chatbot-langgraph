import { ChatAnthropic } from "@langchain/anthropic";
import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { BaseMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { tools } from "./tools";

/**
 * LANGGRAPH CONCEPT 1: STATE DEFINITION
 *
 * In LangGraph v1.x, we use Annotation to define state with typed reducers.
 * The state defines what data flows through your graph.
 * Each node can read from and write to this state.
 */
const ChatStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    // Reducer function: concatenates old and new messages
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  userIntent: Annotation<"greeting" | "question" | "farewell" | "unknown">({
    // Reducer function: new value overwrites old value
    reducer: (x, y) => y ?? x,
    default: () => "unknown",
  }),
  conversationCount: Annotation<number>({
    // Reducer function: new value overwrites old value
    reducer: (x, y) => y ?? x,
    default: () => 0,
  }),
});

// Extract the TypeScript type from the annotation
type ChatState = typeof ChatStateAnnotation.State;

/**
 * LANGGRAPH CONCEPT 2: NODES
 *
 * Nodes are functions that process and update the state.
 * Each node receives the current state and returns updates to it.
 */

// Node 1: Analyze user intent
async function analyzeIntent(state: ChatState) {
  const lastMessage = state.messages[state.messages.length - 1];
  const userInput = lastMessage.content.toString().toLowerCase();

  let intent: "greeting" | "question" | "farewell" | "unknown" = "unknown";

  if (userInput.match(/\b(hi|hello|hey|greetings)\b/)) {
    intent = "greeting";
  } else if (userInput.match(/\b(bye|goodbye|see you|farewell)\b/)) {
    intent = "farewell";
  } else {
    intent = "question";
  }

  console.log(`[Intent Analyzer] Detected intent: ${intent}`);

  return {
    userIntent: intent,
  };
}

// Node 2: Handle greetings
async function handleGreeting(state: ChatState) {
  console.log("[Greeting Handler] Processing greeting...");

  const response = new AIMessage(
    "Hello! I'm a chatbot built with LangGraph. I can help answer your questions. What would you like to know?"
  );

  return {
    messages: [response],
    conversationCount: state.conversationCount + 1,
  };
}

// Node 3: Handle farewells
async function handleFarewell(state: ChatState) {
  console.log("[Farewell Handler] Processing farewell...");

  const response = new AIMessage(
    "Goodbye! It was nice chatting with you. Feel free to come back anytime!"
  );

  return {
    messages: [response],
    conversationCount: state.conversationCount + 1,
  };
}

// Node 4: Handle general questions using Claude with tool support
async function handleQuestion(state: ChatState) {
  console.log("[Question Handler] Processing question with Claude...");

  // Create model and bind tools to it
  const model = new ChatAnthropic({
    modelName: "claude-haiku-4-5-20251001",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    maxTokens: 1024,
    temperature: 0.5,
  }).bindTools(tools);

  const response = await model.invoke(state.messages);

  return {
    messages: [response],
    conversationCount: state.conversationCount + 1,
  };
}

/**
 * LANGGRAPH CONCEPT 4: TOOL CALLING
 *
 * This node executes tools that the LLM has decided to call.
 * Tool results are added back to the message history so the LLM can use them.
 */
async function callTools(state: ChatState) {
  console.log("[Tool Executor] Executing tool calls...");

  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  const toolCalls = lastMessage.tool_calls || [];

  if (toolCalls.length === 0) {
    console.log("[Tool Executor] No tool calls found");
    return { messages: [] };
  }

  // Execute each tool call
  const toolMessages: ToolMessage[] = [];

  for (const toolCall of toolCalls) {
    console.log(`[Tool Executor] Calling tool: ${toolCall.name} with args:`, toolCall.args);

    // Find the matching tool
    const tool = tools.find(t => t.name === toolCall.name);

    if (tool) {
      try {
        // Use type assertion to handle the union type
        const result = await (tool as any).invoke(toolCall.args);
        console.log(`[Tool Executor] Tool ${toolCall.name} returned:`, result);

        toolMessages.push(
          new ToolMessage({
            content: typeof result === 'string' ? result : JSON.stringify(result),
            tool_call_id: toolCall.id!,
          })
        );
      } catch (error: any) {
        console.error(`[Tool Executor] Error calling tool ${toolCall.name}:`, error.message);
        toolMessages.push(
          new ToolMessage({
            content: `Error: ${error.message}`,
            tool_call_id: toolCall.id!,
          })
        );
      }
    }
  }

  return { messages: toolMessages };
}

/**
 * LANGGRAPH CONCEPT 3: CONDITIONAL ROUTING
 *
 * Router functions determine which node to execute next based on the current state.
 * This enables dynamic flow control in your graph.
 */
function routeByIntent(state: ChatState) {
  console.log(`[Router] Routing based on intent: ${state.userIntent}`);

  switch (state.userIntent) {
    case "greeting":
      return "greeting";
    case "farewell":
      return "farewell";
    case "question":
      return "question";
    default:
      return "question"; // Default to question handler
  }
}

/**
 * Router that checks if tools need to be called
 * This creates an agent loop: question -> tools -> question -> end
 */
function shouldContinue(state: ChatState) {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  const toolCalls = lastMessage.tool_calls || [];

  console.log("[Router] Checking if tools are needed...");
  console.log("[Router] Tool calls:", JSON.stringify(toolCalls, null, 2));

  if (toolCalls.length > 0) {
    console.log(`[Router] Found ${toolCalls.length} tool call(s), routing to tool executor`);
    return "tools";
  } else {
    console.log("[Router] No tool calls, ending conversation turn");
    return END;
  }
}

/**
 * Build and configure the LangGraph workflow with tool calling
 *
 * Graph flow:
 * START -> analyzeIntent -> [greeting/farewell/question]
 *   - greeting -> END
 *   - farewell -> END
 *   - question -> [tools or END]
 *       - if tool_calls exist -> callTools -> question (agent loop)
 *       - else -> END
 */
export function createChatbot() {
  // Initialize the state graph using the Annotation (LangGraph v1.x API)
  const graph = new StateGraph(ChatStateAnnotation)
    // Add all nodes to the graph
    .addNode("analyzeIntent", analyzeIntent)
    .addNode("greeting", handleGreeting)
    .addNode("farewell", handleFarewell)
    .addNode("question", handleQuestion)
    .addNode("tools", callTools)
    // Define the flow: START -> analyzeIntent
    .addEdge(START, "analyzeIntent")
    // Route from analyzeIntent to appropriate handler
    .addConditionalEdges("analyzeIntent", routeByIntent)
    // Greeting and farewell go directly to END
    .addEdge("greeting", END)
    .addEdge("farewell", END)
    // Question handler checks if tools need to be called (agent loop)
    .addConditionalEdges("question", shouldContinue)
    // After tools are called, go back to question handler for final response
    .addEdge("tools", "question");

  // Compile the graph into a runnable
  return graph.compile();
}
