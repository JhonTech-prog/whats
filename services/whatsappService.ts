
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
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Saneamento EXTREMO: Meta REJEITA qualquer coisa que não seja dígito
    const cleanTo = String(to).replace(/\D/g, '');
    
    if (!cleanTo || cleanTo.length < 8) {
      return { success: false, error: 'Número de telefone inválido (deve conter apenas números e código do país)' };
    }

    const isTemplate = !!options?.templateName;
    const isMedia = !!options?.mediaUrl && !!options?.mediaType;
    
    const body: any = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: cleanTo,
    };

    if (isTemplate) {
      body.type = "template";
      body.template = {
        name: options.templateName,
        language: {
          code: options.languageCode || "pt_BR"
        }
      };
    } else if (isMedia) {
      body.type = options.mediaType;
      body[options.mediaType!] = {
        link: options.mediaUrl,
        ...(options.fileName ? { filename: options.fileName } : {})
      };
    } else {
      body.type = "text";
      // Meta API exige que 'body' não seja vazio
      body.text = { body: (text || ' ').trim() || ' ' };
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
      console.error('Meta API Error:', data);
      return { 
        success: false, 
        error: data.error?.message || `Erro API #${data.error?.code || 'Desconhecido'}` 
      };
    }
  } catch (err) {
    console.error('Connection Error:', err);
    return { success: false, error: 'Erro de conexão com a Meta. Verifique sua internet.' };
  }
};
