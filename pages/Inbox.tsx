
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
  const pollingRef = useRef<any>(null);

  // Solicitar permissão de notificação ao carregar
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Sincronizar estado com LocalStorage de forma segura
  useEffect(() => {
    const saved = localStorage.getItem('wb_incoming');
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (e) {
        console.error("Erro ao fazer parse das mensagens salvas", e);
      }
    }
  }, []);

  useEffect(() => {
    // Persiste no localStorage sempre que o estado de mensagens mudar
    if (messages.length > 0) {
      localStorage.setItem('wb_incoming', JSON.stringify(messages));
    }
  }, [messages]);

  // Scroll automático para a última mensagem
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selectedChat, messages]);

  // Loop de Polling
  useEffect(() => {
    const poll = async () => {
      const configRaw = localStorage.getItem('wb_sender_config');
      if (!configRaw) return;
      
      const config = JSON.parse(configRaw);
      if (!config.bridgeUrl) return;

      try {
        const baseUrl = config.bridgeUrl.replace(/\/$/, '');
        const res = await fetch(`${baseUrl}/messages?nocache=${Date.now()}`);
        
        if (!res.ok) throw new Error("Falha na resposta do servidor");
        
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
        console.error("Erro no polling:", e);
        setStatus('offline');
      }
    };

    poll();
    pollingRef.current = setInterval(poll, 4000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const handleIncoming = (list: any[]) => {
    const news: IncomingMessage[] = list.map((m: any): IncomingMessage | null => {
      // Extração ultra-robusta do telefone
      // Tenta extrair de múltiplos campos comuns em diferentes implementações de bridge
      const rawId = m.from || m.wa_id || (m.key ? m.key.remoteJid : '') || '';
      
      // Limpa @s.whatsapp.net e caracteres não numéricos
      const phone = String(rawId).split('@')[0].replace(/\D/g, '');
      
      // Validação de tamanho mínimo (DDI + DDD + Numero)
      if (!phone || phone.length < 8) {
        console.warn("Mensagem ignorada: Telefone inválido extraído", { rawId, phone });
        return null;
      }

      const body = m.text?.body || m.message?.conversation || m.body || m.text || '';
      const isMe = !!m.isMe || !!m.key?.fromMe;

      return {
        id: m.id || m.key?.id || `msg-${Date.now()}-${Math.random()}`,
        from: phone,
        fromName: m.pushName || '',
        text: String(body).trim() || '[Mídia]',
        timestamp: new Date().toISOString(),
        unread: !isMe, // Mensagens minhas não contam como não lidas
        isMe: isMe
      };
    }).filter((m): m is IncomingMessage => m !== null);

    if (news.length === 0) return;

    setMessages(prevMessages => {
      const existingIds = new Set(prevMessages.map(m => m.id));
      const filteredNew = news.filter(n => !existingIds.has(n.id));

      if (filteredNew.length === 0) return prevMessages;

      // Disparar Notificação para novas mensagens de terceiros
      filteredNew.forEach(msg => {
        if (!msg.isMe && Notification.permission === "granted") {
          new Notification(`Nova mensagem de ${msg.fromName || msg.from}`, {
            body: msg.text,
            icon: 'https://cdn-icons-png.flaticon.com/512/124/124034.png'
          });
        }
      });

      // Retorna novo estado ordenado
      return [...prevMessages, ...filteredNew].sort((a, b) => 
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

  const sortedKeys = Object.keys(chatGroups).sort((a, b) => {
    const lastA = chatGroups[a][chatGroups[a].length - 1].timestamp;
    const lastB = chatGroups[b][chatGroups[b].length - 1].timestamp;
    return new Date(lastB).getTime() - new Date(lastA).getTime();
  });

  const markAsRead = (phone: string) => {
    setMessages(prev => prev.map(m => 
      m.from === phone ? { ...m, unread: false } : m
    ));
  };

  const handleSelectChat = (phone: string) => {
    setSelectedChat(phone);
    markAsRead(phone);
  };

  return (
    <div className="bg-white rounded-none md:rounded-2xl border border-slate-200 shadow-sm h-screen md:h-[calc(100vh-200px)] flex overflow-hidden">
      {/* Lista de Conversas */}
      <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-slate-100 flex-col bg-white overflow-y-auto`}>
        <div className="p-4 border-b border-slate-50 flex justify-between items-center bg-slate-50 sticky top-0 z-10">
          <h2 className="font-bold text-slate-800 text-sm">Conversas</h2>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${status === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
            <span className="text-[9px] font-bold text-slate-400 uppercase">{status}</span>
          </div>
        </div>
        
        {sortedKeys.length === 0 ? (
          <div className="p-10 text-center opacity-30 mt-10">
            <p className="text-4xl mb-2">📬</p>
            <p className="text-[10px] font-bold uppercase tracking-widest">Nenhuma mensagem</p>
          </div>
        ) : (
          sortedKeys.map(phone => {
            const chat = chatGroups[phone];
            const last = chat[chat.length - 1];
            const unreadCount = chat.filter((m: any) => m.unread).length;

            return (
              <button 
                key={phone} 
                onClick={() => handleSelectChat(phone)} 
                className={`w-full p-4 text-left border-b border-slate-50 hover:bg-slate-50 transition-all flex items-center gap-3 ${selectedChat === phone ? 'bg-emerald-50 border-r-4 border-r-emerald-500' : ''}`}
              >
                <div className="w-10 h-10 bg-slate-100 rounded-full flex-shrink-0 flex items-center justify-center text-lg">👤</div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1">
                    <p className={`text-sm truncate pr-2 ${unreadCount > 0 ? 'font-black text-slate-900' : 'font-bold text-slate-700'}`}>
                      {last.fromName || `+${phone}`}
                    </p>
                    <span className="text-[9px] text-slate-400 shrink-0">
                      {new Date(last.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className={`text-xs truncate ${unreadCount > 0 ? 'font-bold text-slate-800' : 'text-slate-500'}`}>
                      {last.text}
                    </p>
                    {unreadCount > 0 && (
                      <span className="bg-emerald-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-2">
                        {unreadCount}
                      </span>
                    )}
                  </div>
                </div>
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
                <p className="text-[9px] text-emerald-500 font-bold uppercase tracking-widest">Conectado</p>
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
                  placeholder="Mensagem" 
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
            <h3 className="font-black uppercase tracking-widest text-xs">Selecione uma conversa</h3>
          </div>
        )}
      </div>
    </div>
  );
};

export default Inbox;
