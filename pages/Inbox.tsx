
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
    
    // Função para limpar dados corrompidos
    const cleanCache = () => {
      try {
        const mRaw = localStorage.getItem('wb_incoming');
        if (mRaw) {
          const m: IncomingMessage[] = JSON.parse(mRaw);
          const valid = m.filter(msg => msg.from && msg.from !== 'unknown' && msg.from.length > 5);
          if (valid.length !== m.length) {
            localStorage.setItem('wb_incoming', JSON.stringify(valid));
            setMessages(valid);
          } else {
            setMessages(m);
          }
        }
        const c = localStorage.getItem('wb_contacts');
        if (c) setSavedContacts(JSON.parse(c));
      } catch (e) { console.error(e); }
    };

    cleanCache();

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
    if (!config.bridgeUrl) return;

    let url = config.bridgeUrl.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    const finalUrl = url.replace(/\/$/, '') + '/messages';

    try {
      const response = await fetch(`${finalUrl}?nocache=${Date.now()}`);
      if (!response.ok) throw new Error(`Status ${response.status}`);
      const data = await response.json();
      
      setDebugData(data);
      setStatus('online');
      setLastSync(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

      let msgList: any[] = [];
      if (data.entry?.[0]?.changes?.[0]?.value?.messages) {
        msgList = data.entry[0].changes[0].value.messages;
      } else if (Array.isArray(data)) {
        msgList = data;
      }

      if (msgList.length > 0) processMessages(msgList);
    } catch (err: any) {
      setStatus('offline');
      setErrorLog(err.message);
    }
  };

  const processMessages = (rawList: any[]) => {
    const news: IncomingMessage[] = rawList.map((m: any): IncomingMessage | null => {
      // Tenta achar o número de telefone
      let rawFrom = m.from || m.wa_id || m.key?.remoteJid || '';
      let phone = String(rawFrom).split('@')[0].replace(/\D/g, '');
      
      if (!phone || phone.length < 8 || phone === '0') return null;

      // Tenta achar o texto
      let text = typeof m.text === 'string' ? m.text : (m.text?.body || m.message?.conversation || m.body || '');
      
      return {
        id: m.id || m.key?.id || `msg-${Date.now()}`,
        from: phone,
        fromName: m.pushName || '',
        text: text.trim() || '[Mídia ou Mensagem Vazia]',
        timestamp: new Date().toISOString(),
        unread: true,
        isMe: !!m.isMe || !!m.key?.fromMe
      };
    }).filter((m): m is IncomingMessage => m !== null);

    const current: IncomingMessage[] = JSON.parse(localStorage.getItem('wb_incoming') || '[]');
    const existingIds = new Set(current.map(m => m.id));
    const added = news.filter(n => !existingIds.has(n.id));

    if (added.length > 0) {
      const merged = [...current, ...added].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      setMessages(merged);
      localStorage.setItem('wb_incoming', JSON.stringify(merged));
    }
  };

  const handleSendReply = async () => {
    if (!selectedChat || !replyText.trim() || isSendingReply) return;
    
    if (selectedChat === 'unknown') {
      alert("Erro: Não é possível responder a um remetente desconhecido.");
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
      alert(res.error);
      if (res.debug) console.log('DEBUG ENVIO:', res.debug);
    }
    setIsSendingReply(false);
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
      
      {showDebug && (
        <div className="absolute inset-0 z-[100] bg-slate-900 text-emerald-400 p-6 overflow-auto font-mono text-xs">
          <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-2">
            <h2 className="text-white font-bold">DADOS DO SERVIDOR (JSON)</h2>
            <button onClick={() => setShowDebug(false)} className="bg-rose-500 text-white px-4 py-1 rounded font-bold">FECHAR</button>
          </div>
          <pre>{JSON.stringify(debugData, null, 2)}</pre>
        </div>
      )}

      {/* BARRA DE STATUS - CORES FORTES PARA VISIBILIDADE */}
      <div className={`px-4 py-3 flex justify-between items-center text-[11px] text-white font-black bg-[#111b21] border-b border-slate-800`}>
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${status === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
          <span className="uppercase tracking-widest">{status === 'online' ? 'SISTEMA ONLINE' : 'ERRO DE CONEXÃO'}</span>
        </div>
        
        <div className="flex gap-2">
          <button onClick={() => setShowDebug(true)} className="bg-amber-500 text-slate-900 px-3 py-1.5 rounded-lg font-bold hover:scale-105 transition-all">INSPECIONAR JSON</button>
          <button onClick={() => { if(confirm("Limpar mensagens?")) { localStorage.removeItem('wb_incoming'); setMessages([]); setSelectedChat(null); window.location.reload(); } }} className="bg-rose-600 text-white px-3 py-1.5 rounded-lg font-bold hover:scale-105 transition-all">LIMPAR CACHE</button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Lista Lateral */}
        <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-slate-100 flex-col bg-white overflow-y-auto`}>
          {sortedChats.length === 0 ? (
            <div className="p-10 text-center mt-10 opacity-30">
              <p className="text-4xl mb-4">📭</p>
              <p className="text-[10px] font-black uppercase tracking-widest">Nenhuma mensagem real recebida.</p>
              <p className="text-[9px] mt-2 text-slate-400">Verifique seu webhook na Meta.</p>
            </div>
          ) : (
            sortedChats.map(phone => {
              const last = chatGroups[phone][chatGroups[phone].length - 1];
              return (
                <button key={phone} onClick={() => setSelectedChat(phone)} className={`w-full p-4 flex gap-3 text-left border-b border-slate-50 transition-all ${selectedChat === phone ? 'bg-emerald-50 border-r-4 border-r-emerald-500' : 'hover:bg-slate-50'}`}>
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

        {/* Chat */}
        <div className={`${!selectedChat ? 'hidden md:flex' : 'flex'} flex-1 flex-col bg-[#efeae2]`}>
          {selectedChat ? (
            <>
              <div className="p-4 bg-white border-b border-slate-200 flex items-center gap-3 shrink-0">
                <button onClick={() => setSelectedChat(null)} className="md:hidden text-slate-400 text-2xl pr-2">←</button>
                <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold">👤</div>
                <div>
                  <div className="font-bold text-slate-800 text-sm">+{selectedChat}</div>
                </div>
              </div>

              <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-3 flex flex-col bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat">
                {chatGroups[selectedChat].map((msg: any) => (
                  <div key={msg.id} className={`max-w-[85%] p-3 rounded-xl shadow-sm text-sm ${msg.isMe ? 'bg-[#dcf8c6] self-end rounded-tr-none' : 'bg-white self-start rounded-tl-none'}`}>
                    <p className="whitespace-pre-wrap text-slate-800 leading-relaxed font-medium">{msg.text}</p>
                    <div className="text-[9px] opacity-40 text-right mt-1.5 font-bold uppercase">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                  </div>
                ))}
              </div>

              <div className="p-4 bg-[#f0f2f5] border-t border-slate-200">
                <div className="flex gap-2 items-center max-w-4xl mx-auto">
                  <input value={replyText} onChange={e => setReplyText(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSendReply()} placeholder="Digite uma resposta..." className="flex-1 bg-white border-0 rounded-full px-5 py-3 text-sm focus:ring-1 focus:ring-emerald-300 outline-none shadow-sm" />
                  <button onClick={handleSendReply} disabled={!replyText.trim() || isSendingReply} className="w-12 h-12 bg-[#00a884] text-white rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all">
                    {isSendingReply ? '...' : '✈️'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-10 text-center opacity-30">
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
