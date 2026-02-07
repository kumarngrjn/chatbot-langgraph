import express, { Request, Response } from "express";
import cors from "cors";
import bodyParser from "body-parser";
import * as dotenv from "dotenv";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { createChatbot, MemorySaver } from "./chatbot";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

/**
 * LANGGRAPH PERSISTENCE
 *
 * MemorySaver stores conversation state in memory.
 * Each conversation is identified by a unique thread_id.
 * State persists across requests but not server restarts.
 *
 * For production, use SqliteSaver or PostgresSaver for persistent storage.
 */
const checkpointer = new MemorySaver();

// Create chatbot instance with checkpointer for persistence
const chatbot = createChatbot(checkpointer);

// Track conversation counts separately (not part of graph state for simplicity)
const conversationCounts = new Map<string, number>();

// Health check endpoint
app.get("/api/health", (req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Chat endpoint
app.post("/api/chat", async (req: Request, res: Response) => {
  try {
    const { message, sessionId } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Get or initialize conversation count
    const currentCount = conversationCounts.get(sessionId) || 0;

    // Configure the thread for persistence
    const config = {
      configurable: {
        thread_id: sessionId,
      },
    };

    console.log(`[Server] Processing message for thread: ${sessionId}`);

    // Invoke the chatbot with just the new message
    // The checkpointer handles message history automatically
    const result = await chatbot.invoke(
      {
        messages: [new HumanMessage(message)],
        userIntent: "unknown" as const,
        conversationCount: currentCount,
      },
      config
    );

    // Update conversation count
    const newCount = (result.conversationCount as number) || currentCount + 1;
    conversationCounts.set(sessionId, newCount);

    // Check if human approval is needed (HITL)
    if (result.needsApproval && result.approvalMessage) {
      console.log("[Server] Human approval needed, returning approval message");
      return res.json({
        response: result.approvalMessage,
        intent: result.userIntent,
        conversationCount: newCount,
        toolsUsed: [],
        toolCallDetails: [],
        needsApproval: true,
        timestamp: new Date().toISOString(),
      });
    }

    // Get the last message (bot's response)
    const messages = result.messages as AIMessage[];
    const lastMessage = messages[messages.length - 1];

    // Extract tools used from the conversation
    const toolsUsed: string[] = [];
    const toolCallDetails: Array<{ name: string; args: Record<string, unknown> }> = [];
    for (const msg of messages) {
      if (msg._getType() === "ai") {
        const aiMsg = msg as AIMessage;
        if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
          aiMsg.tool_calls.forEach((tc) => {
            if (!toolsUsed.includes(tc.name)) {
              toolsUsed.push(tc.name);
            }
            toolCallDetails.push({
              name: tc.name,
              args: tc.args as Record<string, unknown>,
            });
          });
        }
      }
    }

    // Return response
    res.json({
      response: lastMessage.content,
      intent: result.userIntent,
      conversationCount: newCount,
      toolsUsed: toolsUsed,
      toolCallDetails: toolCallDetails,
      needsApproval: false,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error processing chat:", error);
    res.status(500).json({
      error: "Failed to process message",
      details: error.message,
    });
  }
});

// Get conversation history from checkpointer
app.get("/api/conversation/:sessionId", async (req: Request, res: Response) => {
  try {
    const sessionId = req.params.sessionId as string;

    // Get state from checkpointer
    const config = { configurable: { thread_id: sessionId } };
    const state = await chatbot.getState(config);

    if (!state || !state.values || !state.values.messages) {
      return res.json({
        messages: [],
        conversationCount: 0,
      });
    }

    const messages = state.values.messages as AIMessage[];

    res.json({
      messages: messages.map((msg) => ({
        role: msg._getType() === "human" ? "user" : "assistant",
        content: msg.content,
      })),
      conversationCount: conversationCounts.get(sessionId) || 0,
    });
  } catch (error: any) {
    console.error("Error getting conversation:", error);
    res.json({
      messages: [],
      conversationCount: 0,
    });
  }
});

// Clear conversation
app.delete("/api/conversation/:sessionId", async (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;

  // Clear the conversation count
  conversationCounts.delete(sessionId);

  // Note: MemorySaver doesn't have a delete method, but we can reset by tracking
  // For full deletion, you'd need to use a persistent checkpointer like SqliteSaver

  res.json({ success: true });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Server is running on http://localhost:${PORT}`);
  console.log(`📡 API endpoint: http://localhost:${PORT}/api/chat`);
  console.log(`💾 Persistence: MemorySaver (in-memory)`);
  console.log(`\n✨ LangGraph Chatbot Backend Ready!\n`);
});
