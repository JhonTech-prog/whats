
import React, { useState, useEffect, useRef } from 'react';
import { IncomingMessage, AutomationSettings, Contact } from '../types';
import { sendWhatsAppMessage } from '../services/whatsappService';

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
  
  const pollingRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selectedChat, messages]);

  const loadContacts = () => {
    const saved = localStorage.getItem('wb_contacts');
    if (saved) setSavedContacts(JSON.parse(saved));
  };

  useEffect(() => {
    loadContacts();
    window.addEventListener('storage', loadContacts);
    return () => window.removeEventListener('storage', loadContacts);
  }, []);

  const autoSaveContact = (phone: string, profileName?: string) => {
    if (!profileName || profileName.toLowerCase().trim() !== 'cliente') return;
    const contacts: Contact[] = JSON.parse(localStorage.getItem('wb_contacts') || '[]');
    const exists = contacts.find(c => c.phone === phone);
    if (!exists) {
      const newContact: Contact = {
        id: crypto.randomUUID(),
        name: `Lead Cliente ${phone.slice(-4)}`,
        phone: phone,
        group: 'Capturado via Chat'
      };
      const updated = [newContact, ...contacts];
      localStorage.setItem('wb_contacts', JSON.stringify(updated));
      setSavedContacts(updated);
    }
  };

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
          // Detectar tipo baseado em campos comuns de bridges (Baileys/WPPConnect)
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
          const updated = isDeepSync ? formattedMessages : [...localSaved, ...newMessages];
          updated.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          localStorage.setItem('wb_incoming', JSON.stringify(updated));
          setMessages(updated);
          setDebugLog(isDeepSync ? `Sincronizado.` : `${newMessages.length} novas.`);
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
  }, []);

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
        text: mediaOptions ? `[Enviou ${mediaOptions.mediaType}]` : replyText,
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
      setMediaUrlInput('');
    } else {
      alert("Erro ao enviar: " + result.error);
    }
    setIsSendingReply(false);
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
        return (
          <div className="py-1">
            <audio src={msg.mediaUrl} controls className="max-w-full h-8" />
          </div>
        );
      case 'document':
        return (
          <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-2 bg-black/5 rounded-lg hover:bg-black/10 transition-colors">
            <span className="text-2xl">📄</span>
            <div className="min-w-0">
              <p className="text-xs font-bold truncate">{msg.fileName || 'Documento'}</p>
              <p className="text-[10px] opacity-60 uppercase">Clique para baixar</p>
            </div>
          </a>
        );
      default:
        return <p className="whitespace-pre-wrap">{msg.text}</p>;
    }
  };

  return (
    <div className="bg-white rounded-none md:rounded-2xl border-0 md:border border-slate-200 shadow-sm overflow-hidden h-screen md:h-[calc(100vh-200px)] flex flex-col">
      {/* Header de Status */}
      <div className="px-4 py-3 bg-slate-900 flex justify-between items-center border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${serverHealth === 'up' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
          <span className="text-[10px] text-white font-bold uppercase tracking-widest">
            {serverHealth === 'up' ? 'Automação Ativa' : 'Ponte Offline'}
          </span>
        </div>
        <button onClick={() => fetchMessages(true)} className="text-[9px] font-bold bg-white/10 text-white px-3 py-1 rounded hover:bg-white/20 uppercase">Sync</button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar de Chats */}
        <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-slate-100 flex-col bg-white overflow-y-auto`}>
          {sortedChats.length === 0 ? (
            <div className="p-10 text-center opacity-20 mt-10">
              <p className="text-4xl mb-2">📩</p>
              <p className="text-[10px] font-bold uppercase">Sem mensagens</p>
            </div>
          ) : (
            sortedChats.map(phone => (
              <button key={phone} onClick={() => setSelectedChat(phone)} className={`w-full p-4 flex gap-3 text-left border-b border-slate-50 transition-colors ${selectedChat === phone ? 'bg-emerald-50/50' : 'hover:bg-slate-50'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs bg-slate-100 text-slate-500`}>👤</div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 text-sm truncate">+{phone}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {chatGroups[phone][chatGroups[phone].length - 1].type !== 'text' ? `📎 [${chatGroups[phone][chatGroups[phone].length - 1].type}]` : chatGroups[phone][chatGroups[phone].length - 1].text}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Área do Chat */}
        <div className={`${!selectedChat ? 'hidden md:flex' : 'flex'} flex-1 flex-col bg-[#efeae2] relative shadow-inner`}>
          {selectedChat ? (
            <>
              <div className="p-4 bg-white border-b border-slate-200 flex justify-between items-center z-10 shadow-sm">
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedChat(null)} className="md:hidden text-slate-400 p-1">←</button>
                  <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-[10px]">👤</div>
                  <div>
                    <p className="font-bold text-slate-800 text-sm">+{selectedChat}</p>
                    <p className="text-[8px] text-emerald-500 font-bold uppercase">Atendimento Oficial</p>
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

              {/* Barra de Input */}
              <div className="p-4 bg-white border-t border-slate-200 pb-safe">
                <div className="flex gap-2 items-end max-w-4xl mx-auto">
                  <button 
                    onClick={() => setIsMediaModalOpen(true)}
                    className="w-12 h-12 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center hover:bg-slate-200 transition-colors"
                  >
                    📎
                  </button>
                  <textarea 
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Sua resposta..."
                    rows={1}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none max-h-32 transition-all"
                  />
                  <button onClick={() => handleSendReply()} disabled={!replyText.trim() || isSendingReply} className="w-12 h-12 bg-emerald-500 text-white rounded-full flex items-center justify-center hover:bg-emerald-600 disabled:opacity-50 transition-all shadow-md active:scale-95">
                    {isSendingReply ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <span className="text-xl">✈️</span>}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-12 text-center">
              <div className="w-24 h-24 bg-white/50 rounded-full flex items-center justify-center text-4xl mb-4 grayscale opacity-30 shadow-sm">🤖</div>
              <h3 className="font-bold text-slate-500 uppercase tracking-widest text-xs">Aguardando Interação</h3>
              <p className="text-[10px] mt-2 max-w-[200px]">Selecione um chat para ver as mídias e responder.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Envio de Mídia */}
      {isMediaModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl border border-slate-100">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <span>📎</span> Enviar Mídia Oficial
            </h3>
            <p className="text-[10px] text-slate-400 mb-6 uppercase font-bold">A Meta exige links públicos para envio via API.</p>
            
            <div className="space-y-4">
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase">Tipo de Arquivo</label>
                <select 
                  value={mediaTypeSelect} 
                  onChange={(e: any) => setMediaTypeSelect(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none"
                >
                  <option value="image">Imagem (JPG/PNG)</option>
                  <option value="video">Vídeo (MP4)</option>
                  <option value="audio">Áudio (MP3/OGG)</option>
                  <option value="document">Documento (PDF/ZIP)</option>
                </select>
              </div>
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase">Link Público do Arquivo</label>
                <input 
                  type="text" 
                  value={mediaUrlInput}
                  onChange={(e) => setMediaUrlInput(e.target.value)}
                  placeholder="https://exemplo.com/imagem.jpg"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none"
                />
              </div>
              <div className="flex gap-2 pt-4">
                <button onClick={() => setIsMediaModalOpen(false)} className="flex-1 py-3 text-slate-500 font-bold text-sm">Cancelar</button>
                <button 
                  onClick={() => handleSendReply({ mediaType: mediaTypeSelect, mediaUrl: mediaUrlInput })} 
                  disabled={!mediaUrlInput || isSendingReply}
                  className="flex-1 py-3 bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-100 text-sm disabled:opacity-50"
                >
                  Enviar Mídia
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inbox;
