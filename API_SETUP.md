# API Setup Guide

This guide explains the API integrations for the chatbot's tools.

## Overview

The chatbot uses three tools:

1. **Calculator** - No API needed (pure computation)
2. **Weather** - Free APIs: api.weather.gov + Nominatim (OpenStreetMap, no signup required)
3. **Search** - Tavily Search API (free tier available)

## Quick Start

```bash
cp .env.example .env
# Add your ANTHROPIC_API_KEY and TAVILY_API_KEY
```

The weather tool uses completely free, public APIs that require no signup!

## About the Free APIs

### 1. Weather Tool - api.weather.gov + Nominatim

**What it does:** Get real-time weather data for US cities

**How it works:**
1. Uses Nominatim (OpenStreetMap) to convert city names to coordinates
2. Queries api.weather.gov (National Weather Service) for current weather
3. Returns temperature, conditions, wind, and detailed forecast

**No signup required!** Both APIs are completely free and open.

**Limitations:**
- api.weather.gov only covers United States locations
- For best results, use US city names

**Example queries:**
- "What's the weather in New York?"
- "Tell me the temperature in San Francisco"
- "Is it raining in Seattle?"

### 2. Search Tool - Tavily API

**What it does:** Get real, current information from the web with AI-powered summaries

**How it works:**
- Queries Tavily's Search API for comprehensive web results
- Returns AI-generated summaries and top results with URLs
- Excellent for current information and detailed queries

**Setup:**
1. Go to [https://tavily.com](https://tavily.com)
2. Sign up for a free account
3. Copy your API key from the dashboard
4. Add to your `.env` file:
   ```
   TAVILY_API_KEY=your_key_here
   ```

**Free Tier:**
- 1,000 API calls/month
- AI-powered search results
- Includes answer summaries

**Example queries:**
- "Latest news about SpaceX"
- "How to make sourdough bread"
- "What is LangGraph and how does it work"

## Complete .env File Example

```bash
# Required - Anthropic API key for Claude
ANTHROPIC_API_KEY=sk-ant-api03-xxx

# Required - Tavily API key for web search
TAVILY_API_KEY=tvly-xyz789

# Weather tool uses free public APIs (no key needed)
```

## Testing the Tools

### Test Weather Tool

Start the server:
```bash
npm run server
```

In a new terminal:
```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is the weather in Seattle?",
    "sessionId": "test-weather"
  }'
```

**Expected response:**
```json
{
  "response": "Weather in Seattle, Washington:\nTemperature: 45°F\nCondition: Partly Cloudy\nWind: 10 mph NW\nForecast: Partly cloudy with a chance of rain later...",
  "toolsUsed": ["get_weather"]
}
```

**Note:** Only US cities are supported (api.weather.gov limitation). For international cities, the API will return an error message explaining this limitation.

### Test Search Tool

```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Search for information about LangGraph",
    "sessionId": "test-search"
  }'
```

**Expected response:**
Tavily results with:
- AI-generated summary
- Top 3 web results with titles, descriptions, and URLs
- Current, up-to-date information

## Error Handling

The chatbot handles API errors gracefully:

### Weather Tool Errors
- **Location not found**: Clear message asking to check city name spelling
- **Non-US location**: Explains that api.weather.gov only covers the United States
- **Network timeout**: User-friendly error message suggesting retry
- **API temporarily down**: Informative error with suggestion to try again

### Search Tool Errors
- **API authentication failed**: Clear message to check TAVILY_API_KEY in .env
- **Network timeout**: User-friendly error message suggesting retry
- **No results found**: Rare, but handled gracefully

## API Costs

| API | Free Tier | Paid Plans |
|-----|-----------|------------|
| api.weather.gov | Unlimited | N/A (always free) |
| Nominatim (geocoding) | Unlimited | N/A (always free) |
| Tavily | 1,000 calls/month | $49/month for 10,000 calls |
| Anthropic (Claude) | Pay per use | Various tiers available |

**Recommendation:** The free tiers are more than enough for development and testing!

## Security Best Practices

1. **Never commit `.env` files**
   - Already in `.gitignore`
   - Share `.env.example` only

2. **Protect your Anthropic API key**
   - Only environment variable that needs protection
   - Rotate if you suspect exposure

3. **Use environment-specific keys**
   - Development keys for local testing
   - Production keys for deployment

4. **Monitor Claude API usage**
   - Check your usage at console.anthropic.com
   - Set up billing alerts if needed

## Troubleshooting

### "Weather data not available for [city]"
- Check city name spelling
- **Important:** api.weather.gov only supports US cities
- Try "New York" instead of "New York, USA"
- Very small towns might not be found by Nominatim

### "Request timed out"
- Check your internet connection
- APIs might be temporarily down (rare)
- Try again in a few seconds

### "Search API authentication failed"
- Check that your TAVILY_API_KEY is correctly copied to `.env`
- Ensure no extra spaces or quotes around the key
- Verify the key is active at https://tavily.com

### Server won't start
- Ensure you have `ANTHROPIC_API_KEY` in your `.env` file
- Check for typos in environment variable names
- Restart: `Ctrl+C` then `npm run server`

## Next Steps

Now that you have free APIs working:

1. Try the web UI for a better experience
2. Ask weather questions about US cities
3. Search for factual information and definitions
4. Combine tools: "What's the weather in Seattle and search for information about coffee"
5. Experiment with parallel tool execution (coming next!)

## API Documentation Links

- [api.weather.gov Documentation](https://www.weather.gov/documentation/services-web-api)
- [Nominatim API Docs](https://nominatim.org/release-docs/latest/api/Overview/)
- [Tavily API Docs](https://docs.tavily.com/)
- [LangChain Tools Guide](https://js.langchain.com/docs/modules/agents/tools/)

## Why These APIs?

We chose these APIs because:
- **Easy setup** - Weather requires no signup, Tavily has a simple free tier
- **Generous free tiers** - Perfect for learning and development
- **High quality results** - Tavily provides AI-powered summaries and current data
- **Reliable** - Government API (weather.gov) and established search service (Tavily)
- **Great for learning** - Focus on building with LangGraph, not managing complex APIs
