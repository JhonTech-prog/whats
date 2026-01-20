
import React, { useState, useEffect, useRef } from 'react';
import { IncomingMessage, AutomationSettings, Contact, MessageType } from '../types.ts';
import { sendWhatsAppMessage, sendWhatsAppMedia } from '../services/whatsappService.ts';
import { safeGenerateId } from '../App.tsx';

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

  const normalizeTimestamp = (ts: any): number => {
    if (!ts) return Date.now();
    if (typeof ts === 'number') {
      return ts < 10000000000 ? ts * 1000 : ts;
    }
    const parsed = new Date(ts).getTime();
    return isNaN(parsed) ? Date.now() : parsed;
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selectedChat, messages]);

  const loadContacts = () => {
    try {
      const saved = localStorage.getItem('wb_contacts');
      if (saved) setSavedContacts(JSON.parse(saved));
    } catch(e) {}
  };

  useEffect(() => {
    loadContacts();
    window.addEventListener('storage', loadContacts);
    return () => window.removeEventListener('storage', loadContacts);
  }, []);

  const autoSaveContact = (phone: string, profileName?: string) => {
    try {
      const contactsRaw = localStorage.getItem('wb_contacts');
      const contacts: Contact[] = contactsRaw ? JSON.parse(contactsRaw) : [];
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
          id: safeGenerateId(),
          name: finalName,
          phone: phone,
          group: targetGroup
        };
        const updated = [newContact, ...contacts];
        localStorage.setItem('wb_contacts', JSON.stringify(updated));
        setSavedContacts(updated);
        window.dispatchEvent(new Event('storage'));
      }
    } catch(e) {}
  };

  const fetchMessages = async (isManual = false) => {
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
          // Compatibilidade máxima com diferentes formatos de backend
          const timestampMs = normalizeTimestamp(m.timestamp || m.dataRecebimento);
          const stableId = m.id || m._id || m.idExterno || `msg-${m.telefone || m.from}-${timestampMs}`;

          let rawText = m.text || m.texto || m.body || '';
          let detectedType: MessageType = m.type || m.tipo || 'text';
          let mediaUrl = m.mediaUrl || m.image_url || m.audio_url || m.url;
          let finalText = rawText;

          // Se for imagem ou áudio em base64, tratar corretamente
          if (typeof rawText === 'string' && rawText.startsWith('data:image/')) {
            detectedType = 'image'; mediaUrl = rawText; finalText = '📷 Imagem';
          } else if (typeof rawText === 'string' && rawText.startsWith('data:audio/')) {
            detectedType = 'audio'; mediaUrl = rawText; finalText = '🎤 Áudio';
          }

          return {
            id: stableId,
            from: String(m.from || m.telefone || m.de || '').replace(/\D/g, ''),
            fromName: m.fromName || m.push_name || m.pushName || m.nome || m.name || undefined,
            text: finalText,
            type: detectedType,
            mediaUrl: mediaUrl,
            timestamp: new Date(timestampMs).toISOString(),
            unread: m.unread !== undefined ? m.unread : true,
            isMe: m.isMe || false
          };
        });

        const localSavedRaw = localStorage.getItem('wb_incoming');
        const localSaved = localSavedRaw ? JSON.parse(localSavedRaw) : [];
        const messageMap = new Map();
        if (Array.isArray(localSaved)) localSaved.forEach((m: IncomingMessage) => messageMap.set(m.id, m));
        formattedMessages.forEach((m: IncomingMessage) => messageMap.set(m.id, m));
        const merged = Array.from(messageMap.values()) as IncomingMessage[];
        merged.sort((a, b) => normalizeTimestamp(a.timestamp) - normalizeTimestamp(b.timestamp));

        setMessages(merged);
        localStorage.setItem('wb_incoming', JSON.stringify(merged));
        
        if (isManual) setDebugLog(`Sincronizado.`);
        formattedMessages.filter(m => !m.isMe).forEach(msg => autoSaveContact(msg.from, msg.fromName));
      }
    } catch (e) {
      setServerHealth('down');
      setDebugLog('Erro na ponte.');
    }
  };

  useEffect(() => {
    try {
      const configRaw = localStorage.getItem('wb_sender_config');
      const config = configRaw ? JSON.parse(configRaw) : {};
      if (config.bridgeUrl) {
        fetchMessages();
        pollingRef.current = window.setInterval(() => fetchMessages(), 10000);
      }
      const saved = localStorage.getItem('wb_incoming');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          parsed.sort((a: any, b: any) => normalizeTimestamp(a.timestamp) - normalizeTimestamp(b.timestamp));
          setMessages(parsed);
        }
      }
    } catch(e) {}
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  const handleSendReply = async () => {
    if (!selectedChat || !replyText.trim() || isSendingReply) return;
    const configRaw = localStorage.getItem('wb_sender_config');
    const config = configRaw ? JSON.parse(configRaw) : {};
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

  return (
    <div className="bg-white rounded-none md:rounded-2xl border-0 md:border border-slate-200 shadow-sm overflow-hidden h-screen md:h-[calc(100vh-200px)] flex flex-col">
      <div className="px-4 py-3 bg-slate-900 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${serverHealth === 'up' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
          <span className="text-[10px] text-white font-bold uppercase">{serverHealth === 'up' ? 'Conectado' : 'Desconectado'}</span>
        </div>
        <button onClick={() => fetchMessages(true)} className="text-[9px] font-bold bg-white/10 text-white px-3 py-1 rounded">Sync Agora</button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-slate-100 flex-col bg-white overflow-y-auto`}>
          {sortedPartners.map(phone => {
            const partnerMsgs = chatGroups[phone];
            const lastMsg = partnerMsgs[partnerMsgs.length - 1];
            return (
              <button key={phone} onClick={() => setSelectedChat(phone)} className={`w-full p-4 flex gap-3 text-left hover:bg-slate-50 border-b border-slate-50 ${selectedChat === phone ? 'bg-emerald-50' : ''}`}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs bg-slate-100 text-slate-500">{getContactName(phone).charAt(0)}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 text-sm truncate">{getContactName(phone)}</p>
                  <p className="text-xs text-slate-500 truncate">{lastMsg.text}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className={`${!selectedChat ? 'hidden md:flex' : 'flex'} flex-1 flex-col bg-[#efeae2] relative`}>
          {selectedChat ? (
            <>
              <div className="p-4 bg-white border-b border-slate-200 flex items-center gap-3">
                <button onClick={() => setSelectedChat(null)} className="md:hidden text-slate-400">←</button>
                <p className="font-bold text-slate-800 text-sm">{getContactName(selectedChat)}</p>
              </div>
              <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-4 flex flex-col">
                {chatGroups[selectedChat].map((msg: any) => (
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
                <button onClick={handleSendReply} disabled={!replyText.trim() || isSendingReply} className="w-10 h-10 bg-emerald-500 text-white rounded-full flex items-center justify-center">
                  {isSendingReply ? '...' : '✈️'}
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
