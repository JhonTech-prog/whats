import React, { useRef, useEffect, useState } from 'react';

export interface Message {
  id: string;
  fromMe: boolean;
  type: 'text' | 'image' | 'audio';
  content: string;
  timestamp: string;
  mediaUrl?: string;
}

interface MessageBubbleProps {
  message: Message;
  onImageClick?: (url: string) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onImageClick }) => {
  const isMe = message.fromMe;
  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className={`max-w-[75%] rounded-2xl px-4 py-2 shadow text-sm ${isMe ? 'bg-emerald-500 text-white' : 'bg-white text-slate-800 border border-slate-100'}`}>
        {message.type === 'text' && <span>{message.content}</span>}
        {message.type === 'image' && message.mediaUrl && (
          <button
            className="block p-0 border-0 bg-transparent cursor-pointer focus:outline-none"
            title="Clique para ampliar"
            onClick={() => onImageClick && onImageClick(message.mediaUrl!)}
          >
            <img src={message.mediaUrl} alt="imagem" className="rounded-lg max-w-[120px] max-h-24 object-cover" />
          </button>
        )}
        {message.type === 'audio' && message.mediaUrl && (
          <audio controls src={message.mediaUrl} className="w-full mt-2" />
        )}
        <div className="text-[10px] text-right text-slate-400 mt-1">{message.timestamp}</div>
      </div>
    </div>
  );
};

interface ChatWindowProps {
  messages: Message[];
  contactName: string;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ messages, contactName }) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [modalUrl, setModalUrl] = useState<string | null>(null);

  useEffect(() => {
    // Scroll para o final após imagens carregarem
    if (messages.some(m => m.type === 'image')) {
      const imgs = document.querySelectorAll('.chat-img');
      let loaded = 0;
      imgs.forEach(img => {
        if ((img as HTMLImageElement).complete) loaded++;
        else img.addEventListener('load', () => {
          loaded++;
          if (loaded === imgs.length) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        });
      });
      if (loaded === imgs.length) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="px-6 py-4 border-b border-slate-100 bg-white sticky top-0 z-10">
        <span className="font-bold text-slate-800 text-lg">{contactName}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-6 bg-slate-50">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} onImageClick={setModalUrl} />
        ))}
        <div ref={bottomRef} />
      </div>
      {modalUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70" onClick={() => setModalUrl(null)}>
          <div className="relative" onClick={e => e.stopPropagation()}>
            <img src={modalUrl} alt="imagem ampliada" className="max-w-[90vw] max-h-[80vh] rounded-lg shadow-lg" />
            <button
              className="absolute top-2 right-2 bg-white bg-opacity-80 rounded-full p-1 text-slate-700 hover:bg-opacity-100"
              onClick={() => setModalUrl(null)}
              title="Fechar"
            >
              ✖
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export { ChatWindow, MessageBubble };
