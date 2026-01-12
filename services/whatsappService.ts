
export interface MetaConfig {
  accessToken: string;
  phoneId: string;
}

export interface SendMessageOptions {
  templateName?: string;
  languageCode?: string;
}

export const sendWhatsAppMessage = async (
  to: string,
  text: string,
  config: MetaConfig,
  options?: SendMessageOptions
): Promise<{ success: boolean; error?: string }> => {
  try {
    // LIMPEZA ABSOLUTA: A Meta só aceita strings contendo APENAS dígitos.
    const cleanTo = String(to).replace(/\D/g, '');
    
    if (!cleanTo || cleanTo.length < 10) {
      return { success: false, error: "Número de destino inválido ou incompleto." };
    }

    if (!config.accessToken || !config.phoneId) {
      return { success: false, error: "Credenciais da Meta não configuradas." };
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
      body.text = { body: text.trim() };
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
        error: `Erro Meta #${data.error?.code}: ${data.error?.message}` 
      };
    }
  } catch (err) {
    return { success: false, error: "Falha na conexão com a API da Meta." };
  }
};
