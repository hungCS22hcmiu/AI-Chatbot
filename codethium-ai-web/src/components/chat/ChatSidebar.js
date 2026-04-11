import React, { useEffect, useState, useRef } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import SettingsPanel from './SettingsPanel';

function groupChatsByDate(chats) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const week = new Date(today); week.setDate(today.getDate() - 7);

  const groups = { Today: [], Yesterday: [], 'Previous 7 Days': [], Older: [] };
  for (const chat of chats) {
    const d = new Date(chat.updated_at);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (day >= today) groups['Today'].push(chat);
    else if (day >= yesterday) groups['Yesterday'].push(chat);
    else if (day >= week) groups['Previous 7 Days'].push(chat);
    else groups['Older'].push(chat);
  }
  return groups;
}

function ChatSidebar({ activeChatId, onSelectChat, onNewChat, onRegisterTitleChange }) {
  const [chats, setChats] = useState([]);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const { user } = useAuth();
  const editRef = useRef(null);

  useEffect(() => {
    api.get('/api/chats')
      .then(res => setChats(res.data.chats || []))
      .catch(() => {});
  }, []);

  // Register title change callback for ChatPage auto-title
  useEffect(() => {
    if (onRegisterTitleChange) {
      onRegisterTitleChange((chatId, newTitle) => {
        setChats(prev => prev.map(c => c.id === chatId ? { ...c, title: newTitle } : c));
      });
    }
  }, [onRegisterTitleChange]);

  // Focus rename input when editing starts
  useEffect(() => {
    if (editingId && editRef.current) editRef.current.focus();
  }, [editingId]);

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

  const startRename = (e, chat) => {
    e.stopPropagation();
    setEditingId(chat.id);
    setEditingTitle(chat.title || '');
  };

  const commitRename = async (chatId) => {
    const title = editingTitle.trim();
    if (title && title !== chats.find(c => c.id === chatId)?.title) {
      try {
        await api.put(`/api/chats/${chatId}`, { title });
        setChats(prev => prev.map(c => c.id === chatId ? { ...c, title } : c));
      } catch {}
    }
    setEditingId(null);
  };

  const handleRenameKey = (e, chatId) => {
    if (e.key === 'Enter') commitRename(chatId);
    if (e.key === 'Escape') setEditingId(null);
  };

  const displayedChats = search.trim()
    ? chats.filter(c => (c.title || '').toLowerCase().includes(search.toLowerCase()))
    : null;

  const grouped = displayedChats ? null : groupChatsByDate(chats);
  const GROUP_ORDER = ['Today', 'Yesterday', 'Previous 7 Days', 'Older'];

  const renderChatItem = (chat) => (
    <div
      key={chat.id}
      onClick={() => editingId !== chat.id && onSelectChat(chat)}
      onDoubleClick={(e) => startRename(e, chat)}
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
      {editingId === chat.id ? (
        <input
          ref={editRef}
          value={editingTitle}
          onChange={(e) => setEditingTitle(e.target.value)}
          onBlur={() => commitRename(chat.id)}
          onKeyDown={(e) => handleRenameKey(e, chat.id)}
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            background: '#2a2a3e',
            color: '#fff',
            border: '1px solid #3a3a5e',
            borderRadius: '4px',
            padding: '2px 6px',
            fontSize: '13px',
            outline: 'none',
          }}
        />
      ) : (
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}
          title="Double-click to rename">
          {chat.title || 'Untitled'}
        </span>
      )}
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
          marginLeft: '4px',
        }}
        title="Delete chat"
      >
        ×
      </button>
    </div>
  );

  return (
    <div style={{
      width: '240px',
      flexShrink: 0,
      background: '#0d0d1a',
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1px solid #1e1e2e',
      height: '100%',
      position: 'relative',
    }}>
      <div style={{ padding: '16px 16px 8px' }}>
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
            marginBottom: '8px',
          }}
        >
          + New Chat
        </button>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats..."
            style={{
              width: '100%',
              padding: '6px 28px 6px 10px',
              background: '#1e1e2e',
              color: '#ccc',
              border: '1px solid #2a2a3e',
              borderRadius: '6px',
              fontSize: '12px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                position: 'absolute',
                right: '6px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: '#555',
                cursor: 'pointer',
                fontSize: '14px',
                lineHeight: 1,
                padding: 0,
              }}
            >×</button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
        {displayedChats ? (
          displayedChats.length === 0
            ? <div style={{ color: '#555', fontSize: '12px', padding: '8px 10px' }}>No results</div>
            : displayedChats.map(renderChatItem)
        ) : (
          GROUP_ORDER.map(label => {
            const group = grouped[label];
            if (!group || group.length === 0) return null;
            return (
              <div key={label}>
                <div style={{
                  fontSize: '11px',
                  color: '#555',
                  padding: '8px 10px 4px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  {label}
                </div>
                {group.map(renderChatItem)}
              </div>
            );
          })
        )}
      </div>

      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid #1e1e2e',
        fontSize: '13px',
        color: '#888',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px',
        }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.username || user?.email}
          </span>
          <button
            onClick={() => setShowSettings(s => !s)}
            title="Settings"
            style={{
              background: 'none',
              border: 'none',
              color: showSettings ? '#2563eb' : '#555',
              cursor: 'pointer',
              fontSize: '16px',
              flexShrink: 0,
              lineHeight: 1,
              padding: '2px 4px',
            }}
          >
            ⚙
          </button>
        </div>
      </div>

      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

export default ChatSidebar;
