
import React, { useState, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout.tsx';
import Dashboard from './pages/Dashboard.tsx';
import NewCampaign from './pages/NewCampaign.tsx';
import Settings from './pages/Settings.tsx';
import Inbox from './pages/Inbox.tsx';
import Automation from './pages/Automation.tsx';
import { Contact, Campaign } from './types.ts';

// Helper para gerar ID seguro em qualquer ambiente (HTTPS ou não)
const generateId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

const MobileRedirectHandler: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const checkMobile = () => {
      if (window.innerWidth < 768 && location.pathname !== '/inbox') {
        navigate('/inbox');
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [location.pathname, navigate]);

  return <>{children}</>;
};

const Campaigns = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('wb_campaigns');
      if (saved) {
        const parsed = JSON.parse(saved);
        setCampaigns(Array.isArray(parsed) ? parsed : []);
      }
    } catch(e) { console.error("Erro ao carregar campanhas", e); }
  }, []);

  const deleteCampaign = (id: string) => {
    if(!confirm("Deseja excluir esta campanha do histórico?")) return;
    const updated = campaigns.filter(c => c.id !== id);
    setCampaigns(updated);
    localStorage.setItem('wb_campaigns', JSON.stringify(updated));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center px-4 md:px-0">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Minhas Campanhas</h2>
          <p className="text-slate-500 text-sm">Gerencie seus disparos agendados e concluídos.</p>
        </div>
        <Link to="/campaigns/new" className="bg-emerald-500 text-white px-6 py-2 rounded-xl font-bold shadow-lg shadow-emerald-100 hover:bg-emerald-600 transition-all">+ Nova</Link>
      </div>

      <div className="bg-white p-4 md:p-8 rounded-2xl border border-slate-200 shadow-sm">
        <div className="space-y-4">
          {campaigns.length === 0 ? (
            <div className="py-20 text-center text-slate-400 italic">
              <p className="text-4xl mb-4">🚀</p>
              <p>Nenhuma campanha realizada ainda.</p>
              <Link to="/campaigns/new" className="text-emerald-500 font-bold mt-2 inline-block">Criar minha primeira campanha</Link>
            </div>
          ) : (
            campaigns.map(c => (
              <div key={c.id} className="flex items-center justify-between p-4 border border-slate-100 rounded-2xl hover:border-emerald-200 transition-all">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${c.status === 'completed' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                    {c.status === 'completed' ? '✓' : '📝'}
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-sm">{c.name}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">{new Date(c.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
                <button onClick={() => deleteCampaign(c.id)} className="p-2 text-slate-300 hover:text-rose-500">✕</button>
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
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('wb_contacts');
      if (saved) {
        const parsed = JSON.parse(saved);
        setContacts(Array.isArray(parsed) ? parsed : []);
      }
    } catch(e) {}
  }, []);

  const saveContacts = (newList: Contact[]) => {
    const uniqueMap = new Map();
    newList.forEach(c => { if (!uniqueMap.has(c.phone)) uniqueMap.set(c.phone, c); });
    const deduped = Array.from(uniqueMap.values());
    setContacts(deduped);
    localStorage.setItem('wb_contacts', JSON.stringify(deduped));
    setSelectedIds(new Set());
    window.dispatchEvent(new Event('storage'));
  };

  const formatPhoneForAPI = (value: string) => {
    let digits = value.replace(/\D/g, '');
    if (digits.startsWith('0')) digits = digits.substring(1);
    if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) digits = '55' + digits;
    return digits;
  };

  return (
    <div className="bg-white p-4 md:p-8 rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <h2 className="text-xl font-bold text-slate-800">Minha Agenda</h2>
        <div className="flex flex-wrap gap-2">
          <input type="file" ref={fileInputRef} onChange={(e) => {
             const file = e.target.files?.[0];
             if (!file) return;
             const reader = new FileReader();
             reader.onload = (event) => {
               const content = event.target?.result as string;
               const imported: Contact[] = [];
               const lines = content.split('\n');
               lines.forEach(l => {
                 const p = l.split(/[,;]/);
                 if (p.length >= 2) imported.push({ id: generateId(), name: p[0].trim(), phone: formatPhoneForAPI(p[1]), group: 'Importado' });
               });
               saveContacts([...imported, ...contacts]);
             };
             reader.readAsText(file);
          }} className="hidden" accept=".csv" />
          <button onClick={() => fileInputRef.current?.click()} className="bg-slate-100 px-4 py-2 rounded-lg text-xs font-bold">Importar CSV</button>
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
            {contacts.map(c => (
              <tr key={c.id}>
                <td className="py-4 text-sm font-semibold text-slate-700">{c.name}</td>
                <td className="py-4 text-sm text-emerald-600">+{c.phone}</td>
                <td className="py-4 text-right">
                  <button onClick={() => saveContacts(contacts.filter(x => x.id !== c.id))} className="text-slate-300 hover:text-rose-500">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold mb-4">Novo Contato</h3>
            <input placeholder="Nome" value={newName} onChange={e => setNewName(e.target.value)} className="w-full p-3 bg-slate-50 border rounded-xl mb-3" />
            <input placeholder="WhatsApp (DDD + Número)" value={newPhone} onChange={e => setNewPhone(e.target.value)} className="w-full p-3 bg-slate-50 border rounded-xl mb-4" />
            <div className="flex gap-2">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 py-3 font-bold text-slate-400">Sair</button>
              <button onClick={() => {
                saveContacts([{ id: generateId(), name: newName, phone: formatPhoneForAPI(newPhone), group: 'Manual' }, ...contacts]);
                setIsModalOpen(false);
              }} className="flex-1 py-3 bg-emerald-500 text-white rounded-xl font-bold">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <HashRouter>
      <MobileRedirectHandler>
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
      </MobileRedirectHandler>
    </HashRouter>
  );
};

export default App;
