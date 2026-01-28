import { useState, useEffect, useRef } from 'react';
import './App.css';

interface ToolCallDetail {
  name: string;
  args: any;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  intent?: string;
  toolsUsed?: string[];
  toolCallDetails?: ToolCallDetail[];
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const [conversationCount, setConversationCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const API_URL = 'http://localhost:3001/api';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: input,
          sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const data = await response.json();

      const botMessage: Message = {
        role: 'assistant',
        content: data.response,
        timestamp: data.timestamp,
        intent: data.intent,
        toolsUsed: data.toolsUsed || [],
        toolCallDetails: data.toolCallDetails || [],
      };

      setMessages(prev => [...prev, botMessage]);
      setConversationCount(data.conversationCount);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearConversation = async () => {
    try {
      await fetch(`${API_URL}/conversation/${sessionId}`, {
        method: 'DELETE',
      });
      setMessages([]);
      setConversationCount(0);
    } catch (error) {
      console.error('Error clearing conversation:', error);
    }
  };

  const getIntentEmoji = (intent?: string) => {
    switch (intent) {
      case 'greeting': return '👋';
      case 'farewell': return '👋';
      case 'question': return '❓';
      default: return '💬';
    }
  };

  const getIntentColor = (intent?: string) => {
    switch (intent) {
      case 'greeting': return '#4CAF50';
      case 'farewell': return '#FF9800';
      case 'question': return '#2196F3';
      default: return '#9E9E9E';
    }
  };

  const getToolEmoji = (toolName: string) => {
    switch (toolName) {
      case 'calculator': return '🧮';
      case 'get_weather': return '🌤️';
      case 'web_search': return '🔍';
      default: return '🔧';
    }
  };

  const getToolDisplayName = (toolName: string) => {
    switch (toolName) {
      case 'calculator': return 'Calculator';
      case 'get_weather': return 'Weather';
      case 'web_search': return 'Search';
      default: return toolName;
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div className="header-title">
            <h1>🤖 LangGraph Chatbot</h1>
            <p>AI Assistant with State Management</p>
          </div>
          <div className="header-stats">
            <div className="stat">
              <span className="stat-label">Messages</span>
              <span className="stat-value">{conversationCount}</span>
            </div>
            <button className="clear-btn" onClick={clearConversation}>
              Clear Chat
            </button>
          </div>
        </div>
      </header>

      <div className="chat-container">
        <div className="messages">
          {messages.length === 0 && (
            <div className="welcome-message">
              <h2>Welcome! 👋</h2>
              <p>This chatbot demonstrates LangGraph concepts:</p>
              <ul>
                <li><strong>State Management</strong> - Tracks conversation history and context</li>
                <li><strong>Nodes</strong> - Different handlers for greetings, questions, and farewells</li>
                <li><strong>Conditional Routing</strong> - Routes to different nodes based on intent</li>
                <li><strong>Tool Calling</strong> - Uses calculator, weather, and search tools</li>
              </ul>
              <p>Try asking "What's 25 times 4?" or "What's the weather in Tokyo?"</p>
            </div>
          )}

          {messages.map((msg, index) => (
            <div key={index} className={`message ${msg.role}`}>
              <div className="message-avatar">
                {msg.role === 'user' ? '👤' : '🤖'}
              </div>
              <div className="message-content">
                <div className="message-bubble">
                  {msg.content}
                </div>
                <div className="message-meta">
                  <span className="message-time">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                  {msg.intent && (
                    <span
                      className="message-intent"
                      style={{ backgroundColor: getIntentColor(msg.intent) }}
                    >
                      {getIntentEmoji(msg.intent)} {msg.intent}
                    </span>
                  )}
                  {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                    <span
                      className="message-tool"
                      style={{ backgroundColor: '#9C27B0' }}
                    >
                      {msg.toolsUsed.map(tool => getToolEmoji(tool)).join(' ')}
                      {msg.toolsUsed.map(tool => getToolDisplayName(tool)).join(', ')}
                    </span>
                  )}
                </div>
                {msg.toolCallDetails && msg.toolCallDetails.length > 0 && (
                  <div className="tool-call-details">
                    {msg.toolCallDetails.map((toolCall, idx) => (
                      <div key={idx} className="tool-call-item">
                        <code>
                          {toolCall.name}({Object.entries(toolCall.args).map(([key, value]) =>
                            `${key}: ${JSON.stringify(value)}`
                          ).join(', ')})
                        </code>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="message assistant">
              <div className="message-avatar">🤖</div>
              <div className="message-content">
                <div className="message-bubble loading">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="input-container">
          <div className="input-wrapper">
            <textarea
              className="message-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              rows={1}
              disabled={isLoading}
            />
            <button
              className="send-button"
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M22 2L11 13M22 2L15 22L11 13M22 2L2 8L11 13"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
