
export interface MetaConfig {
  accessToken: string;
  phoneId: string;
}

export interface SendMessageOptions {
  templateName?: string;
  languageCode?: string;
}

/**
 * Envia uma mensagem via API do WhatsApp Business (Meta)
 * Esta versão foca na simplicidade que funcionava anteriormente.
 */
export const sendWhatsAppMessage = async (
  to: string,
  text: string,
  config: MetaConfig,
  options?: SendMessageOptions
): Promise<{ success: boolean; error?: string }> => {
  try {
    // 1. Limpeza TOTAL: A Meta exige apenas dígitos no campo 'to'
    const cleanTo = String(to).replace(/\D/g, '');
    
    if (!cleanTo || cleanTo.length < 8) {
      return { success: false, error: "O número de destino está vazio ou é inválido." };
    }

    if (!config.accessToken || !config.phoneId) {
      return { success: false, error: "Configurações ausentes: Phone ID ou Token." };
    }

    const isTemplate = !!options?.templateName;
    
    // 2. Montagem do corpo da requisição (Versão padrão Meta)
    const body: any = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: cleanTo,
    };

    if (isTemplate) {
      body.type = "template";
      body.template = {
        name: options.templateName,
        language: { code: options.languageCode || "pt_BR" }
      };
    } else {
      body.type = "text";
      body.text = { 
        body: (text || "").trim() || "." // Meta rejeita corpos vazios
      };
    }

    // 3. Chamada para a API (Versão estável v21.0)
    const response = await fetch(`https://graph.facebook.com/v21.0/${config.phoneId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (response.ok) {
      return { success: true };
    } else {
      console.error('Meta API Error:', data);
      const msg = data.error?.message || 'Erro desconhecido';
      const code = data.error?.code;
      return { success: false, error: `Erro #${code}: ${msg}` };
    }
  } catch (err) {
    return { success: false, error: "Erro de conexão com os servidores da Meta." };
  }
};
