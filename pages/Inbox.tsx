
import React, { useState, useEffect, useRef } from 'react';
import { IncomingMessage } from '../types';
import { sendWhatsAppMessage } from '../services/whatsappService';

const Inbox: React.FC = () => {
  const [messages, setMessages] = useState<IncomingMessage[]>([]);
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState<'online' | 'offline'>('offline');
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollTimer = useRef<any>(null);

  // Auto-scroll para o fim da conversa
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selectedChat, messages]);

  useEffect(() => {
    // Carregar histórico local
    const saved = localStorage.getItem('wb_incoming');
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (e) {
        setMessages([]);
      }
    }

    const startPolling = () => {
      pollTimer.current = setInterval(async () => {
        const configRaw = localStorage.getItem('wb_sender_config');
        if (!configRaw) return;
        const config = JSON.parse(configRaw);
        if (!config.bridgeUrl) return;

        try {
          const baseUrl = config.bridgeUrl.trim().replace(/\/$/, '');
          const res = await fetch(`${baseUrl}/messages?nocache=${Date.now()}`);
          if (!res.ok) throw new Error();
          
          const data = await res.json();
          setStatus('online');
          
          let rawList: any[] = [];
          if (data.entry?.[0]?.changes?.[0]?.value?.messages) {
            rawList = data.entry[0].changes[0].value.messages;
          } else if (Array.isArray(data)) {
            rawList = data;
          }

          if (rawList.length > 0) {
            handleIncoming(rawList);
          }
        } catch (e) {
          setStatus('offline');
        }
      }, 5000);
    };

    startPolling();
    return () => clearInterval(pollTimer.current);
  }, []);

  const handleIncoming = (list: any[]) => {
    const news: IncomingMessage[] = list.map((m: any): IncomingMessage | null => {
      // Extração segura do número (Resolve o problema do 'unknown')
      const rawFrom = m.from || m.wa_id || m.key?.remoteJid || '';
      const phone = String(rawFrom).split('@')[0].replace(/\D/g, '');
      
      if (!phone || phone.length < 8) return null;

      const body = m.text?.body || m.message?.conversation || m.body || m.text || '';
      
      return {
        id: m.id || m.key?.id || `msg-${Date.now()}-${Math.random()}`,
        from: phone,
        fromName: m.pushName || '',
        text: String(body).trim() || '[Mídia]',
        timestamp: new Date().toISOString(),
        unread: true,
        isMe: !!m.isMe || !!m.key?.fromMe
      };
    }).filter((m): m is IncomingMessage => m !== null);

    if (news.length === 0) return;

    const current: IncomingMessage[] = JSON.parse(localStorage.getItem('wb_incoming') || '[]');
    const existingIds = new Set(current.map(msg => msg.id));
    const added = news.filter(n => !existingIds.has(n.id));

    if (added.length > 0) {
      const merged = [...current, ...added].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      setMessages(merged);
      localStorage.setItem('wb_incoming', JSON.stringify(merged));
    }
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
      const updated = [...messages, myMsg];
      setMessages(updated);
      localStorage.setItem('wb_incoming', JSON.stringify(updated));
      setReplyText('');
    } else {
      alert(`Falha no envio:\n${result.error}`);
    }
    setIsSending(false);
  };

  // Agrupamento de conversas
  const chatGroups = messages.reduce((acc: any, m) => {
    if (!acc[m.from]) acc[m.from] = [];
    acc[m.from].push(m);
    return acc;
  }, {});

  const sortedChats = Object.keys(chatGroups).sort((a, b) => {
    const lastA = chatGroups[a][chatGroups[a].length - 1].timestamp;
    const lastB = chatGroups[b][chatGroups[b].length - 1].timestamp;
    return new Date(lastB).getTime() - new Date(lastA).getTime();
  });

  return (
    <div className="bg-white rounded-none md:rounded-2xl border border-slate-200 shadow-sm h-screen md:h-[calc(100vh-200px)] flex overflow-hidden">
      {/* Lista de Contatos */}
      <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-slate-100 flex-col bg-white overflow-y-auto`}>
        <div className="p-4 border-b border-slate-50 flex justify-between items-center bg-slate-50 sticky top-0 z-10">
          <h2 className="font-bold text-slate-800 text-sm">Mensagens</h2>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${status === 'online' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
            <span className="text-[10px] font-bold text-slate-400 uppercase">{status}</span>
          </div>
        </div>
        
        {sortedChats.length === 0 ? (
          <div className="p-10 text-center opacity-30 mt-10">
            <p className="text-4xl mb-2">📥</p>
            <p className="text-[10px] font-black uppercase tracking-widest">Aguardando mensagens...</p>
          </div>
        ) : (
          sortedChats.map(phone => {
            const last = chatGroups[phone][chatGroups[phone].length - 1];
            return (
              <button 
                key={phone} 
                onClick={() => setSelectedChat(phone)} 
                className={`w-full p-4 text-left border-b border-slate-50 hover:bg-slate-50 transition-all ${selectedChat === phone ? 'bg-emerald-50 border-r-4 border-r-emerald-500' : ''}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <p className="font-bold text-slate-800 text-sm truncate pr-2">{last.fromName || `+${phone}`}</p>
                  <span className="text-[9px] text-slate-400 shrink-0">{new Date(last.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                </div>
                <p className="text-xs text-slate-500 truncate">{last.text}</p>
              </button>
            );
          })
        )}
      </div>

      {/* Janela de Chat */}
      <div className={`${!selectedChat ? 'hidden md:flex' : 'flex'} flex-1 flex-col bg-[#efeae2]`}>
        {selectedChat ? (
          <>
            <div className="p-4 bg-white border-b border-slate-200 flex items-center gap-3 shrink-0">
              <button onClick={() => setSelectedChat(null)} className="md:hidden text-slate-400 text-xl font-bold">←</button>
              <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold">👤</div>
              <div>
                <p className="font-bold text-slate-800 text-sm">+{selectedChat}</p>
                <p className="text-[9px] text-emerald-500 font-bold uppercase tracking-widest">Online</p>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-3 flex flex-col bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat">
              {chatGroups[selectedChat].map((m: any) => (
                <div 
                  key={m.id} 
                  className={`max-w-[85%] p-3 rounded-xl shadow-sm text-sm ${
                    m.isMe ? 'bg-[#dcf8c6] self-end rounded-tr-none' : 'bg-white self-start rounded-tl-none'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.text}</p>
                  <div className="text-[9px] opacity-40 text-right mt-1 font-bold uppercase">
                    {new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
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
                  placeholder="Escreva uma mensagem..." 
                />
                <button 
                  onClick={handleSend} 
                  disabled={!replyText.trim() || isSending} 
                  className="w-12 h-12 bg-[#00a884] text-white rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-all disabled:opacity-50"
                >
                  {isSending ? '...' : '✈️'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-10 opacity-30">
            <div className="text-8xl mb-4">💬</div>
            <h3 className="font-black uppercase tracking-widest text-xs">Selecione uma conversa</h3>
          </div>
        )}
      </div>
    </div>
  );
};

export default Inbox;
