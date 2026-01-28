import * as dotenv from "dotenv";
import * as readline from "readline";
import chalk from "chalk";
import ora from "ora";
import Table from "cli-table3";
import { HumanMessage, BaseMessage } from "@langchain/core/messages";
import { createChatbot } from "./chatbot";

// Load environment variables
dotenv.config();

// Conversation history with timestamps
interface ConversationEntry {
  timestamp: Date;
  role: "user" | "assistant";
  content: string;
  intent?: string;
}

let conversationHistory: ConversationEntry[] = [];

// Display welcome banner
function displayWelcome() {
  console.clear();
  console.log(chalk.cyan.bold("\n┌" + "─".repeat(68) + "┐"));
  console.log(chalk.cyan.bold("│") + chalk.white.bold("  🤖 LangGraph Chatbot - AI Assistant with State Management      ") + chalk.cyan.bold("│"));
  console.log(chalk.cyan.bold("└" + "─".repeat(68) + "┘\n"));

  console.log(chalk.yellow("📚 This chatbot demonstrates LangGraph concepts:\n"));
  console.log(chalk.gray("  ▸ STATE MANAGEMENT") + " - Tracks messages, intent, and conversation count");
  console.log(chalk.gray("  ▸ NODES") + " - Different handlers for greetings, questions, and farewells");
  console.log(chalk.gray("  ▸ CONDITIONAL ROUTING") + " - Routes to different nodes based on intent\n");

  displayHelp();
  console.log(chalk.cyan("─".repeat(70)) + "\n");
}

// Display help menu
function displayHelp() {
  console.log(chalk.yellow("💡 Available Commands:\n"));
  console.log(chalk.gray("  /help    ") + "- Show this help menu");
  console.log(chalk.gray("  /clear   ") + "- Clear the screen");
  console.log(chalk.gray("  /history ") + "- View conversation history");
  console.log(chalk.gray("  /stats   ") + "- Show conversation statistics");
  console.log(chalk.gray("  /exit    ") + "- Exit the chatbot");
  console.log(chalk.gray("\n  Or just type your message to chat!\n"));
}

// Display conversation history
function displayHistory() {
  console.log(chalk.cyan("\n" + "─".repeat(70)));
  console.log(chalk.cyan.bold("📜 Conversation History\n"));

  if (conversationHistory.length === 0) {
    console.log(chalk.gray("  No conversation history yet.\n"));
    return;
  }

  const table = new Table({
    head: [
      chalk.white.bold("Time"),
      chalk.white.bold("Role"),
      chalk.white.bold("Message"),
      chalk.white.bold("Intent"),
    ],
    colWidths: [12, 12, 35, 12],
    wordWrap: true,
    style: {
      head: [],
      border: ["gray"],
    },
  });

  conversationHistory.forEach((entry) => {
    const time = entry.timestamp.toLocaleTimeString();
    const role = entry.role === "user"
      ? chalk.green("👤 You")
      : chalk.blue("🤖 Bot");
    const content = entry.content.substring(0, 100) + (entry.content.length > 100 ? "..." : "");
    const intent = entry.intent ? chalk.yellow(entry.intent) : chalk.gray("-");

    table.push([time, role, content, intent]);
  });

  console.log(table.toString());
  console.log(chalk.cyan("─".repeat(70)) + "\n");
}

// Display statistics
function displayStats(conversationCount: number, messages: any[]) {
  console.log(chalk.cyan("\n" + "─".repeat(70)));
  console.log(chalk.cyan.bold("📊 Conversation Statistics\n"));

  const userMessages = conversationHistory.filter(e => e.role === "user").length;
  const botMessages = conversationHistory.filter(e => e.role === "assistant").length;
  const intents = conversationHistory.filter(e => e.intent).map(e => e.intent);
  const intentCounts = intents.reduce((acc: any, intent) => {
    acc[intent!] = (acc[intent!] || 0) + 1;
    return acc;
  }, {});

  console.log(chalk.gray("  Total Exchanges:     ") + chalk.white.bold(conversationCount));
  console.log(chalk.gray("  Your Messages:       ") + chalk.green.bold(userMessages));
  console.log(chalk.gray("  Bot Responses:       ") + chalk.blue.bold(botMessages));
  console.log(chalk.gray("  Total Messages:      ") + chalk.white.bold(messages.length));

  if (Object.keys(intentCounts).length > 0) {
    console.log(chalk.gray("\n  Intent Breakdown:"));
    Object.entries(intentCounts).forEach(([intent, count]) => {
      console.log(chalk.gray(`    • ${intent}: `) + chalk.yellow.bold(count as string));
    });
  }

  console.log(chalk.cyan("\n" + "─".repeat(70)) + "\n");
}

