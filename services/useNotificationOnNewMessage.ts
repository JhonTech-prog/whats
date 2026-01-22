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
        // Notificação sonora
        playNotificationSound();
        // Notificação visual
        if (window.Notification && Notification.permission === 'granted') {
          new Notification('Nova mensagem', {
            body: lastMsg.content || lastMsg.text || 'Nova mensagem recebida',
          });
        }
      }
    }
    prevMessagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (window.Notification && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  }, []);
}
