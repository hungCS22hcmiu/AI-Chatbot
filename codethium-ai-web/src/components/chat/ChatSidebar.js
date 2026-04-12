import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Settings, X, Sun, Moon } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import SettingsPanel from './SettingsPanel';
import Button from '../ui/Button';

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
  const { theme, toggleTheme } = useTheme();
  const editRef = useRef(null);

  useEffect(() => {
    api.get('/api/chats')
      .then(res => setChats(res.data.chats || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (onRegisterTitleChange) {
      onRegisterTitleChange((chatId, newTitle) => {
        setChats(prev => prev.map(c => c.id === chatId ? { ...c, title: newTitle } : c));
      });
    }
  }, [onRegisterTitleChange]);

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
    <motion.div
      key={chat.id}
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.15 }}
      onClick={() => editingId !== chat.id && onSelectChat(chat)}
      onDoubleClick={(e) => startRename(e, chat)}
      className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer mb-0.5 transition-colors
        ${activeChatId === chat.id
          ? 'bg-surface-2 border-l-2 border-brand-primary'
          : 'hover:bg-white/5 border-l-2 border-transparent'
        }`}
    >
      {editingId === chat.id ? (
        <input
          ref={editRef}
          value={editingTitle}
          onChange={(e) => setEditingTitle(e.target.value)}
          onBlur={() => commitRename(chat.id)}
          onKeyDown={(e) => handleRenameKey(e, chat.id)}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 bg-surface-3 text-zinc-100 border border-white/20 rounded px-2 py-0.5 text-xs outline-none"
        />
      ) : (
        <span
          className="text-zinc-300 text-xs truncate flex-1"
          title="Double-click to rename"
        >
          {chat.title || 'Untitled'}
        </span>
      )}
      <button
        onClick={(e) => handleDelete(e, chat.id)}
        title="Delete chat"
        className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-red-400 ml-1 flex-shrink-0"
      >
        <Trash2 size={13} />
      </button>
    </motion.div>
  );

  return (
    <div className="w-60 flex-shrink-0 bg-surface-1 flex flex-col border-r border-white/10 h-full relative">
      {/* Top: new chat + search */}
      <div className="p-4 pb-2 space-y-2">
        <Button variant="primary" onClick={handleNewChat} className="w-full flex items-center justify-center gap-2 py-2 text-sm">
          <Plus size={16} /> New Chat
        </Button>
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats…"
            className="w-full bg-surface-2 text-zinc-300 border border-white/10 rounded-lg px-3 py-1.5 text-xs outline-none placeholder:text-zinc-500 focus:border-brand-primary/50 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-zinc-200 transition-colors"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto px-2 scrollbar-thin">
        <AnimatePresence>
          {displayedChats ? (
            displayedChats.length === 0
              ? <p className="text-muted text-xs px-3 py-2">No results</p>
              : displayedChats.map(renderChatItem)
          ) : (
            GROUP_ORDER.map(label => {
              const group = grouped[label];
              if (!group || group.length === 0) return null;
              return (
                <div key={label}>
                  <p className="text-xs text-muted uppercase tracking-widest px-3 py-2 mt-1">
                    {label}
                  </p>
                  {group.map(renderChatItem)}
                </div>
              );
            })
          )}
        </AnimatePresence>
      </div>

      {/* User footer */}
      <div className="border-t border-white/10 p-3 relative">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted truncate flex-1">
            {user?.username || user?.email}
          </span>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-1.5 rounded-lg transition-colors text-muted hover:text-zinc-200"
            >
              {theme === 'dark'
                ? <Sun size={14} />
                : <Moon size={14} />}
            </button>
            <button
              onClick={() => setShowSettings(s => !s)}
              title="Settings"
              className={`p-1.5 rounded-lg transition-colors ${
                showSettings ? 'text-brand-primary' : 'text-muted hover:text-zinc-200'
              }`}
            >
              <Settings size={14} />
            </button>
          </div>
        </div>

        <AnimatePresence>
          {showSettings && (
            <SettingsPanel onClose={() => setShowSettings(false)} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default ChatSidebar;
