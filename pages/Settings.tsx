
import React, { useState, useEffect } from 'react';

const Settings: React.FC = () => {
  const [config, setConfig] = useState({
    name: '',
    phone: '', // Ex: 558396809919
    accessToken: '',
    phoneId: '',
    bridgeUrl: ''
  });
  const [saveStatus, setSaveStatus] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('wb_sender_config');
    if (saved) setConfig(JSON.parse(saved));
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    // Limpa o telefone para garantir que só tenha números antes de salvar
    const cleanConfig = { ...config, phone: config.phone.replace(/\D/g, '') };
    localStorage.setItem('wb_sender_config', JSON.stringify(cleanConfig));
    setSaveStatus(true);
    setTimeout(() => setSaveStatus(false), 2000);
    window.dispatchEvent(new Event('senderConfigUpdated'));
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
        <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
          <span className="text-indigo-600">⚙️</span> Configurações API Meta
        </h2>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Seu Telefone WhatsApp (Com 55)</label>
            <input 
              type="text" 
              value={config.phone} 
              onChange={e => setConfig({...config, phone: e.target.value})} 
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" 
              placeholder="Ex: 558396809919" 
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">URL do Webhook Bridge (Render.com)</label>
            <input 
              type="text" 
              value={config.bridgeUrl} 
              onChange={e => setConfig({...config, bridgeUrl: e.target.value})} 
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" 
              placeholder="https://whatsapp-nrx3.onrender.com" 
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Phone Number ID</label>
              <input 
                type="text" 
                value={config.phoneId} 
                onChange={e => setConfig({...config, phoneId: e.target.value})} 
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                placeholder="Ex: 109238475"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Token de Acesso Permanente</label>
              <input 
                type="password" 
                value={config.accessToken} 
                onChange={e => setConfig({...config, accessToken: e.target.value})} 
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                placeholder="EAAG...."
              />
            </div>
          </div>

          <button type="submit" className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold shadow-lg hover:bg-indigo-700 active:scale-95 transition-all">
            {saveStatus ? 'Configurações Salvas! ✓' : 'Salvar Configurações'}
          </button>
        </form>
      </div>

      <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
        <h3 className="text-emerald-400 font-bold text-sm mb-4">Informações para o Webhook da Meta</h3>
        <div className="space-y-3 font-mono text-[11px]">
          <div>
            <p className="text-slate-500">Callback URL:</p>
            <p className="text-white break-all">{config.bridgeUrl ? `${config.bridgeUrl}/webhook` : 'Aguardando URL do Bridge...'}</p>
          </div>
          <div>
            <p className="text-slate-500">Verify Token:</p>
            <p className="text-white font-bold">G3rPF002513</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
