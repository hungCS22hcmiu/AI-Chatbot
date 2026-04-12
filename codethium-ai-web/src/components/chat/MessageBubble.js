import React from 'react';
import { motion } from 'framer-motion';
import { User, Bot, FileText } from 'lucide-react';
import MessageContent from './MessageContent';

function MessageBubble({ role, content, attachments }) {
  const isUser = role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex items-end gap-3 mb-3 ${isUser ? 'flex-row-reverse' : ''}`}
    >
      {/* Avatar */}
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
          isUser
            ? 'bg-gradient-to-br from-brand-from to-brand-via'
            : 'bg-surface-3 border border-white/10'
        }`}
      >
        {isUser ? (
          <User size={14} className="text-white" />
        ) : (
          <Bot size={14} className="text-muted" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[75%] px-4 py-2 text-sm leading-relaxed break-words ${
          isUser
            ? 'bg-gradient-to-br from-violet-600 to-pink-600 text-white rounded-2xl rounded-br-sm shadow-lg shadow-violet-900/30'
            : 'glass rounded-2xl rounded-bl-sm text-zinc-100'
        }`}
      >
        {isUser ? (
          <>
            {attachments?.filter(a => a.type === 'image').map((a, i) => (
              <img
                key={i}
                src={a.payload}
                alt={a.name}
                className="max-w-[200px] rounded-lg block mb-2"
              />
            ))}
            {attachments?.filter(a => a.type === 'pdf').map((a, i) => (
              <div key={i} className="flex items-center gap-1 text-xs opacity-70 mb-1">
                <FileText size={12} /> {a.name}
              </div>
            ))}
            {attachments?.filter(a => a.type === 'file').map((a, i) => (
              <div key={i} className="flex items-center gap-1 text-xs opacity-70 mb-1">
                <FileText size={12} /> {a.name}
              </div>
            ))}
            <span className="whitespace-pre-wrap">{content}</span>
          </>
        ) : (
          <MessageContent content={content} />
        )}
      </div>
    </motion.div>
  );
}

export default MessageBubble;
