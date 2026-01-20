import { useRef, useEffect } from 'react';
import { playNotificationSound } from '../services/notificationAudio';

export function useNotificationOnNewMessage(messages) {
  const prevMessagesRef = useRef(messages);

  useEffect(() => {
    if (
      prevMessagesRef.current &&
      messages.length > prevMessagesRef.current.length
    ) {
      // Só notifica se a última mensagem não for enviada por mim
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && !lastMsg.isMe) {
        playNotificationSound();
      }
    }
    prevMessagesRef.current = messages;
  }, [messages]);
}