async function main() {
  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(chalk.red.bold("\n❌ Error: ANTHROPIC_API_KEY not found in environment variables."));
    console.error(chalk.yellow("Please create a .env file with your API key."));
    console.error(chalk.gray("See .env.example for reference.\n"));
    process.exit(1);
  }

  // Display welcome screen
  displayWelcome();

  // Create the chatbot graph
  const chatbot = createChatbot();

  // Initialize state
  let messages: any[] = [];
  let conversationCount = 0;

  // Create readline interface for user input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = (query: string): Promise<string> => {
    return new Promise((resolve) => rl.question(query, resolve));
  };

  // Main conversation loop
  while (true) {
    const userInput = await askQuestion(chalk.green.bold("You: "));

    if (!userInput.trim()) {
      continue;
    }

    // Handle commands
    if (userInput.startsWith("/")) {
      const command = userInput.toLowerCase().trim();

      if (command === "/exit") {
        console.log(chalk.cyan("\n👋 Goodbye! Thanks for chatting!\n"));
        rl.close();
        break;
      } else if (command === "/help") {
        displayHelp();
        continue;
      } else if (command === "/clear") {
        displayWelcome();
        continue;
      } else if (command === "/history") {
        displayHistory();
        continue;
      } else if (command === "/stats") {
        displayStats(conversationCount, messages);
        continue;
      } else {
        console.log(chalk.red(`\n❌ Unknown command: ${command}`));
        console.log(chalk.gray("Type /help to see available commands.\n"));
        continue;
      }
    }

    // Add user message to history
    conversationHistory.push({
      timestamp: new Date(),
      role: "user",
      content: userInput,
    });

    // Add user message to state
    messages.push(new HumanMessage(userInput));

    // Show loading spinner
    const spinner = ora({
      text: chalk.gray("Thinking..."),
      color: "cyan",
    }).start();

    try {
      // Invoke the graph with current state
      const result = await chatbot.invoke({
        messages: messages,
        userIntent: "unknown" as const,
        conversationCount: conversationCount,
      });

      // Stop spinner
      spinner.stop();

      // Update local state with proper typing
      messages = result.messages as any[];
      conversationCount = result.conversationCount as number;

      // Display the AI's response
      const lastMessage = (result.messages as any[])[result.messages.length - 1];

      console.log(chalk.blue.bold("\n🤖 Bot: ") + chalk.white(lastMessage.content));

      // Display state info in a subtle way
      const intentEmoji = result.userIntent === "greeting" ? "👋" :
                         result.userIntent === "farewell" ? "👋" :
                         result.userIntent === "question" ? "❓" : "💬";
      console.log(chalk.gray(`\n${intentEmoji} Intent: ${result.userIntent} | 💬 Messages: ${result.conversationCount}`));
      console.log(chalk.cyan("─".repeat(70)) + "\n");

      // Add bot message to history
      conversationHistory.push({
        timestamp: new Date(),
        role: "assistant",
        content: lastMessage.content,
        intent: result.userIntent,
      });

    } catch (error: any) {
      spinner.stop();
      console.error(chalk.red.bold("\n❌ Error: ") + chalk.red(error.message));
      console.log(chalk.cyan("─".repeat(70)) + "\n");
    }
  }
}

main().catch((error) => {
  console.error(chalk.red.bold("\n❌ Fatal Error: ") + chalk.red(error.message));
  process.exit(1);
});
