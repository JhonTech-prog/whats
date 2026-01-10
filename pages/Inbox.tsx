
import React, { useState, useEffect, useRef } from 'react';
import { IncomingMessage, AutomationSettings, Contact } from '../types';
import { sendWhatsAppMessage } from '../services/whatsappService';

const NOTIFICATION_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3';

const Inbox: React.FC = () => {
  const [messages, setMessages] = useState<IncomingMessage[]>([]);
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [debugLog, setDebugLog] = useState<string>('Sistema pronto.');
  const [serverHealth, setServerHealth] = useState<'up' | 'down' | 'unknown'>('unknown');
  const [savedContacts, setSavedContacts] = useState<Contact[]>([]);
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [mediaUrlInput, setMediaUrlInput] = useState('');
  const [mediaTypeSelect, setMediaTypeSelect] = useState<'image' | 'video' | 'audio' | 'document'>('image');
  const [isSoundEnabled, setIsSoundEnabled] = useState(false);
  
  const pollingRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selectedChat, messages]);

  const playNotification = () => {
    if (isSoundEnabled && audioRef.current) {
      audioRef.current.play().catch(e => console.warn("Áudio bloqueado pelo navegador."));
    }
  };

  const loadContacts = () => {
    const saved = localStorage.getItem('wb_contacts');
    if (saved) setSavedContacts(JSON.parse(saved));
  };

  useEffect(() => {
    loadContacts();
    audioRef.current = new Audio(NOTIFICATION_SOUND_URL);
    window.addEventListener('storage', loadContacts);
    return () => window.removeEventListener('storage', loadContacts);
  }, []);

  const fetchMessages = async (isManual = false, isDeepSync = false) => {
    const config = JSON.parse(localStorage.getItem('wb_sender_config') || '{}');
    if (!config.bridgeUrl) return;

    const dataUrl = config.bridgeUrl.endsWith('/messages') ? config.bridgeUrl : (config.bridgeUrl.endsWith('/') ? config.bridgeUrl + 'messages' : config.bridgeUrl + '/messages');

    try {
      const response = await fetch(dataUrl);
      if (!response.ok) throw new Error();
      const rawData = await response.json();
      setServerHealth('up');

      if (Array.isArray(rawData)) {
        const formattedMessages: IncomingMessage[] = rawData.map((m: any) => {
          const stableId = m.id || `${m.from}-${m.timestamp}`;
          let type: any = m.type || 'text';
          if (m.mimetype?.startsWith('image/')) type = 'image';
          if (m.mimetype?.startsWith('video/')) type = 'video';
          if (m.mimetype?.startsWith('audio/')) type = 'audio';

          return {
            id: stableId,
            from: m.from || 'Sistema',
            fromName: m.name || m.fromName || undefined,
            text: m.text || '',
            timestamp: m.timestamp || new Date().toISOString(),
            unread: m.unread !== undefined ? m.unread : true,
            isMe: m.isMe || false,
            type: type,
            mediaUrl: m.mediaUrl || m.url || m.link,
            mimeType: m.mimetype,
            fileName: m.fileName || m.filename
          };
        });

        const localSaved = isDeepSync ? [] : JSON.parse(localStorage.getItem('wb_incoming') || '[]');
        const existingIds = new Set(localSaved.map((m: any) => m.id));
        const newMessages = formattedMessages.filter(m => !existingIds.has(m.id));

        if (newMessages.length > 0 || isDeepSync) {
          if (!isDeepSync && newMessages.some(m => !m.isMe)) {
            playNotification();
          }

          const updated = isDeepSync ? formattedMessages : [...localSaved, ...newMessages];
          updated.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          localStorage.setItem('wb_incoming', JSON.stringify(updated));
          setMessages(updated);
        }
      }
    } catch (e) {
      setServerHealth('down');
    }
  };

  useEffect(() => {
    const config = JSON.parse(localStorage.getItem('wb_sender_config') || '{}');
    if (config.bridgeUrl) {
      fetchMessages();
      pollingRef.current = window.setInterval(() => fetchMessages(), 10000);
    }
    const saved = localStorage.getItem('wb_incoming');
    if (saved) setMessages(JSON.parse(saved));
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [isSoundEnabled]);

  const handleSendReply = async (mediaOptions?: any) => {
    if (!selectedChat || isSendingReply) return;
    if (!replyText.trim() && !mediaOptions) return;

    const config = JSON.parse(localStorage.getItem('wb_sender_config') || '{}');
    if (!config.accessToken || !config.phoneId) {
      alert("Configure seu Token e Phone ID nos Ajustes.");
      return;
    }

    setIsSendingReply(true);
    const result = await sendWhatsAppMessage(selectedChat, replyText, {
      accessToken: config.accessToken,
      phoneId: config.phoneId
    }, mediaOptions);

    if (result.success) {
      const myMessage: IncomingMessage = {
        id: `sent-${Date.now()}`,
        from: selectedChat,
        text: mediaOptions ? `[Mídia Enviada: ${mediaOptions.mediaType}]` : replyText,
        timestamp: new Date().toISOString(),
        unread: false,
        isMe: true,
        type: mediaOptions?.mediaType || 'text',
        mediaUrl: mediaOptions?.mediaUrl
      };

      setMessages(prev => {
        const updated = [...prev, myMessage];
        localStorage.setItem('wb_incoming', JSON.stringify(updated));
        return updated;
      });
      setReplyText('');
      setIsMediaModalOpen(false);
    } else {
      alert("Erro ao enviar: " + result.error);
    }
    setIsSendingReply(false);
  };

  const getDisplayName = (phone: string) => {
    // 1. Tentar encontrar na agenda salva
    const contact = savedContacts.find(c => c.phone === phone);
    if (contact) return { name: contact.name, isSaved: true };

    // 2. Tentar encontrar o fromName na última mensagem recebida deste chat
    const chatMessages = messages.filter(m => m.from === phone && !m.isMe);
    const lastMessageWithName = [...chatMessages].reverse().find(m => m.fromName);
    
    if (lastMessageWithName?.fromName) {
      return { name: lastMessageWithName.fromName, isSaved: false };
    }

    return { name: `+${phone}`, isSaved: false };
  };

  const chatGroups = messages.reduce((acc: any, msg) => {
    if (!acc[msg.from]) acc[msg.from] = [];
    acc[msg.from].push(msg);
    return acc;
  }, {});

  const sortedChats = Object.keys(chatGroups).sort((a, b) => {
    const lastA = chatGroups[a][chatGroups[a].length - 1].timestamp;
    const lastB = chatGroups[b][chatGroups[b].length - 1].timestamp;
    return new Date(lastB).getTime() - new Date(lastA).getTime();
  });

  const renderMessageContent = (msg: IncomingMessage) => {
    switch (msg.type) {
      case 'image':
        return (
          <div className="space-y-2">
            <img 
              src={msg.mediaUrl} 
              alt="Mídia" 
              className="rounded-lg max-w-full h-auto cursor-pointer hover:opacity-90 border border-black/5" 
              onClick={() => window.open(msg.mediaUrl, '_blank')}
            />
            {msg.text && <p className="text-sm">{msg.text}</p>}
          </div>
        );
      case 'video':
        return (
          <div className="space-y-2">
            <video src={msg.mediaUrl} controls className="rounded-lg max-w-full h-auto border border-black/5" />
            {msg.text && <p className="text-sm">{msg.text}</p>}
          </div>
        );
      case 'audio':
        return <div className="py-1"><audio src={msg.mediaUrl} controls className="max-w-full h-8" /></div>;
      case 'document':
        return (
          <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-2 bg-black/5 rounded-lg hover:bg-black/10 transition-colors">
            <span className="text-2xl">📄</span>
            <div className="min-w-0">
              <p className="text-xs font-bold truncate">{msg.fileName || 'Documento'}</p>
              <p className="text-[10px] opacity-60 uppercase">Baixar</p>
            </div>
          </a>
        );
      default:
        return <p className="whitespace-pre-wrap">{msg.text}</p>;
    }
  };

  return (
    <div className="bg-white rounded-none md:rounded-2xl border-0 md:border border-slate-200 shadow-sm overflow-hidden h-screen md:h-[calc(100vh-200px)] flex flex-col">
      <div className="px-4 py-3 bg-slate-900 flex justify-between items-center border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${serverHealth === 'up' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
          <span className="text-[10px] text-white font-bold uppercase tracking-widest">
            {serverHealth === 'up' ? 'Automação Ativa' : 'Ponte Offline'}
          </span>
          <button 
            onClick={() => setIsSoundEnabled(!isSoundEnabled)} 
            className={`flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-bold transition-all ${isSoundEnabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/5 text-white/40 border border-white/10'}`}
          >
            {isSoundEnabled ? '🔔 SOM ATIVO' : '🔕 SEM SOM'}
          </button>
        </div>
        <button onClick={() => fetchMessages(true)} className="text-[9px] font-bold bg-white/10 text-white px-3 py-1 rounded hover:bg-white/20 uppercase">Sync</button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-slate-100 flex-col bg-white overflow-y-auto`}>
          {sortedChats.length === 0 ? (
            <div className="p-10 text-center opacity-20 mt-10">
              <p className="text-4xl mb-2">📩</p>
              <p className="text-[10px] font-bold uppercase">Sem mensagens</p>
            </div>
          ) : (
            sortedChats.map(phone => {
              const display = getDisplayName(phone);
              const lastMsg = chatGroups[phone][chatGroups[phone].length - 1];
              return (
                <button key={phone} onClick={() => setSelectedChat(phone)} className={`w-full p-4 flex gap-3 text-left border-b border-slate-50 transition-colors ${selectedChat === phone ? 'bg-emerald-50/50' : 'hover:bg-slate-50'}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs ${display.isSaved ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                    {display.isSaved ? '👤' : '👥'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <p className="font-bold text-slate-800 text-sm truncate">{display.name}</p>
                      <span className="text-[8px] text-slate-400 mt-1 uppercase">{new Date(lastMsg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {lastMsg.type !== 'text' ? `📎 [Mídia: ${lastMsg.type}]` : lastMsg.text}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className={`${!selectedChat ? 'hidden md:flex' : 'flex'} flex-1 flex-col bg-[#efeae2] relative shadow-inner`}>
          {selectedChat ? (
            <>
              <div className="p-4 bg-white border-b border-slate-200 flex justify-between items-center z-10 shadow-sm">
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedChat(null)} className="md:hidden text-slate-400 p-1 mr-2 text-xl">←</button>
                  <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-sm">
                    {getDisplayName(selectedChat).isSaved ? '👤' : '👥'}
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-sm">{getDisplayName(selectedChat).name}</p>
                    <p className="text-[10px] text-slate-400 font-mono tracking-tighter">+{selectedChat}</p>
                  </div>
                </div>
              </div>

              <div ref={scrollRef} className="flex-1 p-4 md:p-6 overflow-y-auto space-y-3 flex flex-col">
                {chatGroups[selectedChat].map((msg: any) => (
                  <div key={msg.id} className={`max-w-[85%] p-3 rounded-xl shadow-sm border text-sm ${
                    msg.isMe 
                      ? 'bg-[#dcf8c6] border-[#c1e8a0] self-end rounded-tr-none text-slate-800' 
                      : 'bg-white border-slate-200 self-start rounded-tl-none text-slate-700'
                  }`}>
                    {renderMessageContent(msg)}
                    <div className="flex justify-end items-center gap-1 mt-1 opacity-50">
                      <p className="text-[9px]">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                      {msg.isMe && <span className="text-[10px] text-blue-500">✓✓</span>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 bg-white border-t border-slate-200 pb-safe">
                <div className="flex gap-2 items-end max-w-4xl mx-auto">
                  <button onClick={() => setIsMediaModalOpen(true)} className="w-12 h-12 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center hover:bg-slate-200 transition-colors">
                    📎
                  </button>
                  <textarea 
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Escreva sua mensagem..."
                    rows={1}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none max-h-32"
                  />
                  <button onClick={() => handleSendReply()} disabled={!replyText.trim() || isSendingReply} className="w-12 h-12 bg-emerald-500 text-white rounded-full flex items-center justify-center hover:bg-emerald-600 disabled:opacity-50 transition-all shadow-md active:scale-95">
                    {isSendingReply ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <span className="text-xl">✈️</span>}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-12 text-center">
              <div className="w-24 h-24 bg-white/50 rounded-full flex items-center justify-center text-4xl mb-4 grayscale opacity-30 shadow-sm">💬</div>
              <h3 className="font-bold text-slate-500 uppercase tracking-widest text-xs">Selecione uma Conversa</h3>
              {!isSoundEnabled && (
                <button 
                  onClick={() => setIsSoundEnabled(true)}
                  className="mt-6 px-6 py-3 bg-emerald-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-emerald-100"
                >
                  🔔 ATIVAR NOTIFICAÇÕES SONORAS
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {isMediaModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl border border-slate-100">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">📎 Enviar Mídia</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase">Tipo</label>
                <select value={mediaTypeSelect} onChange={(e: any) => setMediaTypeSelect(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none">
                  <option value="image">Imagem</option>
                  <option value="video">Vídeo</option>
                  <option value="audio">Áudio</option>
                  <option value="document">Documento</option>
                </select>
              </div>
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase">URL do Link Público</label>
                <input type="text" value={mediaUrlInput} onChange={(e) => setMediaUrlInput(e.target.value)} placeholder="https://..." className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setIsMediaModalOpen(false)} className="flex-1 py-3 text-slate-500 font-bold text-sm">Cancelar</button>
                <button onClick={() => handleSendReply({ mediaType: mediaTypeSelect, mediaUrl: mediaUrlInput })} disabled={!mediaUrlInput || isSendingReply} className="flex-1 py-3 bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-100 text-sm">Enviar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inbox;
