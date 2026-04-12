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
  const [onChatTitleChange, setOnChatTitleChange] = useState(null);

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

  const handleSend = ({ content, model, attachments }) => {
    if (!activeChat || isStreaming) return;

    const isFirstMessage = messages.length === 0;
    const userMsg = { role: 'user', content, attachments };
    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);

    let assistantContent = '';
    const assistantPlaceholder = { role: 'assistant', content: '' };
    setMessages(prev => [...prev, assistantPlaceholder]);

    streamChat({
      chatId: activeChat.id,
      content,
      model,
      attachments,
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
        if (isFirstMessage && activeChat.title === 'New Chat') {
          const newTitle = content.replace(/\n/g, ' ').slice(0, 40).trim();
          api.put(`/api/chats/${activeChat.id}`, { title: newTitle })
            .then(() => {
              setActiveChat(prev => ({ ...prev, title: newTitle }));
              if (onChatTitleChange) onChatTitleChange(activeChat.id, newTitle);
            })
            .catch(() => {});
        }
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
    <div className="flex h-screen bg-gradient-to-br from-violet-900/10 via-surface-0 to-cyan-900/10 text-zinc-100">
      <ChatSidebar
        activeChatId={activeChat?.id}
        onSelectChat={loadChat}
        onNewChat={loadChat}
        onRegisterTitleChange={(fn) => setOnChatTitleChange(() => fn)}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {activeChat ? (
          <>
            <div className="px-4 py-3 border-b border-white/10 text-sm font-semibold text-zinc-200">
              {activeChat.title}
            </div>
            <MessageList messages={messages} isStreaming={isStreaming} />
            <ChatInput onSend={handleSend} isStreaming={isStreaming} />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted text-sm">
            Select a chat or create a new one
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatPage;
