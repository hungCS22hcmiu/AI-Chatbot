import React, { useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import MessageBubble from './MessageBubble';

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-3">
      <div className="glass rounded-2xl rounded-bl-sm px-4 py-2 text-sm text-muted">
        <span className="inline-flex gap-1">
          <span className="animate-bounce [animation-delay:0ms]">·</span>
          <span className="animate-bounce [animation-delay:150ms]">·</span>
          <span className="animate-bounce [animation-delay:300ms]">·</span>
        </span>
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
    <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin">
      <AnimatePresence initial={false}>
        {messages.map((msg, i) => (
          <MessageBubble
            key={i}
            role={msg.role}
            content={msg.content}
            attachments={msg.attachments}
          />
        ))}
      </AnimatePresence>
      {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
        <TypingIndicator />
      )}
      <div ref={bottomRef} />
    </div>
  );
}

export default MessageList;
