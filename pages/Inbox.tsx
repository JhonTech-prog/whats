
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
  const [apiLog, setApiLog] = useState<{ status: string; lastUpdate: string; type: 'success' | 'error' | 'idle' }>({
    status: 'Iniciando...',
    lastUpdate: '--:--',
    type: 'idle'
  });
  
  const [savedContacts, setSavedContacts] = useState<Contact[]>([]);
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [mediaUrlInput, setMediaUrlInput] = useState('');
  const [mediaTypeSelect, setMediaTypeSelect] = useState<'image' | 'video' | 'audio' | 'document'>('image');
  const [isSoundEnabled, setIsSoundEnabled] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selectedChat, messages]);

  useEffect(() => {
    isMounted.current = true;
    audioRef.current = new Audio(NOTIFICATION_SOUND_URL);
    
    const loadInitial = () => {
      const savedC = localStorage.getItem('wb_contacts');
      if (savedC) setSavedContacts(JSON.parse(savedC));
      const savedM = localStorage.getItem('wb_incoming');
      if (savedM) setMessages(JSON.parse(savedM));
    };

    loadInitial();
    
    const poll = async () => {
      if (!isMounted.current) return;
      await fetchMessages();
      setTimeout(poll, 4000); 
    };
    poll();

    return () => { isMounted.current = false; };
  }, []);

  const fetchMessages = async (forceManual = false) => {
    const config = JSON.parse(localStorage.getItem('wb_sender_config') || '{}');
    if (!config.bridgeUrl) {
      setApiLog({ status: 'URL da Ponte ausente', lastUpdate: new Date().toLocaleTimeString(), type: 'error' });
      return;
    }

    if (isFetching && !forceManual) return;
    setIsFetching(true);

    let baseUrl = config.bridgeUrl.trim();
    if (!baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    
    const finalUrl = baseUrl.endsWith('/messages') 
      ? `${baseUrl}?t=${Date.now()}` 
      : `${baseUrl}/messages?t=${Date.now()}`;

    try {
      const response = await fetch(finalUrl, { 
        method: 'GET',
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
      });
      
      if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);
      
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error("API não retornou uma lista []");

      setApiLog({ 
        status: `Conectado (${data.length} msg)`, 
        lastUpdate: new Date().toLocaleTimeString(), 
        type: 'success' 
      });

      const formatted: IncomingMessage[] = data.map((m: any) => {
        // EXTRAÇÃO ROBUSTA DE TEXTO (Suporta m.text.body da Meta e strings diretas)
        let extractedText = '';
        if (typeof m.text === 'object' && m.text?.body) {
          extractedText = m.text.body;
        } else {
          extractedText = m.text || m.body || m.caption || m.message || '';
        }

        const mime = m.mimetype || '';
        const timestamp = m.timestamp || new Date().toISOString();
        
        // ID DETERMINÍSTICO para evitar duplicados no polling
        // Se a API não manda ID, criamos um baseado no remetente + tempo + conteúdo
        const deterministicId = m.id || `id-${m.from}-${timestamp}-${extractedText.length}`;

        return {
          id: deterministicId,
          from: m.from || 'unknown',
          fromName: m.name || m.fromName || undefined,
          text: extractedText,
          timestamp: timestamp,
          unread: m.unread !== undefined ? m.unread : true,
          isMe: !!m.isMe,
          type: mime.startsWith('image/') ? 'image' : 
                mime.startsWith('video/') ? 'video' : 
                mime.startsWith('audio/') ? 'audio' : (m.type || 'text'),
          mediaUrl: m.mediaUrl || m.url || m.link,
          fileName: m.fileName || m.filename
        };
      });

      const currentLocal = JSON.parse(localStorage.getItem('wb_incoming') || '[]');
      const existingIds = new Set(currentLocal.map((m: any) => m.id));
      const newOnly = formatted.filter(m => !existingIds.has(m.id));

      if (newOnly.length > 0 || forceManual) {
        if (newOnly.some(m => !m.isMe) && isSoundEnabled && !forceManual) {
          audioRef.current?.play().catch(() => {});
        }

        const merged = forceManual ? formatted : [...currentLocal, ...newOnly];
        // Ordena por data
        merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        
        setMessages(merged);
        localStorage.setItem('wb_incoming', JSON.stringify(merged));
      }
    } catch (err: any) {
      setApiLog({ status: 'Falha: ' + err.message, lastUpdate: new Date().toLocaleTimeString(), type: 'error' });
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
        id: `sent-${Date.now()}-${Math.random()}`,
        from: selectedChat,
        text: media ? `[Mídia enviada]` : replyText,
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
      alert("Erro ao responder: " + res.error);
    }
    setIsSendingReply(false);
  };

  const clearChat = () => {
    if (!confirm("Deseja apagar o histórico local desta conversa?")) return;
    const updated = messages.filter(m => m.from !== selectedChat);
    setMessages(updated);
    localStorage.setItem('wb_incoming', JSON.stringify(updated));
    setSelectedChat(null);
  };

  const getDisplayName = (phone: string) => {
    const contact = savedContacts.find(c => c.phone === phone);
    if (contact) return { name: contact.name, isSaved: true };
    const profile = [...messages].reverse().find(m => m.from === phone && m.fromName);
    return { name: profile?.fromName || `+${phone}`, isSaved: false };
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
      {/* Status Bar */}
      <div className="px-4 py-2 bg-slate-900 flex justify-between items-center text-white shrink-0">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${apiLog.type === 'success' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
          <span className="text-[10px] font-mono text-emerald-400 truncate">{apiLog.status}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsSoundEnabled(!isSoundEnabled)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            {isSoundEnabled ? '🔔' : '🔕'}
          </button>
          <button onClick={() => fetchMessages(true)} className="bg-white/10 hover:bg-white/20 px-3 py-1 rounded text-[9px] font-bold uppercase">
            {isFetching ? '...' : 'Sincronizar'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-slate-100 flex-col bg-white overflow-y-auto`}>
          {sortedChats.length === 0 ? (
            <div className="p-12 text-center opacity-30 mt-10">
              <p className="text-4xl mb-4">📤</p>
              <p className="text-[10px] font-bold uppercase">Sem mensagens</p>
            </div>
          ) : (
            sortedChats.map(phone => {
              const display = getDisplayName(phone);
              const last = chatGroups[phone][chatGroups[phone].length - 1];
              const previewText = last.text || `[${last.type || 'Mídia'}]`;
              
              return (
                <button key={phone} onClick={() => setSelectedChat(phone)} className={`w-full p-4 flex gap-3 text-left border-b border-slate-50 transition-all ${selectedChat === phone ? 'bg-emerald-50/70 border-r-4 border-r-emerald-500' : 'hover:bg-slate-50'}`}>
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${display.isSaved ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                    {display.isSaved ? '👤' : '👥'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <p className="font-bold text-slate-800 text-sm truncate">{display.name}</p>
                      <span className="text-[8px] text-slate-400 font-bold">{new Date(last.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">{previewText}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Chat Area */}
        <div className={`${!selectedChat ? 'hidden md:flex' : 'flex'} flex-1 flex-col bg-[#efeae2] relative`}>
          {selectedChat ? (
            <>
              <div className="p-3 bg-white border-b border-slate-200 flex items-center justify-between z-10 shadow-sm shrink-0">
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedChat(null)} className="md:hidden text-slate-400 text-xl px-2">←</button>
                  <div className="w-9 h-9 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-sm">
                    {getDisplayName(selectedChat).isSaved ? '👤' : '👥'}
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-sm leading-tight">{getDisplayName(selectedChat).name}</p>
                    <p className="text-[9px] text-slate-400">+{selectedChat}</p>
                  </div>
                </div>
                <button onClick={clearChat} className="text-slate-300 hover:text-rose-500 p-2" title="Limpar Histórico Local">🗑️</button>
              </div>

              <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-3 flex flex-col">
                {chatGroups[selectedChat].map((msg: any) => (
                  <div key={msg.id} className={`max-w-[85%] p-3 rounded-xl shadow-sm border text-sm ${
                    msg.isMe ? 'bg-[#dcf8c6] border-[#c1e8a0] self-end rounded-tr-none' : 'bg-white border-slate-200 self-start rounded-tl-none'
                  }`}>
                    {msg.type === 'image' && <img src={msg.mediaUrl} className="rounded mb-2 max-w-full cursor-pointer" onClick={() => window.open(msg.mediaUrl, '_blank')} />}
                    {msg.type === 'video' && <video src={msg.mediaUrl} controls className="rounded mb-2 max-w-full" />}
                    {msg.type === 'audio' && <audio src={msg.mediaUrl} controls className="mb-2 h-8" />}
                    
                    {msg.text ? (
                      <p className="whitespace-pre-wrap text-slate-800 leading-relaxed text-[13px]">{msg.text}</p>
                    ) : (
                      !msg.mediaUrl && <p className="italic text-slate-400 text-[11px]">[Sem conteúdo textual]</p>
                    )}
                    
                    <div className="flex justify-end mt-1 opacity-40 text-[8px] font-black uppercase tracking-tighter">
                      {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      {msg.isMe && <span className="ml-1 text-blue-500">✓✓</span>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-white border-t border-slate-200 shrink-0">
                <div className="flex gap-2 items-end max-w-4xl mx-auto">
                  <button onClick={() => setIsMediaModalOpen(true)} className="w-10 h-10 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center hover:bg-slate-200 flex-shrink-0">📎</button>
                  <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Digite sua resposta..." rows={1} className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none max-h-32" />
                  <button onClick={() => handleSendReply()} disabled={(!replyText.trim() && !isMediaModalOpen) || isSendingReply} className="w-10 h-10 bg-emerald-500 text-white rounded-full flex items-center justify-center hover:bg-emerald-600 shadow-md disabled:opacity-50 flex-shrink-0">
                    {isSendingReply ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <span className="text-lg">✈️</span>}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-12 text-center">
              <div className="w-20 h-20 bg-white/50 rounded-full flex items-center justify-center text-3xl mb-4 grayscale opacity-30 shadow-sm animate-pulse">📥</div>
              <h3 className="font-bold text-slate-500 uppercase tracking-widest text-[10px]">Caixa de Entrada</h3>
              <p className="text-[10px] mt-2 max-w-[200px]">Aguardando mensagens do seu servidor no Render.</p>
            </div>
          )}
        </div>
      </div>

      {isMediaModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl border border-slate-100">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">📂 Enviar Arquivo</h3>
            <div className="space-y-4">
              <select value={mediaTypeSelect} onChange={(e: any) => setMediaTypeSelect(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none">
                <option value="image">Imagem</option>
                <option value="video">Vídeo</option>
                <option value="audio">Áudio</option>
                <option value="document">Documento</option>
              </select>
              <input type="text" value={mediaUrlInput} onChange={(e) => setMediaUrlInput(e.target.value)} placeholder="URL pública do arquivo" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none" />
              <div className="flex gap-2 pt-2">
                <button onClick={() => setIsMediaModalOpen(false)} className="flex-1 py-3 text-slate-500 font-bold text-sm">Sair</button>
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
