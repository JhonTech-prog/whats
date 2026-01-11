
import React, { useState, useEffect, useRef } from 'react';
import { IncomingMessage, Contact } from '../types';
import { sendWhatsAppMessage } from '../services/whatsappService';

const NOTIFICATION_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3';

const Inbox: React.FC = () => {
  const [messages, setMessages] = useState<IncomingMessage[]>([]);
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{status: 'online' | 'offline' | 'loading', log: string}>({ status: 'loading', log: 'Iniciando sincronização...' });
  const [lastCheck, setLastCheck] = useState<string>('');
  const [savedContacts, setSavedContacts] = useState<Contact[]>([]);
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [mediaUrlInput, setMediaUrlInput] = useState('');
  const [mediaTypeSelect, setMediaTypeSelect] = useState<'image' | 'video' | 'audio' | 'document'>('image');
  const [isSoundEnabled, setIsSoundEnabled] = useState(false);
  
  const pollingRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Auto-scroll para a última mensagem
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selectedChat, messages]);

  // Carregar contatos e sons
  useEffect(() => {
    const loadData = () => {
      const savedC = localStorage.getItem('wb_contacts');
      if (savedC) setSavedContacts(JSON.parse(savedC));
      
      const savedM = localStorage.getItem('wb_incoming');
      if (savedM) setMessages(JSON.parse(savedM));
    };

    loadData();
    audioRef.current = new Audio(NOTIFICATION_SOUND_URL);
    window.addEventListener('storage', loadData);
    return () => window.removeEventListener('storage', loadData);
  }, []);

  const fetchMessages = async (forceResync = false) => {
    const config = JSON.parse(localStorage.getItem('wb_sender_config') || '{}');
    if (!config.bridgeUrl) {
      setConnectionStatus({ status: 'offline', log: 'URL da Ponte não configurada nas Definições.' });
      return;
    }

    setLastCheck(new Date().toLocaleTimeString());

    // Normalização da URL
    let url = config.bridgeUrl.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    if (url.endsWith('/')) url = url.slice(0, -1);
    const finalUrl = url.endsWith('/messages') ? url : `${url}/messages`;

    try {
      const response = await fetch(finalUrl, { 
        cache: 'no-store',
        headers: { 'Pragma': 'no-cache' }
      });
      
      if (!response.ok) throw new Error(`Servidor respondeu com erro ${response.status}`);
      
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error("Formato de dados inválido (esperado lista [])");

      setConnectionStatus({ status: 'online', log: `${data.length} mensagens encontradas no servidor.` });

      const newIncoming: IncomingMessage[] = data.map((m: any) => ({
        id: m.id || `${m.from}-${m.timestamp}-${(m.text || '').substring(0, 5)}`,
        from: m.from || 'desconhecido',
        fromName: m.name || m.fromName || undefined,
        text: m.text || '',
        timestamp: m.timestamp || new Date().toISOString(),
        unread: m.unread !== undefined ? m.unread : true,
        isMe: m.isMe || false,
        type: m.mimetype?.startsWith('image/') ? 'image' : 
              m.mimetype?.startsWith('video/') ? 'video' : 
              m.mimetype?.startsWith('audio/') ? 'audio' : (m.type || 'text'),
        mediaUrl: m.mediaUrl || m.url || m.link,
        fileName: m.fileName || m.filename
      }));

      const localMessages = forceResync ? [] : JSON.parse(localStorage.getItem('wb_incoming') || '[]');
      const existingIds = new Set(localMessages.map((m: any) => m.id));
      const filteredNew = newIncoming.filter(m => !existingIds.has(m.id));

      if (filteredNew.length > 0 || forceResync) {
        if (filteredNew.some(m => !m.isMe) && isSoundEnabled && !forceResync) {
          audioRef.current?.play().catch(() => {});
        }

        const merged = forceResync ? newIncoming : [...localMessages, ...filteredNew];
        merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        
        setMessages(merged);
        localStorage.setItem('wb_incoming', JSON.stringify(merged));
      }
    } catch (err: any) {
      setConnectionStatus({ status: 'offline', log: err.message });
    }
  };

  useEffect(() => {
    fetchMessages();
    pollingRef.current = window.setInterval(() => fetchMessages(), 4000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [isSoundEnabled]);

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
        text: media ? `[Mídia: ${media.mediaType}]` : replyText,
        timestamp: new Date().toISOString(),
        unread: false,
        isMe: true,
        type: media?.mediaType || 'text',
        mediaUrl: media?.mediaUrl
      };
      const updated = [...messages, myMsg];
      setMessages(updated);
      localStorage.setItem('wb_incoming', JSON.stringify(updated));
      setReplyText('');
      setIsMediaModalOpen(false);
    } else {
      alert("Erro no envio: " + res.error);
    }
    setIsSendingReply(false);
  };

  const getDisplayName = (phone: string) => {
    // 1. Prioridade: Contato Salvo na Agenda
    const contact = savedContacts.find(c => c.phone === phone);
    if (contact) return { name: contact.name, isSaved: true };

    // 2. Prioridade: Nome de Perfil vindo da API nas mensagens
    const profileMsg = [...messages].reverse().find(m => m.from === phone && m.fromName);
    if (profileMsg?.fromName) return { name: profileMsg.fromName, isSaved: false };

    // 3. Fallback: Número
    return { name: `+${phone}`, isSaved: false };
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
      {/* Status da Conexão */}
      <div className="px-4 py-2 bg-slate-900 flex justify-between items-center text-white border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${connectionStatus.status === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
          <span className="text-[10px] font-bold uppercase tracking-widest">{connectionStatus.status === 'online' ? 'Sistema Online' : 'Conexão Perdida'}</span>
          <span className="hidden sm:block text-[9px] text-slate-500 font-mono">| Log: {connectionStatus.log}</span>
        </div>
        <div className="flex gap-2">
           <button onClick={() => setIsSoundEnabled(!isSoundEnabled)} className={`px-2 py-1 rounded text-[9px] font-bold border ${isSoundEnabled ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' : 'bg-white/5 text-white/40 border-white/10'}`}>
             {isSoundEnabled ? '🔔 SOM ATIVO' : '🔕 SEM SOM'}
           </button>
           <button onClick={() => fetchMessages(true)} className="bg-emerald-500 text-white px-3 py-1 rounded text-[9px] font-bold hover:bg-emerald-600 uppercase">Sincronizar</button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar de Chats */}
        <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-slate-100 flex-col bg-white overflow-y-auto`}>
          {sortedChats.length === 0 ? (
            <div className="p-12 text-center opacity-30 mt-10">
              <p className="text-4xl mb-4">💬</p>
              <p className="text-[10px] font-bold uppercase">Nenhuma mensagem recebida</p>
              <p className="text-[9px] mt-2">Aguardando dados da Ponte...</p>
            </div>
          ) : (
            sortedChats.map(phone => {
              const display = getDisplayName(phone);
              const last = chatGroups[phone][chatGroups[phone].length - 1];
              return (
                <button key={phone} onClick={() => setSelectedChat(phone)} className={`w-full p-4 flex gap-3 text-left border-b border-slate-50 transition-all ${selectedChat === phone ? 'bg-emerald-50/50 border-r-4 border-r-emerald-500' : 'hover:bg-slate-50'}`}>
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm ${display.isSaved ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                    {display.isSaved ? '👤' : '👥'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                      <p className="font-bold text-slate-800 text-sm truncate">{display.name}</p>
                      <span className="text-[8px] text-slate-400 font-bold uppercase">{new Date(last.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">{last.text || `[Mídia: ${last.type}]`}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Chat Aberto */}
        <div className={`${!selectedChat ? 'hidden md:flex' : 'flex'} flex-1 flex-col bg-[#efeae2] relative shadow-inner`}>
          {selectedChat ? (
            <>
              <div className="p-4 bg-white border-b border-slate-200 flex items-center gap-3 z-10 shadow-sm">
                <button onClick={() => setSelectedChat(null)} className="md:hidden text-slate-400 text-xl mr-2">←</button>
                <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-sm">
                  {getDisplayName(selectedChat).isSaved ? '👤' : '👥'}
                </div>
                <div>
                  <p className="font-bold text-slate-800 text-sm">{getDisplayName(selectedChat).name}</p>
                  <p className="text-[10px] text-slate-400 font-mono tracking-tighter">+{selectedChat}</p>
                </div>
              </div>

              <div ref={scrollRef} className="flex-1 p-4 md:p-6 overflow-y-auto space-y-3 flex flex-col">
                {chatGroups[selectedChat].map((msg: any) => (
                  <div key={msg.id} className={`max-w-[80%] p-3 rounded-xl shadow-sm border text-sm ${
                    msg.isMe ? 'bg-[#dcf8c6] border-[#c1e8a0] self-end rounded-tr-none' : 'bg-white border-slate-200 self-start rounded-tl-none'
                  }`}>
                    {msg.type === 'image' && <img src={msg.mediaUrl} className="rounded mb-2 max-w-full cursor-pointer" onClick={() => window.open(msg.mediaUrl, '_blank')} />}
                    {msg.type === 'video' && <video src={msg.mediaUrl} controls className="rounded mb-2 max-w-full" />}
                    {msg.type === 'audio' && <audio src={msg.mediaUrl} controls className="mb-2 h-8" />}
                    {msg.text && <p className="whitespace-pre-wrap text-slate-800 leading-relaxed">{msg.text}</p>}
                    <div className="flex justify-end mt-1 opacity-40 text-[9px] font-bold">
                      {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 bg-white border-t border-slate-200 pb-safe">
                <div className="flex gap-2 items-end max-w-4xl mx-auto">
                  <button onClick={() => setIsMediaModalOpen(true)} className="w-12 h-12 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center hover:bg-slate-200 transition-colors flex-shrink-0">📎</button>
                  <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Responder..." rows={1} className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none max-h-32" />
                  <button onClick={() => handleSendReply()} disabled={(!replyText.trim() && !isMediaModalOpen) || isSendingReply} className="w-12 h-12 bg-emerald-500 text-white rounded-full flex items-center justify-center hover:bg-emerald-600 shadow-md active:scale-95 disabled:opacity-50 transition-all flex-shrink-0">
                    {isSendingReply ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <span className="text-xl">✈️</span>}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-12 text-center">
              <div className="w-24 h-24 bg-white/50 rounded-full flex items-center justify-center text-4xl mb-4 grayscale opacity-30 shadow-sm animate-bounce">📩</div>
              <h3 className="font-bold text-slate-500 uppercase tracking-widest text-[10px]">Aguardando Novas Mensagens</h3>
              <p className="text-[10px] mt-2 max-w-[220px]">Sincronizando com a API do WhatsApp a cada 4 segundos.</p>
              <div className="mt-4 text-[9px] text-slate-400 uppercase font-bold tracking-tighter">Última checagem: {lastCheck}</div>
            </div>
          )}
        </div>
      </div>

      {isMediaModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl border border-slate-100">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">📎 Enviar Mídia</h3>
            <div className="space-y-4">
              <select value={mediaTypeSelect} onChange={(e: any) => setMediaTypeSelect(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none">
                <option value="image">Imagem</option>
                <option value="video">Vídeo</option>
                <option value="audio">Áudio</option>
                <option value="document">Documento</option>
              </select>
              <input type="text" value={mediaUrlInput} onChange={(e) => setMediaUrlInput(e.target.value)} placeholder="https://link-da-imagem.jpg" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none" />
              <div className="flex gap-2 pt-2">
                <button onClick={() => setIsMediaModalOpen(false)} className="flex-1 py-3 text-slate-500 font-bold text-sm">Cancelar</button>
                <button onClick={() => handleSendReply({ mediaType: mediaTypeSelect, mediaUrl: mediaUrlInput })} disabled={!mediaUrlInput || isSendingReply} className="flex-1 py-3 bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-100 text-sm">Enviar Agora</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inbox;
