import React, { useState, useRef, useEffect } from 'react';

const MODELS = [
  { value: 'groq', label: 'Llama 3 (Groq)' },
  { value: 'openrouter', label: 'Llama 3 (OpenRouter)' },
  { value: 'local', label: 'CodeThium Local' },
];

function ChatInput({ onSend, isStreaming, disabled }) {
  const [content, setContent] = useState('');
  const [model, setModel] = useState('groq');
  const textareaRef = useRef(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  }, [content]);

  const handleSend = () => {
    const trimmed = content.trim();
    if (!trimmed || isStreaming) return;
    onSend({ content: trimmed, model });
    setContent('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{
      padding: '12px 16px',
      borderTop: '1px solid #2a2a3e',
      background: '#13131f',
      display: 'flex',
      gap: '8px',
      alignItems: 'flex-end',
    }}>
      <select
        value={model}
        onChange={(e) => setModel(e.target.value)}
        disabled={isStreaming}
        style={{
          background: '#1e1e2e',
          color: '#ccc',
          border: '1px solid #2a2a3e',
          borderRadius: '8px',
          padding: '8px',
          fontSize: '13px',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        {MODELS.map(m => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </select>

      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled || isStreaming}
        placeholder="Ask anything... (Enter to send, Shift+Enter for newline)"
        rows={1}
        style={{
          flex: 1,
          resize: 'none',
          background: '#1e1e2e',
          color: '#fff',
          border: '1px solid #2a2a3e',
          borderRadius: '8px',
          padding: '8px 12px',
          fontSize: '14px',
          lineHeight: '1.5',
          outline: 'none',
          overflow: 'hidden',
        }}
      />

      <button
        onClick={handleSend}
        disabled={!content.trim() || isStreaming || disabled}
        style={{
          background: isStreaming ? '#555' : '#2563eb',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          padding: '8px 16px',
          cursor: isStreaming ? 'not-allowed' : 'pointer',
          fontSize: '14px',
          flexShrink: 0,
        }}
      >
        {isStreaming ? '...' : 'Send'}
      </button>
    </div>
  );
}

export default ChatInput;
