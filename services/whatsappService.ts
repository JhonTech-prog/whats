
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
 * Versão simplificada e estável.
 */
export const sendWhatsAppMessage = async (
  to: string,
  text: string,
  config: MetaConfig,
  options?: SendMessageOptions
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Limpeza básica: remove tudo que não é número
    const cleanTo = String(to).replace(/\D/g, '');
    
    if (!cleanTo || cleanTo.length < 8) {
      return { success: false, error: "Número inválido." };
    }

    if (!config.accessToken || !config.phoneId) {
      return { success: false, error: "Configurações da Meta ausentes." };
    }

    const isTemplate = !!options?.templateName;
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
      body.text = { body: text.trim() || "." };
    }

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
      return { 
        success: false, 
        error: data.error?.message || "Erro na API da Meta" 
      };
    }
  } catch (err) {
    return { success: false, error: "Falha de conexão." };
  }
};
