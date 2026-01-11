
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
  const [serverCount, setServerCount] = useState(0);
  const [isOnline, setIsOnline] = useState(false);
  
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

  // Carregamento de dados locais
  useEffect(() => {
    isMounted.current = true;
    audioRef.current = new Audio(NOTIFICATION_SOUND_URL);
    
    const savedC = localStorage.getItem('wb_contacts');
    if (savedC) setSavedContacts(JSON.parse(savedC));
    
    const savedM = localStorage.getItem('wb_incoming');
    if (savedM) setMessages(JSON.parse(savedM));

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
      if (!response.ok) throw new Error();
      
      const data = await response.json();
      setIsOnline(true);
      
      if (!Array.isArray(data)) {
        setIsFetching(false);
        return;
      }

      setServerCount(data.length);

      const formatted: IncomingMessage[] = data.map((m: any) => {
        // Limpeza rigorosa do número
        const rawFrom = m.from || '';
        const cleanPhone = rawFrom.split('@')[0].replace(/\D/g, '');

        // EXTRAÇÃO DE TEXTO INFALÍVEL
        let textContent = '';
        if (m.text?.body) textContent = m.text.body;
        else if (m.message?.conversation) textContent = m.message.conversation;
        else if (m.message?.text?.body) textContent = m.message.text.body;
        else if (m.body) textContent = m.body;
        else if (m.text && typeof m.text === 'string') textContent = m.text;
        else if (m.message && typeof m.message === 'string') textContent = m.message;
        else if (m.caption) textContent = m.caption;

        return {
          id: m.id || `msg-${cleanPhone}-${m.timestamp}-${textContent.length}`,
          from: cleanPhone || 'contato',
          fromName: m.name || m.fromName,
          text: String(textContent || '').trim(),
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
        
        // Notificação sonora para mensagens de clientes
        if (newOnly.some(m => !m.isMe)) {
          audioRef.current?.play().catch(() => {});
        }
      }
      setLastSync(new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' }));
    } catch (err) {
      setIsOnline(false);
      console.error("Erro Sync:", err);
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
      alert("Erro ao enviar: " + res.error);
    }
    setIsSendingReply(false);
  };

  const getDisplayName = (phone: string) => {
    const cleanSearch = phone.replace(/\D/g, '');
    const contact = savedContacts.find(c => c.phone.replace(/\D/g, '') === cleanSearch);
    if (contact) return contact.name;
    
    // Fallback para nome enviado pela API ou número
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
      <div className={`px-4 py-2 flex justify-between items-center text-[10px] text-white font-bold uppercase tracking-widest shrink-0 transition-colors ${isOnline ? 'bg-[#0b141a]' : 'bg-rose-900'}`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full animate-pulse ${isOnline ? 'bg-emerald-500' : 'bg-white'}`}></div>
            <span>STATUS DA PONTE: {isOnline ? 'Online' : 'Offline'}</span>
          </div>
          <span className="opacity-40">|</span>
          <span className="text-slate-400 lowercase italic font-medium">{serverCount} msg no servidor • {lastSync}</span>
        </div>
        <button onClick={() => { if(confirm("Limpar tudo?")) { localStorage.removeItem('wb_incoming'); setMessages([]); setSelectedChat(null); } }} className="hover:text-rose-300">Limpar Inbox</button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-85 border-r border-slate-100 flex-col bg-white overflow-y-auto`}>
          {sortedChats.length === 0 ? (
            <div className="p-12 text-center opacity-30 mt-10">
              <div className="text-5xl mb-4">📥</div>
              <p className="text-[10px] font-bold uppercase">Aguardando Mensagens...</p>
            </div>
          ) : (
            sortedChats.map(phone => {
              const last = chatGroups[phone][chatGroups[phone].length - 1];
              const isSelected = selectedChat === phone;
              return (
                <button key={phone} onClick={() => setSelectedChat(phone)} className={`w-full p-4 flex gap-3 text-left border-b border-slate-50 transition-all ${isSelected ? 'bg-emerald-50 border-r-4 border-r-emerald-500 shadow-sm' : 'hover:bg-slate-50'}`}>
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-400 shrink-0 text-xl border border-slate-200">👤</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <p className="font-bold text-slate-800 text-sm truncate">{getDisplayName(phone)}</p>
                      <span className="text-[9px] text-slate-400">{new Date(last.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
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
                <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-sm">👤</div>
                <div>
                  <div className="font-bold text-slate-800 text-sm">{getDisplayName(selectedChat)}</div>
                  <div className="text-[10px] text-slate-400 font-bold">+{selectedChat}</div>
                </div>
              </div>

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-3 flex flex-col bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat">
                {chatGroups[selectedChat].map((msg: any) => (
                  <div key={msg.id} className={`max-w-[85%] p-3 rounded-xl shadow-sm border text-sm animate-in fade-in slide-in-from-bottom-2 ${
                    msg.isMe ? 'bg-[#dcf8c6] border-[#c1e8a0] self-end rounded-tr-none' : 'bg-white border-slate-200 self-start rounded-tl-none'
                  }`}>
                    {msg.text ? (
                      <p className="whitespace-pre-wrap text-slate-800 leading-relaxed font-medium">{msg.text}</p>
                    ) : (
                      <p className="italic text-slate-400 text-[10px]">Mensagem de sistema ou mídia</p>
                    )}
                    {msg.mediaUrl