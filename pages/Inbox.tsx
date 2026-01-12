
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
  const [showDebug, setShowDebug] = useState(false);
  const [debugData, setDebugData] = useState<any>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMounted = useRef(true);
  const pollTimer = useRef<any>(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selectedChat, messages]);

  useEffect(() => {
    isMounted.current = true;
    
    // Limpeza de inicialização: remove lixo 'unknown' do armazenamento local
    const initCache = () => {
      try {
        const stored = localStorage.getItem('wb_incoming');
        if (stored) {
          const parsed: IncomingMessage[] = JSON.parse(stored);
          const cleaned = parsed.filter(m => m.from && !m.from.includes('unknown') && m.from.replace(/\D/g, '').length > 5);
          if (cleaned.length !== parsed.length) {
            localStorage.setItem('wb_incoming', JSON.stringify(cleaned));
            setMessages(cleaned);
          } else {
            setMessages(parsed);
          }
        }
      } catch (e) { console.error("Erro no cache:", e); }
    };
    initCache();

    const startPolling = async () => {
      if (!isMounted.current) return;
      await fetchMessages();
      pollTimer.current = setTimeout(startPolling, 3000);
    };
    startPolling();

    return () => {
      isMounted.current = false;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  const fetchMessages = async () => {
    const configRaw = localStorage.getItem('wb_sender_config');
    if (!configRaw) {
      setStatus('offline');
      return;
    }
    const config = JSON.parse(configRaw);
    if (!config.bridgeUrl) return;

    let url = config.bridgeUrl.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    const finalUrl = url.replace(/\/$/, '') + '/messages';

    try {
      const response = await fetch(`${finalUrl}?cb=${Date.now()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      
      setDebugData(data);
      setStatus('online');
      setLastSync(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

      let rawMsgs: any[] = [];
      if (data.entry?.[0]?.changes?.[0]?.value?.messages) {
        rawMsgs = data.entry[0].changes[0].value.messages;
      } else if (Array.isArray(data)) {
        rawMsgs = data;
      }

      if (rawMsgs.length > 0) processIncoming(rawMsgs);
    } catch (err: any) {
      setStatus('offline');
      console.error("Polling error:", err);
    }
  };

  const processIncoming = (list: any[]) => {
    const newMsgs: IncomingMessage[] = list.map((m: any): IncomingMessage | null => {
      // EXTRATOR DE NÚMERO (Resolve 'unknown')
      let rawFrom = m.from || m.wa_id || m.key?.remoteJid || m.sender || '';
      let phone = String(rawFrom).split('@')[0].replace(/\D/g, '');
      
      // Se não tem um número válido, descarta para evitar erro #131009 no futuro
      if (!phone || phone.length < 8) return null;

      // EXTRATOR DE TEXTO
      let body = "";
      if (typeof m.text === 'string') body = m.text;
      else if (m.text?.body) body = m.text.body;
      else if (m.message?.conversation) body = m.message.conversation;
      else if (m.body) body = m.body;
      else if (m.message?.extendedTextMessage?.text) body = m.message.extendedTextMessage.text;

      return {
        id: m.id || m.key?.id || `msg-${phone}-${Date.now()}`,
        from: phone,
        fromName: m.pushName || m.name || '',
        text: body.trim() || '[Mídia ou Mensagem sem texto]',
        timestamp: new Date().toISOString(),
        unread: true,
        isMe: !!m.isMe || !!m.key?.fromMe
      };
    }).filter((m): m is IncomingMessage => m !== null);

    const stored: IncomingMessage[] = JSON.parse(localStorage.getItem('wb_incoming') || '[]');
    const existingIds = new Set(stored.map(x => x.id));
    const toAdd = newMsgs.filter(n => !existingIds.has(n.id));

    if (toAdd.length > 0) {
      const updated = [...stored, ...toAdd].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      setMessages(updated);
      localStorage.setItem('wb_incoming', JSON.stringify(updated));
    }
  };

  const handleReply = async () => {
    if (!selectedChat || !replyText.trim() || isSendingReply) return;
    
    setIsSendingReply(true);
    const config = JSON.parse(localStorage.getItem('wb_sender_config') || '{}');
    
    const result = await sendWhatsAppMessage(selectedChat, replyText, {
      accessToken: config.accessToken,
      phoneId: config.phoneId
    });

    if (result.success) {
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
      alert(`FALHA NO ENVIO:\n${result.error}`);
    }
    setIsSendingReply(false);
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

  return (
    <div className="bg-white rounded-none md:rounded-2xl border-0 md:border border-slate-200 shadow-sm overflow-hidden h-screen md:h-[calc(100vh-200px)] flex flex-col relative">
      
      {/* PAINEL DE DEPURAÇÃO */}
      {showDebug && (
        <div className="absolute inset-0 z-[100] bg-slate-900 text-emerald-400 p-6 overflow-auto font-mono text-[10px]">
          <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-2">
            <h2 className="text-white font-bold text-sm">INSPEÇÃO DE DADOS DO SERVIDOR</h2>
            <button onClick={() => setShowDebug(false)} className="bg-rose-500 text-white px-4 py-1 rounded font-bold">FECHAR</button>
          </div>
          <p className="mb-4 text-slate-400 uppercase font-bold tracking-widest">Abaixo está o que seu servidor no Render está enviando agora:</p>
          <pre className="bg-slate-950 p-4 rounded-lg">{JSON.stringify(debugData, null, 2)}</pre>
        </div>
      )}

      {/* BARRA DE STATUS SUPERIOR */}
      <div className={`px-4 py-3 flex justify-between items-center text-[10px] text-white font-black transition-all ${status === 'online' ? 'bg-[#111b21]' : 'bg-rose-600'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${status === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-white'}`}></div>
          <span className="uppercase tracking-widest">
            {status === 'online' ? `CONECTADO • ${messages.length} MSGS` : `SISTEMA OFFLINE`}
          </span>
        </div>
        
        <div className="flex gap-2 items-center">
          <button onClick={() => setShowDebug(true)} className="bg-amber-500 text-slate-900 px-3 py-1 rounded-lg font-bold hover:scale-105 transition-all">DEPURAR JSON</button>
          <button 
            onClick={() => { if(confirm("Deseja apagar todas as mensagens da tela?")) { localStorage.removeItem('wb_incoming'); setMessages([]); setSelectedChat(null); window.location.reload(); } }} 
            className="bg-rose-500 text-white px-3 py-1 rounded-lg font-bold hover:scale-105 transition-all"
          >
            RESETAR TELA
          </button>
          <span className="opacity-40 hidden sm:inline ml-2">{lastSync}</span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* LISTA DE CONVERSAS */}
        <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-slate-100 flex-col bg-white overflow-y-auto`}>
          {sortedKeys.length === 0 ? (
            <div className="p-10 text-center mt-10 opacity-20 flex flex-col items-center">
              <span className="text-6xl mb-4">📥</span>
              <p className="text-[10px] font-black uppercase tracking-widest">Sem mensagens novas</p>
            </div>
          ) : (
            sortedKeys.map(phone => {
              const chat = chatGroups[phone];
              const last = chat[chat.length - 1];
              return (
                <button 
                  key={phone} 
                  onClick={() => setSelectedChat(phone)} 
                  className={`w-full p-4 flex gap-3 text-left border-b border-slate-50 transition-all ${selectedChat === phone ? 'bg-emerald-50 border-r-4 border-r-emerald-500' : 'hover:bg-slate-50'}`}
                >
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-400 shrink-0 border border-slate-200">👤</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <p className="font-bold text-slate-800 text-sm truncate">{last.fromName || `+${phone}`}</p>
                      <span className="text-[9px] text-slate-400">{new Date(last.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{last.text}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* ÁREA DE CHAT */}
        <div className={`${!selectedChat ? 'hidden md:flex' : 'flex'} flex-1 flex-col bg-[#efeae2]`}>
          {selectedChat ? (
            <>
              <div className="p-4 bg-white border-b border-slate-200 flex items-center gap-3 shrink-0 shadow-sm">
                <button onClick={() => setSelectedChat(null)} className="md:hidden text-slate-400 text-2xl pr-4">←</button>
                <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold">👤</div>
                <div>
                  <div className="font-bold text-slate-800 text-sm">+{selectedChat}</div>
                  <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">Conversa Aberta</p>
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
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 bg-[#f0f2f5] border-t border-slate-200">
                <div className="flex gap-2 items-center max-w-4xl mx-auto">
                  <input 
                    value={replyText} 
                    onChange={e => setReplyText(e.target.value)} 
                    onKeyPress={e => e.key === 'Enter' && handleReply()} 
                    placeholder="Digite sua resposta..." 
                    className="flex-1 bg-white border-0 rounded-full px-5 py-3 text-sm focus:ring-1 focus:ring-emerald-300 outline-none shadow-sm" 
                  />
                  <button 
                    onClick={handleReply} 
                    disabled={!replyText.trim() || isSendingReply} 
                    className="w-12 h-12 bg-[#00a884] text-white rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all disabled:opacity-50"
                  >
                    {isSendingReply ? '...' : '✈️'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-10 text-center opacity-30">
              <div className="text-8xl mb-6">💬</div>
              <h3 className="font-black uppercase tracking-widest text-xs">Selecione uma conversa para começar</h3>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Inbox;
