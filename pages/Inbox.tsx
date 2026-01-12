
import React, { useState, useEffect, useRef } from 'react';
import { IncomingMessage } from '../types';
import { sendWhatsAppMessage } from '../services/whatsappService';

const Inbox: React.FC = () => {
  const [messages, setMessages] = useState<IncomingMessage[]>([]);
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState<'online' | 'offline'>('offline');
  
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selectedChat, messages]);

  useEffect(() => {
    const saved = localStorage.getItem('wb_incoming');
    if (saved) setMessages(JSON.parse(saved));

    const interval = setInterval(async () => {
      const config = JSON.parse(localStorage.getItem('wb_sender_config') || '{}');
      if (!config.bridgeUrl) return;

      try {
        const url = config.bridgeUrl.replace(/\/$/, '') + '/messages';
        const res = await fetch(`${url}?t=${Date.now()}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        
        setStatus('online');
        
        let list: any[] = [];
        if (data.entry?.[0]?.changes?.[0]?.value?.messages) {
          list = data.entry[0].changes[0].value.messages;
        } else if (Array.isArray(data)) {
          list = data;
        }

        if (list.length > 0) {
          handleIncoming(list);
        }
      } catch (e) {
        setStatus('offline');
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleIncoming = (list: any[]) => {
    const news: IncomingMessage[] = list.map((m: any): IncomingMessage | null => {
      const phone = String(m.from || m.wa_id || m.key?.remoteJid || '').replace(/\D/g, '');
      if (!phone || phone.length < 8) return null;

      const body = m.text?.body || m.message?.conversation || m.body || m.text || '';
      
      return {
        id: m.id || m.key?.id || `msg-${Date.now()}-${Math.random()}`,
        from: phone,
        fromName: m.pushName || '',
        text: String(body),
        timestamp: new Date().toISOString(),
        unread: true,
        isMe: !!m.isMe || !!m.key?.fromMe
      };
    }).filter((m): m is IncomingMessage => m !== null);

    const current: IncomingMessage[] = JSON.parse(localStorage.getItem('wb_incoming') || '[]');
    const existingIds = new Set(current.map(m => m.id));
    const added = news.filter(n => !existingIds.has(n.id));

    if (added.length > 0) {
      const merged = [...current, ...added].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      setMessages(merged);
      localStorage.setItem('wb_incoming', JSON.stringify(merged));
    }
  };

  const handleSend = async () => {
    if (!selectedChat || !replyText.trim() || isSending) return;
    setIsSending(true);
    const config = JSON.parse(localStorage.getItem('wb_sender_config') || '{}');
    const res = await sendWhatsAppMessage(selectedChat, replyText, config);
    if (res.success) {
      const myMsg: IncomingMessage = {
        id: `sent-${Date.now()}`,
        from: selectedChat,
        text: replyText,
        timestamp: new Date().toISOString(),
        unread: false,
        isMe: true
      };
      const updated = [...messages, myMsg];
      setMessages(updated);
      localStorage.setItem('wb_incoming', JSON.stringify(updated));
      setReplyText('');
    } else {
      alert(res.error);
    }
    setIsSending(false);
  };

  const chatGroups = messages.reduce((acc: any, m) => {
    if (!acc[m.from]) acc[m.from] = [];
    acc[m.from].push(m);
    return acc;
  }, {});

  const sortedKeys = Object.keys(chatGroups).sort((a, b) => {
    const lastA = chatGroups[a][chatGroups[a].length - 1].timestamp;
    const lastB = chatGroups[b][chatGroups[b].length - 1].timestamp;
    return new Date(lastB).getTime() - new Date(lastA).getTime();
  });

  return (
    <div className="bg-white rounded-none md:rounded-2xl border border-slate-200 shadow-sm h-screen md:h-[calc(100vh-200px)] flex overflow-hidden">
      <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-slate-100 flex-col bg-white overflow-y-auto`}>
        <div className="p-4 border-b border-slate-50 flex justify-between items-center bg-slate-50 sticky top-0">
          <h2 className="font-bold text-slate-800">Conversas</h2>
          <span className={`w-2 h-2 rounded-full ${status === 'online' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
        </div>
        {sortedKeys.map(phone => {
          const chat = chatGroups[phone];
          const last = chat[chat.length - 1];
          return (
            <button key={phone} onClick={() => setSelectedChat(phone)} className={`w-full p-4 text-left border-b border-slate-50 hover:bg-slate-50 transition-all ${selectedChat === phone ? 'bg-emerald-50' : ''}`}>
              <p className="font-bold text-slate-800 text-sm">{last.fromName || `+${phone}`}</p>
              <p className="text-xs text-slate-500 truncate">{last.text}</p>
            </button>
          );
        })}
      </div>

      <div className={`${!selectedChat ? 'hidden md:flex' : 'flex'} flex-1 flex-col bg-[#efeae2]`}>
        {selectedChat ? (
          <>
            <div className="p-4 bg-white border-b border-slate-200 flex items-center gap-3">
              <button onClick={() => setSelectedChat(null)} className="md:hidden text-slate-400">←</button>
              <p className="font-bold text-slate-800">+{selectedChat}</p>
            </div>
            <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-3 flex flex-col bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')]">
              {chatGroups[selectedChat].map((m: any) => (
                <div key={m.id} className={`max-w-[80%] p-3 rounded-xl shadow-sm text-sm ${m.isMe ? 'bg-[#dcf8c6] self-end' : 'bg-white self-start'}`}>
                  {m.text}
                </div>
              ))}
            </div>
            <div className="p-4 bg-[#f0f2f5] flex gap-2">
              <input value={replyText} onChange={e => setReplyText(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSend()} className="flex-1 px-4 py-2 rounded-full border-0 outline-none" placeholder="Mensagem" />
              <button onClick={handleSend} disabled={isSending} className="w-10 h-10 bg-[#00a884] text-white rounded-full flex items-center justify-center">
                {isSending ? '...' : '✈️'}
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400">Selecione uma conversa</div>
        )}
      </div>
    </div>
  );
};

export default Inbox;
