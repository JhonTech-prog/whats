
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateMessageContent } from '../services/geminiService';
import { sendWhatsAppMessage } from '../services/whatsappService';
import { Contact, Campaign } from '../types';

const NewCampaign: React.FC = () => {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const [tone, setTone] = useState('Profissional');
  const [message, setMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [campaignName, setCampaignName] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });
  
  // Novos estados para suporte a Template
  const [sendMethod, setSendMethod] = useState<'text' | 'template'>('text');
  const [templateName, setTemplateName] = useState('');
  const [langCode, setLangCode] = useState('pt_BR');

  useEffect(() => {
    const saved = localStorage.getItem('wb_contacts');
    if (saved) setContacts(JSON.parse(saved));
  }, []);

  const saveCampaignToHistory = (status: 'draft' | 'completed', sentCount: number) => {
    const campaigns: Campaign[] = JSON.parse(localStorage.getItem('wb_campaigns') || '[]');
    const newCampaign: Campaign = {
      id: crypto.randomUUID(),
      name: campaignName || `Campanha ${new Date().toLocaleDateString()}`,
      message: sendMethod === 'template' ? `[TEMPLATE: ${templateName}]` : message,
      status: status,
      totalContacts: contacts.length,
      sentCount: sentCount,
      createdAt: new Date().toISOString()
    };
    localStorage.setItem('wb_campaigns', JSON.stringify([newCampaign, ...campaigns]));
  };

  const handleGenerate = async () => {
    if (!prompt) return;
    setIsGenerating(true);
    const result = await generateMessageContent(prompt, tone);
    setMessage(result);
    setIsGenerating(false);
  };

  const launchCampaign = async () => {
    const config = JSON.parse(localStorage.getItem('wb_sender_config') || '{}');
    
    if (!config.accessToken || !config.phoneId) {
      alert("Erro: Configure suas credenciais da Meta nas 'Configurações' primeiro.");
      return;
    }

    if (sendMethod === 'text' && !message) {
      alert("Erro: Gere ou escreva uma mensagem.");
      return;
    }

    if (sendMethod === 'template' && !templateName) {
      alert("Erro: Insira o nome do Template exatamente como está no Painel da Meta.");
      return;
    }

    if (contacts.length === 0) {
      alert("Erro: Você não possui contatos cadastrados.");
      return;
    }

    if (!confirm(`Deseja iniciar o envio para ${contacts.length} contatos usando o método ${sendMethod === 'template' ? 'TEMPLATE' : 'TEXTO LIVRE'}?`)) return;

    setIsSending(true);
    const total = contacts.length;
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < contacts.length; i++) {
      setProgress({ current: i + 1, total, success: successCount, failed: failedCount });
      
      const options = sendMethod === 'template' ? { templateName, languageCode: langCode } : undefined;
      
      const result = await sendWhatsAppMessage(contacts[i].phone, message, {
        accessToken: config.accessToken,
        phoneId: config.phoneId
      }, options);

      if (result.success) {
        successCount++;
      } else {
        failedCount++;
        console.error(`Erro no contato ${contacts[i].phone}:`, result.error);
      }
      
      // Delay essencial para evitar bloqueios de taxa (rate limiting)
      await new Promise(r => setTimeout(r, 300));
    }

    setProgress(prev => ({ ...prev, success: successCount, failed: failedCount }));
    saveCampaignToHistory('completed', successCount);
    alert(`Campanha finalizada!\nSucesso: ${successCount}\nFalhas: ${failedCount}\n\nDica: Se muitos falharam, verifique se o nome do Template está correto ou se os números possuem o código do país (55).`);
    setIsSending(false);
    navigate('/campaigns');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      {isSending && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl p-10 max-w-md w-full shadow-2xl text-center space-y-6 border border-slate-100">
            <div className="relative w-24 h-24 mx-auto">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100" />
                <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" 
                  strokeDasharray={251.2} 
                  strokeDashoffset={251.2 - (251.2 * (progress.current / progress.total))}
                  className="text-emerald-500 transition-all duration-500" 
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center font-bold text-xl text-slate-800">
                {Math.round((progress.current / progress.total) * 100)}%
              </div>
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800">Disparando Mensagens...</h3>
              <p className="text-slate-500 text-sm mt-1">Contato {progress.current} de {progress.total}</p>
            </div>
            <div className="flex gap-4 justify-center bg-slate-50 p-4 rounded-2xl">
              <div className="text-center">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Sucesso</p>
                <p className="text-lg font-bold text-emerald-600">{progress.success}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Falhas</p>
                <p className="text-lg font-bold text-rose-500">{progress.failed}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
        <h2 className="text-xl font-bold text-slate-800 mb-6">1. Configuração de Envio</h2>
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Qual método de disparo?</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button 
                onClick={() => setSendMethod('text')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${sendMethod === 'text' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-100 hover:border-slate-200'}`}
              >
                <p className="font-bold text-slate-800 text-sm">Texto Livre (IA)</p>
                <p className="text-[10px] text-slate-500 mt-1 uppercase font-bold tracking-tight text-rose-500">Apenas para conversas ativas (24h)</p>
              </button>
              <button 
                onClick={() => setSendMethod('template')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${sendMethod === 'template' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-100 hover:border-slate-200'}`}
              >
                <p className="font-bold text-slate-800 text-sm">Template Oficial (Meta)</p>
                <p className="text-[10px] text-slate-500 mt-1 uppercase font-bold tracking-tight text-emerald-600">Obrigatório para disparos em massa</p>
              </button>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nome da Campanha</label>
            <input 
              type="text" 
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
              placeholder="Ex: Disparo Promoção Template"
            />
          </div>
        </div>
      </div>

      {sendMethod === 'template' ? (
        <div className="bg-white rounded-2xl border border-indigo-200 p-8 shadow-sm">
          <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
            <span className="text-indigo-500">📋</span> Detalhes do Template
          </h2>
          <div className="space-y-4">
            <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl mb-4">
              <p className="text-xs text-amber-800 leading-relaxed font-medium">
                <strong>Importante:</strong> O nome do template deve ser exatamente igual ao que foi aprovado no Painel da Meta (ex: <code>promocao_verao</code>).
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Nome do Template (Slug)</label>
                <input 
                  type="text" 
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="ex: hello_world"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Código do Idioma</label>
                <input 
                  type="text" 
                  value={langCode}
                  onChange={(e) => setLangCode(e.target.value)}
                  placeholder="pt_BR"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono text-sm"
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-emerald-200 p-8 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-slate-800">2. Conteúdo com IA</h2>
            <span className="text-xs bg-emerald-50 text-emerald-600 px-2 py-1 rounded-full font-bold uppercase tracking-wider italic">Apenas p/ conversas iniciadas</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Oferta/Aviso</label>
                <textarea 
                  rows={4}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                  placeholder="Ex: Quero oferecer 15% de desconto para quem comprar hoje."
                />
              </div>
              <button onClick={handleGenerate} disabled={isGenerating || !prompt} className="w-full bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-900 disabled:opacity-50 transition-all">
                {isGenerating ? 'Gerando...' : '✨ Gerar Mensagem IA'}
              </button>
            </div>

            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-4">Preview da Mensagem</h4>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full bg-white p-4 rounded-xl shadow-sm border border-emerald-100 min-h-[160px] text-sm text-slate-700 outline-none resize-none"
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center p-6 bg-slate-100 rounded-2xl">
        <div className="flex items-center gap-4">
           <div className="bg-white p-3 rounded-xl border border-slate-200 text-center min-w-[100px]">
             <p className="text-[10px] font-bold text-slate-400 uppercase">Público</p>
             <p className="text-xl font-bold text-slate-800">{contacts.length}</p>
           </div>
           <p className="text-xs text-slate-500 max-w-[200px]">As mensagens serão enviadas de forma sequencial para evitar bloqueios.</p>
        </div>
        <button 
          onClick={launchCampaign} 
          disabled={isSending || (sendMethod === 'text' && !message) || (sendMethod === 'template' && !templateName)}
          className={`px-10 py-4 font-bold rounded-2xl shadow-xl transition-all active:scale-95 ${
            sendMethod === 'template' ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200' : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-200'
          }`}
        >
          {isSending ? 'Processando...' : `Lançar Campanha ${sendMethod === 'template' ? 'Oficial' : 'IA'} 🚀`}
        </button>
      </div>
    </div>
  );
};

export default NewCampaign;
