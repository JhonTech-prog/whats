
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
 * Limpa rigorosamente o número para conter apenas dígitos e garante o prefixo internacional.
 */
export const sendWhatsAppMessage = async (
  to: string,
  text: string,
  config: MetaConfig,
  options?: SendMessageOptions
): Promise<{ success: boolean; error?: string }> => {
  try {
    // 1. LIMPEZA TOTAL: Remove TUDO que não for dígito (essencial para evitar erro 131009)
    let cleanTo = String(to).replace(/\D/g, '');
    
    // 2. CORREÇÃO AUTOMÁTICA DDI: Se for número do Brasil sem o 55, adiciona.
    // Números brasileiros tem 10 (fixo) ou 11 (celular) dígitos sem o DDI.
    if (cleanTo.length >= 10 && cleanTo.length <= 11 && !cleanTo.startsWith('55')) {
      cleanTo = '55' + cleanTo;
    }

    if (!cleanTo || cleanTo.length < 10) {
      return { success: false, error: "Número de destino inválido ou incompleto." };
    }

    if (!config.accessToken || !config.phoneId) {
      return { success: false, error: "Credenciais da Meta (Token/Phone ID) não configuradas." };
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
      // Texto simples. O corpo não pode ser vazio.
      body.type = "text";
      body.text = { body: (text || "").trim() || "Mensagem automática" };
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
      console.error('Meta API Error Details:', data);
      const msg = data.error?.message || 'Erro desconhecido na API da Meta';
      const code = data.error?.code || 'N/A';
      return { success: false, error: `Erro Meta #${code}: ${msg}` };
    }
  } catch (err) {
    return { success: false, error: "Falha na conexão com os servidores da Meta." };
  }
};
