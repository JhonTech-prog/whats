
import { GoogleGenAI } from "@google/genai";

/**
 * Helper para inicializar o AI de forma segura.
 * A chave DEVE vir de process.env.API_KEY conforme os requisitos do sistema.
 */
const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API_KEY não configurada no ambiente.");
  }
  return new GoogleGenAI({ apiKey });
};

export const generateMessageContent = async (prompt: string, tone: string): Promise<string> => {
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Escreva uma mensagem de WhatsApp profissional em Português do Brasil baseada neste pedido: "${prompt}". 
                 Tom de voz: ${tone}. 
                 A mensagem deve ser concisa, persuasiva e adequada para leitura em dispositivos móveis. 
                 Use emojis de forma estratégica. Não inclua assunto. Foque em gerar engajamento ou ação imediata (CTA).`,
      config: {
        temperature: 0.7,
        topP: 0.8,
        topK: 40
      }
    });

    return response.text || 'Falha ao gerar o conteúdo da mensagem.';
  } catch (error) {
    console.error('Erro Gemini:', error);
    if (error instanceof Error && error.message.includes("API_KEY")) {
      return "Erro: Chave de API do Google não configurada no servidor de hospedagem.";
    }
    return 'Erro ao gerar conteúdo por IA. Por favor, verifique as configurações.';
  }
};

export const refineMessage = async (currentMessage: string, feedback: string): Promise<string> => {
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Refine esta mensagem de WhatsApp: "${currentMessage}". 
                 Feedback para aplicar: ${feedback}. 
                 O resultado deve ser apenas o texto refinado da mensagem em Português do Brasil.`,
    });

    return response.text || currentMessage;
  } catch (error) {
    console.error('Erro Gemini:', error);
    return currentMessage;
  }
};
