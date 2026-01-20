import React, { useState, useEffect, useRef } from 'react';
import { useNotificationOnNewMessage } from '../services/useNotificationOnNewMessage';
import { IncomingMessage, Contact } from '../types.ts';
import { sendWhatsAppMessage } from '../services/whatsappService.ts';


const Inbox: React.FC = () => {
  const [messages, setMessages] = useState<IncomingMessage[]>([]);
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [savedContacts, setSavedContacts] = useState<Contact[]>([]);
  const [serverHealth, setServerHealth] = useState<'up' | 'down' | 'unknown'>('unknown');
  const [openedChats, setOpenedChats] = useState<{[phone: string]: boolean}>({});
  const [respondedChats, setRespondedChats] = useState<{[phone: string]: boolean}>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  useNotificationOnNewMessage(messages);

  useEffect(() => {
    // Carrega contatos salvos
    try {
      const saved = localStorage.getItem('wb_contacts');
      if (saved) setSavedContacts(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    // Carrega mensagens do localStorage e do backend
    const fetchMessages = async () => {
      try {
        const configRaw = localStorage.getItem('wb_sender_config');
        const config = configRaw ? JSON.parse(configRaw) : {};
        if (!config.bridgeUrl) return;
        const dataUrl = config.bridgeUrl.endsWith('/messages') ? config.bridgeUrl : (config.bridgeUrl.endsWith('/') ? config.bridgeUrl + 'messages' : config.bridgeUrl + '/messages');
        const response = await fetch(dataUrl);
        if (!response.ok) throw new Error();
        const rawData = await response.json();
        setServerHealth('up');
        if (Array.isArray(rawData)) {
          const formattedMessages: IncomingMessage[] = rawData.map((m: any) => {
            let rawText = m.text || m.texto || m.body || '';
            let detectedType = m.type || m.tipo || 'text';
            let mediaUrl = m.mediaUrl || m.image_url || m.audio_url || m.url;
            if (typeof rawText === 'string' && rawText.startsWith('data:image/')) {
              detectedType = 'image'; mediaUrl = rawText; rawText = '📷 Imagem';
            } else if (typeof rawText === 'string' && rawText.startsWith('data:audio/')) {
              detectedType = 'audio'; mediaUrl = rawText; rawText = '🎤 Áudio';
            }
            return {
              id: m.id || m._id || m.idExterno || `msg-${m.telefone || m.from}`,
              from: String(m.from || m.telefone || '').replace(/\D/g, ''),
              fromName: m.fromName || m.push_name || m.nome || undefined,
              text: rawText,
              type: detectedType,
              mediaUrl: mediaUrl,
              timestamp: m.timestamp ? new Date(m.timestamp).toISOString() : new Date().toISOString(),
              unread: m.unread !== undefined ? m.unread : true,
              isMe: m.isMe || false
            };
          });
          setMessages(formattedMessages);
          localStorage.setItem('wb_incoming', JSON.stringify(formattedMessages));
        }
      } catch {
        setServerHealth('down');
      }
    };
    fetchMessages();
    const interval = setInterval(fetchMessages, 10000);
    return () => clearInterval(interval);
  }, []);


  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    // Marca chat como aberto ao selecionar
    if (selectedChat) {
      setOpenedChats(prev => ({ ...prev, [selectedChat]: true }));
    }
  }, [selectedChat, messages]);

  const handleSendReply = async () => {
    if (!selectedChat || !replyText.trim()) return;
    const configRaw = localStorage.getItem('wb_sender_config');
    const config = configRaw ? JSON.parse(configRaw) : {};
    if (!config.accessToken || !config.phoneId) return alert("Configure suas credenciais.");
    const result = await sendWhatsAppMessage(selectedChat, replyText, {
      accessToken: config.accessToken,
      phoneId: config.phoneId
    });
    if (result.success) {
      const myMessage: IncomingMessage = {
        id: `sent-${Date.now()}`,
        from: selectedChat,
        text: replyText,
        timestamp: new Date().toISOString(),
        unread: false,
        isMe: true,
        type: 'text'
      };
      setMessages(prev => [...prev, myMessage]);
      setReplyText('');
      // Marca chat como respondido
      setRespondedChats(prev => ({ ...prev, [selectedChat]: true }));
    } else {
      alert("Erro ao enviar: " + result.error);
    }
  };

  // Agrupa mensagens por contato
  const chatGroups = messages.reduce((acc: any, msg) => {
    const chatId = String(msg.from).replace(/\D/g, '');
    if (!acc[chatId]) acc[chatId] = [];
    acc[chatId].push(msg);
    return acc;
  }, {});

  // Lista de chats (telefones únicos)
  const chatPhones = Object.keys(chatGroups);

  const getContactName = (phone: string) => {
    const contact = savedContacts.find(c => String(c.phone).replace(/\D/g, '') === String(phone).replace(/\D/g, ''));
    return contact ? contact.name : `+${phone}`;
  };

  return (
    <div className="bg-white rounded-none md:rounded-2xl border-0 md:border border-slate-200 shadow-sm overflow-hidden h-screen md:h-[calc(100vh-200px)] flex flex-col">
      <div className="px-4 py-3 bg-slate-900 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${serverHealth === 'up' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
          <span className="text-[10px] text-white font-bold uppercase">{serverHealth === 'up' ? 'Conectado' : 'Desconectado'}</span>
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-slate-100 flex-col bg-white overflow-y-auto`}>
          {chatPhones.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8">Nenhum chat encontrado</div>
          ) : (
            chatPhones.map(phone => {
              const msgs = chatGroups[phone];
              // Achar a última mensagem mais recente pelo timestamp
              const lastMsg = msgs.reduce((latest, msg) => {
                return new Date(msg.timestamp) > new Date(latest.timestamp) ? msg : latest;
              }, msgs[0]);
              // Verifica se há mensagens não lidas recebidas
              const hasUnread = msgs.some(m => m.unread && !m.isMe);
              // Se já abriu o chat pelo menos uma vez
              const wasOpened = openedChats[phone];
              // Se já respondeu pelo menos uma vez
              const wasResponded = respondedChats[phone];
              // Cor do contato:
              // Vermelho: se tem mensagem não lida
              // Azul: se já respondeu e não tem não lida
              // Preto: se só abriu e não respondeu e não tem não lida
              let nameColor = 'text-slate-800';
              let msgColor = 'text-slate-500';
              if (hasUnread) {
                nameColor = 'text-red-600';
                msgColor = 'text-red-500 font-bold';
              } else if (wasResponded) {
                nameColor = 'text-blue-600';
                msgColor = 'text-blue-500 font-bold';
              } else if (wasOpened) {
                nameColor = 'text-black';
                msgColor = 'text-black';
              }
              return (
                <button
                  key={phone}
                  onClick={() => setSelectedChat(phone)}
                  className={`w-full p-4 flex gap-3 text-left hover:bg-slate-50 border-b border-slate-50 ${selectedChat === phone ? 'bg-emerald-50' : ''}`}
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs bg-slate-100 text-slate-500">{getContactName(phone).charAt(0)}</div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-bold text-sm truncate ${nameColor}`}>{getContactName(phone)}</p>
                    <p className={`text-xs truncate ${msgColor}`}>{lastMsg.text}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
        <div className={`${!selectedChat ? 'hidden md:flex' : 'flex'} flex-1 flex-col bg-[#efeae2] relative`}>
          {selectedChat ? (
            <>
              <div className="p-4 bg-white border-b border-slate-200 flex items-center gap-3">
                <button onClick={() => setSelectedChat(null)} className="md:hidden text-slate-400">←</button>
                <p className="font-bold text-slate-800 text-sm">{getContactName(selectedChat)}</p>
              </div>
              <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-4 flex flex-col">
                {(chatGroups[selectedChat] || []).slice().reverse().map((msg: any) => (
                  <div key={msg.id} className={`max-w-[85%] rounded-2xl p-2 ${msg.isMe ? 'bg-[#dcf8c6] self-end' : 'bg-white self-start'}`}>
                    {msg.type === 'image' && msg.mediaUrl ? (
                      <img src={msg.mediaUrl} alt="Imagem" className="max-w-[200px] max-h-[200px] rounded mb-1" />
                    ) : msg.type === 'audio' && msg.mediaUrl ? (
                      <audio controls className="w-full max-w-[200px] mb-1">
                        <source src={msg.mediaUrl} />
                        Seu navegador não suporta áudio.
                      </audio>
                    ) : (
                      <p className="text-sm">{msg.text}</p>
                    )}
                    <p className="text-[8px] opacity-40 text-right mt-1">{new Date(msg.timestamp).toLocaleTimeString()}</p>
                  </div>
                ))}
              </div>
              <div className="p-4 bg-white border-t flex gap-2">
                <textarea 
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Mensagem..."
                  className="flex-1 bg-slate-50 border rounded-xl px-4 py-2 text-sm focus:outline-none resize-none"
                  rows={1}
                />
                <button onClick={handleSendReply} disabled={!replyText.trim()} className="w-10 h-10 bg-emerald-500 text-white rounded-full flex items-center justify-center">
                  ✈️
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400">📱 Selecione um Chat</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Inbox;

