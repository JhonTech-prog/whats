
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
    // Saneamento: Meta exige apenas números no campo "to"
    const cleanTo = to.replace(/\D/g, '');
    
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
      body.text = { body: text };
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
        error: data.error?.message || 'Erro na API da Meta' 
      };
    }
  } catch (err) {
    return { success: false, error: 'Erro de conexão com a Meta' };
  }
};
