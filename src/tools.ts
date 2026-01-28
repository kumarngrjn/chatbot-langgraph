import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Calculator tool - performs basic arithmetic operations
 */
export const calculatorTool = tool(
  async ({ operation, a, b }) => {
    switch (operation) {
      case "add":
        return `${a} + ${b} = ${a + b}`;
      case "subtract":
        return `${a} - ${b} = ${a - b}`;
      case "multiply":
        return `${a} * ${b} = ${a * b}`;
      case "divide":
        if (b === 0) {
          return "Error: Cannot divide by zero";
        }
        return `${a} / ${b} = ${a / b}`;
      default:
        return "Error: Unknown operation";
    }
  },
  {
    name: "calculator",
    description: "Performs basic arithmetic operations (add, subtract, multiply, divide)",
    schema: z.object({
      operation: z.enum(["add", "subtract", "multiply", "divide"]).describe("The arithmetic operation to perform"),
      a: z.number().describe("The first number"),
      b: z.number().describe("The second number"),
    }),
  }
);

/**
 * Weather tool - simulates weather lookup (in production, would call a real API)
 */
export const weatherTool = tool(
  async ({ location }) => {
    // Simulate API call with mock data
    // In production, you would call a real weather API like OpenWeatherMap
    const mockWeatherData: Record<string, any> = {
      "new york": { temp: 72, condition: "Partly cloudy", humidity: 65 },
      "london": { temp: 60, condition: "Rainy", humidity: 80 },
      "tokyo": { temp: 75, condition: "Sunny", humidity: 55 },
      "paris": { temp: 68, condition: "Cloudy", humidity: 70 },
      "sydney": { temp: 82, condition: "Sunny", humidity: 50 },
    };

    const normalizedLocation = location.toLowerCase();
    const weather = mockWeatherData[normalizedLocation];

    if (weather) {
      return `Weather in ${location}:\nTemperature: ${weather.temp}°F\nCondition: ${weather.condition}\nHumidity: ${weather.humidity}%`;
    } else {
      return `Weather data not available for ${location}. (This is a demo - only major cities like New York, London, Tokyo, Paris, and Sydney are supported)`;
    }
  },
  {
    name: "get_weather",
    description: "Get current weather information for a specific location",
    schema: z.object({
      location: z.string().describe("The city name to get weather for (e.g., 'New York', 'London')"),
    }),
  }
);

/**
 * Search tool - simulates web search (mock implementation)
 */
export const searchTool = tool(
  async ({ query }) => {
    // Simulate search results
    // In production, you would call a real search API like Brave Search, Tavily, or Serper
    const mockResults: Record<string, string> = {
      langgraph: "LangGraph is a library for building stateful, multi-actor applications with LLMs. It extends LangChain with the ability to create cyclical graphs.",
      typescript: "TypeScript is a strongly typed programming language that builds on JavaScript, giving you better tooling at any scale.",
      nodejs: "Node.js is an open-source, cross-platform JavaScript runtime environment that executes JavaScript code outside a web browser.",
    };

    // Simple keyword matching
    for (const [keyword, result] of Object.entries(mockResults)) {
      if (query.toLowerCase().includes(keyword)) {
        return `Search results for "${query}":\n\n${result}`;
      }
    }

    return `Search results for "${query}":\n\nNo specific results found in this demo. In production, this would call a real search API.`;
  },
  {
    name: "web_search",
    description: "Search the web for information about a topic",
    schema: z.object({
      query: z.string().describe("The search query"),
    }),
  }
);

// Export all tools as an array for easy binding
export const tools = [calculatorTool, weatherTool, searchTool];
