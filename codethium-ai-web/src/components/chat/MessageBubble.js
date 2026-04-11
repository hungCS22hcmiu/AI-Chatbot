import React from 'react';
import MessageContent from './MessageContent';

function MessageBubble({ role, content }) {
  const isUser = role === 'user';

  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: '12px',
    }}>
      <div style={{
        maxWidth: '75%',
        padding: '10px 14px',
        borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        background: isUser ? '#2563eb' : '#1e1e2e',
        color: '#fff',
        fontSize: '14px',
        lineHeight: '1.6',
        wordBreak: 'break-word',
      }}>
        {isUser ? (
          <span style={{ whiteSpace: 'pre-wrap' }}>{content}</span>
        ) : (
          <MessageContent content={content} />
        )}
      </div>
    </div>
  );
}

export default MessageBubble;
