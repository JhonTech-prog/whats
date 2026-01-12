
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
    const contacts: Contact[] = JSON.parse(localStorage.getItem('wb_contacts') || '[]');
    const index = contacts.findIndex(c => c.phone === phone);
    
    const hasRealName = profileName && profileName.trim() !== "";
    const nameFromProfile = hasRealName ? profileName!.trim() : null;
    const finalName = nameFromProfile ? `Cliente ${nameFromProfile}` : `Cliente ${phone.slice(-4)}`;

    if (index === -1) {
      // Novo contato: Criar do zero
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
    } else {
      // Contato já existe: Verificar se precisamos atualizar o nome
      const existing = contacts[index];
      // Se o nome atual for genérico (apenas os 4 digitos) e agora temos um nome real, atualizamos
      const isGeneric = existing.name.includes(phone.slice(-4)) || existing.name.startsWith('Novo Contato');
      
      if (isGeneric && nameFromProfile) {
        contacts[index].name = finalName;
        localStorage.setItem('wb_contacts', JSON.stringify(contacts));
        setSavedContacts([...contacts]);
        setDebugLog(`Nome atualizado: ${finalName}`);
        window.dispatchEvent(new Event('storage'));
      }
    }
  };

  const handleAutomation = async (newMsg: IncomingMessage) => {
    const processedIds = JSON.parse(localStorage.getItem('wb_processed_ids') || '[]');
    if (processedIds.includes(newMsg.id)) return;

    // CAPTURA AUTOMÁTICA: Salva ou atualiza o contato assim que a mensagem chega
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

    if (settings.keywords.enabled) {
      const cleanText = newMsg.text.toLowerCase().trim();
      const rule = settings.keywords.rules.find(r => 
        r.trigger && cleanText.includes(r.trigger.toLowerCase().trim())
      );
      if (rule) responseToSend = rule.response;
    }

    if (!responseToSend && settings.officeHours.enabled) {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const isOut = currentTime < settings.officeHours.start || currentTime > settings.officeHours.end;
      if (isOut) responseToSend = settings.officeHours.awayMessage;
    }

    if (!responseToSend && settings.welcomeMessage.enabled) {
      const localMsgs = JSON.parse(localStorage.getItem('wb_incoming') || '[]');
      const count = localMsgs.filter((m: any) => m.from === newMsg.from).length;
      if (count <= 1) responseToSend = settings.welcomeMessage.text;
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
          isMe: true
        };
        setMessages(prev => {
          const updated = [...prev, myMessage];
          localStorage.setItem('wb_incoming', JSON.stringify(updated));
          return updated;
        });
      }
    } else {
      processedIds.push(newMsg.id);
      localStorage.setItem('wb_processed_ids', JSON.stringify(processedIds.slice(-200)));
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
          return {
            id: stableId,
            from: String(m.from || m.de || m.telefone || '').replace(/\D/g, ''),
            // Mapeamento extra-robusto para pegar o nome de perfil da Meta/Bridge
            fromName: m.push_name || m.pushName || m.pushname || m.nome || m.name || m.senderName || m.sender_name || m.fromName || undefined,
            text: m.text || m.texto || m.body || 'Mensagem recebida',
            timestamp: m.timestamp || new Date().toISOString(),
            unread: m.unread !== undefined ? m.unread : true,
            isMe: m.isMe || false
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

          if (!isDeepSync) {
            newMessages.forEach(msg => {
               if(!msg.isMe) handleAutomation(msg);
            });
          }
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
        from: selectedChat,
        text: replyText,
        timestamp: new Date().toISOString(),
        unread: false,
        isMe: true
      };

      setMessages(prev => {
        const updated = [...prev, myMessage];
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
    if (!acc[msg.from]) acc[msg.from] = [];
    acc[msg.from].push(msg);
    return acc;
  }, {});

  const sortedChats = Object.keys(chatGroups).sort((a, b) => {
    const lastA = chatGroups[a][chatGroups[a].length - 1].timestamp;
    const lastB = chatGroups[b][chatGroups[b].length - 1].timestamp;
    return new Date(lastB).getTime() - new Date(lastA).getTime();
  });

  const getContactName = (phone: string) => {
    const contact = savedContacts.find(c => c.phone === phone);
    return contact ? contact.name : `+${phone}`;
  };

  const isContactSaved = (phone: string) => {
    // Identifica se o contato tem um nome real capturado (não apenas os últimos 4 dígitos)
    const contact = savedContacts.find(c => c.phone === phone);
    return contact && !contact.name.includes(phone.slice(-4));
  };

  const exportChat = () => {
    if (!selectedChat) return;
    const chatMsgs = chatGroups[selectedChat];
    const text = chatMsgs.map((m: any) => 
      `[${new Date(m.timestamp).toLocaleString()}] ${m.isMe ? 'EU' : m.from}: ${m.text}`
    ).join('\n');
    
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversa_${selectedChat}.txt`;
    a.click();
  };

  return (
    <div className="bg-white rounded-none md:rounded-2xl border-0 md:border border-slate-200 shadow-sm overflow-hidden h-screen md:h-[calc(100vh-200px)] flex flex-col">
      <div className="px-4 py-3 bg-slate-900 flex justify-between items-center border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${serverHealth === 'up' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
          <span className="text-[10px] text-white font-bold uppercase tracking-widest">
            {serverHealth === 'up' ? 'Automação Ativa' : 'Ponte Offline'}
          </span>
          <span className="text-[10px] text-slate-400 font-mono hidden lg:inline">| {debugLog}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => fetchMessages(true, true)} title="Recuperar histórico" className="text-[9px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 px-3 py-1 rounded hover:bg-amber-500 hover:text-white transition-all uppercase">Histórico</button>
          <button onClick={() => fetchMessages(true)} className="text-[9px] font-bold bg-white/10 text-white px-3 py-1 rounded hover:bg-white/20 uppercase">Sync</button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-slate-100 flex-col bg-white overflow-y-auto`}>
          {sortedChats.length === 0 ? (
            <div className="p-10 text-center opacity-20 mt-10">
              <p className="text-4xl mb-2">📩</p>
              <p className="text-[10px] font-bold uppercase">Sem mensagens</p>
            </div>
          ) : (
            sortedChats.map(phone => (
              <button key={phone} onClick={() => setSelectedChat(phone)} className={`w-full p-4 flex gap-3 text-left hover:bg-slate-50 border-b border-slate-50 transition-colors ${selectedChat === phone ? 'bg-emerald-50/50' : ''}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs ${isContactSaved(phone) ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {isContactSaved(phone) ? '👤' : '⚡'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline">
                    <p className="font-bold text-slate-800 text-sm truncate">{getContactName(phone)}</p>
                    {chatGroups[phone].some((m:any) => m.unread && !m.isMe) && <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>}
                  </div>
                  <p className="text-xs text-slate-500 truncate">{chatGroups[phone][chatGroups[phone].length - 1].text}</p>
                </div>
              </button>
            ))
          )}
        </div>

        <div className={`${!selectedChat ? 'hidden md:flex' : 'flex'} flex-1 flex-col bg-[#efeae2] relative shadow-inner`}>
          {selectedChat ? (
            <>
              <div className="p-4 bg-white border-b border-slate-200 flex justify-between items-center z-10 shadow-sm">
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedChat(null)} className="md:hidden text-slate-400 p-1">←</button>
                  <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-[10px]">👤</div>
                  <div>
                    <p className="font-bold text-slate-800 text-sm">{getContactName(selectedChat)}</p>
                    <p className="text-[8px] text-emerald-500 font-bold uppercase">+{selectedChat}</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={exportChat} className="hidden sm:inline text-[9px] font-bold text-slate-400 hover:text-indigo-500 uppercase tracking-wider">Exportar</button>
                  <button onClick={() => {
                     if(confirm("Remover conversa local?")) {
                        const updated = messages.filter(m => m.from !== selectedChat);
                        setMessages(updated);
                        localStorage.setItem('wb_incoming', JSON.stringify(updated));
                        setSelectedChat(null);
                     }
                  }} className="text-[10px] font-bold text-slate-400 hover:text-rose-500 uppercase tracking-wider">Limpar</button>
                </div>
              </div>

              <div ref={scrollRef} className="flex-1 p-4 md:p-6 overflow-y-auto space-y-3 flex flex-col">
                {chatGroups[selectedChat].map((msg: any) => (
                  <div key={msg.id} className={`max-w-[85%] p-3 rounded-xl shadow-sm border text-sm ${
                    msg.isMe 
                      ? 'bg-[#dcf8c6] border-[#c1e8a0] self-end rounded-tr-none text-slate-800' 
                      : 'bg-white border-slate-200 self-start rounded-tl-none text-slate-700'
                  }`}>
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                    <div className="flex justify-end items-center gap-1 mt-1">
                      <p className="text-[9px] text-slate-400 opacity-70">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                      {msg.isMe && <span className="text-[10px] text-blue-500">✓✓</span>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 bg-white border-t border-slate-200 pb-safe">
                <div className="flex gap-2 items-end max-w-4xl mx-auto">
                  <textarea 
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendReply();
                      }
                    }}
                    placeholder="Sua resposta..."
                    rows={1}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none max-h-32 transition-all"
                  />
                  <button onClick={handleSendReply} disabled={!replyText.trim() || isSendingReply} className="w-12 h-12 bg-emerald-500 text-white rounded-full flex items-center justify-center hover:bg-emerald-600 disabled:opacity-50 transition-all shadow-md active:scale-95">
                    {isSendingReply ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <span className="text-xl">✈️</span>}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-12 text-center">
              <div className="w-24 h-24 bg-white/50 rounded-full flex items-center justify-center text-4xl mb-4 grayscale opacity-30 shadow-sm">🤖</div>
              <h3 className="font-bold text-slate-500 uppercase tracking-widest text-xs">Robô de Atendimento</h3>
              <p className="text-[10px] mt-2 max-w-[200px]">Selecione um chat para responder.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Inbox;
