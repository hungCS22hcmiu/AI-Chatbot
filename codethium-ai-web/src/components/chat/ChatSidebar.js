import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

function ChatSidebar({ activeChatId, onSelectChat, onNewChat }) {
  const [chats, setChats] = useState([]);
  const { user, logout } = useAuth();

  useEffect(() => {
    api.get('/api/chats')
      .then(res => setChats(res.data.chats || []))
      .catch(() => {});
  }, []);

  const handleNewChat = async () => {
    try {
      const { data } = await api.post('/api/chats', { title: 'New Chat', messages: [] });
      setChats(prev => [data.chat, ...prev]);
      onNewChat(data.chat);
    } catch {}
  };

  const handleDelete = async (e, chatId) => {
    e.stopPropagation();
    try {
      await api.delete(`/api/chats/${chatId}`);
      setChats(prev => prev.filter(c => c.id !== chatId));
      if (activeChatId === chatId) onSelectChat(null);
    } catch {}
  };

  return (
    <div style={{
      width: '240px',
      flexShrink: 0,
      background: '#0d0d1a',
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1px solid #1e1e2e',
      height: '100%',
    }}>
      <div style={{ padding: '16px' }}>
        <button
          onClick={handleNewChat}
          style={{
            width: '100%',
            padding: '8px',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          + New Chat
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
        {chats.map(chat => (
          <div
            key={chat.id}
            onClick={() => onSelectChat(chat)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 10px',
              borderRadius: '8px',
              cursor: 'pointer',
              background: activeChatId === chat.id ? '#1e1e2e' : 'transparent',
              color: '#ccc',
              fontSize: '13px',
              marginBottom: '2px',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {chat.title || 'Untitled'}
            </span>
            <button
              onClick={(e) => handleDelete(e, chat.id)}
              style={{
                background: 'none',
                border: 'none',
                color: '#555',
                cursor: 'pointer',
                fontSize: '16px',
                flexShrink: 0,
                lineHeight: 1,
              }}
              title="Delete chat"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid #1e1e2e',
        fontSize: '13px',
        color: '#888',
      }}>
        <div style={{ marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user?.username || user?.email}
        </div>
        <button
          onClick={logout}
          style={{
            width: '100%',
            padding: '6px',
            background: 'transparent',
            color: '#888',
            border: '1px solid #2a2a3e',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          Log out
        </button>
      </div>
    </div>
  );
}

export default ChatSidebar;
