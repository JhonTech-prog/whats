
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateMessageContent } from '../services/geminiService.ts';
import { sendWhatsAppMessage } from '../services/whatsappService.ts';
import { Contact, Campaign } from '../types.ts';
import { safeGenerateId } from '../App.tsx';

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
    try {
      const saved = localStorage.getItem('wb_contacts');
      if (saved) setContacts(JSON.parse(saved));
    } catch(e) {}
  }, []);

  const groups = Array.from(new Set(contacts.map(c => c.group)));

  const filteredContacts = selectedGroup === 'all' 
    ? contacts 
    : contacts.filter(c => c.group === selectedGroup);

  const saveCampaignToHistory = (status: 'draft' | 'completed', sentCount: number) => {
    try {
      const campaigns: Campaign[] = JSON.parse(localStorage.getItem('wb_campaigns') || '[]');
      const newCampaign: Campaign = {
        id: safeGenerateId(),
        name: campaignName || `Campanha ${new Date().toLocaleDateString()}`,
        message: message,
        status: status,
        totalContacts: filteredContacts.length,
        sentCount: sentCount,
        createdAt: new Date().toISOString()
      };
      localStorage.setItem('wb_campaigns', JSON.stringify([newCampaign, ...campaigns]));
    } catch(e) {}
  };

  const handleGenerate = async () => {
    if (!prompt) return;
    setIsGenerating(true);
    const result = await generateMessageContent(prompt, tone);
    setMessage(result);
    setIsGenerating(false);
  };

  const launchCampaign = async () => {
    const configRaw = localStorage.getItem('wb_sender_config');
    const config = configRaw ? JSON.parse(configRaw) : {};
    
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

    if (!confirm(`Iniciar envio para ${filteredContacts.length} contatos?`)) return;

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
      }
      
      await new Promise(r => setTimeout(r, 200));
    }

    saveCampaignToHistory('completed', successCount);
    setIsSending(false);
    navigate('/campaigns');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 px-4 md:px-0">
      {isSending && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl p-10 max-w-md w-full shadow-2xl text-center space-y-6">
            <h3 className="text-xl font-bold">Enviando... {Math.round((progress.current / progress.total) * 100)}%</h3>
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div>
            </div>
            <p className="text-slate-500">{progress.current} / {progress.total}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
        <h2 className="text-xl font-bold text-slate-800 mb-6">1. Dados da Campanha</h2>
        <div className="space-y-4">
          <input 
            type="text" 
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
            placeholder="Nome da Campanha"
          />
          <select 
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-600"
          >
            <option value="all">Todos os contatos ({contacts.length})</option>
            {groups.map(group => (
              <option key={group} value={group}>Grupo: {group}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
        <h2 className="text-xl font-bold mb-6">2. Criar com IA</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <textarea 
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none resize-none"
            placeholder="Descreva sua oferta..."
          />
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full bg-white p-4 rounded-xl border border-emerald-100 min-h-[160px] text-sm text-slate-700 outline-none resize-none"
              placeholder="A mensagem gerada aparecerá aqui..."
            />
          </div>
        </div>
        <button onClick={handleGenerate} disabled={isGenerating || !prompt} className="w-full mt-4 bg-slate-800 text-white py-4 rounded-xl font-bold hover:bg-slate-900 disabled:opacity-50">
          {isGenerating ? 'Gerando...' : '✨ Gerar Mensagem IA'}
        </button>
      </div>

      <div className="flex justify-end gap-4 pb-20">
        <button onClick={launchCampaign} disabled={!message || isSending} className="px-10 py-4 bg-emerald-500 text-white font-bold rounded-xl shadow-lg hover:bg-emerald-600 transition-all disabled:opacity-50">
          Lançar Campanha 🚀
        </button>
      </div>
    </div>
  );
};

export default NewCampaign;
