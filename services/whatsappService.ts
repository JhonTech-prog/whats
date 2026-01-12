
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
 * Limpa o número para conter apenas dígitos, removendo +, espaços e parênteses.
 */
export const sendWhatsAppMessage = async (
  to: string,
  text: string,
  config: MetaConfig,
  options?: SendMessageOptions
): Promise<{ success: boolean; error?: string }> => {
  try {
    // 1. Limpeza rigorosa: A Meta não aceita nada além de números no campo 'to'
    let cleanTo = String(to).replace(/\D/g, '');
    
    // Fallback para Brasil se o número tiver 10 ou 11 dígitos e não começar com 55
    if (cleanTo.length >= 10 && cleanTo.length <= 11 && !cleanTo.startsWith('55')) {
      cleanTo = '55' + cleanTo;
    }

    if (!cleanTo || cleanTo.length < 8) {
      return { success: false, error: "Número de destino inválido." };
    }

    if (!config.accessToken || !config.phoneId) {
      return { success: false, error: "Token ou Phone ID não configurados." };
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
      body.text = { body: (text || "").trim() };
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
      const errorMsg = data.error?.message || 'Erro desconhecido';
      const errorCode = data.error?.code;
      return { success: false, error: `Erro #${errorCode}: ${errorMsg}` };
    }
  } catch (err) {
    return { success: false, error: "Falha na conexão com os servidores da Meta." };
  }
};
