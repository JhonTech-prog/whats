
import React, { useState, useEffect, useRef } from 'react';
import AuthModal from './components/AuthModal';
import { HashRouter, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout.tsx';
import Dashboard from './pages/Dashboard.tsx';
import NewCampaign from './pages/NewCampaign.tsx';
import Settings from './pages/Settings.tsx';
import Inbox from './pages/Inbox.tsx';
import Automation from './pages/Automation.tsx';
import { Contact, Campaign } from './types.ts';

// Helper universal para gerar IDs únicos sem depender exclusivamente do crypto.randomUUID (que falha em HTTP)
export const safeGenerateId = () => {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch (e) {}
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
};

// Componente para forçar o Inbox no Mobile
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
    } catch (e) {
      console.error("Erro ao ler campanhas do localStorage", e);
    }
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

      <div className="bg-white p-4 md:p-8 rounded-2xl border border-slate-200 shadow-sm mx-4 md:mx-0">
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
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [testingId, setTestingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = () => {
      try {
        const saved = localStorage.getItem('wb_contacts');
        if (saved) {
          const parsed = JSON.parse(saved);
          setContacts(Array.isArray(parsed) ? parsed : []);
        }
      } catch (e) {}
    };
    load();
    window.addEventListener('storage', load);
    return () => window.removeEventListener('storage', load);
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
    setSelectedIds(new Set());
    window.dispatchEvent(new Event('storage'));
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

  const toggleSelectAll = () => {
    if (selectedIds.size === contacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contacts.map(c => c.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedIds(newSelection);
  };

  const deleteSelected = () => {
    if (!confirm(`Deseja remover ${selectedIds.size} contatos selecionados?`)) return;
    const remaining = contacts.filter(c => !selectedIds.has(c.id));
    saveContacts(remaining);
  };

  const handleEdit = (contact: Contact) => {
    setEditingContact(contact);
    setNewName(contact.name);
    setNewPhone(contact.phone);
    setIsModalOpen(true);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const newContacts: Contact[] = [];
        if (file.name.endsWith('.vcf')) {
          const cards = content.split('BEGIN:VCARD');
          cards.forEach(card => {
            const nameMatch = card.match(/FN:(.*)/);
            const telMatch = card.match(/TEL.*:(.*)/);
            const rawName = nameMatch ? nameMatch[1].trim() : 'Contato VCF';
            if (telMatch) {
              newContacts.push({
                id: safeGenerateId(),
                name: rawName,
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
              const rawName = parts[0].trim().replace(/"/g, '');
              newContacts.push({
                id: safeGenerateId(),
                name: rawName,
                phone: formatPhoneForAPI(parts[1]),
                group: 'Arquivo CSV'
              });
            }
          });
        }
        const validContacts = newContacts.filter(c => c.phone.length >= 10);
        saveContacts([...validContacts, ...contacts]);
        alert(`${validContacts.length} contatos importados.`);
      } catch (err) {
        alert("Erro ao processar arquivo.");
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingContact(null);
    setNewName('');
    setNewPhone('');
  };

  return (
    <div className="bg-white p-4 md:p-8 rounded-2xl border border-slate-200 shadow-sm mx-4 md:mx-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Minha Agenda</h2>
          <p className="text-sm text-slate-500">Contatos manuais e leads capturados pelo chat.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedIds.size > 0 && (
            <button 
              onClick={deleteSelected}
              className="bg-rose-50 text-rose-600 px-4 py-2 rounded-lg text-xs font-bold border border-rose-100"
            >
              Remover ({selectedIds.size})
            </button>
          )}
          <input type="file" ref={fileInputRef} onChange={handleFileImport} accept=".vcf,.csv" className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg text-xs font-bold border border-slate-200">📁 Arquivo</button>
          <button onClick={() => { setEditingContact(null); setIsModalOpen(true); }} className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-lg shadow-emerald-100">+ Manual</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="pb-4 w-10">
                <input 
                  type="checkbox" 
                  checked={contacts.length > 0 && selectedIds.size === contacts.length}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="pb-4 text-xs font-bold text-slate-400 uppercase">Nome</th>
              <th className="pb-4 text-xs font-bold text-slate-400 uppercase">WhatsApp</th>
              <th className="pb-4 text-xs font-bold text-slate-400 uppercase text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {contacts.length === 0 ? (
              <tr><td colSpan={4} className="py-20 text-center text-slate-400 italic">Nenhum contato encontrado.</td></tr>
            ) : (
              contacts.map(c => (
                <tr key={c.id} className={`hover:bg-slate-50/80 transition-colors ${selectedIds.has(c.id) ? 'bg-emerald-50/30' : ''}`}>
                  <td className="py-4">
                    <input 
                      type="checkbox" 
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleSelect(c.id)}
                    />
                  </td>
                  <td className="py-4">
                    <p className="text-sm font-semibold text-slate-700">{c.name}</p>
                  </td>
                  <td className="py-4 text-sm text-emerald-600 font-mono">+{c.phone}</td>
                  <td className="py-4 text-right">
                    <button onClick={() => handleEdit(c)} className="p-1 text-slate-400 hover:text-emerald-500">✏️</button>
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
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <h3 className="text-lg font-bold mb-4">{editingContact ? 'Editar' : 'Novo'} Contato</h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formatted = formatPhoneForAPI(newPhone);
              if (formatted.length < 10) return alert("Número inválido.");
              if (editingContact) {
                saveContacts(contacts.map(c => c.id === editingContact.id ? { ...c, name: newName, phone: formatted } : c));
              } else {
                saveContacts([{ id: safeGenerateId(), name: newName, phone: formatted, group: 'Manual' }, ...contacts]);
              }
              closeModal();
            }} className="space-y-4">
              <input required placeholder="Nome" value={newName} onChange={e => setNewName(e.target.value)} className="w-full p-3 bg-slate-50 border rounded-xl" />
              <input required placeholder="WhatsApp" value={newPhone} onChange={e => setNewPhone(e.target.value)} className="w-full p-3 bg-slate-50 border rounded-xl" />
              <div className="flex gap-2">
                <button type="button" onClick={closeModal} className="flex-1 py-3 text-slate-500 font-bold">Cancelar</button>
                <button type="submit" className="flex-1 py-3 bg-emerald-500 text-white font-bold rounded-xl">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};


const App: React.FC = () => {
  const [auth, setAuth] = useState<{
    phoneId: string;
    accessToken: string;
    apiUrl: string;
  } | null>(null);

  useEffect(() => {
    // Tenta restaurar do localStorage
    const saved = localStorage.getItem('wjtauth');
    if (saved) {
      try {
        setAuth(JSON.parse(saved));
      } catch {}
    }
  }, []);

  const handleAuth = (data: { phoneId: string; accessToken: string; apiUrl: string }) => {
    setAuth(data);
    localStorage.setItem('wjtauth', JSON.stringify(data));
  };

  return (
    <>
      <AuthModal isOpen={!auth} onSubmit={handleAuth} />
      {auth && (
        <HashRouter>
          <MobileRedirectHandler>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/inbox" element={<Inbox auth={auth} />} />
                <Route path="/automation" element={<Automation />} />
                <Route path="/campaigns" element={<Campaigns />} />
                <Route path="/campaigns/new" element={<NewCampaign />} />
                <Route path="/contacts" element={<Contacts />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </Layout>
          </MobileRedirectHandler>
        </HashRouter>
      )}
    </>
  );
};

export default App;
