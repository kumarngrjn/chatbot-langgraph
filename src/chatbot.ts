import { ChatAnthropic } from "@langchain/anthropic";
import { StateGraph, END, START, Annotation, MemorySaver } from "@langchain/langgraph";
import { BaseMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { BaseCheckpointSaver } from "@langchain/langgraph";
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
  // Human-in-the-Loop (HITL) fields
  needsApproval: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),
  pendingToolCalls: Annotation<any[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  approvalMessage: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
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

// Node 1: Analyze user intent using LLM for nuanced detection
async function analyzeIntent(state: ChatState) {
  const lastMessage = state.messages[state.messages.length - 1];
  const userInput = lastMessage.content.toString();

  console.log(`[Intent Analyzer] Analyzing intent with LLM...`);

  // Use Claude Haiku for fast, cheap intent classification
  const intentModel = new ChatAnthropic({
    modelName: "claude-haiku-4-5-20251001",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    maxTokens: 50,
    temperature: 0,
  });

  const intentPrompt = `Classify the user's intent into exactly ONE of these categories:
- "greeting": User is saying hello, hi, hey, good morning, etc.
- "farewell": User is saying goodbye, bye, see you, take care, etc.
- "question": User is asking a question, requesting information, or giving a command

User message: "${userInput}"

Respond with ONLY the category name (greeting, farewell, or question), nothing else.`;

  try {
    const response = await intentModel.invoke([
      { role: "user", content: intentPrompt }
    ]);

    const detectedIntent = response.content.toString().trim().toLowerCase();

    // Map the response to valid intent types
    let intent: "greeting" | "question" | "farewell" | "unknown" = "unknown";
    if (detectedIntent.includes("greeting")) {
      intent = "greeting";
    } else if (detectedIntent.includes("farewell")) {
      intent = "farewell";
    } else if (detectedIntent.includes("question")) {
      intent = "question";
    } else {
      // Default to question for unrecognized intents
      intent = "question";
    }

    console.log(`[Intent Analyzer] LLM detected intent: ${intent}`);

    return {
      userIntent: intent,
    };
  } catch (error: any) {
    console.error(`[Intent Analyzer] LLM error, falling back to regex: ${error.message}`);

    // Fallback to simple regex matching if LLM fails
    const lowerInput = userInput.toLowerCase();
    let intent: "greeting" | "question" | "farewell" | "unknown" = "question";

    if (lowerInput.match(/\b(hi|hello|hey|greetings)\b/)) {
      intent = "greeting";
    } else if (lowerInput.match(/\b(bye|goodbye|see you|farewell)\b/)) {
      intent = "farewell";
    }

    console.log(`[Intent Analyzer] Fallback detected intent: ${intent}`);
    return { userIntent: intent };
  }
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
 * LANGGRAPH CONCEPT 4: PARALLEL TOOL CALLING
 *
 * This node executes tools that the LLM has decided to call.
 * IMPORTANT: Tools are executed IN PARALLEL for better performance.
 * If multiple tools are requested, they all run simultaneously.
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

  console.log(`[Tool Executor] Executing ${toolCalls.length} tool(s) in parallel...`);
  const startTime = Date.now();

  // Execute all tool calls in parallel using Promise.allSettled
  // This ensures that if one tool fails, others still complete
  const toolPromises = toolCalls.map(async (toolCall) => {
    console.log(`[Tool Executor] Starting tool: ${toolCall.name} with args:`, toolCall.args);

    // Find the matching tool
    const tool = tools.find(t => t.name === toolCall.name);

    if (!tool) {
      console.error(`[Tool Executor] Tool not found: ${toolCall.name}`);
      return {
        toolCall,
        result: null,
        error: `Tool "${toolCall.name}" not found`
      };
    }

    try {
      // Use type assertion to handle the union type
      const result = await (tool as any).invoke(toolCall.args);
      console.log(`[Tool Executor] Tool ${toolCall.name} completed successfully`);
      return {
        toolCall,
        result,
        error: null
      };
    } catch (error: any) {
      console.error(`[Tool Executor] Error calling tool ${toolCall.name}:`, error.message);
      return {
        toolCall,
        result: null,
        error: error.message
      };
    }
  });

  // Wait for all tools to complete
  const results = await Promise.all(toolPromises);
  const endTime = Date.now();
  console.log(`[Tool Executor] All ${toolCalls.length} tool(s) completed in ${endTime - startTime}ms`);

  // Convert results to ToolMessages
  const toolMessages: ToolMessage[] = results.map(({ toolCall, result, error }) => {
    const content = error
      ? `Error: ${error}`
      : (typeof result === 'string' ? result : JSON.stringify(result));

    return new ToolMessage({
      content,
      tool_call_id: toolCall.id!,
    });
  });

  return { messages: toolMessages, needsApproval: false, pendingToolCalls: [], approvalMessage: "" };
}

/**
 * LANGGRAPH CONCEPT 5: HUMAN-IN-THE-LOOP (HITL)
 *
 * This node validates tool calls before execution and can request human approval
 * for ambiguous or sensitive operations.
 *
 * Uses LLM-driven validation: Claude autonomously decides if clarification is needed.
 */
async function validateToolCalls(state: ChatState) {
  console.log("[Validation] Checking tool calls for approval requirements...");

  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  const toolCalls = lastMessage.tool_calls || [];

  // Create a validation model (using Haiku for fast, cheap validation)
  const validationModel = new ChatAnthropic({
    modelName: "claude-haiku-4-5-20251001",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    maxTokens: 150,
    temperature: 0,
  });

  // Check for ambiguous weather queries using LLM
  for (const toolCall of toolCalls) {
    if (toolCall.name === "get_weather") {
      const location = toolCall.args.location as string;

      // Only validate single-word locations (those without state/country specified)
      const isSingleWord = !location.includes(',') && !location.includes(' ');

      if (isSingleWord) {
        console.log(`[Validation] Asking LLM to evaluate location ambiguity: ${location}`);

        const validationPrompt = `Is "${location}" an ambiguous location name that could refer to multiple cities in different places?

Examples:
- "Paris" is AMBIGUOUS - could mean Paris, France or Paris, Texas
- "Springfield" is AMBIGUOUS - exists in many US states (Illinois, Massachusetts, Missouri, etc.)
- "Seattle" is CLEAR - primarily refers to Seattle, Washington
- "Tokyo" is CLEAR - clearly refers to Tokyo, Japan

Format your response as follows:
- If CLEAR: respond with just "CLEAR"
- If AMBIGUOUS: respond with "AMBIGUOUS: <location1>, <location2>, ..."
  Example: "AMBIGUOUS: Paris, France; Paris, Texas; Paris, Tennessee"`;

        try {
          const response = await validationModel.invoke([
            { role: "user", content: validationPrompt }
          ]);

          const answer = response.content.toString().trim();
          console.log(`[Validation] LLM response for "${location}": ${answer}`);

          if (answer.toUpperCase().includes("AMBIGUOUS")) {
            console.log(`[Validation] LLM detected ambiguous location: ${location}`);

            // Extract the examples from the LLM response
            // Format: "AMBIGUOUS: Paris, France; Paris, Texas; Paris, Tennessee"
            let examples = "";
            const colonIndex = answer.indexOf(":");
            if (colonIndex > -1) {
              // Get the part after "AMBIGUOUS:"
              const examplesPart = answer.substring(colonIndex + 1).trim();
              // Split by semicolon and take first 2-3 examples
              const exampleList = examplesPart.split(";").map(e => e.trim()).filter(e => e.length > 0);
              examples = exampleList.slice(0, 3).map(e => `"${e}"`).join(" or ");
            }

            // Fallback if we couldn't extract examples
            if (!examples) {
              examples = `"${location}, [State/Country]"`;
            }

            // Create a ToolMessage to satisfy Anthropic's requirement that each tool_use has a tool_result
            const clarificationMessage = new ToolMessage({
              content: `[Requesting clarification] The location "${location}" is ambiguous. Asking user to specify.`,
              tool_call_id: toolCall.id!,
            });

            return {
              messages: [clarificationMessage],
              needsApproval: true,
              pendingToolCalls: toolCalls,
              approvalMessage: `I found that "${location}" could refer to multiple cities. To get accurate weather data, could you please specify which ${location} you mean? For example: ${examples}`,
            };
          }
        } catch (error: any) {
          console.error(`[Validation] Error during LLM validation:`, error.message);
          // On error, fail safe and continue without blocking
        }
      }
    }
  }

  console.log("[Validation] All tool calls approved");
  return { needsApproval: false };
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
 * This creates an agent loop: question -> validation -> tools -> question -> end
 */
function shouldContinue(state: ChatState) {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  const toolCalls = lastMessage.tool_calls || [];

  console.log("[Router] Checking if tools are needed...");
  console.log("[Router] Tool calls:", JSON.stringify(toolCalls, null, 2));

  if (toolCalls.length > 0) {
    console.log(`[Router] Found ${toolCalls.length} tool call(s), routing to validation`);
    return "validate";
  } else {
    console.log("[Router] No tool calls, ending conversation turn");
    return END;
  }
}

/**
 * Router that checks if human approval is needed before executing tools
 */
function needsApprovalRouter(state: ChatState) {
  console.log("[Router] Checking if approval is needed...");

  if (state.needsApproval) {
    console.log("[Router] Approval needed, pausing for human input");
    return END;  // Return to user with approval message
  } else {
    console.log("[Router] No approval needed, proceeding to execute tools");
    return "tools";
  }
}

/**
 * Build and configure the LangGraph workflow with Human-in-the-Loop (HITL)
 *
 * Graph flow:
 * START -> analyzeIntent -> [greeting/farewell/question]
 *   - greeting -> END
 *   - farewell -> END
 *   - question -> [validate or END]
 *       - if tool_calls exist -> validate -> [tools or END]
 *           - if needs approval -> END (ask user for clarification)
 *           - else -> callTools -> question (agent loop)
 *       - else -> END
 *
 * LANGGRAPH CONCEPT 6: PERSISTENCE WITH CHECKPOINTING
 *
 * Checkpointing enables conversation persistence across invocations.
 * Each conversation is identified by a thread_id in the config.
 * The checkpointer stores state (messages, etc.) between calls.
 */
export function createChatbot(checkpointer?: BaseCheckpointSaver) {
  // Initialize the state graph using the Annotation (LangGraph v1.x API)
  const graph = new StateGraph(ChatStateAnnotation)
    // Add all nodes to the graph
    .addNode("analyzeIntent", analyzeIntent)
    .addNode("greeting", handleGreeting)
    .addNode("farewell", handleFarewell)
    .addNode("question", handleQuestion)
    .addNode("validate", validateToolCalls)  // HITL validation node
    .addNode("tools", callTools)
    // Define the flow: START -> analyzeIntent
    .addEdge(START, "analyzeIntent")
    // Route from analyzeIntent to appropriate handler
    .addConditionalEdges("analyzeIntent", routeByIntent)
    // Greeting and farewell go directly to END
    .addEdge("greeting", END)
    .addEdge("farewell", END)
    // Question handler checks if tools need to be called
    .addConditionalEdges("question", shouldContinue)
    // Validate tools before execution (HITL checkpoint)
    .addConditionalEdges("validate", needsApprovalRouter)
    // After tools are called, go back to question handler for final response
    .addEdge("tools", "question");

  // Compile the graph with optional checkpointer for persistence
  return graph.compile({ checkpointer });
}

// Export MemorySaver for convenience
export { MemorySaver };
