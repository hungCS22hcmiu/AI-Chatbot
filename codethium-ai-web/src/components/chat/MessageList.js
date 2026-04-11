import React, { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '12px' }}>
      <div style={{
        padding: '10px 16px',
        borderRadius: '18px 18px 18px 4px',
        background: '#1e1e2e',
        color: '#888',
        fontSize: '14px',
      }}>
        ···
      </div>
    </div>
  );
}

function MessageList({ messages, isStreaming }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      padding: '16px',
    }}>
      {messages.map((msg, i) => (
        <MessageBubble key={i} role={msg.role} content={msg.content} attachments={msg.attachments} />
      ))}
      {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
        <TypingIndicator />
      )}
      <div ref={bottomRef} />
    </div>
  );
}

export default MessageList;
