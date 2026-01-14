
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

  // Scroll automático para a última mensagem
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
    const contacts: Contact[] = JSON.parse(localStorage.getItem('wb_contacts') || '[]');
    const index = contacts.findIndex(c => c.phone === phone);
    
    const hasRealName = profileName && profileName.trim() !== "";
    const nameFromProfile = hasRealName ? profileName!.trim() : null;
    const finalName = nameFromProfile ? `Cliente ${nameFromProfile}` : `Cliente ${phone.slice(-4)}`;

    if (index === -1) {
      const newContact: Contact = {
        id: crypto.randomUUID(),
        name: finalName,
        phone: phone,
        group: 'Capturado via Chat'
      };
      const updated = [newContact, ...contacts];
      localStorage.setItem('wb_contacts', JSON.stringify(updated));
      setSavedContacts(updated);
      setDebugLog(`Novo lead: ${finalName}`);
      window.dispatchEvent(new Event('storage'));
    }
  };

  const handleAutomation = async (newMsg: IncomingMessage) => {
    const processedIds = JSON.parse(localStorage.getItem('wb_processed_ids') || '[]');
    if (processedIds.includes(newMsg.id)) return;

    if (!newMsg.isMe) {
      autoSaveContact(newMsg.from, newMsg.fromName);
    }

    const autoSettingsRaw = localStorage.getItem('wb_automation_settings');
    if (!autoSettingsRaw) return;
    const settings: AutomationSettings = JSON.parse(autoSettingsRaw);
    if (!settings.enabled) return;

    const config = JSON.parse(localStorage.getItem('wb_sender_config') || '{}');
    if (!config.accessToken || !config.phoneId) return;

    let responseToSend = "";
    if (settings.keywords.enabled && newMsg.type === 'text') {
      const cleanText = newMsg.text.toLowerCase().trim();
      const rule = settings.keywords.rules.find(r => 
        r.trigger && cleanText.includes(r.trigger.toLowerCase().trim())
      );
      if (rule) responseToSend = rule.response;
    }

    if (responseToSend) {
      processedIds.push(newMsg.id);
      localStorage.setItem('wb_processed_ids', JSON.stringify(processedIds.slice(-200)));

      const result = await sendWhatsAppMessage(newMsg.from, responseToSend, {
        accessToken: config.accessToken,
        phoneId: config.phoneId
      });

      if (result.success) {
        const myMessage: IncomingMessage = {
          id: `auto-${Date.now()}-${Math.random()}`,
          from: newMsg.from,
          text: responseToSend,
          timestamp: new Date().toISOString(),
          unread: false,
          isMe: true,
          type: 'text'
        };
        setMessages(prev => {
          const updated = [...prev, myMessage].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          localStorage.setItem('wb_incoming', JSON.stringify(updated));
          return updated;
        });
      }
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
          let rawText = m.text || m.texto || m.body || '';
          let detectedType: MessageType = m.type || 'text';
          let mediaUrl = m.mediaUrl || m.image_url || m.audio_url || m.url;
          let finalText = rawText;

          const isBase64Image = typeof rawText === 'string' && rawText.startsWith('data:image/');
          const isBase64Audio = typeof rawText === 'string' && (rawText.startsWith('data:audio/') || rawText.startsWith('data:application/ogg') || rawText.startsWith('data:video/ogg'));

          if (isBase64Image) {
            detectedType = 'image';
            mediaUrl = rawText;
            finalText = '📷 Imagem';
          } else if (isBase64Audio) {
            detectedType = 'audio';
            mediaUrl = rawText;
            finalText = '🎤 Áudio';
          }

          return {
            id: stableId,
            from: String(m.from || m.de || m.telefone || '').replace(/\D/g, ''),
            fromName: m.push_name || m.pushName || m.nome || m.name || undefined,
            text: finalText,
            type: detectedType,
            mediaUrl: mediaUrl,
            timestamp: m.timestamp || new Date().toISOString(),
            unread: m.unread !== undefined ? m.unread : true,
            isMe: m.isMe || false
          };
        });

        // MERGE LOGIC: Junta o que já existe com o que veio do servidor sem duplicar
        const localSaved = JSON.parse(localStorage.getItem('wb_incoming') || '[]');
        
        // Se for DeepSync, ainda mantemos o local, mas damos prioridade aos dados do servidor
        const messageMap = new Map();
        
        // Adiciona locais primeiro
        localSaved.forEach((m: IncomingMessage) => messageMap.set(m.id, m));
        // Sobrescreve/Adiciona novos do servidor
        formattedMessages.forEach((m: IncomingMessage) => messageMap.set(m.id, m));

        const merged = Array.from(messageMap.values()) as IncomingMessage[];
        
        // ORDENAÇÃO CRONOLÓGICA GLOBAL
        merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        setMessages(merged);
        localStorage.setItem('wb_incoming', JSON.stringify(merged));
        
        if (isManual) {
          setDebugLog(isDeepSync ? `Histórico Mesclado (${merged.length} total)` : 'Sincronizado.');
        }

        // Rodar automação apenas para mensagens novas que não são minhas
        if (!isDeepSync) {
          const existingIds = new Set(localSaved.map((m: any) => m.id));
          formattedMessages.filter(m => !existingIds.has(m.id) && !m.isMe).forEach(msg => handleAutomation(msg));
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
    if (saved) {
      const parsed = JSON.parse(saved);
      parsed.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      setMessages(parsed);
    }
    
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  const handleSendReply = async () => {
    if (!selectedChat || !replyText.trim() || isSendingReply) return;

    const config = JSON.parse(localStorage.getItem('wb_sender_config') || '{}');
    if (!config.accessToken || !config.phoneId) {
      alert("Configure seu Token e Phone ID nos Ajustes.");
      return;
    }

    setIsSendingReply(true);
    const result = await sendWhatsAppMessage(selectedChat, replyText, {
      accessToken: config.accessToken,
      phoneId: config.phoneId
    });

    if (result.success) {
      const myMessage: IncomingMessage = {
        id: `sent-${Date.now()}`,
        from: selectedChat, // Associamos ao chat do cliente para agrupar corretamente
        text: replyText,
        timestamp: new Date().toISOString(),
        unread: false,
        isMe: true,
        type: 'text'
      };

      setMessages(prev => {
        const updated = [...prev, myMessage].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
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

    const config = JSON.parse(localStorage.getItem('wb_sender_config') || '{}');
    const fileType: MessageType = file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : 'text';
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setIsSendingReply(true);
      
      const myMessage: IncomingMessage = {
        id: `media-${Date.now()}`,
        from: selectedChat,
        text: fileType === 'image' ? '📷 Imagem' : '🎤 Áudio',
        timestamp: new Date().toISOString(),
        unread: false,
        isMe: true,
        type: fileType,
        mediaUrl: base64
      };

      setMessages(prev => {
        const updated = [...prev, myMessage].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        localStorage.setItem('wb_incoming', JSON.stringify(updated));
        return updated;
      });
      setIsSendingReply(false);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // AGRUPAMENTO INTELIGENTE: Garante que as minhas mensagens para o cliente X fiquem no grupo do cliente X
  const chatGroups = messages.reduce((acc: any, msg) => {
    const chatId = msg.from; // Sempre agrupamos pelo número do cliente
    if (!acc[chatId]) acc[chatId] = [];
    acc[chatId].push(msg);
    return acc;
  }, {});

  const sortedChatPartners = Object.keys(chatGroups).sort((a, b) => {
    const lastA = chatGroups[a][chatGroups[a].length - 1].timestamp;
    const lastB = chatGroups[b][chatGroups[b].length - 1].timestamp;
    return new Date(lastB).getTime() - new Date(lastA).getTime();
  });

  const getContactName = (phone: string) => {
    const contact = savedContacts.find(c => c.phone === phone);
    return contact ? contact.name : `+${phone}`;
  };

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
          <span className="text-[10px] text-white font-bold uppercase tracking-widest">
            {serverHealth === 'up' ? 'Online' : 'Erro de Ponte'}
          </span>
          <span className="text-[10px] text-slate-400 font-mono hidden lg:inline">| {debugLog}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => fetchMessages(true, true)} className="text-[9px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 px-3 py-1 rounded hover:bg-amber-500 hover:text-white uppercase transition-all">Sincronizar Histórico</button>
          <button onClick={() => fetchMessages(true)} className="text-[9px] font-bold bg-white/10 text-white px-3 py-1 rounded hover:bg-white/20 uppercase">Sync Agora</button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-slate-100 flex-col bg-white overflow-y-auto`}>
          {sortedChatPartners.length === 0 ? (
            <div className="p-10 text-center opacity-20 mt-10">
              <p className="text-4xl mb-2">📩</p>
              <p className="text-[10px] font-bold">Nenhum Chat</p>
            </div>
          ) : (
            sortedChatPartners.map(phone => {
              const lastMsg = chatGroups[phone][chatGroups[phone].length - 1];
              return (
                <button key={phone} onClick={() => setSelectedChat(phone)} className={`w-full p-4 flex gap-3 text-left hover:bg-slate-50 border-b border-slate-50 transition-colors ${selectedChat === phone ? 'bg-emerald-50/50 border-r-4 border-r-emerald-500' : ''}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs bg-slate-100 text-slate-500`}>
                    {getContactName(phone).charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline">
                      <p className="font-bold text-slate-800 text-sm truncate">{getContactName(phone)}</p>
                    </div>
                    <p className="text-xs text-slate-500 truncate">
                      {lastMsg.isMe ? 'Você: ' : ''}
                      {lastMsg.text}
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
                    msg.isMe 
                      ? 'bg-[#dcf8c6] border-[#c1e8a0] self-end rounded-tr-none text-slate-800' 
                      : 'bg-white border-slate-200 self-start rounded-tl-none text-slate-700'
                  } p-2`}>
                    {msg.type === 'image' && msg.mediaUrl && (
                      <img src={msg.mediaUrl} className="rounded-xl max-w-full h-auto mb-2 cursor-pointer" onClick={() => setPreviewImage(msg.mediaUrl)} />
                    )}
                    {msg.type === 'audio' && msg.mediaUrl && (
                      <audio controls className="w-full h-10 mb-2 custom-player">
                        <source src={msg.mediaUrl} type="audio/mpeg" />
                      </audio>
                    )}
                    <p className="whitespace-pre-wrap text-sm px-1">{msg.text}</p>
                    <div className="flex justify-end items-center gap-1 mt-1 opacity-60">
                      <p className="text-[9px] font-medium">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                      {msg.isMe && <span className="text-[10px]">✓✓</span>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 bg-white border-t border-slate-200">
                <div className="flex gap-2 items-end max-w-4xl mx-auto">
                  <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,audio/*" />
                  <button onClick={() => fileInputRef.current?.click()} className="w-12 h-12 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center hover:bg-slate-200 transition-all shadow-sm">📎</button>
                  <textarea 
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendReply();
                      }
                    }}
                    placeholder="Sua mensagem..."
                    rows={1}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none max-h-32"
                  />
                  <button onClick={handleSendReply} disabled={!replyText.trim() || isSendingReply} className="w-12 h-12 bg-emerald-500 text-white rounded-full flex items-center justify-center hover:bg-emerald-600 disabled:opacity-50 transition-all shadow-md active:scale-95">
                    {isSendingReply ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <span>✈️</span>}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-12 text-center">
              <div className="w-20 h-20 bg-white/50 rounded-full flex items-center justify-center text-3xl mb-4 opacity-30 shadow-sm">📱</div>
              <h3 className="font-bold text-slate-500 uppercase tracking-widest text-xs">Atendimento WhatsApp</h3>
              <p className="text-[10px] mt-2">Escolha uma conversa lateral para começar.</p>
            </div>
          )}
        </div>
      </div>
      <style>{`
        .custom-player::-webkit-media-controls-panel { background-color: #f8fafc; }
      `}</style>
    </div>
  );
};

export default Inbox;
