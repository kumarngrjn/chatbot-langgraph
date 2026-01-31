import express, { Request, Response } from "express";
import cors from "cors";
import bodyParser from "body-parser";
import * as dotenv from "dotenv";
import { HumanMessage, BaseMessage, AIMessage } from "@langchain/core/messages";
import { createChatbot } from "./chatbot";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Store conversations in memory (in production, use a database)
interface Conversation {
  messages: BaseMessage[];
  conversationCount: number;
}

const conversations = new Map<string, Conversation>();

// Create chatbot instance
const chatbot = createChatbot();

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

    // Get or create conversation for this session
    let conversation = conversations.get(sessionId);
    if (!conversation) {
      conversation = {
        messages: [],
        conversationCount: 0,
      };
      conversations.set(sessionId, conversation);
    }

    // Add user message
    conversation.messages.push(new HumanMessage(message));

    // Invoke the chatbot
    const result = await chatbot.invoke({
      messages: conversation.messages,
      userIntent: "unknown" as const,
      conversationCount: conversation.conversationCount,
    });

    // Update conversation state
    conversation.messages = result.messages as BaseMessage[];
    conversation.conversationCount = result.conversationCount as number;

    // Check if human approval is needed (HITL)
    if (result.needsApproval && result.approvalMessage) {
      console.log("[Server] Human approval needed, returning approval message");
      return res.json({
        response: result.approvalMessage,
        intent: result.userIntent,
        conversationCount: result.conversationCount,
        toolsUsed: [],
        toolCallDetails: [],
        needsApproval: true,
        timestamp: new Date().toISOString(),
      });
    }

    // Get the last message (bot's response)
    const lastMessage = conversation.messages[conversation.messages.length - 1];

    // Extract tools used from the conversation
    const toolsUsed: string[] = [];
    const toolCallDetails: Array<{name: string, args: any}> = [];
    for (const msg of conversation.messages) {
      if (msg._getType() === "ai") {
        const aiMsg = msg as AIMessage;
        if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
          aiMsg.tool_calls.forEach(tc => {
            if (!toolsUsed.includes(tc.name)) {
              toolsUsed.push(tc.name);
            }
            toolCallDetails.push({
              name: tc.name,
              args: tc.args
            });
          });
        }
      }
    }

    // Return response
    res.json({
      response: lastMessage.content,
      intent: result.userIntent,
      conversationCount: result.conversationCount,
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

// Get conversation history
app.get("/api/conversation/:sessionId", (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;
  const conversation = conversations.get(sessionId);

  if (!conversation) {
    return res.json({
      messages: [],
      conversationCount: 0,
    });
  }

  res.json({
    messages: conversation.messages.map((msg) => ({
      role: msg._getType() === "human" ? "user" : "assistant",
      content: msg.content,
    })),
    conversationCount: conversation.conversationCount,
  });
});

// Clear conversation
app.delete("/api/conversation/:sessionId", (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;
  conversations.delete(sessionId);
  res.json({ success: true });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Server is running on http://localhost:${PORT}`);
  console.log(`📡 API endpoint: http://localhost:${PORT}/api/chat`);
  console.log(`\n✨ LangGraph Chatbot Backend Ready!\n`);
});
