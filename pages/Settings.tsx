
import React, { useState, useEffect } from 'react';

const Settings: React.FC = () => {
  const [config, setConfig] = useState({
    name: '',
    phone: '',
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
    localStorage.setItem('wb_sender_config', JSON.stringify(config));
    setSaveStatus(true);
    setTimeout(() => setSaveStatus(false), 2000);
    window.dispatchEvent(new Event('senderConfigUpdated'));
  };

  return (
    <div className="max-w-2xl mx-auto bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
      <h2 className="text-xl font-bold mb-6">Configurações API Meta</h2>
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase mb-1">URL do Webhook (Render)</label>
          <input type="text" value={config.bridgeUrl} onChange={e => setConfig({...config, bridgeUrl: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none" placeholder="https://seu-app.onrender.com" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Phone ID</label>
            <input type="text" value={config.phoneId} onChange={e => setConfig({...config, phoneId: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Token Permanente</label>
            <input type="password" value={config.accessToken} onChange={e => setConfig({...config, accessToken: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none" />
          </div>
        </div>
        <button type="submit" className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold shadow-lg">
          {saveStatus ? 'Salvo! ✓' : 'Salvar Configurações'}
        </button>
      </form>
      <div className="mt-8 p-4 bg-slate-900 text-emerald-400 rounded-xl text-xs font-mono">
        <p>Token de Verificação Webhook:</p>
        <p className="font-bold text-white mt-1">G3rPF002513</p>
      </div>
    </div>
  );
};

export default Settings;
