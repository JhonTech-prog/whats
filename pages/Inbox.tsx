
import React, { useState, useEffect, useRef } from 'react';
import { IncomingMessage, Contact } from '../types';
import { sendWhatsAppMessage } from '../services/whatsappService';

const NOTIFICATION_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3';

const Inbox: React.FC = () => {
  const [messages, setMessages] = useState<IncomingMessage[]>([]);
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [lastSync, setLastSync] = useState('--:--');
  const [serverMsgCount, setServerMsgCount] = useState(0);
  
  const [savedContacts, setSavedContacts] = useState<Contact[]>([]);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isMounted = useRef(true);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selectedChat, messages]);

  // Carregamento e Sincronização
  useEffect(() => {
    isMounted.current = true;
    audioRef.current = new Audio(NOTIFICATION_SOUND_URL);
    
    const loadLocal = () => {
      const savedC = localStorage.getItem('wb_contacts');
      if (savedC) setSavedContacts(JSON.parse(savedC));
      
      const savedM = localStorage.getItem('wb_incoming');
      if (savedM) setMessages(JSON.parse(savedM));
    };

    loadLocal();

    const interval = setInterval(() => {
      if (isMounted.current) fetchMessages();
    }, 4000);

    return () => {
      isMounted.current = false;
      clearInterval(interval);
    };
  }, []);

  const fetchMessages = async () => {
    const config = JSON.parse(localStorage.getItem('wb_sender_config') || '{}');
    if (!config.bridgeUrl || isFetching) return;

    setIsFetching(true);
    let baseUrl = config.bridgeUrl.trim();
    if (!baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;
    const finalUrl = baseUrl.endsWith('/messages') ? baseUrl : `${baseUrl.replace(/\/$/, '')}/messages`;

    try {
      const response = await fetch(`${finalUrl}?t=${Date.now()}`, { cache: 'no-store' });
      const data = await response.json();
      
      if (!Array.isArray(data)) {
        setIsFetching(false);
        return;
      }

      setServerMsgCount(data.length);

      const formatted: IncomingMessage[] = data.map((m: any) => {
        // Limpa o número: remove @s.whatsapp.net e caracteres não numéricos
        const rawFrom = m.from || '';
        const cleanPhone = rawFrom.split('@')[0].replace(/\D/g, '');

        // Captura de texto robusta para evitar balões vazios
        let textContent = '';
        if (m.text && typeof m.text === 'object') {
          textContent = m.text.body || '';
        } else if (m.message?.conversation) {
          textContent = m.message.conversation;
        } else if (m.message?.text?.body) {
          textContent = m.message.text.body;
        } else {
          textContent = m.text || m.body || m.caption || m.message || '';
        }

        return {
          id: m.id || `msg-${cleanPhone}-${m.timestamp}-${textContent.length}`,
          from: cleanPhone,
          fromName: m.name || m.fromName,
          text: String(textContent).trim(),
          timestamp: m.timestamp || new Date().toISOString(),
          unread: true,
          isMe: !!m.isMe,
          type: m.type || 'text',
          mediaUrl: m.mediaUrl || m.url
        };
      });

      const currentLocal = JSON.parse(localStorage.getItem('wb_incoming') || '[]');
      const existingIds = new Set(currentLocal.map((m: any) => m.id));
      const newOnly = formatted.filter(m => !existingIds.has(m.id));

      if (newOnly.length > 0) {
        const merged = [...currentLocal, ...newOnly].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        setMessages(merged);
        localStorage.setItem('wb_incoming', JSON.stringify(merged));
        if (newOnly.some(m => !m.isMe)) audioRef.current?.play().catch(() => {});
      }
      setLastSync(new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' }));
    } catch (err) {
      console.error("Sync error:", err);
    } finally {
      setIsFetching(false);
    }
  };

  const handleSendReply = async () => {
    if (!selectedChat || !replyText.trim() || isSendingReply) return;
    const config = JSON.parse(localStorage.getItem('wb_sender_config') || '{}');
    
    setIsSendingReply(true);
    const res = await sendWhatsAppMessage(selectedChat, replyText, {
      accessToken: config.accessToken,
      phoneId: config.phoneId
    });

    if (res.success) {
      const myMsg: IncomingMessage = {
        id: `sent-${Date.now()}`,
        from: selectedChat,
        text: replyText,
        timestamp: new Date().toISOString(),
        unread: false,
        isMe: true,
        type: 'text'
      };
      const updated = [...messages, myMsg];
      setMessages(updated);
      localStorage.setItem('wb_incoming', JSON.stringify(updated));
      setReplyText('');
    } else {
      alert("Falha no envio: " + res.error);
    }
    setIsSendingReply(false);
  };

  const getDisplayName = (phone: string) => {
    const cleanSearch = phone.replace(/\D/g, '');
    const contact = savedContacts.find(c => c.phone.replace(/\D/g, '') === cleanSearch);
    if (contact) return contact.name;
    
    const msg = messages.find(m => m.from === phone && m.fromName);
    return msg?.fromName || `+${phone}`;
  };

  const chatGroups = messages.reduce((acc: any, msg) => {
    const key = msg.from;
    if (!acc[key]) acc[key] = [];
    acc[key].push(msg);
    return acc;
  }, {});

  const sortedChats = Object.keys(chatGroups).sort((a, b) => {
    const lastA = chatGroups[a][chatGroups[a].length - 1].timestamp;
    const lastB = chatGroups[b][chatGroups[b].length - 1].timestamp;
    return new Date(lastB).getTime() - new Date(lastA).getTime();
  });

  return (
    <div className="bg-white rounded-none md:rounded-2xl border-0 md:border border-slate-200 shadow-sm overflow-hidden h-screen md:h-[calc(100vh-200px)] flex flex-col">
      {/* Status Bar */}
      <div className="px-4 py-2 bg-[#0b141a] flex justify-between items-center text-[10px] text-white font-bold uppercase tracking-widest shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
            <span className="text-emerald-400">STATUS DA PONTE: Online</span>
          </div>
          <span className="opacity-40">|</span>
          <span className="text-slate-400 font-medium lowercase italic">
            {serverMsgCount} msg no servidor • {lastSync}
          </span>
        </div>
        <button onClick={() => { if(confirm("Limpar mensagens?")) { localStorage.removeItem('wb_incoming'); setMessages([]); } }} className="text-rose-400 hover:text-white transition-colors">Limpar Tudo</button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Chats List */}
        <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-85 border-r border-slate-100 flex-col bg-white overflow-y-auto`}>
          {sortedChats.length === 0 ? (
            <div className="p-12 text-center opacity-30 mt-10">
              <div className="text-5xl mb-4">📥</div>
              <p className="text-[10px] font-bold uppercase">Nenhuma conversa</p>
            </div>
          ) : (
            sortedChats.map(phone => {
              const last = chatGroups[phone][chatGroups[phone].length - 1];
              const isSelected = selectedChat === phone;
              return (
                <button key={phone} onClick={() => setSelectedChat(phone)} className={`w-full p-4 flex gap-3 text-left border-b border-slate-50 transition-all ${isSelected ? 'bg-emerald-50 border-r-4 border-r-emerald-500 shadow-sm' : 'hover:bg-slate-50'}`}>
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-400 shrink-0 text-xl shadow-inner">👤</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <p className="font-bold text-slate-800 text-sm truncate">{getDisplayName(phone)}</p>
                      <span className="text-[9px] text-slate-400 font-medium">{new Date(last.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{last.text || "[Mídia]"}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Chat Area */}
        <div className={`${!selectedChat ? 'hidden md:flex' : 'flex'} flex-1 flex-col bg-[#e5ddd5] relative`}>
          {selectedChat ? (
            <>
              {/* Header */}
              <div className="p-4 bg-white border-b border-slate-200 flex items-center gap-3 shrink-0 shadow-sm z-10">
                <button onClick={() => setSelectedChat(null)} className="md:hidden text-slate-400 text-2xl mr-2">←</button>
                <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-sm shadow-inner">👤</div>
                <div>
                  <div className="font-bold text-slate-800 text-sm">{getDisplayName(selectedChat)}</div>
                  <div className="text-[10px] text-slate-400 font-bold">+{selectedChat}</div>
                </div>
              </div>

              {/* Bubbles */}
              <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-3 flex flex-col bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat">
                {chatGroups[selectedChat].map((msg: any) => (
                  <div key={msg.id} className={`max-w-[85%] p-3 rounded-xl shadow-sm border text-sm animate-in fade-in slide-in-from-bottom-2 ${
                    msg.isMe ? 'bg-[#dcf8c6] border-[#c1e8a0] self-end rounded-tr-none' : 'bg-white border-slate-200 self-start rounded-tl-none'
                  }`}>
                    {msg.text && <p className="whitespace-pre-wrap text-slate-800 leading-relaxed font-medium">{msg.text}</p>}
                    {msg.mediaUrl && <div className="mt-2 text-[10px] text-blue-500 underline cursor-pointer" onClick={() => window.open(msg.mediaUrl, '_blank')}>📎 Ver anexo</div>}
                    <div className="text-[9px] opacity-40 text-right mt-1.5 font-black uppercase tracking-tighter">
                      {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      {msg.isMe && <span className="ml-1 text-blue-500">✓✓</span>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Reply Box */}
              <div className="p-4 bg-[#f0f2f5] border-t border-slate-200 shrink-0">
                <div className="flex gap-2 max-w-4xl mx-auto items-center">
                  <input 
                    value={replyText} 
                    onChange={e => setReplyText(e.target.value)} 
                    onKeyPress={e => e.key === 'Enter' && handleSendReply()}
                    placeholder="Responda aqui..." 
                    className="flex-1 bg-white border-0 rounded-full px-5 py-3 text-sm focus:ring-1 focus:ring-emerald-300 outline-none shadow-sm" 
                  />
                  <button 
                    onClick={handleSendReply} 
                    disabled={!replyText.trim() || isSendingReply} 
                    className="w-12 h-12 bg-[#00a884] text-white rounded-full flex items-center justify-center shadow-lg active:scale-90 disabled:opacity-50 transition-all"
                  >
                    {isSendingReply ? '...' : '✈️'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-10 text-center opacity-40">
              <div className="text-8xl mb-4">💬</div>
              <h3 className="font-black uppercase tracking-widest text-xs">Selecione um cliente para conversar</h3>
              <p className="text-[10px] mt-2 max-w-[200px] font-bold uppercase">WhatsJhonTechAI Business Suite</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Inbox;
