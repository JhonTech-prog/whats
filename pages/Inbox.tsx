
import React, { useState, useRef, useEffect } from 'react';
import ContactList, { Contact } from '../components/ContactList';
import { ChatWindow, Message } from '../components/ChatWindow';

interface InboxProps {
  auth: {
    phoneId: string;
    accessToken: string;
    apiUrl: string;
  };
}

const Inbox: React.FC<InboxProps> = ({ auth }) => {
    // Carrega mensagens do backend ao abrir o Inbox
  const [messages, setMessages] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [input, setInput] = useState<string>('');
  const [apiUrl, setApiUrl] = useState<string>(auth.apiUrl);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);


  // Carrega todas as mensagens do backend e salva no cache local
  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${apiUrl}/messages`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          // Salva todas as mensagens no cache local
          localStorage.setItem('chat-historico-all', JSON.stringify(data));
          setMessages(data);
        } else {
          setError('Formato de resposta inválido do backend.');
        }
      })
      .catch(() => setError('Erro ao buscar mensagens do backend.'))
      .finally(() => setLoading(false));
  }, [apiUrl]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const chatWindowRef = useRef<HTMLDivElement>(null);

  // Função para enviar mensagem de texto
  const handleSend = () => {
    if (!input.trim() || !selectedId) {
      console.warn('Campos obrigatórios ausentes:', { to: selectedId, text: input });
      return;
    }
    setInput('');
    // Log dos dados enviados
    console.log('Enviando para backend:', { to: selectedId, text: input });
    fetch(`${apiUrl}/send-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ to: selectedId, text: input })
    })
      .then(res => res.json())
      .then(data => {
        console.log('Resposta do backend ao enviar mensagem:', data);
        // Após enviar, limpa o cache do chat para forçar reload na próxima abertura
        try {
          localStorage.removeItem(`chat-historico-${selectedId}`);
        } catch {}
        // Atualiza a tela imediatamente (opcional: pode buscar do backend de novo)
        setMessages(prev => [
          ...prev,
          {
            telefone: selectedId,
            texto: input,
            senderType: 'sent',
            timestamp: new Date().toISOString(),
            tipo: 'text',
            nome: '',
          },
        ].slice(-50));
      })
      .catch(err => {
        console.error('Erro ao enviar mensagem:', err);
      });
  };

  // Handler para envio de arquivos (imagem/áudio)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;
    const formData = new FormData();
    formData.append('to', selectedId);
    formData.append('file', file);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/send-message`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      console.log('Arquivo enviado:', data);
      // Atualiza a tela imediatamente (opcional: pode buscar do backend de novo)
      setMessages(prev => [
        ...prev,
        {
          telefone: selectedId,
          texto: file.type.startsWith('image') ? '[imagem]' : '[áudio]',
          senderType: 'sent',
          timestamp: new Date().toISOString(),
          tipo: file.type.startsWith('image') ? 'image' : 'audio',
          nome: '',
          midiaUrl: data?.midiaUrl || undefined,
        },
      ].slice(-50));
    } catch (err) {
      setError('Erro ao enviar arquivo');
      console.error('Erro ao enviar arquivo:', err);
    } finally {
      setLoading(false);
      if (e.target) e.target.value = '';
    }
  };

  useEffect(() => {
    console.log('Mensagens recebidas do backend:', messages);
  }, [messages]);


  // Sempre mostrar todos os contatos presentes nas mensagens do backend (cache local)
  const contacts: Contact[] = React.useMemo(() => {
    let allMessages: any[] = [];
    try {
      const raw = localStorage.getItem('chat-historico-all');
      if (raw) allMessages = JSON.parse(raw);
    } catch {}
    if (!Array.isArray(allMessages) || allMessages.length === 0) allMessages = messages;
    const byTel = new Map<string, { msg: any, lastDate: number }>();
    allMessages.forEach(msg => {
      const tel = msg.telefone || msg.from || 'desconhecido';
      const msgDate = msg.dataRecebimento
        ? new Date(msg.dataRecebimento).getTime()
        : typeof msg.timestamp === 'number'
          ? msg.timestamp * 1000
          : new Date(msg.timestamp).getTime();
      if (!byTel.has(tel) || msgDate > (byTel.get(tel)?.lastDate ?? 0)) {
        byTel.set(tel, { msg, lastDate: msgDate });
      }
    });
    return Array.from(byTel.values())
      .sort((a, b) => b.lastDate - a.lastDate)
      .map(({ msg, lastDate }) => ({
        id: msg.telefone || msg.from || 'desconhecido',
        name: msg.nome || msg.telefone || msg.from || 'desconhecido',
        lastMessage: msg.texto || msg.text || '',
        lastMessageTime: new Date(lastDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        avatarUrl: undefined,
      }));
  }, [messages]);

  // Mensagens do chat selecionado (useMemo)

  // Converte mensagens do backend para o formato do ChatWindow

  // Alternância correta: enviado (direita), recebido (esquerda)


  const msgs: Message[] = React.useMemo(() => {
    if (!selectedId) return [];
    const filtered = messages.filter(msg => msg.telefone === selectedId);
    console.log('DEBUG mensagens filtradas para o contato', selectedId, filtered);
    const mapped = filtered
      .sort((a, b) => {
        const aDate = a.dataRecebimento
          ? new Date(a.dataRecebimento).getTime()
          : typeof a.timestamp === 'number'
            ? a.timestamp * 1000
            : new Date(a.timestamp).getTime();
        const bDate = b.dataRecebimento
          ? new Date(b.dataRecebimento).getTime()
          : typeof b.timestamp === 'number'
            ? b.timestamp * 1000
            : new Date(b.timestamp).getTime();
        return aDate - bDate;
      })
      .map((msg, idx) => {
        const isSent =
          msg.senderType === 'sent' ||
          msg.isMe === true ||
          (msg.from && auth && String(msg.from) === String(auth.phoneId)) ||
          (msg.telefone && auth && String(msg.telefone) === String(auth.phoneId));
        return {
          id: msg.id || msg._id || String(idx),
          fromMe: isSent,
          type: msg.tipo || msg.type || 'text',
          content: msg.texto || msg.text || msg.content || '',
          timestamp: msg.dataRecebimento || msg.timestamp || '',
          mediaUrl: msg.midiaUrl || msg.mediaUrl || undefined,
        };
      });
    console.log('DEBUG msgs mapeadas para ChatWindow', mapped);
    return mapped;
  }, [messages, selectedId, auth]);


  // Polling: busca novas mensagens e atualiza apenas se houver novidades
  useEffect(() => {
    const interval = setInterval(() => {
      fetch(`${apiUrl}/messages`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            // Atualiza o cache local
            localStorage.setItem('chat-historico-all', JSON.stringify(data));
            setMessages(data);
          }
        });
    }, 3000);
    return () => clearInterval(interval);
  }, [apiUrl]);





  // ...existing code...




  // Handler para envio de arquivos (imagem/áudio)

  // ...existing code...


  // Ref para scroll automático
  // ...existing code...

  useEffect(() => {
    if (!loading && chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [messages, selectedId, loading]);

  return (
    <div className="flex h-[calc(100vh-120px)] bg-white rounded-2xl border border-slate-200 shadow overflow-hidden">
      <div className="w-80 h-full border-r border-slate-100">
        <ContactList contacts={contacts} selectedId={selectedId} onSelect={setSelectedId} />
      </div>
      <div className="flex-1 flex flex-col h-full">
        {selectedId ? (
          <>
            <div ref={chatWindowRef} className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mb-2"></div>
                  Carregando histórico...
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center h-full text-red-400">
                  {error} <button className="ml-2 underline" onClick={() => setSelectedId(selectedId)}>Tentar novamente</button>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  Inicie uma nova conversa
                </div>
              ) : (
                <ChatWindow
                  messages={msgs}
                  contactName={contacts.find(c => c.id === selectedId)?.name || ''}
                />
              )}
            </div>
            <div className="p-4 bg-white border-t flex gap-2 items-center">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Mensagem..."
                className="flex-1 bg-slate-50 border rounded-xl px-4 py-2 text-sm focus:outline-none"
                onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
              />
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <button
                type="button"
                className="w-10 h-10 flex items-center justify-center text-emerald-500 hover:bg-emerald-50 rounded-full"
                onClick={() => fileInputRef.current?.click()}
                title="Enviar imagem"
              >
                <span role="img" aria-label="imagem">🖼️</span>
              </button>
              <input
                type="file"
                accept="audio/*"
                ref={audioInputRef}
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <button
                type="button"
                className="w-10 h-10 flex items-center justify-center text-emerald-500 hover:bg-emerald-50 rounded-full"
                onClick={() => audioInputRef.current?.click()}
                title="Enviar áudio"
              >
                <span role="img" aria-label="áudio">🎤</span>
              </button>
              <button onClick={handleSend} disabled={!input.trim()} className="w-10 h-10 bg-emerald-500 text-white rounded-full flex items-center justify-center">
                ✈️
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">📱 Selecione um Chat</div>
        )}
      </div>
    </div>
  );
};


export default Inbox;

