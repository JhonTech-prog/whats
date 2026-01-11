
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
  const [apiLog, setApiLog] = useState({ status: 'Conectado', type: 'success' });
  
  const [savedContacts, setSavedContacts] = useState<Contact[]>([]);
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [mediaUrlInput, setMediaUrlInput] = useState('');
  const [mediaTypeSelect, setMediaTypeSelect] = useState<'image' | 'video' | 'audio' | 'document'>('image');
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isMounted = useRef(true);

  // Scroll automático
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selectedChat, messages]);

  // Carregamento Inicial e Polling
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
    let url = config.bridgeUrl.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    const finalUrl = url.endsWith('/messages') ? url : `${url}/messages`;

    try {
      const response = await fetch(`${finalUrl}?t=${Date.now()}`);
      if (!response.ok) throw new Error('Erro na ponte');
      
      const data = await response.json();
      if (!Array.isArray(data)) return;

      const formatted: IncomingMessage[] = data.map((m: any) => {
        // CORREÇÃO: Captura o texto mesmo se vier como objeto {body: "..."}
        let txt = '';
        if (typeof m.text === 'object' && m.text?.body) {
          txt = m.text.body;
        } else {
          txt = m.text || m.body || m.caption || '';
        }

        return {
          id: m.id || `msg-${m.from}-${m.timestamp}-${txt.length}`,
          from: m.from || 'unknown',
          fromName: m.name || m.fromName,
          text: txt,
          timestamp: m.timestamp || new Date().toISOString(),
          unread: true,
          isMe: !!m.isMe,
          type: m.type || 'text',
          mediaUrl: m.mediaUrl || m.url
        };
      });

      const currentLocal = JSON.parse(localStorage.getItem('wb_incoming') || '[]');
      const existingIds = new Set(currentLocal.map((m: any) => m.id));
      const newMessages = formatted.filter(m => !existingIds.has(m.id));

      if (newMessages.length > 0) {
        const merged = [...currentLocal, ...newMessages].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        setMessages(merged);
        localStorage.setItem('wb_incoming', JSON.stringify(merged));
        
        if (newMessages.some(m => !m.isMe)) {
          audioRef.current?.play().catch(() => {});
        }
      }
      setApiLog({ status: 'Conectado', type: 'success' });
    } catch (err) {
      setApiLog({ status: 'Erro de Conexão', type: 'error' });
    } finally {
      setIsFetching(false);
    }
  };

  const handleSendReply = async (media?: any) => {
    if (!selectedChat || isSendingReply) return;
    const config = JSON.parse(localStorage.getItem('wb_sender_config') || '{}');
    
    setIsSendingReply(true);
    const res = await sendWhatsAppMessage(selectedChat, replyText, {
      accessToken: config.accessToken,
      phoneId: config.phoneId
    }, media);

    if (res.success) {
      const myMsg: IncomingMessage = {
        id: `sent-${Date.now()}`,
        from: selectedChat,
        text: media ? `[Arquivo enviado]` : replyText,
        timestamp: new Date().toISOString(),
        unread: false,
        isMe: true,
        type: media?.mediaType || 'text'
      };
      const updated = [...messages, myMsg];
      setMessages(updated);
      localStorage.setItem('wb_incoming', JSON.stringify(updated));
      setReplyText('');
      setIsMediaModalOpen(false);
    } else {
      alert("Erro: " + res.error);
    }
    setIsSendingReply(false);
  };

  const getDisplayName = (phone: string) => {
    const contact = savedContacts.find(c => c.phone === phone);
    if (contact) return contact.name;
    const msg = [...messages].reverse().find(m => m.from === phone && m.fromName);
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
      {/* Mini Status */}
      <div className="px-4 py-1.5 bg-slate-800 flex justify-between items-center text-[10px] text-white font-bold uppercase tracking-wider">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${apiLog.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
          {apiLog.status}
        </div>
        <div className="opacity-50">{new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-slate-100 flex-col bg-white overflow-y-auto`}>
          {sortedChats.length === 0 ? (
            <div className="p-12 text-center opacity-20 mt-10 text-xs font-bold uppercase">Nenhuma mensagem</div>
          ) : (
            sortedChats.map(phone => {
              const last = chatGroups[phone][chatGroups[phone].length - 1];
              return (
                <button key={phone} onClick={() => setSelectedChat(phone)} className={`w-full p-4 flex gap-3 text-left border-b border-slate-50 transition-all ${selectedChat === phone ? 'bg-emerald-50 border-r-4 border-r-emerald-500' : ''}`}>
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-lg">👤</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <p className="font-bold text-slate-800 text-sm truncate">{getDisplayName(phone)}</p>
                      <span className="text-[9px] text-slate-400">{new Date(last.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">{last.text || `[${last.type}]`}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Chat */}
        <div className={`${!selectedChat ? 'hidden md:flex' : 'flex'} flex-1 flex-col bg-[#efeae2] relative`}>
          {selectedChat ? (
            <>
              <div className="p-3 bg-white border-b border-slate-200 flex items-center gap-3 z-10 shrink-0">
                <button onClick={() => setSelectedChat(null)} className="md:hidden text-slate-400 text-xl px-2">←</button>
                <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-xs">👤</div>
                <div className="font-bold text-slate-800 text-sm">{getDisplayName(selectedChat)}</div>
              </div>

              <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-2 flex flex-col">
                {chatGroups[selectedChat].map((msg: any) => (
                  <div key={msg.id} className={`max-w-[85%] p-2.5 rounded-lg shadow-sm text-sm ${
                    msg.isMe ? 'bg-[#dcf8c6] self-end rounded-tr-none' : 'bg-white self-start rounded-tl-none'
                  }`}>
                    {msg.text && <p className="whitespace-pre-wrap text-slate-800 leading-normal">{msg.text}</p>}
                    {msg.mediaUrl && <div className="mt-1 text-[10px] text-blue-500 underline cursor-pointer" onClick={() => window.open(msg.mediaUrl, '_blank')}>Ver arquivo</div>}
                    <div className="text-[8px] opacity-40 text-right mt-1 uppercase font-bold">
                      {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-white border-t border-slate-200">
                <div className="flex gap-2 max-w-4xl mx-auto">
                  <button onClick={() => setIsMediaModalOpen(true)} className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center">📎</button>
                  <input value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Mensagem" className="flex-1 bg-slate-50 border-0 rounded-full px-4 text-sm focus:ring-1 focus:ring-emerald-500" />
                  <button onClick={() => handleSendReply()} disabled={!replyText.trim() || isSendingReply} className="w-10 h-10 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-md">
                    {isSendingReply ? '...' : '✈️'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-[10px] font-bold uppercase tracking-widest">
              Selecione uma conversa
            </div>
          )}
        </div>
      </div>

      {isMediaModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-xs p-6 shadow-xl">
            <h3 className="font-bold mb-4">Enviar Mídia</h3>
            <input type="text" value={mediaUrlInput} onChange={e => setMediaUrlInput(e.target.value)} placeholder="URL do arquivo" className="w-full p-2 bg-slate-50 border rounded-lg text-sm mb-4 outline-none" />
            <div className="flex gap-2">
              <button onClick={() => setIsMediaModalOpen(false)} className="flex-1 py-2 text-slate-400 font-bold text-xs">CANCELAR</button>
              <button onClick={() => handleSendReply({ mediaType: mediaTypeSelect, mediaUrl: mediaUrlInput })} className="flex-1 py-2 bg-emerald-500 text-white rounded-lg font-bold text-xs">ENVIAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inbox;
