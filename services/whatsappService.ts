
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
