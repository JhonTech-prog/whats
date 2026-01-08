
import React, { useState, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, Link } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import NewCampaign from './pages/NewCampaign';
import Settings from './pages/Settings';
import Inbox from './pages/Inbox';
import Automation from './pages/Automation';
import { Contact, Campaign } from './types';

const Campaigns = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('wb_campaigns');
    if (saved) setCampaigns(JSON.parse(saved));
  }, []);

  const deleteCampaign = (id: string) => {
    if(!confirm("Deseja excluir esta campanha do histórico?")) return;
    const updated = campaigns.filter(c => c.id !== id);
    setCampaigns(updated);
    localStorage.setItem('wb_campaigns', JSON.stringify(updated));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Minhas Campanhas</h2>
          <p className="text-slate-500 text-sm">Gerencie seus disparos agendados e concluídos.</p>
        </div>
        <Link to="/campaigns/new" className="bg-emerald-500 text-white px-6 py-2 rounded-xl font-bold shadow-lg shadow-emerald-100 hover:bg-emerald-600 transition-all">+ Nova Campanha</Link>
      </div>

      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
        <div className="space-y-4">
          {campaigns.length === 0 ? (
            <div className="py-20 text-center text-slate-400 italic">
              <p className="text-4xl mb-4">🚀</p>
              <p>Nenhuma campanha realizada ainda.</p>
              <Link to="/campaigns/new" className="text-emerald-500 font-bold mt-2 inline-block">Criar minha primeira campanha</Link>
            </div>
          ) : (
            campaigns.map(c => (
              <div key={c.id} className="flex items-center justify-between p-5 border border-slate-100 rounded-2xl hover:border-emerald-200 transition-all hover:shadow-sm">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg ${c.status === 'completed' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                    {c.status === 'completed' ? '✓' : '📝'}
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-slate-800">{c.name}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{new Date(c.createdAt).toLocaleDateString()}</p>
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${c.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                        {c.status === 'completed' ? 'Concluída' : 'Rascunho'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right hidden sm:block">
                    <p className="text-xs font-bold text-slate-700">{c.sentCount} / {c.totalContacts}</p>
                    <p className="text-[10px] text-slate-400 uppercase">Enviados</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => deleteCampaign(c.id)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors">✕</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

const Contacts = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('wb_contacts');
    if (saved) setContacts(JSON.parse(saved));
  }, []);

  const saveContacts = (newList: Contact[]) => {
    const uniqueMap = new Map();
    newList.forEach(c => {
      if (!uniqueMap.has(c.phone)) {
        uniqueMap.set(c.phone, c);
      }
    });
    const deduped = Array.from(uniqueMap.values());
    setContacts(deduped);
    localStorage.setItem('wb_contacts', JSON.stringify(deduped));
    return deduped.length;
  };

  const formatPhoneForAPI = (value: string) => {
    let digits = value.replace(/\D/g, '');
    if (digits.startsWith('0')) digits = digits.substring(1);
    if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
      digits = '55' + digits;
    }
    return digits;
  };

  const handleImportFromPhone = async () => {
    if (!('contacts' in navigator)) {
      alert("API de agenda não suportada neste navegador.");
      return;
    }
    try {
      // @ts-ignore
      const results = await navigator.contacts.select(['name', 'tel'], { multiple: true });
      if (results?.length > 0) {
        const imported = results.map((res: any) => ({
          id: crypto.randomUUID(),
          name: res.name?.[0] || 'Sem Nome',
          phone: formatPhoneForAPI(res.tel?.[0] || ''),
          group: 'Agenda Celular'
        })).filter((c: Contact) => c.phone.length >= 12);
        
        const count = saveContacts([...imported, ...contacts]);
        alert(`Processado! Agora você tem ${count} contatos únicos.`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const newContacts: Contact[] = [];
      if (file.name.endsWith('.vcf')) {
        const cards = content.split('BEGIN:VCARD');
        cards.forEach(card => {
          const nameMatch = card.match(/FN:(.*)/);
          const telMatch = card.match(/TEL.*:(.*)/);
          if (telMatch) {
            newContacts.push({
              id: crypto.randomUUID(),
              name: nameMatch ? nameMatch[1].trim() : 'Importado VCF',
              phone: formatPhoneForAPI(telMatch[1]),
              group: 'Arquivo VCF'
            });
          }
        });
      } else if (file.name.endsWith('.csv')) {
        const lines = content.split('\n');
        lines.forEach(line => {
          const parts = line.split(/[,;]/);
          if (parts.length >= 2) {
            newContacts.push({
              id: crypto.randomUUID(),
              name: parts[0].trim().replace(/"/g, ''),
              phone: formatPhoneForAPI(parts[1]),
              group: 'Arquivo CSV'
            });
          }
        });
      }
      const validContacts = newContacts.filter(c => c.phone.length >= 12);
      saveContacts([...validContacts, ...contacts]);
      setIsProcessing(false);
      alert(`${validContacts.length} contatos importados.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const sendTest = async (contact: Contact) => {
    const config = JSON.parse(localStorage.getItem('wb_sender_config') || '{}');
    if (!config.accessToken || !config.phoneId) {
      alert("⚠️ SIMULAÇÃO: Para enviar uma mensagem real, configure o 'Token' e o 'Phone ID' da Meta em Configurações.");
      setTestingId(contact.id);
      await new Promise(r => setTimeout(r, 1000));
      setTestingId(null);
      return;
    }
    setTestingId(contact.id);
    try {
      const response = await fetch(`https://graph.facebook.com/v21.0/${config.phoneId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: contact.phone,
          type: "template",
          template: {
            name: "hello_world",
            language: { code: "en_US" }
          }
        })
      });
      if (response.ok) {
        alert("✅ SUCESSO REAL!\nMensagem de teste enviada.");
      } else {
        const result = await response.json();
        alert(`❌ ERRO NA API DA META:\n${result.error?.message || 'Erro desconhecido'}`);
      }
    } catch (error) {
      alert("❌ ERRO DE CONEXÃO:\nNão foi possível alcançar os servidores da Meta.");
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Meus Contatos</h2>
          <p className="text-sm text-slate-500">Banco de dados local do navegador</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input type="file" ref={fileInputRef} onChange={handleFileImport} accept=".vcf,.csv" className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg text-xs font-bold border border-slate-200">📁 Arquivo</button>
          <button onClick={handleImportFromPhone} className="bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-lg shadow-indigo-100">📱 Agenda</button>
          <button onClick={() => setIsModalOpen(true)} className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-bold">+ Manual</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="pb-4 text-xs font-bold text-slate-400 uppercase">Nome</th>
              <th className="pb-4 text-xs font-bold text-slate-400 uppercase">WhatsApp</th>
              <th className="pb-4 text-xs font-bold text-slate-400 uppercase text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {contacts.length === 0 ? (
              <tr><td colSpan={3} className="py-20 text-center text-slate-400 italic">Nenhum contato.</td></tr>
            ) : (
              contacts.map(c => (
                <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-4 text-sm font-semibold text-slate-700">{c.name}</td>
                  <td className="py-4 text-sm text-emerald-600 font-mono">+{c.phone}</td>
                  <td className="py-4 text-right">
                    <button 
                      disabled={!!testingId} 
                      onClick={() => sendTest(c)} 
                      className={`text-[10px] px-3 py-1.5 rounded-md font-bold transition-all ${
                        testingId === c.id ? 'bg-slate-100 text-slate-400' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                      }`}
                    >
                      {testingId === c.id ? 'ENVIANDO...' : 'TESTAR'}
                    </button>
                    <button onClick={() => saveContacts(contacts.filter(x => x.id !== c.id))} className="ml-2 text-slate-300 hover:text-rose-500">✕</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 border border-slate-200 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Adicionar Manual</h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formatted = formatPhoneForAPI(newPhone);
              if (formatted.length < 12) return alert("Número inválido.");
              saveContacts([{ id: crypto.randomUUID(), name: newName, phone: formatted, group: 'Manual' }, ...contacts]);
              setNewName(''); setNewPhone(''); setIsModalOpen(false);
            }} className="space-y-4">
              <input required type="text" placeholder="Nome" value={newName} onChange={e => setNewName(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none" />
              <input required type="text" placeholder="DDD + Número" value={newPhone} onChange={e => setNewPhone(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none" />
              <div className="flex gap-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 text-slate-500 font-bold">Cancelar</button>
                <button type="submit" className="flex-1 py-3 bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-100">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/automation" element={<Automation />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/campaigns/new" element={<NewCampaign />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
};

export default App;
