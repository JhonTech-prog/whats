
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
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });

  useEffect(() => {
    const saved = localStorage.getItem('wb_contacts');
    if (saved) setContacts(JSON.parse(saved));
  }, []);

  const groups = Array.from(new Set(contacts.map(c => c.group)));

  const filteredContacts = selectedGroup === 'all' 
    ? contacts 
    : contacts.filter(c => c.group === selectedGroup);

  const saveCampaignToHistory = (status: 'draft' | 'completed', sentCount: number) => {
    const campaigns: Campaign[] = JSON.parse(localStorage.getItem('wb_campaigns') || '[]');
    const newCampaign: Campaign = {
      id: crypto.randomUUID(),
      name: campaignName || `Campanha ${new Date().toLocaleDateString()}`,
      message: message,
      status: status,
      totalContacts: filteredContacts.length,
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

  const handleSaveDraft = () => {
    if (!message && !prompt) {
      alert("Escreva algo antes de salvar como rascunho.");
      return;
    }
    saveCampaignToHistory('draft', 0);
    alert("Rascunho salvo com sucesso!");
    navigate('/campaigns');
  };

  const launchCampaign = async () => {
    const config = JSON.parse(localStorage.getItem('wb_sender_config') || '{}');
    
    if (!config.accessToken || !config.phoneId) {
      alert("Erro: Configure suas credenciais da Meta nas 'Configurações' antes de lançar uma campanha.");
      return;
    }

    if (!message) {
      alert("Erro: Gere ou escreva uma mensagem antes de enviar.");
      return;
    }

    if (filteredContacts.length === 0) {
      alert("Erro: Não existem contatos no grupo selecionado.");
      return;
    }

    if (!confirm(`Deseja iniciar o envio para ${filteredContacts.length} contatos do grupo "${selectedGroup === 'all' ? 'Todos' : selectedGroup}"?`)) return;

    setIsSending(true);
    const total = filteredContacts.length;
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < filteredContacts.length; i++) {
      setProgress({ current: i + 1, total, success: successCount, failed: failedCount });
      
      const result = await sendWhatsAppMessage(filteredContacts[i].phone, message, {
        accessToken: config.accessToken,
        phoneId: config.phoneId
      });

      if (result.success) {
        successCount++;
      } else {
        failedCount++;
        console.error(`Falha ao enviar para ${filteredContacts[i].phone}:`, result.error);
      }
      
      await new Promise(r => setTimeout(r, 200));
    }

    setProgress(prev => ({ ...prev, success: successCount, failed: failedCount }));
    saveCampaignToHistory('completed', successCount);
    alert(`Campanha finalizada!\nSucesso: ${successCount}\nFalhas: ${failedCount}`);
    setIsSending(false);
    navigate('/campaigns');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {isSending && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl p-10 max-w-md w-full shadow-2xl text-center space-y-6">
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
              <h3 className="text-xl font-bold text-slate-800">Enviando Campanha...</h3>
              <p className="text-slate-500 text-sm mt-1">Processando {progress.current} de {progress.total}</p>
            </div>
            <div className="flex gap-4 justify-center">
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
        <h2 className="text-xl font-bold text-slate-800 mb-6">1. Dados da Campanha</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nome da Campanha</label>
            <input 
              type="text" 
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
              placeholder="Ex: Promoção de Inverno"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Público Alvo (Filtrar por Grupo)</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <select 
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
                className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-600"
              >
                <option value="all">Todos os contatos ({contacts.length})</option>
                {groups.map(group => (
                  <option key={group} value={group}>
                    Grupo: {group} ({contacts.filter(c => c.group === group).length})
                  </option>
                ))}
              </select>
              <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex justify-between items-center">
                <span className="text-indigo-800 font-semibold text-xs">Total de envios:</span>
                <span className="bg-indigo-500 text-white px-3 py-1 rounded-full text-xs font-bold">{filteredContacts.length} contatos</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-slate-800">2. Criar com IA</h2>
          <span className="text-xs bg-emerald-50 text-emerald-600 px-2 py-1 rounded-full font-bold uppercase tracking-wider">Gemini 3 Flash</span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Oferta ou aviso:</label>
              <textarea 
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                placeholder="Ex: Quero oferecer 15% de desconto para quem comprar hoje"
              />
            </div>
            <button onClick={handleGenerate} disabled={isGenerating || !prompt} className="w-full bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-900 disabled:opacity-50 transition-all">
              {isGenerating ? 'Gerando...' : '✨ Gerar Mensagem IA'}
            </button>
          </div>

          <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 relative">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Preview da Mensagem</h4>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full bg-white p-4 rounded-xl shadow-sm border border-emerald-100 min-h-[160px] text-sm text-slate-700 outline-none resize-none"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-4 pb-12">
        <button onClick={handleSaveDraft} className="px-6 py-3 text-slate-600 font-semibold hover:bg-slate-100 rounded-xl transition-all">Salvar Rascunho</button>
        <button 
          onClick={launchCampaign} 
          disabled={!message || isSending}
          className="px-10 py-3 bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-200 hover:bg-emerald-600 transition-all disabled:opacity-50"
        >
          Lançar para "{selectedGroup === 'all' ? 'Todos' : selectedGroup}" 🚀
        </button>
      </div>
    </div>
  );
};

export default NewCampaign;
