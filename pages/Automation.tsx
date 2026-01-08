
import React, { useState, useEffect } from 'react';
import { AutomationSettings } from '../types';

const Automation: React.FC = () => {
  const [settings, setSettings] = useState<AutomationSettings>({
    enabled: false,
    welcomeMessage: { enabled: false, text: 'Olá! Seja bem-vindo ao nosso atendimento.' },
    officeHours: { enabled: false, start: '08:00', end: '18:00', awayMessage: 'No momento estamos fora do horário de atendimento. Retornaremos em breve!' },
    keywords: { enabled: false, rules: [{ trigger: 'cardapio', response: 'Aqui está o nosso cardápio digital: https://meumenu.com' }] }
  });
  const [saveStatus, setSaveStatus] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('wb_automation_settings');
    if (saved) setSettings(JSON.parse(saved));
  }, []);

  const handleSave = () => {
    localStorage.setItem('wb_automation_settings', JSON.stringify(settings));
    setSaveStatus(true);
    setTimeout(() => setSaveStatus(false), 2000);
  };

  const addKeywordRule = () => {
    setSettings({
      ...settings,
      keywords: {
        ...settings.keywords,
        rules: [...settings.keywords.rules, { trigger: '', response: '' }]
      }
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Automação de Respostas</h2>
          <p className="text-sm text-slate-500">Configure como o sistema deve responder sozinho.</p>
        </div>
        <button 
          onClick={() => setSettings({...settings, enabled: !settings.enabled})}
          className={`px-6 py-2 rounded-full font-bold text-xs uppercase tracking-widest transition-all ${settings.enabled ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}
        >
          {settings.enabled ? 'Robô Ativo' : 'Robô Desligado'}
        </button>
      </div>

      <div className={`space-y-6 transition-all ${!settings.enabled ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
        {/* Boas Vindas */}
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between mb-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">👋 Mensagem de Boas-Vindas</h3>
            <input type="checkbox" checked={settings.welcomeMessage.enabled} onChange={e => setSettings({...settings, welcomeMessage: {...settings.welcomeMessage, enabled: e.target.checked}})} />
          </div>
          <textarea 
            value={settings.welcomeMessage.text}
            onChange={e => setSettings({...settings, welcomeMessage: {...settings.welcomeMessage, text: e.target.value}})}
            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            rows={2}
          />
        </div>

        {/* Horário de Atendimento */}
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between mb-6">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">⏰ Horário de Atendimento</h3>
            <input type="checkbox" checked={settings.officeHours.enabled} onChange={e => setSettings({...settings, officeHours: {...settings.officeHours, enabled: e.target.checked}})} />
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Início</label>
              <input type="time" value={settings.officeHours.start} onChange={e => setSettings({...settings, officeHours: {...settings.officeHours, start: e.target.value}})} className="w-full p-2 bg-slate-50 border rounded-lg" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Fim</label>
              <input type="time" value={settings.officeHours.end} onChange={e => setSettings({...settings, officeHours: {...settings.officeHours, end: e.target.value}})} className="w-full p-2 bg-slate-50 border rounded-lg" />
            </div>
          </div>
          <label className="text-[10px] font-bold text-slate-400 uppercase">Mensagem de Ausência (Fora de Horário)</label>
          <textarea 
            value={settings.officeHours.awayMessage}
            onChange={e => setSettings({...settings, officeHours: {...settings.officeHours, awayMessage: e.target.value}})}
            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none mt-1"
            rows={2}
          />
        </div>

        {/* Palavras Chave / Cardápio */}
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between mb-6">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">🔗 Palavras-Chave (Ex: Cardápio)</h3>
            <input type="checkbox" checked={settings.keywords.enabled} onChange={e => setSettings({...settings, keywords: {...settings.keywords, enabled: e.target.checked}})} />
          </div>
          <div className="space-y-4">
            {settings.keywords.rules.map((rule, idx) => (
              <div key={idx} className="flex gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100 items-start">
                <div className="w-1/3">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Se o cliente digitar:</label>
                  <input 
                    type="text" 
                    value={rule.trigger} 
                    onChange={e => {
                      const newRules = [...settings.keywords.rules];
                      newRules[idx].trigger = e.target.value;
                      setSettings({...settings, keywords: {...settings.keywords, rules: newRules}});
                    }}
                    placeholder="cardapio" 
                    className="w-full p-2 border rounded-lg text-sm" 
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">O robô responde:</label>
                  <textarea 
                    value={rule.response} 
                    onChange={e => {
                      const newRules = [...settings.keywords.rules];
                      newRules[idx].response = e.target.value;
                      setSettings({...settings, keywords: {...settings.keywords, rules: newRules}});
                    }}
                    placeholder="Olá! Veja nosso cardápio aqui..." 
                    className="w-full p-2 border rounded-lg text-sm" 
                    rows={2}
                  />
                </div>
                <button 
                  onClick={() => {
                    const newRules = settings.keywords.rules.filter((_, i) => i !== idx);
                    setSettings({...settings, keywords: {...settings.keywords, rules: newRules}});
                  }}
                  className="mt-6 text-slate-300 hover:text-rose-500"
                >✕</button>
              </div>
            ))}
            <button onClick={addKeywordRule} className="text-xs font-bold text-emerald-600 hover:underline">+ Adicionar Nova Regra</button>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <button 
          onClick={handleSave}
          className="bg-slate-800 text-white px-10 py-4 rounded-2xl font-bold shadow-xl hover:bg-slate-900 transition-all active:scale-95"
        >
          {saveStatus ? 'Configurações Salvas! ✓' : 'Salvar Automações'}
        </button>
      </div>
    </div>
  );
};

export default Automation;
