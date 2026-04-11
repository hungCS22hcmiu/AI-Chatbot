import React, { useState } from 'react';
import api from '../../services/api';
import { streamChat } from '../../services/streamChat';
import ChatSidebar from './ChatSidebar';
import MessageList from './MessageList';
import ChatInput from './ChatInput';

function ChatPage() {
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const loadChat = async (chat) => {
    setActiveChat(chat);
    setMessages([]);
    if (!chat) return;
    try {
      const { data } = await api.get(`/api/chats/${chat.id}/messages`);
      setMessages(data.messages || []);
    } catch {
      // new chat — no messages yet
    }
  };

  const handleSend = ({ content, model }) => {
    if (!activeChat || isStreaming) return;

    const userMsg = { role: 'user', content };
    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);

    let assistantContent = '';
    const assistantPlaceholder = { role: 'assistant', content: '' };
    setMessages(prev => [...prev, assistantPlaceholder]);

    streamChat({
      chatId: activeChat.id,
      content,
      model,
      onToken: (chunk) => {
        assistantContent += chunk;
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
          return updated;
        });
      },
      onDone: () => {
        setIsStreaming(false);
      },
      onError: (err) => {
        setIsStreaming(false);
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: `Error: ${err}` };
          return updated;
        });
      },
    });
  };

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      background: '#13131f',
      color: '#fff',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <ChatSidebar
        activeChatId={activeChat?.id}
        onSelectChat={loadChat}
        onNewChat={loadChat}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {activeChat ? (
          <>
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid #1e1e2e',
              fontSize: '15px',
              fontWeight: 600,
              color: '#ccc',
            }}>
              {activeChat.title}
            </div>
            <MessageList messages={messages} isStreaming={isStreaming} />
            <ChatInput onSend={handleSend} isStreaming={isStreaming} />
          </>
        ) : (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#555',
            fontSize: '15px',
          }}>
            Select a chat or create a new one
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatPage;
