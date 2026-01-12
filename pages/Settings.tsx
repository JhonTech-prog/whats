
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

      if (Array.isArray(data) || data.messages || data.entry) {
        setBridgeStatus({ 
          type: 'success', 
          message: 'PONTE CONECTADA!', 
          debug: 'Sucesso! O servidor respondeu com dados válidos.' 
        });
      } else {
        setBridgeStatus({ type: 'error', message: 'FORMATO ESTRANHO', debug: 'O servidor respondeu, mas não parece ser a lista de mensagens.' });
      }
    } catch (err) {
      setBridgeStatus({ type: 'error', message: 'FALHA DE CONEXÃO', debug: 'Não foi possível falar com o servidor no Render. Verifique a URL.' });
    } finally {
      setIsTestingBridge(false);
    }
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const config = { name: senderName, phone: senderPhone, accessToken: accessToken.trim(), phoneId: phoneId.trim(), bridgeUrl: bridgeUrl.trim() };
    localStorage.setItem('wb_sender_config', JSON.stringify(config));
    setSaveStatus(true);
    setTimeout(() => setSaveStatus(false), 3000);
    window.dispatchEvent(new Event('senderConfigUpdated'));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 mb-6">Configurações da API Oficial (Meta)</h3>
        
        <form onSubmit={handleSaveConfig} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">URL da Ponte Webhook (Render)</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={bridgeUrl} 
                  onChange={(e) => setBridgeUrl(e.target.value)} 
                  className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs" 
                  placeholder="https://seu-app-webhook.onrender.com" 
                />
                <button type="button" onClick={testBridge} disabled={isTestingBridge} className="bg-slate-800 text-white px-6 py-3 rounded-xl text-xs font-bold hover:bg-slate-900 transition-all">
                  {isTestingBridge ? '...' : 'TESTAR'}
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
                 <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Phone Number ID</label>
                 <input type="text" value={phoneId} onChange={(e) => setPhoneId(e.target.value)} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none text-sm font-mono" placeholder="Ex: 412345678901234" />
               </div>
               <div>
                 <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Token de Acesso Permanente</label>
                 <input type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none text-sm font-mono" placeholder="EAAB..." />
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
          <span>🚨</span> CHECKLIST PARA FUNCIONAMENTO TOTAL
        </h4>
        <div className="space-y-4 text-xs leading-relaxed">
          <ol className="list-decimal list-inside space-y-3">
            <li className="p-3 bg-slate-800 rounded-xl border border-slate-700">
              <strong>Número de Teste:</strong> Na Meta, você SÓ pode responder para números que foram autorizados manualmente como "Testadores" (máximo 5 números).
            </li>
            <li className="p-3 bg-slate-800 rounded-xl border border-slate-700">
              <strong>Formato do Número:</strong> Para responder, o número deve ser apenas dígitos com código do país (ex: 5511999998888). O sistema agora limpa isso automaticamente.
            </li>
            <li className="p-3 bg-slate-800 rounded-xl border border-slate-700">
              <strong>Verify Token no Webhook:</strong> Se estiver configurando o Render, o token de verificação deve ser: <code className="text-emerald-400 font-bold">G3rPF002513</code>
            </li>
            <li className="p-3 bg-slate-800 rounded-xl border border-slate-700">
              <strong>Janela de 24h:</strong> Você só pode enviar mensagens de texto livre se o cliente mandou uma mensagem para você nas últimas 24 horas. Caso contrário, use um <strong>Template</strong>.
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default Settings;
