
import React, { useState, useEffect } from 'react';

const Settings: React.FC = () => {
  const [senderName, setSenderName] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [phoneId, setPhoneId] = useState('');
  const [bridgeUrl, setBridgeUrl] = useState('');
  const [saveStatus, setSaveStatus] = useState(false);
  const [isTestingBridge, setIsTestingBridge] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<{ type: 'idle' | 'success' | 'error' | 'warning', message: string, debug?: string }>({ type: 'idle', message: '' });

  useEffect(() => {
    const config = localStorage.getItem('wb_sender_config');
    if (config) {
      const parsed = JSON.parse(config);
      setSenderName(parsed.name || '');
      setSenderPhone(parsed.phone || '');
      setAccessToken(parsed.accessToken || '');
      setPhoneId(parsed.phoneId || '');
      setBridgeUrl(parsed.bridgeUrl || '');
    }
  }, []);

  const testBridge = async () => {
    if (!bridgeUrl) return;
    const cleanUrl = bridgeUrl.trim();
    const dataUrl = cleanUrl.endsWith('/messages') ? cleanUrl : (cleanUrl.endsWith('/') ? cleanUrl + 'messages' : cleanUrl + '/messages');
    
    setIsTestingBridge(true);
    setBridgeStatus({ type: 'warning', message: 'Conectando ao Render...' });

    try {
      const response = await fetch(dataUrl);
      const data = await response.json();

      if (Array.isArray(data)) {
        setBridgeStatus({ 
          type: 'success', 
          message: 'PONTE CONECTADA!', 
          debug: `Sucesso! O servidor respondeu com uma lista de ${data.length} mensagens.` 
        });
      } else {
        setBridgeStatus({ type: 'error', message: 'FORMATO INVÁLIDO', debug: 'O servidor respondeu, mas não retornou uma lista [].' });
      }
    } catch (err) {
      setBridgeStatus({ type: 'error', message: 'FALHA DE CONEXÃO', debug: 'Não foi possível falar com o servidor no Render. Verifique a URL.' });
    } finally {
      setIsTestingBridge(false);
    }
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const config = { name: senderName, phone: senderPhone, accessToken, phoneId, bridgeUrl: bridgeUrl.trim() };
    localStorage.setItem('wb_sender_config', JSON.stringify(config));
    setSaveStatus(true);
    setTimeout(() => setSaveStatus(false), 3000);
    window.dispatchEvent(new Event('senderConfigUpdated'));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 mb-6">Configurações da API Oficial</h3>
        
        <form onSubmit={handleSaveConfig} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">URL da Ponte (Render)</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={bridgeUrl} 
                  onChange={(e) => setBridgeUrl(e.target.value)} 
                  className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs" 
                  placeholder="https://seu-app.onrender.com" 
                />
                <button type="button" onClick={testBridge} disabled={isTestingBridge} className="bg-slate-800 text-white px-6 py-3 rounded-xl text-xs font-bold hover:bg-slate-900 transition-all">
                  {isTestingBridge ? '...' : 'TESTAR URL'}
                </button>
              </div>
            </div>

            {bridgeStatus.message && (
              <div className={`p-4 rounded-2xl border ${
                bridgeStatus.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 
                bridgeStatus.type === 'warning' ? 'bg-amber-50 border-amber-100 text-amber-800' :
                'bg-rose-50 border-rose-100 text-rose-800'
              }`}>
                <p className="font-bold text-xs">{bridgeStatus.message}</p>
                {bridgeStatus.debug && <p className="text-[10px] mt-1 opacity-80">{bridgeStatus.debug}</p>}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div>
                 <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Phone ID</label>
                 <input type="text" value={phoneId} onChange={(e) => setPhoneId(e.target.value)} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none text-sm" placeholder="4123..." />
               </div>
               <div>
                 <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Access Token (Meta)</label>
                 <input type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none text-sm" placeholder="EAAB..." />
               </div>
            </div>
          </div>

          <button type="submit" className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">
            Salvar Configurações {saveStatus && '✓'}
          </button>
        </form>
      </div>

      <div className="bg-slate-900 text-white rounded-3xl p-8 border border-slate-800 shadow-xl">
        <h4 className="text-emerald-400 font-black text-sm mb-4 uppercase tracking-tighter flex items-center gap-2">
          <span>🔓</span> MODO DESENVOLVIMENTO: POR QUE NÃO RECEBO?
        </h4>
        <div className="space-y-4 text-xs leading-relaxed">
          <p className="text-slate-400 italic">Se o botão "Teste" da Meta chega na sua caixa de entrada, mas o seu celular não, o problema é este:</p>
          <ol className="list-decimal list-inside space-y-3">
            <li className="p-3 bg-slate-800 rounded-xl border border-slate-700">
              <strong>Adicione seu número como Testador:</strong> No Painel da Meta {' > '} WhatsApp {' > '} <strong>Configuração da API</strong>, procure o campo "Para" e adicione o seu número pessoal. Você deve validar o código que chegará no seu WhatsApp.
            </li>
            <li className="p-3 bg-slate-800 rounded-xl border border-slate-700">
              <strong>Mande mensagem para o número de teste:</strong> Você deve enviar mensagem <strong>PARA</strong> o número que a Meta te deu (o +1 555...). Se mandar para o seu número real de chip, a Meta bloqueia o Webhook.
            </li>
            <li className="p-3 bg-slate-800 rounded-xl border border-slate-700">
              <strong>Verify Token:</strong> No painel de Webhooks da Meta, o token de verificação deve ser exatamente: <code className="text-emerald-400 font-bold">G3rPF002513</code>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default Settings;
