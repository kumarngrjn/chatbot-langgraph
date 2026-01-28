# LangGraph Chatbot Demo

A simple TypeScript chatbot application that demonstrates core LangGraph capabilities including state management, nodes, and conditional routing.

## What is LangGraph?

LangGraph is a library for building stateful, multi-actor applications with LLMs. It extends LangChain with the ability to create cyclical graphs that are essential for developing agent-like behaviors.

## Key Concepts Demonstrated

This chatbot demonstrates four fundamental LangGraph concepts:

### 1. State Management
The chatbot maintains a `ChatState` that tracks:
- **Messages**: Full conversation history
- **User Intent**: Detected intent (greeting, question, farewell)
- **Conversation Count**: Number of exchanges

State flows through the entire graph, and each node can read from and update it.

### 2. Nodes
Nodes are functions that process the state. This chatbot has five nodes:
- **analyzeIntent**: Detects user intent from input
- **handleGreeting**: Responds to greetings
- **handleFarewell**: Responds to farewells
- **handleQuestion**: Uses Claude to answer questions (with tools)
- **callTools**: Executes tools requested by Claude

### 3. Conditional Routing
The `routeByIntent` function dynamically determines which node to execute next based on the detected intent, enabling flexible conversation flow.

### 4. Tool Calling (Agent Loop)
The chatbot can use external tools:
- **Calculator**: Performs arithmetic operations
- **Weather**: Gets weather for major cities
- **Search**: Searches for information

When a question requires a tool, the graph creates an agent loop:
`question → tool execution → question → final answer`

See [TOOL_CALLING.md](TOOL_CALLING.md) for detailed documentation.

## Project Structure

```
chatbot-langgraph/
├── src/
│   ├── chatbot.ts    # LangGraph implementation with nodes and routing
│   ├── index.ts      # CLI chatbot interface
│   └── server.ts     # Express API server for web UI
├── client/           # React web UI
│   ├── src/
│   │   ├── App.tsx   # Main chat component
│   │   └── App.css   # Chat UI styles
│   └── package.json
├── package.json
├── tsconfig.json
└── .env              # Your API key (create this)
```

## Setup

1. **Install backend dependencies**:
   ```bash
   npm install
   ```

2. **Install frontend dependencies**:
   ```bash
   cd client
   npm install
   cd ..
   ```

3. **Set up your API key**:
   ```bash
   cp .env.example .env
   # Edit .env and add your Anthropic API key
   ```

## Running the Application

### Option 1: Web UI (Recommended)

1. **Start the backend server**:
   ```bash
   npm run server
   ```
   The API will run on `http://localhost:3001`

2. **In a new terminal, start the React frontend**:
   ```bash
   cd client
   npm run dev
   ```
   The web app will open at `http://localhost:5173`

3. **Open your browser** and navigate to the URL shown

### Option 2: Command Line Interface

Run the enhanced CLI version with colors and commands:
```bash
npm run dev
```

Available CLI commands:
- `/help` - Show help menu
- `/clear` - Clear screen
- `/history` - View conversation history
- `/stats` - Show statistics
- `/exit` - Exit the chatbot

## How It Works

### Graph Flow

```
START
  ↓
analyzeIntent (detects user intent)
  ↓
[Conditional Routing]
  ├→ greeting → handleGreeting → END
  ├→ farewell → handleFarewell → END
  └→ question → handleQuestion (calls Claude with tools)
       ↓
     [shouldContinue]
       ├→ tool_calls exist → callTools → back to handleQuestion (agent loop)
       └→ no tool_calls → END
```

### Example Interactions

**Basic Conversation:**
```
You: hello
[Intent Analyzer] Detected intent: greeting
[Greeting Handler] Processing greeting...
Bot: Hello! I'm a chatbot built with LangGraph...
[State] Intent: greeting | Conversation count: 1
```

**Tool Calling (Agent Loop):**
```
You: What is 25 times 4?
[Intent Analyzer] Detected intent: question
[Question Handler] Processing question with Claude...
[Router] Found 1 tool call(s), routing to tool executor
[Tool Executor] Calling tool: calculator with args: { operation: 'multiply', a: 25, b: 4 }
[Tool Executor] Tool calculator returned: 25 * 4 = 100
[Question Handler] Processing question with Claude...
[Router] No tool calls, ending conversation turn
Bot: 25 times 4 equals **100**.
[State] Intent: question | Tools used: calculator | Conversation count: 2
```

**Weather Lookup:**
```
You: What's the weather in Tokyo?
[Tool Executor] Calling tool: get_weather with args: { location: 'Tokyo' }
Bot: The weather in Tokyo is currently sunny, 75°F with 55% humidity.
```

## Understanding the Code

### State Definition ([chatbot.ts:13-17](src/chatbot.ts#L13-L17))
```typescript
interface ChatState {
  messages: BaseMessage[];
  userIntent: "greeting" | "question" | "farewell" | "unknown";
  conversationCount: number;
}
```

### Creating Nodes ([chatbot.ts:27-90](src/chatbot.ts#L27-L90))
Each node is an async function that receives the current state and returns updates:
```typescript
async function analyzeIntent(state: ChatState): Promise<Partial<ChatState>> {
  // Process state and return updates
  return { userIntent: intent };
}
```

### Conditional Routing ([chatbot.ts:97-108](src/chatbot.ts#L97-L108))
The router determines the next node based on state:
```typescript
function routeByIntent(state: ChatState): string {
  switch (state.userIntent) {
    case "greeting": return "greeting";
    case "farewell": return "farewell";
    default: return "question";
  }
}
```

### Building the Graph ([chatbot.ts:113-153](src/chatbot.ts#L113-L153))
```typescript
const workflow = new StateGraph<ChatState>({ channels: {...} });
workflow.addNode("analyzeIntent", analyzeIntent);
workflow.addEdge(START, "analyzeIntent");
workflow.addConditionalEdges("analyzeIntent", routeByIntent, {...});
return workflow.compile();
```

## Learn More

- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [LangChain Documentation](https://js.langchain.com/docs/)
- [Anthropic Claude](https://www.anthropic.com/claude)

## License

ISC