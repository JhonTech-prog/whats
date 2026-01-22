
export interface MetaConfig {
  accessToken: string;
  phoneId: string;
}

export const sendWhatsAppMessage = async (
  to: string,
  text: string,
  config: MetaConfig
): Promise<{ success: boolean; error?: string; messageId?: string }> => {
  try {
    const response = await fetch('https://whatsapp-nrx3.onrender.com/send-message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to,
        text
      })
    });
    const data = await response.json();
    if (data.success) {
      return { success: true, messageId: data.messageId };
    } else {
      return { success: false, error: data.error || 'Erro desconhecido no backend' };
    }
  } catch (err) {
    return { success: false, error: 'Erro de conexão com o backend' };
  }
};

export const sendWhatsAppMedia = async (
  to: string,
  type: 'image' | 'audio',
  mediaUrl: string,
  config: MetaConfig,
  caption?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const payload: any = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
      type: type,
    };

    if (type === 'image') {
      payload.image = { link: mediaUrl, caption: caption };
    } else if (type === 'audio') {
      payload.audio = { link: mediaUrl };
    }

    const response = await fetch(`https://graph.facebook.com/v21.0/${config.phoneId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (response.ok) {
      return { success: true };
    } else {
      return { 
        success: false, 
        error: data.error?.message || `Erro ao enviar ${type}` 
      };
    }
  } catch (err) {
    return { success: false, error: 'Erro de conexão com os servidores da Meta' };
  }
};
