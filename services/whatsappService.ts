
export interface MetaConfig {
  accessToken: string;
  phoneId: string;
}

export const sendWhatsAppMessage = async (
  to: string,
  text: string,
  config: MetaConfig
): Promise<{ success: boolean; error?: string }> => {
  try {
    const response = await fetch(`https://graph.facebook.com/v21.0/${config.phoneId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "text",
        text: { body: text }
      })
    });

    const data = await response.json();

    if (response.ok) {
      return { success: true };
    } else {
      return { 
        success: false, 
        error: data.error?.message || 'Erro desconhecido na API da Meta' 
      };
    }
  } catch (err) {
    return { success: false, error: 'Erro de conexão com os servidores da Meta' };
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
