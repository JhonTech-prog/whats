
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
  const [errorLog, setErrorLog] = useState<string>('');
  const [debugData, setDebugData] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);
  
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
    
    const loadCache = () => {
      try {
        const c = localStorage.getItem('wb_contacts');
        if (c) setSavedContacts(JSON.parse(c));
        
        const m = localStorage.getItem('wb_incoming');
        if (m) setMessages(JSON.parse(m));
      } catch (e) { console.error("Erro cache:", e); }
    };
    loadCache();

    const poll = async () => {
      if (!isMounted.current) return;
      await fetchMessages();
      if (isMounted.current) {
        syncTimerRef.current = setTimeout(poll, 4000); 
      }
    };

    poll();

    return () => {
      isMounted.current = false;
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, []);

  const fetchMessages = async () => {
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
    const baseUrl = url.replace(/\/$/, '');
    const finalUrl = baseUrl.includes('/messages') ? baseUrl : `${baseUrl}/messages`;

    try {
      const response = await fetch(`${finalUrl}?nocache=${Date.now()}`);
      if (!response.ok) throw new Error(`Status ${response.status}`);
      
      const data = await response.json();
      setDebugData(data);
      setStatus('online');
      setLastSync(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

      let msgList: any[] = [];
      let contactMap: Record<string, string> = {};

      // 1. Estrutura Padrão Meta (Webhook)
      if (data.entry?.[0]?.changes?.[0]?.value) {
        const value = data.entry[0].changes[0].value;
        msgList = value.messages || [];
        value.contacts?.forEach((c: any) => {
          contactMap[c.wa_id] = c.profile?.name || '';
        });
      } 
      // 2. Estrutura Simples (Array de mensagens)
      else if (Array.isArray(data)) msgList = data;
      // 3. Objeto com chave messages
      else if (data.messages) msgList = data.messages;

      if (msgList.length > 0) {
        processMessages(msgList, contactMap);
      }
    } catch (err: any) {
      setStatus('offline');
      setErrorLog(err.message);
    }
  };

  const processMessages = (rawList: any[], contactMap: Record<string, string>) => {
    const news: IncomingMessage[] = rawList.map((m: any): IncomingMessage => {
      // --- EXTRAÇÃO ROBUSTA DE NÚMERO ---
      let phone = '';
      
      // Tenta extrair de múltiplos campos comuns
      const possibleSources = [
        m.from, 
        m.wa_id, 
        m.sender, 
        m.remoteJid, 
        m.key?.remoteJid,
        m.participant
      ];

      for (let source of possibleSources) {
        if (source && typeof source === 'string') {
          const digits = source.split('@')[0].replace(/\D/g, '');
          if (digits.length >= 8) {
            phone = digits;
            break;
          }
        }
      }

      // Se não achou, tenta vasculhar o ID (comum em algumas APIs)
      if (!phone && m.id && typeof m.id === 'string') {
        const match = m.id.match(/^(\d+)/);
        if (match) phone = match[1];
      }

      // --- EXTRAÇÃO ROBUSTA DE TEXTO ---
      let text = '';
      if (typeof m.text === 'string') text = m.text;
      else if (m.text?.body) text = m.text.body;
      else if (m.message?.conversation) text = m.message.conversation;
      else if (m.message?.extendedTextMessage?.text) text = m.message.extendedTextMessage.text;
      else if (m.body) text = m.body;
      else if (m.content) text = m.content;
      else if (m.caption) text = m.caption;
      
      // Fallback para mídias
      const msgType = m.type || (m.message ? Object.keys(m.message)[0] : '');
      const defaultText = msgType ? `[Mídia: ${msgType}]` : 'Mensagem recebida';

      // --- NOME ---
      let name = m.pushName || m.name || contactMap[phone] || '';
      if (name.toLowerCase() === 'unknown' || !name) name = '';

      // --- DATA ---
      let rawTs = m.timestamp || m.messageTimestamp || Date.now();
      let ts = Number(rawTs);
      if (ts < 10000000000) ts *= 1000;

      return {
        id: m.id || m.key?.id || `msg-${phone}-${ts}`,
        from: phone || 'unknown',
        fromName: name,
        text: (text || defaultText).trim(),
        timestamp: new Date(ts).toISOString(),
        unread: true,
        isMe: !!m.isMe || !!m.key?.fromMe,
        type: 'text'
      };
    }).filter(m => m.from !== 'unknown'); // Só aceita se tiver número real

    const currentLocal: IncomingMessage[] = JSON.parse(localStorage.getItem('wb_incoming') || '[]');
    const existingIds = new Set(currentLocal.map(m => m.id));
    const added = news.filter(n => !existingIds.has(n.id));

    if (added.length > 0) {
      const merged = [...currentLocal, ...added].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      setMessages(merged);
      localStorage.setItem('wb_incoming', JSON.stringify(merged));
    }
  };

  const handleSendReply = async () => {
    if (!selectedChat || !replyText.trim() || isSendingReply) return;
    
    // Verificação de segurança: Não enviar se o destino for "unknown"
    if (selectedChat === 'unknown' || selectedChat.length < 8) {
      alert("Erro: Número de telefone inválido para envio.");
      return;
    }

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
      alert(`ERRO NO ENVIO (#131009?): ${res.error}\n\nDica: Verifique se o seu Token e Phone ID estão corretos nas Configurações.`);
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
    <div className="bg-white rounded-none md:rounded-2xl border-0 md:border border-slate-200 shadow-sm overflow-hidden h-screen md:h-[calc(100vh-200px)] flex flex-col relative">
      
      {/* BOTÃO DE DEPURAÇÃO GIGANTE - AGORA IMPOSSÍVEL DE NÃO VER */}
      <button 
        onClick={() => setShowDebug(true)}
        className="fixed bottom-24 right-6 z-[110] bg-amber-500 text-slate-900 font-black px-6 py-4 rounded-full shadow-2xl border-4 border-white hover:scale-110 active:scale-95 transition-all text-sm flex items-center gap-2"
      >
        <span className="text-xl">🛠️</span> VER DADOS DA API (JSON)
      </button>

      {/* PAINEL DE DEPURAÇÃO */}
      {showDebug && (
        <div className="absolute inset-0 z-[200] bg-slate-950 text-emerald-400 p-6 md:p-12 overflow-auto font-mono text-[11px]">
          <div className="sticky top-0 bg-slate-950 pb-6 mb-6 border-b border-slate-800 flex justify-between items-center">
            <div>
              <h2 className="text-white font-black text-xl uppercase tracking-tighter">Inspecionar Mensagens Recebidas</h2>
              <p className="text-slate-400 text-xs mt-1">Copie este texto e envie para o suporte se as mensagens não aparecerem.</p>
            </div>
            <button onClick={() => setShowDebug(false)} className="bg-rose-600 hover:bg-rose-700 text-white px-8 py-3 rounded-xl font-black text-sm shadow-lg">FECHAR PAINEL</button>
          </div>
          {debugData ? (
            <pre className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-inner select-all">
              {JSON.stringify(debugData, null, 2)}
            </pre>
          ) : (
            <div className="py-20 text-center text-rose-400">Nenhum dado recebido do servidor ainda. Certifique-se que o Render está online.</div>
          )}
        </div>
      )}

      {/* BARRA DE STATUS */}
      <div className={`px-4 py-3 flex justify-between items-center text-[10px] text-white font-black transition-all ${status === 'online' ? 'bg-[#0b141a]' : 'bg-rose-600'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${status === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-white'}`}></div>
          <span className="uppercase tracking-widest">
            {status === 'online' ? `PONTE CONECTADA: ${messages.length} mensagens na tela` : `ERRO: ${errorLog || 'Servidor Offline'}`}
          </span>
        </div>
        <div className="flex gap-4 items-center">
          <span className="opacity-40">{lastSync}</span>
          <button onClick={() => { if(confirm("Apagar histórico de mensagens da tela?")) { localStorage.removeItem('wb_incoming'); setMessages([]); setSelectedChat(null); } }} className="bg-rose-500/20 text-rose-300 px-3 py-1 rounded-md hover:bg-rose-500/40">LIMPAR TUDO</button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-slate-100 flex-col bg-white overflow-y-auto`}>
          {sortedChats.length === 0 ? (
            <div className="p-10 text-center mt-20 opacity-30">
              <div className="text-6xl mb-6">📭</div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">Caixa de Entrada Vazia</p>
              <p className="text-[10px] mt-2 text-slate-400">As mensagens aparecerão aqui assim que forem enviadas para o seu número da Meta.</p>
            </div>
          ) : (
            sortedChats.map(phone => {
              const last = chatGroups[phone][chatGroups[phone].length - 1];
              const isSelected = selectedChat === phone;
              return (
                <button key={phone} onClick={() => setSelectedChat(phone)} className={`w-full p-4 flex gap-3 text-left border-b border-slate-50 transition-all ${isSelected ? 'bg-emerald-50 border-r-4 border-r-emerald-500' : 'hover:bg-slate-50'}`}>
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-400 shrink-0 border border-slate-200">👤</div>
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

        {/* Área de Mensagens */}
        <div className={`${!selectedChat ? 'hidden md:flex' : 'flex'} flex-1 flex-col bg-[#efeae2]`}>
          {selectedChat ? (
            <>
              <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 shadow-sm">
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedChat(null)} className="md:hidden text-slate-400 text-2xl pr-2">←</button>
                  <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold">👤</div>
                  <div>
                    <div className="font-bold text-slate-800 text-sm">{getDisplayName(selectedChat)}</div>
                    <div className="text-[10px] text-slate-400 font-mono">+{selectedChat}</div>
                  </div>
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
                  <input value={replyText} onChange={e => setReplyText(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSendReply()} placeholder="Digite uma mensagem" className="flex-1 bg-white border-0 rounded-full px-5 py-3 text-sm focus:ring-1 focus:ring-emerald-300 outline-none shadow-sm" />
                  <button onClick={handleSendReply} disabled={!replyText.trim() || isSendingReply} className="w-12 h-12 bg-[#00a884] text-white rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all disabled:opacity-50">
                    {isSendingReply ? '...' : '✈️'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-10 text-center opacity-30">
              <div className="text-8xl mb-6">💬</div>
              <h3 className="font-black uppercase tracking-widest text-xs">Selecione uma conversa para começar</h3>
              <p className="text-[10px] mt-4 font-bold max-w-xs">Todas as mensagens recebidas pela sua API da Meta aparecerão aqui automaticamente.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Inbox;
