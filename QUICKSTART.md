# Quick Start Guide - LangGraph Chatbot Web UI

This guide will help you get the chatbot web UI up and running in minutes.

## Prerequisites

- Node.js (v18 or higher)
- npm (comes with Node.js)
- Anthropic API key

## Step 1: Set Up Environment

1. Create your `.env` file:
```bash
cp .env.example .env
```

2. Add your Anthropic API key to `.env`:
```
ANTHROPIC_API_KEY=your_api_key_here
```

## Step 2: Install Dependencies

```bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd client
npm install
cd ..
```

## Step 3: Run the Application

Open two terminal windows:

**Terminal 1 - Backend Server:**
```bash
npm run server
```

You should see:
```
🚀 Server is running on http://localhost:3001
📡 API endpoint: http://localhost:3001/api/chat
✨ LangGraph Chatbot Backend Ready!
```

**Terminal 2 - Frontend:**
```bash
cd client
npm run dev
```

You should see:
```
VITE v5.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
```

## Step 4: Open Your Browser

Navigate to `http://localhost:5173`

You'll see a beautiful chat interface with:
- 🎨 Modern gradient design
- 💬 Real-time chat bubbles
- 🏷️ Intent badges (greeting, question, farewell)
- 📊 Conversation statistics
- ⚡ Loading animations

## Features

- **Smart Intent Detection**: The bot automatically detects if you're greeting, asking a question, or saying goodbye
- **Conversation Memory**: Full context awareness across the conversation
- **Clear Chat**: Reset the conversation anytime with the "Clear Chat" button
- **Message History**: View timestamps and intent for each message
- **Responsive Design**: Works on desktop and mobile browsers

## Try It Out!

1. Type "hello" to see the greeting handler
2. Ask a question like "What is LangGraph?"
3. Type "bye" to see the farewell handler
4. Click "Clear Chat" to start over

## Troubleshooting

### Backend won't start
- Check that port 3001 is not already in use
- Verify your `.env` file has the correct API key
- Run `npm install` again if needed

### Frontend won't start
- Check that port 5173 is not already in use
- Make sure you're in the `client` directory
- Run `npm install` in the client directory

### Can't connect to backend
- Make sure the backend server is running on port 3001
- Check browser console for CORS errors
- Verify the API_URL in `client/src/App.tsx` is correct

## Next Steps

- Modify [src/chatbot.ts](src/chatbot.ts) to add more nodes or change routing logic
- Customize the UI in [client/src/App.tsx](client/src/App.tsx) and [client/src/App.css](client/src/App.css)
- Add more LangGraph features like checkpoints, subgraphs, or tools

Enjoy your LangGraph chatbot! 🚀
