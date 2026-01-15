
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [senderInfo, setSenderInfo] = useState<{name: string, phone: string} | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadSender = () => {
    try {
      const config = localStorage.getItem('wb_sender_config');
      if (config) setSenderInfo(JSON.parse(config));
    } catch(e) {}
  };

  const checkUnread = () => {
    try {
      const saved = localStorage.getItem('wb_incoming');
      const messages = saved ? JSON.parse(saved) : [];
      if (Array.isArray(messages)) {
        const count = messages.filter((m: any) => m.unread).length;
        setUnreadCount(count);
      }
    } catch(e) {}
  };

  useEffect(() => {
    loadSender();
    checkUnread();
    const interval = setInterval(checkUnread, 5000);
    window.addEventListener('senderConfigUpdated', loadSender);
    window.addEventListener('storage', checkUnread);
    return () => {
      clearInterval(interval);
      window.removeEventListener('senderConfigUpdated', loadSender);
      window.removeEventListener('storage', checkUnread);
    };
  }, []);

  const navItems = [
    { name: 'Painel', path: '/', icon: '📊' },
    { name: 'Inbox', path: '/inbox', icon: '📥', badge: unreadCount },
    { name: 'Automação', path: '/automation', icon: '🤖' },
    { name: 'Campanhas', path: '/campaigns', icon: '🚀' },
    { name: 'Agenda', path: '/contacts', icon: '👥' },
    { name: 'Ajustes', path: '/settings', icon: '⚙️' },
  ];

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-64 bg-white border-r border-slate-200 fixed h-full z-10 hidden md:block">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white font-bold text-xl">J</div>
            <span className="text-xl font-bold text-slate-800">WhatsJhon<span className="text-emerald-500">TechAI</span></span>
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all ${
                  location.pathname === item.path ? 'bg-emerald-50 text-emerald-600 font-semibold' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span>{item.icon}</span>
                  <span className="text-sm">{item.name}</span>
                </div>
                {item.badge && item.badge > 0 ? (
                  <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{item.badge}</span>
                ) : null}
              </Link>
            ))}
          </nav>
        </div>
      </aside>

      <main className="flex-1 md:ml-64 p-0 md:p-8">
        <header className="hidden md:flex justify-between items-center mb-8 px-6 py-4 bg-white/50 backdrop-blur-md rounded-2xl border border-slate-200">
          <h1 className="text-lg font-bold text-slate-800">
            {navItems.find(item => item.path === location.pathname)?.name || 'Painel'}
          </h1>
          {senderInfo?.phone && (
            <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">+{senderInfo.phone}</span>
          )}
        </header>
        {children}
      </main>
    </div>
  );
};

export default Layout;
