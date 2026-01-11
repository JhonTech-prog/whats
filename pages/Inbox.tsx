import React, { useState, useEffect, useRef } from 'react';
import { IncomingMessage, Contact } from '../types';
import { sendWhatsAppMessage } from '../services/whatsappService';

const Inbox: React.FC = () => {
  const [messages, setMessages] = useState<IncomingMessage[]>([]);
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [lastSync, setLastSync] = useState('--:--');
  const [serverStatus, setServerStatus] = useState<'online' | 'offline' | 'connecting'>('connecting');
  const [serverMsgCount, setServerMsgCount] = useState(0);
  
  const [savedContacts, setSavedContacts] = useState<Contact[]>([]);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMounted = useRef(true);
  // Fixed: Using any to avoid NodeJS.Timeout vs number conflict in browser environment
  const syncTimerRef = useRef<any>(null);

  // Auto-scroll para o fim da conversa
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selectedChat, messages]);

  // Ciclo de Vida e Sincronização
  useEffect(() => {
    isMounted.current = true;
    
    // Carrega contatos e mensagens locais imediatamente
    const loadLocal = () => {
      try {
        const c = localStorage.getItem('wb_contacts');
        if (c) setSavedContacts(JSON.parse(c));
        
        const m = localStorage.getItem('wb_incoming');
        if (m) setMessages(JSON.parse(m));
      } catch (e) { console.error("Erro ao carregar cache local", e); }
    };
    loadLocal();

    // Inicia o loop de sincronização
    startSyncLoop();

    return () => {
      isMounted.current = false;
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, []);

  const startSyncLoop = async () => {
    if (!isMounted.current) return;
    await fetchMessages();
    
    // Agenda a próxima busca apenas após a anterior terminar (evita atropelos)
    if (isMounted.current) {
      syncTimerRef.current = setTimeout(startSyncLoop, 4000);
    }
  };

  const fetchMessages = async () => {
    const configRaw = localStorage.getItem('wb_sender_config');
    if (!configRaw) {
      setServerStatus('offline');
      return;
    }
    
    const config = JSON.parse(configRaw);
    if (!config.bridgeUrl) return;

    setIsFetching(true);
    let url = config.bridgeUrl.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    const finalUrl = url.endsWith('/messages') ? url : `${url.replace(/\/$/, '')}/messages`;

    try {
      // Adicionamos um timestamp para evitar cache do navegador
      const response = await fetch(`${finalUrl}?t=${Date.now()}`, { 
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      
      if (!response.ok) throw new Error("Erro na resposta do servidor");
      
      const data = await response.json();
      setServerStatus('online');
      
      if (Array.isArray(data)) {
        setServerMsgCount(data.length);
        processNewMessages(data);
      }
      
      setLastSync(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err) {
      console.error("Erro de sincronização:", err);
      setServerStatus('offline');
    } finally {
      setIsFetching(false);
    }
  };

  const processNewMessages = (rawData: any[]) => {
    const formatted: IncomingMessage[] = rawData.map((m: any) => {
      // Limpa o número (remove sufixo whatsapp e caracteres extras)
      const rawFrom = m.from || '';
      const cleanPhone = rawFrom.split('@')[0].replace(/\D/g, '');

      // Extração de texto ultra-resiliente
      let text = '';
      if (m.text?.body) text = m.text.body;
      else if (m.message?.conversation) text = m.message.conversation;
      else if (m.message?.text?.body) text = m.message.text.body;
      else if (m.body) text = m.body;
      else if (typeof m.text === 'string') text = m.text;
      else if (m.caption) text = m.caption;

      return {
        id: m.id || `internal-${cleanPhone}-${m.timestamp}-${Math.random()}`,
        from: cleanPhone,
        fromName: m.name || m.fromName || '',
        text: String(text || '').trim(),
        timestamp: m.timestamp || new Date().toISOString(),
        unread: true,
        isMe: !!m.isMe,
        type: m.type || 'text',
        mediaUrl: m.mediaUrl || m.url
      };
    });

    const currentLocal: IncomingMessage[] = JSON.parse(localStorage.getItem('wb_incoming') || '[]');
    const existingIds = new Set(currentLocal.map(m => m.id));
    
    const newOnes = formatted.filter(m => !existingIds.has(m.id));

    if (newOnes.length > 0) {
      const merged = [...currentLocal, ...newOnes].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      setMessages(merged);
      localStorage.setItem('wb_incoming', JSON.stringify(merged));
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
      alert("Não foi possível enviar: " + res.error);
    }
    setIsSendingReply(false);
  };

  const getDisplayName = (phone: string) => {
    const clean = phone.replace(/\D/g, '');
    const contact = savedContacts.find(c => c.phone.replace(/\D/g, '') === clean);
    if (contact) return contact.name;
    
    const msgWithName = messages.find(m => m.from === phone && m.fromName);
    return msgWithName?.fromName || `+${phone}`;
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
      {/* Barra de Status - Crucial para Debug */}
      <div className={`px-4 py-2 flex justify-between items-center text-[10px] text-white font-bold uppercase tracking-widest shrink-0 transition-colors ${serverStatus === 'online' ? 'bg-[#0b141a]' : serverStatus === 'offline' ? 'bg-rose-900' : 'bg-slate-700'}`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full animate-pulse ${serverStatus === 'online' ? 'bg-emerald-500' : 'bg-white'}`}></div>
            <span>{serverStatus === 'online' ? 'SISTEMA ONLINE' : serverStatus === 'offline' ? 'ERRO NA PONTE' : 'CONECTANDO...'}</span>
          </div>
          <span className="opacity-30">|</span>
          <span className="text-slate-400 font-medium lowercase italic">
             {serverMsgCount} msgs no servidor • Último sync: {lastSync}
          </span>
        </div>
        <button 
          onClick={() => { if(confirm("Deseja apagar todas as mensagens da tela?")) { localStorage.removeItem('wb_incoming'); setMessages([]); setSelectedChat(null); } }} 
          className="text-rose-400 hover:text-white transition-colors"
        >
          Limpar Inbox
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Lista de Conversas */}
        <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-slate-100 flex-col bg-white overflow-y-auto`}>
          {sortedChats.length === 0 ? (
            <div className="p-12 text-center opacity-30 mt-10">
              <div className="text-5xl mb-4">📥</div>
              <p className="text-[10px] font-black uppercase">Aguardando Mensagens</p>
            </div>
          ) : (
            sortedChats.map(phone => {
              const chatMsgs = chatGroups[phone];
              const last = chatMsgs[chatMsgs.length - 1];
              const isSelected = selectedChat === phone;
              
              return (
                <button 
                  key={phone} 
                  onClick={() => setSelectedChat(phone)} 
                  className={`w-full p-4 flex gap-3 text-left border-b border-slate-50 transition-all ${isSelected ? 'bg-emerald-50 border-r-4 border-r-emerald-500' : 'hover:bg-slate-50'}`}
                >
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-400 shrink-0 text-xl shadow-inner">👤</div>
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

        {/* Área de Mensagens */}
        <div className={`${!selectedChat ? 'hidden md:flex' : 'flex'} flex-1 flex-col bg-[#e5ddd5] relative`}>
          {selectedChat ? (
            <>
              {/* Header do Chat */}
              <div className="p-4 bg-white border-b border-slate-200 flex items-center gap-3 shrink-0 shadow-sm z-10">
                <button onClick={() => setSelectedChat(null)} className="md:hidden text-slate-400 text-2xl mr-2 font-bold">←</button>
                <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-sm">👤</div>
                <div className="min-w-0">
                  <div className="font-bold text-slate-800 text-sm truncate">{getDisplayName(selectedChat)}</div>
                  <div className="text-[10px] text-slate-400 font-bold tracking-tight">+{selectedChat}</div>
                </div>
              </div>

              {/* Bubbles */}
              <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-3 flex flex-col bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat">
                {chatGroups[selectedChat].map((msg: any) => (
                  <div key={msg.id} className={`max-w-[85%] p-3 rounded-xl shadow-sm border text-sm animate-in fade-in slide-in-from-bottom-2 ${
                    msg.isMe ? 'bg-[#dcf8c6] border-[#c1e8a0] self-end rounded-tr-none' : 'bg-white border-slate-200 self-start rounded-tl-none'
                  }`}>
                    {msg.text && <p className="whitespace-pre-wrap text-slate-800 leading-relaxed font-medium">{msg.text}</p>}
                    {msg.mediaUrl && (
                      <div className="mt-2 p-2 bg-slate-50 rounded border border-slate-100 text-[10px] text-blue-500 underline cursor-pointer" onClick={() => window.open(msg.mediaUrl, '_blank')}>
                        📎 Ver arquivo anexo
                      </div>
                    )}
                    <div className="text-[9px] opacity-40 text-right mt-1.5 font-bold uppercase tracking-tighter">
                      {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      {msg.isMe && <span className="ml-1 text-blue-500">✓✓</span>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Caixa de Resposta */}
              <div className="p-4 bg-[#f0f2f5] border-t border-slate-200 shrink-0">
                <div className="flex gap-2 max-w-4xl mx-auto items-center">
                  <input 
                    value={replyText} 
                    onChange={e => setReplyText(e.target.value)} 
                    onKeyPress={e => e.key === 'Enter' && handleSendReply()}
                    placeholder="Escreva uma resposta..." 
                    className="flex-1 bg-white border-0 rounded-full px-5 py-3 text-sm focus:ring-1 focus:ring-emerald-300 outline-none shadow-sm" 
                  />
                  <button 
                    onClick={handleSendReply} 
                    disabled={!replyText.trim() || isSendingReply} 
                    className="w-12 h-12 bg-[#00a884] text-white rounded-full flex items-center justify-center shadow-lg active:scale-95 disabled:opacity-50 transition-all hover:bg-[#008f6f]"
                  >
                    {isSendingReply ? '...' : '✈️'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-10 text-center opacity-40">
              <div className="text-8xl mb-6">💬</div>
              <h3 className="font-black uppercase tracking-widest text-xs">Aguardando Interação</h3>
              <p className="text-[10px] mt-2 max-w-[250px] font-bold">SELECIONE UMA CONVERSA PARA RESPONDER</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Inbox;