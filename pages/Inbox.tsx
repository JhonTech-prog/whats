
import React, { useState, useEffect, useRef } from 'react';
import { IncomingMessage, AutomationSettings, Contact, MessageType } from '../types';
import { sendWhatsAppMessage, sendWhatsAppMedia } from '../services/whatsappService';

const Inbox: React.FC = () => {
  const [messages, setMessages] = useState<IncomingMessage[]>([]);
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [debugLog, setDebugLog] = useState<string>('Sistema pronto.');
  const [serverHealth, setServerHealth] = useState<'up' | 'down' | 'unknown'>('unknown');
  const [savedContacts, setSavedContacts] = useState<Contact[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  const pollingRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const normalizeTimestamp = (ts: any): number => {
    if (!ts) return Date.now();
    if (typeof ts === 'number') {
      return ts < 10000000000 ? ts * 1000 : ts;
    }
    const parsed = new Date(ts).getTime();
    return isNaN(parsed) ? Date.now() : parsed;
  };

  useEffect(() => {
    if ("Notification" in window) {
      Notification.requestPermission();
    }
    const audio = new Audio('https://www.myinstants.com/media/sounds/olha-a-mensagem-original.mp3');
    audio.load();
    audioRef.current = audio;
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selectedChat, messages]);

  const loadContacts = () => {
    try {
      const saved = localStorage.getItem('wb_contacts');
      if (saved) setSavedContacts(JSON.parse(saved));
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    loadContacts();
    window.addEventListener('storage', loadContacts);
    return () => window.removeEventListener('storage', loadContacts);
  }, []);

  const triggerNotification = (msg: IncomingMessage) => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {
        console.warn("Áudio bloqueado pelo navegador. Interaja com a página.");
      });
    }

    if (Notification.permission === "granted" && !msg.isMe) {
      const name = getContactName(msg.from);
      new Notification(`Mensagem de ${name}`, {
        body: msg.text,
        icon: 'https://cdn-icons-png.flaticon.com/512/124/124034.png'
      });
    }
  };

  const autoSaveContact = (phone: string, profileName?: string) => {
    try {
      const contacts: Contact[] = JSON.parse(localStorage.getItem('wb_contacts') || '[]');
      const index = contacts.findIndex(c => c.phone === phone);
      
      if (index === -1) {
        const autoSettingsRaw = localStorage.getItem('wb_automation_settings');
        let targetGroup = 'Capturado via Chat';
        
        if (autoSettingsRaw) {
          const settings: AutomationSettings = JSON.parse(autoSettingsRaw);
          if (settings.enabled && settings.leadGrouping?.enabled && settings.leadGrouping?.groupName) {
            targetGroup = settings.leadGrouping.groupName;
          }
        }

        const nameFromProfile = profileName && profileName.trim() !== "" ? profileName.trim() : null;
        const finalName = nameFromProfile ? `Cliente ${nameFromProfile}` : `Cliente ${phone.slice(-4)}`;
        const newContact: Contact = {
          id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2),
          name: finalName,
          phone: phone,
          group: targetGroup
        };
        const updated = [newContact, ...contacts];
        localStorage.setItem('wb_contacts', JSON.stringify(updated));
        setSavedContacts(updated);
        window.dispatchEvent(new Event('storage'));
      }
    } catch (e) { console.error(e); }
  };

  const fetchMessages = async (isManual = false) => {
    try {
      const config = JSON.parse(localStorage.getItem('wb_sender_config') || '{}');
      if (!config.bridgeUrl) return;

      const dataUrl = config.bridgeUrl.endsWith('/messages') ? config.bridgeUrl : (config.bridgeUrl.endsWith('/') ? config.bridgeUrl + 'messages' : config.bridgeUrl + '/messages');

      const response = await fetch(dataUrl);
      if (!response.ok) throw new Error();
      const rawData = await response.json();
      setServerHealth('up');

      if (Array.isArray(rawData)) {
        const localSavedRaw = localStorage.getItem('wb_incoming');
        const localSaved: IncomingMessage[] = localSavedRaw ? JSON.parse(localSavedRaw) : [];
        const existingIds = new Set(localSaved.map(m => m.id));

        const formattedMessages: IncomingMessage[] = rawData.map((m: any) => {
          const timestampMs = normalizeTimestamp(m.timestamp);
          const stableId = m.id || `msg-${m.from}-${timestampMs}`;
          
          let rawText = m.text || m.texto || m.body || '';
          let detectedType: MessageType = m.type || 'text';
          let mediaUrl = m.mediaUrl || m.image_url || m.audio_url || m.url;
          let finalText = rawText;

          if (typeof rawText === 'string' && rawText.startsWith('data:image/')) {
            detectedType = 'image'; mediaUrl = rawText; finalText = '📷 Imagem';
          } else if (typeof rawText === 'string' && rawText.startsWith('data:audio/')) {
            detectedType = 'audio'; mediaUrl = rawText; finalText = '🎤 Áudio';
          }

          return {
            id: stableId,
            from: String(m.from || m.de || m.telefone || '').replace(/\D/g, ''),
            fromName: m.push_name || m.pushName || m.nome || m.name || undefined,
            text: finalText,
            type: detectedType,
            mediaUrl: mediaUrl,
            timestamp: new Date(timestampMs).toISOString(),
            unread: m.unread !== undefined ? m.unread : true,
            isMe: m.isMe || false
          };
        });

        let hasNewMessages = false;
        formattedMessages.forEach(msg => {
          if (!existingIds.has(msg.id) && !msg.isMe) {
            hasNewMessages = true;
            triggerNotification(msg);
          }
        });

        const messageMap = new Map();
        localSaved.forEach((m: IncomingMessage) => messageMap.set(m.id, m));
        formattedMessages.forEach((m: IncomingMessage) => messageMap.set(m.id, m));
        const merged = Array.from(messageMap.values()) as IncomingMessage[];
        merged.sort((a, b) => normalizeTimestamp(a.timestamp) - normalizeTimestamp(b.timestamp));

        setMessages(merged);
        localStorage.setItem('wb_incoming', JSON.stringify(merged));
        
        if (isManual) setDebugLog(`Sincronizado.`);
        if (hasNewMessages) window.dispatchEvent(new Event('storage'));
        
        formattedMessages.filter(m => !m.isMe).forEach(msg => autoSaveContact(msg.from, msg.fromName));
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
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        parsed.sort((a: any, b: any) => normalizeTimestamp(a.timestamp) - normalizeTimestamp(b.timestamp));
        setMessages(parsed);
      } catch(e) {}
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  const handleSendReply = async () => {
    if (!selectedChat || !replyText.trim() || isSendingReply) return;
    const config = JSON.parse(localStorage.getItem('wb_sender_config') || '{}');
    if (!config.accessToken || !config.phoneId) return alert("Configure suas credenciais.");

    setIsSendingReply(true);
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
      setMessages(prev => {
        const updated = [...prev, myMessage].sort((a,b) => normalizeTimestamp(a.timestamp) - normalizeTimestamp(b.timestamp));
        localStorage.setItem('wb_incoming', JSON.stringify(updated));
        return updated;
      });
      setReplyText('');
    } else {
      alert("Erro ao enviar: " + result.error);
    }
    setIsSendingReply(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChat) return;
    const fileType: MessageType = file.type.startsWith('image/') ? 'image' : 'audio';
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      const myMessage: IncomingMessage = {
        id: `media-local-${Date.now()}`,
        from: selectedChat,
        text: fileType === 'image' ? '📷 Imagem' : '🎤 Áudio',
        timestamp: new Date().toISOString(),
        unread: false,
        isMe: true,
        type: fileType,
        mediaUrl: base64
      };
      setMessages(prev => {
        const updated = [...prev, myMessage].sort((a,b) => normalizeTimestamp(a.timestamp) - normalizeTimestamp(b.timestamp));
        localStorage.setItem('wb_incoming', JSON.stringify(updated));
        return updated;
      });
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const chatGroups = messages.reduce((acc: any, msg) => {
    const chatId = msg.from; 
    if (!acc[chatId]) acc[chatId] = [];
    acc[chatId].push(msg);
    return acc;
  }, {});

  const sortedPartners = Object.keys(chatGroups).sort((a, b) => {
    const lastA = normalizeTimestamp(chatGroups[a][chatGroups[a].length - 1].timestamp);
    const lastB = normalizeTimestamp(chatGroups[b][chatGroups[b].length - 1].timestamp);
    return lastB - lastA;
  });

  const getContactName = (phone: string) => {
    const contact = savedContacts.find(c => c.phone === phone);
    return contact ? contact.name : `+${phone}`;
  };

  useEffect(() => {
    if (selectedChat) {
      const updated = messages.map(m => m.from === selectedChat ? { ...m, unread: false } : m);
      setMessages(updated);
      localStorage.setItem('wb_incoming', JSON.stringify(updated));
      window.dispatchEvent(new Event('storage'));
    }
  }, [selectedChat]);

  return (
    <div className="bg-white rounded-none md:rounded-2xl border-0 md:border border-slate-200 shadow-sm overflow-hidden h-screen md:h-[calc(100vh-200px)] flex flex-col">
      {previewImage && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}>
          <img src={previewImage} alt="Preview" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}

      <div className="px-4 py-3 bg-slate-900 flex justify-between items-center border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${serverHealth === 'up' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
          <span className="text-[10px] text-white font-bold uppercase tracking-widest">{serverHealth === 'up' ? 'Conectado' : 'Desconectado'}</span>
          <span className="text-[10px] text-slate-400 font-mono hidden lg:inline">| {debugLog}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => fetchMessages(true)} className="text-[9px] font-bold bg-white/10 text-white px-3 py-1 rounded hover:bg-white/20 uppercase">Sync Agora</button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-slate-100 flex-col bg-white overflow-y-auto`}>
          {sortedPartners.length === 0 ? (
            <div className="p-10 text-center opacity-20 mt-10">
              <p className="text-4xl mb-2">📩</p>
              <p className="text-[10px] font-bold uppercase">Sem conversas</p>
            </div>
          ) : (
            sortedPartners.map(phone => {
              const partnerMsgs = chatGroups[phone];
              const lastMsg = partnerMsgs[partnerMsgs.length - 1];
              const unreadCount = partnerMsgs.filter((m: any) => m.unread).length;

              return (
                <button key={phone} onClick={() => setSelectedChat(phone)} className={`w-full p-4 flex gap-3 text-left hover:bg-slate-50 border-b border-slate-50 transition-colors ${selectedChat === phone ? 'bg-emerald-50/50 border-r-4 border-r-emerald-500' : ''}`}>
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs bg-slate-100 text-slate-500">{getContactName(phone).charAt(0)}</div>
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[8px] rounded-full flex items-center justify-center font-bold ring-2 ring-white">
                        {unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${unreadCount > 0 ? 'font-black text-slate-900' : 'font-bold text-slate-700'}`}>{getContactName(phone)}</p>
                    <p className={`text-xs truncate ${unreadCount > 0 ? 'text-slate-800 font-medium' : 'text-slate-500'}`}>
                      {lastMsg.isMe ? 'Você: ' : ''}{lastMsg.text}
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
                  <button onClick={() => setSelectedChat(null)} className="md:hidden text-slate-400 p-1">←</button>
                  <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-[10px]">{getContactName(selectedChat).charAt(0)}</div>
                  <div>
                    <p className="font-bold text-slate-800 text-sm">{getContactName(selectedChat)}</p>
                    <p className="text-[8px] text-emerald-500 font-bold uppercase">+{selectedChat}</p>
                  </div>
                </div>
              </div>

              <div ref={scrollRef} className="flex-1 p-4 md:p-6 overflow-y-auto space-y-4 flex flex-col">
                {chatGroups[selectedChat].map((msg: any) => (
                  <div key={msg.id} className={`max-w-[85%] rounded-2xl shadow-sm border ${
                    msg.isMe ? 'bg-[#dcf8c6] border-[#c1e8a0] self-end rounded-tr-none' : 'bg-white border-slate-200 self-start rounded-tl-none'
                  } p-2 flex flex-col`}>
                    {msg.type === 'image' && msg.mediaUrl && <img src={msg.mediaUrl} className="rounded-xl max-w-full mb-1 cursor-pointer" onClick={() => setPreviewImage(msg.mediaUrl)} />}
                    {msg.type === 'audio' && msg.mediaUrl && <audio controls className="w-full h-8 mb-1 scale-90 origin-left"><source src={msg.mediaUrl} /></audio>}
                    <p className="text-sm px-1 leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                    <div className="flex justify-end items-center gap-1 mt-0.5 opacity-40">
                      <p className="text-[8px] font-bold">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                      {msg.isMe && <span className="text-[9px]">✓✓</span>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 bg-white border-t border-slate-200">
                <div className="flex gap-2 items-end max-w-4xl mx-auto">
                  <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,audio/*" />
                  <button onClick={() => fileInputRef.current?.click()} className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center hover:bg-slate-200">📎</button>
                  <textarea 
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }}
                    placeholder="Sua mensagem..."
                    rows={1}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none max-h-32"
                  />
                  <button onClick={handleSendReply} disabled={!replyText.trim() || isSendingReply} className="w-12 h-12 bg-emerald-500 text-white rounded-full flex items-center justify-center hover:bg-emerald-600 transition-all active:scale-95">
                    {isSendingReply ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <span>✈️</span>}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-12 text-center">
              <div className="w-20 h-20 bg-white/50 rounded-full flex items-center justify-center text-3xl mb-4 opacity-30">📱</div>
              <h3 className="font-bold text-slate-500 uppercase tracking-widest text-xs">Selecione um Chat</h3>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Inbox;
