// Função utilitária para tocar o áudio de notificação
export function playNotificationSound() {
  const audio = new Audio('/assets/notification.mp3');
  audio.play();
}
