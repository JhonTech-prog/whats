
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
  const [serverStatus, setServerStatus] = useState<'online' | 'offline' | 'connecting' | 'error'>('connecting');
  const [debugInfo, setDebugInfo] = useState<string>('Iniciando...');
  const [showDebug, setShowDebug] = useState(false);
  const [rawResponse, setRawResponse] = useState<string>('');
  
  const [savedContacts, setSavedContacts] = useState<Contact[]>([]);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMounted = useRef(true);
  const syncTimerRef = useRef<any>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selectedChat, messages]);

  useEffect(() => {
    isMounted.current = true;
    
    const loadLocal = () => {
      try {
        const c = localStorage.getItem('wb_contacts');
        if (c) setSavedContacts(JSON.parse(c));
        
        const m = localStorage.getItem('wb_incoming');
        if (m) setMessages(JSON.parse(m));
      } catch (e) { setDebugInfo("Erro ao ler cache local"); }
    };
    loadLocal();

    startSyncLoop();

    return () => {
      isMounted.current = false;
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, []);

  const startSyncLoop = async () => {
    if (!isMounted.current) return;
    await fetchMessages();
    if (isMounted.current) {
      syncTimerRef.current = setTimeout(startSyncLoop, 5000);
    }
  };

  const fetchMessages = async () => {
    const configRaw = localStorage.getItem('wb_sender_config');
    if (!configRaw) {
      setServerStatus('offline');
      setDebugInfo("Configuração ausente em 'Configurações'");
      return;
    }
    
    const config = JSON.parse(configRaw);
    if (!config.bridgeUrl) {
      setServerStatus('offline');
      setDebugInfo("URL da ponte não configurada");
      return;
    }

    setIsFetching(true);
    let url = config.bridgeUrl.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    const finalUrl = url.endsWith('/messages') ? url : `${url.replace(/\/$/, '')}/messages`;

    try {
      const response = await fetch(`${finalUrl}?t=${Date.now()}`, { 
        method: 'GET',
        mode: 'cors',
        headers: { 'Accept': 'application/json' }
      });
      
      if (!response.ok) throw new Error(`Status ${response.status}`);
      
      const data = await response.json();
      setRawResponse(JSON.stringify(data, null, 2));
      setServerStatus('online');

      // EXTRATOR PROFUNDO (Handle Meta, Baileys and Direct Formats)
      let messagesArray: any[] = [];
      
      // 1. Caso seja o payload Bruto da Meta Cloud API
      if (data?.entry?.[0]?.changes?.[0]?.value?.messages) {
        messagesArray = data.entry[0].changes[0].value.messages;
      } 
      // 2. Caso seja um array direto
      else if (Array.isArray(data)) {
        messagesArray = data;
      } 
      // 3. Caso esteja em 'data' ou 'messages'
      else if (data.messages && Array.isArray(data.messages)) {
        messagesArray = data.messages;
      } else if (data.data && Array.isArray(data.data)) {
        messagesArray = data.data;
      }

      if (messagesArray.length > 0) {
        setDebugInfo(`Conectado. ${messagesArray.length} msgs encontradas.`);
        processNewMessages(messagesArray);
      } else {
        setDebugInfo("Conectado. Nenhuma mensagem no servidor.");
      }
      
      setLastSync(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err: any) {
      console.error("Erro Sync:", err);
      setServerStatus('error');
      setDebugInfo(`Falha: ${err.message}`);
    } finally {
      setIsFetching(false);
    }
  };

  const processNewMessages = (rawData: any[]) => {
    const formatted: IncomingMessage[] = rawData.map((m: any) => {
      // Normalização de remetente
      const rawFrom = m.from || m.remoteJid || m.key?.remoteJid || '';
      const cleanPhone = rawFrom.split('@')[0].replace(/\D/g, '');

      // Extração de texto multi-formato (Meta Cloud API vs Baileys)
      let text = '';
      if (m.text?.body) text = m.text.body; // Meta
      else if (typeof m.text === 'string') text = m.text;
      else if (m.message?.conversation) text = m.message.conversation;
      else if (m.message?.extendedTextMessage?.text) text = m.message.extendedTextMessage.text;
      else if (m.body) text = m.body;
      else if (m.caption) text = m.caption;

      return {
        id: m.id || m.key?.id || `ext-${cleanPhone}-${Date.now()}-${Math.random()}`,
        from: cleanPhone || 'contato',
        fromName: m.pushName || m.name || m.fromName || '',
        text: String(text || '').trim(),
        timestamp: m.timestamp || m.messageTimestamp || new Date().toISOString(),
        unread: true,
        isMe: !!m.isMe || !!m.key?.fromMe,
        type: m.type || 'text',
        mediaUrl: m.mediaUrl || m.url
      };
    });

    const validOnes = formatted.filter(m => (m.text || m.mediaUrl) && m.from);

    const currentLocal: IncomingMessage[] = JSON.parse(localStorage.getItem('wb_incoming') || '[]');
    const existingIds = new Set(currentLocal.map(m => m.id));
    
    const newOnes = validOnes.filter(m => !existingIds.has(m.id));

    if (newOnes.length > 0) {
      const merged = [...currentLocal, ...newOnes].sort(
        (a, b) => {
          const timeA = isNaN(Number(a.timestamp)) ? new Date(a.timestamp).getTime() : Number(a.timestamp) * 1000;
          const timeB = isNaN(Number(b.timestamp)) ? new Date(b.timestamp).getTime() : Number(b.timestamp) * 1000;
          return timeA - timeB;
        }
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
      alert("Erro ao responder: " + res.error);
    }
    setIsSendingReply(false);
  };

  const getDisplayName = (phone: string) => {
    const clean = phone.replace(/\D/g, '');
    const contact = savedContacts.find(c => c.phone.replace(/\D/g, '') === clean);
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
    const tA = isNaN(Number(lastA)) ? new Date(lastA).getTime() : Number(lastA) * 1000;
    const tB = isNaN(Number(lastB)) ? new Date(lastB).getTime() : Number(lastB) * 1000;
    return tB - tA;
  });

  return (
    <div className="bg-white rounded-none md:rounded-2xl border-0 md:border border-slate-200 shadow-sm overflow-hidden h-screen md:h-[calc(100vh-200px)] flex flex-col">
      {/* Header de Status e Debug */}
      <div className={`px-4 py-2 flex flex-col sm:flex-row justify-between items-center text-[9px] text-white font-bold uppercase tracking-widest shrink-0 transition-all ${
        serverStatus === 'online' ? 'bg-[#0b141a]' : 
        serverStatus === 'error' ? 'bg-rose-700' : 'bg-slate-700'
      }`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${serverStatus === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-white'}`}></div>
            <span>{serverStatus === 'online' ? 'PONTE CONECTADA' : 'ERRO CONEXÃO'}</span>
          </div>
          <span className="opacity-30">|</span>
          <span className="text-slate-400 normal-case italic font-medium truncate max-w-[200px]">
            {debugInfo}
          </span>
          <button onClick={() => setShowDebug(!showDebug)} className="bg-white/10 px-2 py-0.5 rounded hover:bg-white/20">DEBUG</button>
        </div>
        <div className="flex gap-4 items-center">
          <span className="text-slate-400">SYNC: {lastSync}</span>
          <button onClick={() => { if(confirm("Limpar mensagens da tela?")) { localStorage.removeItem('wb_incoming'); setMessages([]); setSelectedChat(null); } }} className="text-rose-400">Limpar</button>
        </div>
      </div>

      {/* Janela de Debug (Apenas visível se clicado) */}
      {showDebug && (
        <div className="bg-slate-900 text-emerald-400 p-4 font-mono text-[10px] h-40 overflow-auto border-b border-slate-800">
          <p className="mb-2 text-white font-bold border-b border-slate-700 pb-1">Última Resposta do Servidor (Render):</p>
          <pre>{rawResponse || 'Nenhum dado recebido ainda.'}</pre>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-slate-100 flex-col bg-white overflow-y-auto`}>
          {sortedChats.length === 0 ? (
            <div className="p-12 text-center opacity-30 mt-10">
              <div className="text-5xl mb-4">📥</div>
              <p className="text-[10px] font-black uppercase mb-2">Sem Conversas</p>
              <p className="text-[8px] leading-relaxed">
                1. Verifique se o Webhook na Meta está configurado.<br/>
                2. Verifique se o Verify Token é: G3rPF002513<br/>
                3. Certifique-se que o Render está salvando os eventos recebidos.
              </p>
            </div>
          ) : (
            sortedChats.map(phone => {
              const last = chatGroups[phone][chatGroups[phone].length - 1];
              const isSelected = selectedChat === phone;
              const time = isNaN(Number(last.timestamp)) ? new Date(last.timestamp) : new Date(Number(last.timestamp) * 1000);
              
              return (
                <button key={phone} onClick={() => setSelectedChat(phone)} className={`w-full p-4 flex gap-3 text-left border-b border-slate-50 transition-all ${isSelected ? 'bg-emerald-50 border-r-4 border-r-emerald-500' : 'hover:bg-slate-50'}`}>
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-400 shrink-0 text-xl border border-slate-200">👤</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <p className="font-bold text-slate-800 text-sm truncate">{getDisplayName(phone)}</p>
                      <span className="text-[9px] text-slate-400">{time.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{last.text || "[Mídia]"}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Chat Area */}
        <div className={`${!selectedChat ? 'hidden md:flex' : 'flex'} flex-1 flex-col bg-[#e5ddd5]`}>
          {selectedChat ? (
            <>
              <div className="p-4 bg-white border-b border-slate-200 flex items-center gap-3 shrink-0 shadow-sm z-10">
                <button onClick={() => setSelectedChat(null)} className="md:hidden text-slate-400 text-2xl">←</button>
                <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold">👤</div>
                <div>
                  <div className="font-bold text-slate-800 text-sm truncate">{getDisplayName(selectedChat)}</div>
                  <div className="text-[10px] text-slate-400">+{selectedChat}</div>
                </div>
              </div>

              <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-3 flex flex-col bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')]">
                {chatGroups[selectedChat].map((msg: any) => {
                  const time = isNaN(Number(msg.timestamp)) ? new Date(msg.timestamp) : new Date(Number(msg.timestamp) * 1000);
                  return (
                    <div key={msg.id} className={`max-w-[85%] p-3 rounded-xl shadow-sm text-sm animate-in fade-in slide-in-from-bottom-2 ${
                      msg.isMe ? 'bg-[#dcf8c6] self-end rounded-tr-none' : 'bg-white self-start rounded-tl-none'
                    }`}>
                      {msg.text && <p className="whitespace-pre-wrap text-slate-800 leading-relaxed font-medium">{msg.text}</p>}
                      {msg.mediaUrl && <div className="mt-2 text-[10px] text-blue-500 underline cursor-pointer" onClick={() => window.open(msg.mediaUrl, '_blank')}>📎 Ver anexo</div>}
                      <div className="text-[9px] opacity-40 text-right mt-1.5 font-bold uppercase tracking-tight">
                        {time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        {msg.isMe && <span className="ml-1 text-blue-500">✓✓</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-4 bg-[#f0f2f5] border-t border-slate-200">
                <div className="flex gap-2 items-center">
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
              <h3 className="font-black uppercase tracking-widest text-xs">Aguardando Mensagens</h3>
              <p className="text-[10px] mt-2 font-bold uppercase">WhatsJhonTechAI Inbox</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Inbox;
