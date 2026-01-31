import { tool } from "@langchain/core/tools";
import { z } from "zod";
import axios from "axios";

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
 * Weather tool - gets real weather data from api.weather.gov (National Weather Service)
 * No API key required - completely free!
 * Note: Uses Nominatim (OpenStreetMap) for geocoding city names to coordinates
 */
export const weatherTool = tool(
  async ({ location }) => {
    try {
      // Step 1: Geocode the location using Nominatim (free, no API key needed)
      console.log(`[Weather Tool] Geocoding location: ${location}`);
      const geocodeResponse = await axios.get(
        'https://nominatim.openstreetmap.org/search',
        {
          params: {
            q: location,
            format: 'json',
            limit: 1
          },
          headers: {
            'User-Agent': 'LangGraph-Chatbot/1.0' // Nominatim requires a User-Agent
          },
          timeout: 5000
        }
      );

      if (!geocodeResponse.data || geocodeResponse.data.length === 0) {
        return `Could not find location "${location}". Please check the city name and try again.`;
      }

      const { lat, lon, display_name } = geocodeResponse.data[0];
      console.log(`[Weather Tool] Found coordinates: ${lat}, ${lon} for ${display_name}`);

      // Step 2: Get the weather forecast point from weather.gov
      const pointsResponse = await axios.get(
        `https://api.weather.gov/points/${lat},${lon}`,
        {
          headers: {
            'User-Agent': 'LangGraph-Chatbot/1.0' // weather.gov requires a User-Agent
          },
          timeout: 5000
        }
      );

      const forecastUrl = pointsResponse.data.properties.forecast;

      // Step 3: Get the actual forecast
      const forecastResponse = await axios.get(forecastUrl, {
        headers: {
          'User-Agent': 'LangGraph-Chatbot/1.0'
        },
        timeout: 5000
      });

      const currentPeriod = forecastResponse.data.properties.periods[0];

      return `Weather in ${display_name}:
Temperature: ${currentPeriod.temperature}°${currentPeriod.temperatureUnit}
Condition: ${currentPeriod.shortForecast}
Wind: ${currentPeriod.windSpeed} ${currentPeriod.windDirection}
Forecast: ${currentPeriod.detailedForecast}`;

    } catch (error: any) {
      if (error.response?.status === 404) {
        return `Weather data not available for "${location}". Note: api.weather.gov only covers the United States. For international locations, please try a US city.`;
      } else if (error.code === 'ECONNABORTED') {
        return `Weather API request timed out. Please try again.`;
      } else {
        console.error('[Weather Tool] Error:', error.message);
        return `Failed to fetch weather data: ${error.message}`;
      }
    }
  },
  {
    name: "get_weather",
    description: "Get current weather information for US cities using real-time data from the National Weather Service (completely free, no API key needed)",
    schema: z.object({
      location: z.string().describe("The city name to get weather for (e.g., 'New York', 'San Francisco', 'Chicago'). Note: Only US cities are supported."),
    }),
  }
);

/**
 * Search tool - performs web search using Tavily API
 * Requires TAVILY_API_KEY environment variable
 */
export const searchTool = tool(
  async ({ query }) => {
    const apiKey = process.env.TAVILY_API_KEY;

    if (!apiKey) {
      return `Search tool requires a Tavily API key. Please add TAVILY_API_KEY to your .env file. Get a free API key at https://tavily.com`;
    }

    try {
      console.log(`[Search Tool] Searching for: ${query}`);

      // Call Tavily Search API
      const response = await axios.post(
        'https://api.tavily.com/search',
        {
          api_key: apiKey,
          query: query,
          search_depth: 'basic',
          include_answer: true,
          max_results: 5
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      const data = response.data;

      // Format the results
      let result = `Search results for "${query}":\n\n`;

      // Include AI-generated answer if available
      if (data.answer) {
        result += `Summary: ${data.answer}\n\n`;
      }

      // Include top search results
      if (data.results && data.results.length > 0) {
        result += "Top Results:\n";
        data.results.slice(0, 3).forEach((item: any, index: number) => {
          result += `\n${index + 1}. ${item.title}\n`;
          result += `   ${item.content}\n`;
          result += `   Source: ${item.url}\n`;
        });
      } else {
        result += "No results found.";
      }

      return result;

    } catch (error: any) {
      if (error.response?.status === 401) {
        return `Search API authentication failed. Please check your TAVILY_API_KEY in .env file.`;
      } else if (error.code === 'ECONNABORTED') {
        return `Search API request timed out. Please try again.`;
      } else {
        console.error('[Search Tool] Error:', error.message);
        return `Failed to perform web search: ${error.message}`;
      }
    }
  },
  {
    name: "web_search",
    description: "Search the web for current information about any topic using Tavily search API. Provides AI-powered summaries and top results.",
    schema: z.object({
      query: z.string().describe("The search query (e.g., 'latest news about AI', 'how to bake bread', 'LangGraph tutorial')"),
    }),
  }
);

// Export all tools as an array for easy binding
export const tools = [calculatorTool, weatherTool, searchTool];
