
export interface MetaConfig {
  accessToken: string;
  phoneId: string;
}

export interface SendMessageOptions {
  templateName?: string;
  languageCode?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  mediaUrl?: string;
  fileName?: string;
}

export const sendWhatsAppMessage = async (
  to: string,
  text: string,
  config: MetaConfig,
  options?: SendMessageOptions
): Promise<{ success: boolean; error?: string; debug?: any }> => {
  try {
    // Saneamento TOTAL: Remove @c.us, +, espaços e letras.
    // O número DEVE ser apenas dígitos: CódigoPaís + DDD + Número
    const cleanTo = String(to).split('@')[0].replace(/\D/g, '');
    
    if (!cleanTo || cleanTo.length < 8) {
      return { success: false, error: `Número inválido detectado: "${to}". O destino deve ser apenas números.` };
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
      body.text = { body: (text || '').trim() || ' ' };
    }

    console.log('Enviando para Meta:', body);

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
      const errorMsg = data.error?.message || 'Erro desconhecido';
      const errorCode = data.error?.code;
      
      let hint = '';
      if (errorCode === 131030) hint = ' (Destinatário não é um número de teste autorizado no painel da Meta)';
      if (errorCode === 131009) hint = ' (Parâmetro inválido. Verifique se o número de destino está no formato 5511999999999)';

      return { 
        success: false, 
        error: `Erro #${errorCode}: ${errorMsg}${hint}`,
        debug: { payloadSent: body, apiResponse: data }
      };
    }
  } catch (err) {
    return { success: false, error: 'Falha de rede ao contactar a Meta.' };
  }
};
