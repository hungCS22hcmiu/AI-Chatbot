import React from 'react';
import MessageContent from './MessageContent';

function MessageBubble({ role, content, attachments }) {
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
          <>
            {attachments?.filter(a => a.type === 'image').map((a, i) => (
              <img
                key={i}
                src={a.payload}
                alt={a.name}
                style={{
                  maxWidth: '200px',
                  borderRadius: '8px',
                  display: 'block',
                  marginBottom: '6px',
                }}
              />
            ))}
            {attachments?.filter(a => a.type === 'file').map((a, i) => (
              <div key={i} style={{
                fontSize: '12px',
                color: 'rgba(255,255,255,0.7)',
                marginBottom: '4px',
              }}>
                📄 {a.name}
              </div>
            ))}
            <span style={{ whiteSpace: 'pre-wrap' }}>{content}</span>
          </>
        ) : (
          <MessageContent content={content} />
        )}
      </div>
    </div>
  );
}

export default MessageBubble;
