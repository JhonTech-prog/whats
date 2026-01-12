
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { IncomingMessage } from '../types';
import { sendWhatsAppMessage } from '../services/whatsappService';
import { Link } from 'react-router-dom';

const Inbox: React.FC = () => {
  const [messages, setMessages] = useState<IncomingMessage[]>([]);
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState<'online' | 'offline' | 'unconfigured' | 'syncing'>('unconfigured');
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const activePolling = useRef<boolean>(true);

  useEffect(() => {
    const saved = localStorage.getItem('wb_incoming');
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (e) {
        console.error("Erro ao recuperar cache:", e);
      }
    }
    
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    return () => { activePolling.current = false; };
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('wb_incoming', JSON.stringify(messages));
    }
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selectedChat, messages]);

  const pollMessages = useCallback(async () => {
    if (!activePolling.current) return;

    const configRaw = localStorage.getItem('wb_sender_config');
    if (!configRaw) {
      setStatus('unconfigured');
      return;
    }

    const config = JSON.parse(configRaw);
    if (!config.bridgeUrl) {
      setStatus('unconfigured');
      return;
    }

    setStatus('syncing');

    try {
      const baseUrl = config.bridgeUrl.trim().replace(/\/$/, '');
      const url = `${baseUrl}/messages?nocache=${Date.now()}`;

      const res = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        headers: { 'Accept': 'application/json' }
      });

      if (!res.ok) throw new Error(`Servidor respondeu com erro ${res.status}`);
      
      const data = await res.json();
      setStatus('online');
      setErrorDetails(null);

      let list: any[] = [];
      if (Array.isArray(data)) list = data;
      else if (data.messages && Array.isArray(data.messages)) list = data.messages;

      if (list.length > 0) {
        processIncoming(list);
      }
    } catch (err: any) {
      setStatus('offline');
      setErrorDetails(err.message === 'Failed to fetch' 
        ? "Conexão negada. O servidor no Render pode estar hibernando ou sem CORS configurado." 
        : err.message);
    } finally {
      if (activePolling.current) {
        setTimeout(pollMessages, 5000); 
      }
    }
  }, []);

  useEffect(() => {
    pollMessages();
  }, [pollMessages]);

  const processIncoming = (list: any[]) => {
    const news: IncomingMessage[] = list.map((m: any): IncomingMessage | null => {
      const msgId = m.id || `ext-${Date.now()}-${Math.random()}`;
      
      // Ajuste na extração: aceita campos 'from' direto ou do objeto 'key'
      const rawFrom = m.from || m.wa_id || m.key?.remoteJid || '';
      const phone = String(rawFrom).split('@')[0].replace(/\D/g, '');
      
      if (!phone || phone.length < 8) {
        console.warn("Mensagem ignorada por falta de telefone:", m);
        return null;
      }

      const text = m.text?.body || m.message?.conversation || m.body || m.text || '';
      const isMe = !!m.isMe || !!m.key?.fromMe;

      return {
        id: msgId,
        from: phone,
        fromName: m.pushName || m.name || '',
        text: String(text).trim() || '[Mensagem de Mídia]',
        timestamp: m.timestamp || new Date().toISOString(),
        unread: !isMe,
        isMe: isMe
      };
    }).filter((m): m is IncomingMessage => m !== null);

    if (news.length === 0) return;

    setMessages(prev => {
      const existingIds = new Set(prev.map(m => m.id));
      const filtered = news.filter(n => !existingIds.has(n.id));
      
      if (filtered.length === 0) return prev;

      filtered.forEach(msg => {
        if (!msg.isMe && Notification.permission === "granted") {
          new Notification(msg.fromName || `+${msg.from}`, { body: msg.text });
        }
      });

      return [...prev, ...filtered].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    });
  };

  const handleSend = async () => {
    if (!selectedChat || !replyText.trim() || isSending) return;
    
    setIsSending(true);
    const configRaw = localStorage.getItem('wb_sender_config');
    const config = configRaw ? JSON.parse(configRaw) : {};
    
    const result = await sendWhatsAppMessage(selectedChat, replyText, config);
    
    if (result.success) {
      const myMsg: IncomingMessage = {
        id: `sent-${Date.now()}`,
        from: selectedChat,
        text: replyText,
        timestamp: new Date().toISOString(),
        unread: false,
        isMe: true
      };
      setMessages(prev => [...prev, myMsg]);
      setReplyText('');
    } else {
      alert(`Falha no envio: ${result.error}`);
    }
    setIsSending(false);
  };

  const chatGroups = messages.reduce((acc: any, m) => {
    if (!acc[m.from]) acc[m.from] = [];
    acc[m.from].push(m);
    return acc;
  }, {});

  const sortedKeys = Object.keys(chatGroups).sort((a, b) => {
    const lastA = chatGroups[a][chatGroups[a].length - 1].timestamp;
    const lastB = chatGroups[b][chatGroups[b].length - 1].timestamp;
    return new Date(lastB).getTime() - new Date(lastA).getTime();
  });

  if (status === 'unconfigured') {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-50 p-10 text-center">
        <div className="text-6xl mb-4">🔧</div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Configure o Bridge</h2>
        <p className="text-slate-500 max-w-md mb-6 text-sm">
          Falta configurar a URL do seu Bridge nas Configurações.
        </p>
        <Link to="/settings" className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg">
          Configurar Agora
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-none md:rounded-2xl border border-slate-200 shadow-sm h-screen md:h-[calc(100vh-200px)] flex overflow-hidden">
      <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-slate-100 flex-col bg-white overflow-y-auto`}>
        <div className="p-4 border-b border-slate-50 flex justify-between items-center bg-slate-50 sticky top-0 z-10">
          <h2 className="font-bold text-slate-800 text-sm">Mensagens</h2>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${status === 'online' || status === 'syncing' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
            <span className="text-[9px] font-bold text-slate-400 uppercase">
              {status === 'syncing' ? 'Sincronizando...' : status}
            </span>
          </div>
        </div>

        {errorDetails && (
          <div className="m-2 p-3 bg-rose-50 border border-rose-100 rounded-lg">
            <p className="text-[10px] text-rose-600 font-bold leading-tight">
              ⚠️ ERRO: {errorDetails}
            </p>
          </div>
        )}
        
        {sortedKeys.length === 0 ? (
          <div className="p-10 text-center opacity-30 mt-10">
            <p className="text-4xl mb-2">😴</p>
            <p className="text-[10px] font-bold uppercase tracking-widest">Nenhuma conversa...</p>
          </div>
        ) : (
          sortedKeys.map(phone => {
            const chat = chatGroups[phone];
            const last = chat[chat.length - 1];
            const unreadCount = chat.filter((m: any) => m.unread).length;
            return (
              <button 
                key={phone} 
                onClick={() => { setSelectedChat(phone); setMessages(prev => prev.map(m => m.from === phone ? {...m, unread: false} : m)); }} 
                className={`w-full p-4 text-left border-b border-slate-50 hover:bg-slate-50 transition-all flex items-center gap-3 ${selectedChat === phone ? 'bg-emerald-50 border-r-4 border-r-emerald-500' : ''}`}
              >
                <div className="w-10 h-10 bg-slate-100 rounded-full flex-shrink-0 flex items-center justify-center text-lg">👤</div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-0.5">
                    <p className={`text-sm truncate ${unreadCount > 0 ? 'font-black text-slate-900' : 'font-bold text-slate-700'}`}>
                      {last.fromName || `+${phone}`}
                    </p>
                    <span className="text-[9px] text-slate-400 shrink-0">
                      {new Date(last.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-slate-500 truncate">{last.text}</p>
                    {unreadCount > 0 && <span className="bg-emerald-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-2">{unreadCount}</span>}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      <div className={`${!selectedChat ? 'hidden md:flex' : 'flex'} flex-1 flex-col bg-[#efeae2]`}>
        {selectedChat ? (
          <>
            <div className="p-3 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <button onClick={() => setSelectedChat(null)} className="md:hidden text-slate-400 p-2">←</button>
                <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold">👤</div>
                <div>
                  <p className="font-bold text-slate-800 text-sm">+{selectedChat}</p>
                  <p className="text-[9px] text-emerald-500 font-bold uppercase tracking-widest">Atendimento Ativo</p>
                </div>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-3 flex flex-col bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat">
              {chatGroups[selectedChat].map((m: any) => (
                <div key={m.id} className={`max-w-[85%] p-3 rounded-xl shadow-sm text-sm ${m.isMe ? 'bg-[#dcf8c6] self-end rounded-tr-none' : 'bg-white self-start rounded-tl-none'}`}>
                  <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                  <div className="text-[9px] opacity-40 text-right mt-1 font-bold uppercase">
                    {new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-[#f0f2f5] border-t border-slate-200">
              <div className="flex gap-2 max-w-4xl mx-auto items-center">
                <input 
                  value={replyText} 
                  onChange={e => setReplyText(e.target.value)} 
                  onKeyPress={e => e.key === 'Enter' && handleSend()} 
                  className="flex-1 px-5 py-3 rounded-full border-0 outline-none text-sm shadow-sm" 
                  placeholder="Mensagem..." 
                />
                <button 
                  onClick={handleSend} 
                  disabled={!replyText.trim() || isSending} 
                  className="w-12 h-12 bg-[#00a884] text-white rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all disabled:opacity-50"
                >
                  {isSending ? '...' : '✈️'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-10 opacity-30">
            <div className="text-8xl mb-4">💬</div>
            <h3 className="font-black uppercase tracking-widest text-xs text-center">Selecione uma conversa</h3>
          </div>
        )}
      </div>
    </div>
  );
};

export default Inbox;
