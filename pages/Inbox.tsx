import React, { useState, useEffect, useRef } from 'react';
import { IncomingMessage, Contact } from '../types';
import { sendWhatsAppMessage } from '../services/whatsappService';

const Inbox: React.FC = () => {
  const [messages, setMessages] = useState<IncomingMessage[]>([]);
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [lastSync, setLastSync] = useState('--:--');
  const [status, setStatus] = useState<'online' | 'offline' | 'loading'>('loading');
  
  const [savedContacts, setSavedContacts] = useState<Contact[]>([]);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMounted = useRef(true);
  const syncTimerRef = useRef<any>(null);

  // Auto-scroll para a última mensagem
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selectedChat, messages]);

  // Carregamento inicial e Polling
  useEffect(() => {
    isMounted.current = true;
    
    const loadLocal = () => {
      try {
        const c = localStorage.getItem('wb_contacts');
        if (c) setSavedContacts(JSON.parse(c));
        
        const m = localStorage.getItem('wb_incoming');
        if (m) setMessages(JSON.parse(m));
      } catch (e) { console.error("Erro cache:", e); }
    };
    loadLocal();

    const startPolling = async () => {
      if (!isMounted.current) return;
      await fetchFromBridge();
      if (isMounted.current) {
        syncTimerRef.current = setTimeout(startPolling, 5000); // Tenta a cada 5 segundos
      }
    };

    startPolling();

    return () => {
      isMounted.current = false;
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, []);

  const fetchFromBridge = async () => {
    const configRaw = localStorage.getItem('wb_sender_config');
    if (!configRaw) {
      setStatus('offline');
      return;
    }
    
    const config = JSON.parse(configRaw);
    if (!config.bridgeUrl) {
      setStatus('offline');
      return;
    }

    let url = config.bridgeUrl.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    const finalUrl = url.endsWith('/messages') ? url : `${url.replace(/\/$/, '')}/messages`;

    try {
      const response = await fetch(`${finalUrl}?nocache=${Date.now()}`);
      if (!response.ok) throw new Error("Server error");
      
      const data = await response.json();
      setStatus('online');
      setLastSync(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

      // Processamento de dados (Suporta array direto ou objeto Meta)
      let rawMessages: any[] = [];
      if (Array.isArray(data)) {
        rawMessages = data;
      } else if (data.entry?.[0]?.changes?.[0]?.value?.messages) {
        rawMessages = data.entry[0].changes[0].value.messages;
      } else if (data.messages) {
        rawMessages = data.messages;
      }

      if (rawMessages.length > 0) {
        handleIncomingData(rawMessages);
      }
    } catch (err) {
      console.error("Erro sync:", err);
      setStatus('offline');
    }
  };

  const handleIncomingData = (rawList: any[]) => {
    // Fix: Explicitly type return as IncomingMessage to fix type mismatch and mediaUrl property missing during filter
    const formatted: IncomingMessage[] = rawList.map((m: any): IncomingMessage => {
      const phone = (m.from || m.remoteJid || '').split('@')[0].replace(/\D/g, '');
      
      let body = '';
      if (m.text?.body) body = m.text.body;
      else if (m.message?.conversation) body = m.message.conversation;
      else if (m.body) body = m.body;
      else if (typeof m.text === 'string') body = m.text;

      return {
        id: m.id || m.key?.id || `msg-${Date.now()}-${Math.random()}`,
        from: phone,
        fromName: m.pushName || m.name || '',
        text: body.trim(),
        timestamp: m.timestamp || new Date().toISOString(),
        unread: true,
        isMe: !!m.isMe || !!m.key?.fromMe,
        type: 'text',
        mediaUrl: m.mediaUrl || m.url || undefined
      };
    }).filter(m => m.from && (m.text || m.mediaUrl));

    const currentLocal: IncomingMessage[] = JSON.parse(localStorage.getItem('wb_incoming') || '[]');
    const existingIds = new Set(currentLocal.map(m => m.id));
    const newOnes = formatted.filter(m => !existingIds.has(m.id));

    if (newOnes.length > 0) {
      const updated = [...currentLocal, ...newOnes].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      setMessages(updated);
      localStorage.setItem('wb_incoming', JSON.stringify(updated));
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
        isMe: true
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
    const contact = savedContacts.find(c => c.phone.replace(/\D/g, '') === phone.replace(/\D/g, ''));
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
      <div className={`px-4 py-2 flex justify-between items-center text-[10px] text-white font-bold transition-colors ${status === 'online' ? 'bg-[#0b141a]' : 'bg-rose-600'}`}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${status === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-white'}`}></div>
          <span className="uppercase tracking-widest">{status === 'online' ? 'Sistema Conectado' : 'Aguardando Ponte no Render'}</span>
        </div>
        <div className="flex gap-4">
          <span>Último Sync: {lastSync}</span>
          <button onClick={() => { if(confirm("Apagar histórico da tela?")) { localStorage.removeItem('wb_incoming'); setMessages([]); setSelectedChat(null); } }} className="text-rose-300">Limpar</button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-slate-100 flex-col bg-white overflow-y-auto`}>
          {sortedChats.length === 0 ? (
            <div className="p-12 text-center opacity-30 mt-10">
              <div className="text-5xl mb-4">📥</div>
              <p className="text-[10px] font-black uppercase">Nenhuma conversa</p>
            </div>
          ) : (
            sortedChats.map(phone => {
              const last = chatGroups[phone][chatGroups[phone].length - 1];
              const isSelected = selectedChat === phone;
              return (
                <button key={phone} onClick={() => setSelectedChat(phone)} className={`w-full p-4 flex gap-3 text-left border-b border-slate-50 transition-all ${isSelected ? 'bg-emerald-50 border-r-4 border-r-emerald-500' : 'hover:bg-slate-50'}`}>
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-400 shrink-0 text-xl">👤</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <p className="font-bold text-slate-800 text-sm truncate">{getDisplayName(phone)}</p>
                      <span className="text-[9px] text-slate-400">{new Date(last.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{last.text}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Chat */}
        <div className={`${!selectedChat ? 'hidden md:flex' : 'flex'} flex-1 flex-col bg-[#e5ddd5]`}>
          {selectedChat ? (
            <>
              <div className="p-4 bg-white border-b border-slate-200 flex items-center gap-3 shrink-0 shadow-sm z-10">
                <button onClick={() => setSelectedChat(null)} className="md:hidden text-slate-400 text-2xl font-bold">←</button>
                <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold">👤</div>
                <div>
                  <div className="font-bold text-slate-800 text-sm truncate">{getDisplayName(selectedChat)}</div>
                  <div className="text-[10px] text-slate-400">+{selectedChat}</div>
                </div>
              </div>

              <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-3 flex flex-col bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat">
                {chatGroups[selectedChat].map((msg: any) => (
                  <div key={msg.id} className={`max-w-[85%] p-3 rounded-xl shadow-sm text-sm ${
                    msg.isMe ? 'bg-[#dcf8c6] self-end rounded-tr-none' : 'bg-white self-start rounded-tl-none'
                  }`}>
                    <p className="whitespace-pre-wrap text-slate-800 leading-relaxed font-medium">{msg.text}</p>
                    <div className="text-[9px] opacity-40 text-right mt-1.5 font-bold uppercase tracking-tight">
                      {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      {msg.isMe && <span className="ml-1 text-blue-500">✓✓</span>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 bg-[#f0f2f5] border-t border-slate-200">
                <div className="flex gap-2 max-w-4xl mx-auto items-center">
                  <input value={replyText} onChange={e => setReplyText(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSendReply()} placeholder="Digite uma resposta..." className="flex-1 bg-white border-0 rounded-full px-5 py-3 text-sm focus:ring-1 focus:ring-emerald-300 outline-none shadow-sm" />
                  <button onClick={handleSendReply} disabled={!replyText.trim() || isSendingReply} className="w-12 h-12 bg-[#00a884] text-white rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all">
                    {isSendingReply ? '...' : '✈️'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-10 text-center opacity-40">
              <div className="text-8xl mb-6">💬</div>
              <h3 className="font-black uppercase tracking-widest text-xs">Selecione uma conversa</h3>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Inbox;