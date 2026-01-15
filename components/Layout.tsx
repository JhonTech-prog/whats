
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [senderInfo, setSenderInfo] = useState<{name: string, phone: string} | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadSender = () => {
    const config = localStorage.getItem('wb_sender_config');
    if (config) {
      setSenderInfo(JSON.parse(config));
    }
  };

  const checkUnread = () => {
    const messages = JSON.parse(localStorage.getItem('wb_incoming') || '[]');
    const count = messages.filter((m: any) => m.unread).length;
    setUnreadCount(count);
    
    // Sinalizar no Título da Aba
    if (count > 0) {
      document.title = `(${count}) WhatsJhonTechAI`;
    } else {
      document.title = `WhatsJhonTechAI`;
    }
  };

  useEffect(() => {
    loadSender();
    checkUnread();
    
    const interval = setInterval(checkUnread, 3000);
    window.addEventListener('senderConfigUpdated', loadSender);
    window.addEventListener('storage', checkUnread);

    return () => {
      clearInterval(interval);
      window.removeEventListener('senderConfigUpdated', loadSender);
      window.removeEventListener('storage', checkUnread);
    };
  }, []);

  const navItems = [
    { name: 'Painel Principal', path: '/', icon: '📊' },
    { name: 'Caixa de Entrada', path: '/inbox', icon: '📥', badge: unreadCount },
    { name: 'Automação', path: '/automation', icon: '🤖' },
    { name: 'Campanhas', path: '/campaigns', icon: '🚀' },
    { name: 'Contatos', path: '/contacts', icon: '👥' },
    { name: 'Configurações', path: '/settings', icon: '⚙️' },
  ];

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar - Oculta no mobile */}
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
                  location.pathname === item.path
                    ? 'bg-emerald-50 text-emerald-600 font-semibold'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span>{item.icon}</span>
                  {item.name}
                </div>
                {item.badge && item.badge > 0 ? (
                  <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>
        </div>
      </aside>

      {/* Ajuste de margem e padding: zero no mobile, com margem no desktop */}
      <main className="flex-1 md:ml-64 p-0 md:p-8">
        {/* Header - Oculto no mobile */}
        <header className="hidden md:flex justify-between items-center mb-8 px-4 py-4 md:p-0 bg-white md:bg-transparent border-b md:border-0 border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              {navItems.find(item => item.path === location.pathname)?.name || 'Painel'}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-slate-500 text-sm">Comunicação via API do WhatsApp Business</p>
              {senderInfo?.phone && (
                <span className="flex items-center gap-1 bg-emerald-100 text-emerald-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
                  <span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse"></span>
                  ATIVO: +{senderInfo.phone}
                </span>
              )}
            </div>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
};

export default Layout;
