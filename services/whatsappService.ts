
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
 * Resolve o erro #131009 garantindo que o número de destino seja apenas dígitos
 */
export const sendWhatsAppMessage = async (
  to: string,
  text: string,
  config: MetaConfig,
  options?: SendMessageOptions
): Promise<{ success: boolean; error?: string; debug?: any }> => {
  try {
    // 1. Limpeza absoluta do número (Apenas dígitos, sem +, sem espaços, sem @)
    const cleanTo = String(to).replace(/\D/g, '');
    
    if (!cleanTo || cleanTo.length < 10) {
      return { 
        success: false, 
        error: `Número de destino inválido: "${to}". O WhatsApp exige Código do País + DDD + Número.` 
      };
    }

    if (!config.accessToken || !config.phoneId) {
      return { success: false, error: "Credenciais da Meta (Token ou Phone ID) ausentes nas Configurações." };
    }

    const isTemplate = !!options?.templateName;
    
    // 2. Construção do Payload rigoroso conforme documentação da Meta
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
        preview_url: false,
        body: (text || '').trim() || "." // Meta não aceita corpo vazio
      };
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
      const errorMsg = data.error?.message || 'Erro desconhecido na API';
      const errorCode = data.error?.code;
      
      let hint = '';
      if (errorCode === 131009) hint = " | Verifique se o número contém o código do país (ex: 55 para Brasil).";
      if (errorCode === 131030) hint = " | Este número não foi autorizado como 'Testador' no seu painel da Meta.";

      return { 
        success: false, 
        error: `Erro #${errorCode}: ${errorMsg}${hint}`,
        debug: { sentPayload: body, apiResponse: data }
      };
    }
  } catch (err) {
    return { success: false, error: 'Falha de conexão com os servidores da Meta.' };
  }
};
