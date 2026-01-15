
import React, { useState, useEffect } from 'react';
import { Campaign, Contact, IncomingMessage } from '../types.ts';

const StatCard: React.FC<{ title: string; value: string | number; trend: string; color: string }> = ({ title, value, trend, color }) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
    <p className="text-slate-500 text-sm font-medium mb-1">{title}</p>
    <div className="flex items-end justify-between">
      <h3 className="text-3xl font-bold text-slate-800">{value}</h3>
      <span className={`text-xs font-bold px-2 py-1 rounded-full ${trend === '0%' || trend === '0' ? 'bg-slate-50 text-slate-400' : trend.startsWith('+') ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
        {trend}
      </span>
    </div>
  </div>
);

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({
    totalSent: 0,
    deliveryRate: '0%',
    activeCampaigns: 0,
    newLeads: 0,
    recentActivity: [] as any[]
  });

  useEffect(() => {
    const loadStats = () => {
      try {
        const campaignsRaw = localStorage.getItem('wb_campaigns');
        const messagesRaw = localStorage.getItem('wb_incoming');
        const contactsRaw = localStorage.getItem('wb_contacts');

        const campaigns: Campaign[] = campaignsRaw ? JSON.parse(campaignsRaw) : [];
        const messages: IncomingMessage[] = messagesRaw ? JSON.parse(messagesRaw) : [];
        const contacts: Contact[] = contactsRaw ? JSON.parse(contactsRaw) : [];

        if (!Array.isArray(campaigns) || !Array.isArray(messages) || !Array.isArray(contacts)) {
           return;
        }

        const totalSent = campaigns.reduce((acc, c) => acc + (Number(c.sentCount) || 0), 0);
        const totalPlanned = campaigns.reduce((acc, c) => acc + (Number(c.totalContacts) || 0), 0);
        const deliveryRate = totalPlanned > 0 ? Math.round((totalSent / totalPlanned) * 100) + '%' : '0%';
        const activeCampaigns = campaigns.filter(c => c.status === 'running' || c.status === 'draft').length;
        const newLeads = contacts.filter(c => c.group && c.group.toLowerCase().includes('lead')).length;

        const recent = [...messages]
          .filter(m => !m.isMe)
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 5);

        setStats({ totalSent, deliveryRate, activeCampaigns, newLeads, recentActivity: recent });
      } catch (e) {
        console.error("Falha ao processar estatísticas:", e);
      }
    };

    loadStats();
    window.addEventListener('storage', loadStats);
    return () => window.removeEventListener('storage', loadStats);
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 px-4 md:px-0">
        <StatCard title="Total Enviado" value={stats.totalSent} trend={`+${stats.totalSent > 0 ? '100' : '0'}%`} color="emerald" />
        <StatCard title="Taxa de Entrega" value={stats.deliveryRate} trend="Estável" color="blue" />
        <StatCard title="Leads Capturados" value={stats.newLeads} trend={`+${stats.newLeads}`} color="amber" />
        <StatCard title="Campanhas Ativas" value={stats.activeCampaigns} trend={stats.activeCampaigns.toString()} color="indigo" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 px-4 md:px-0">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6 uppercase text-xs tracking-widest text-slate-400">Atividade em Tempo Real</h3>
          <div className="h-48 bg-slate-50 rounded-xl flex items-center justify-center border border-dashed border-slate-200 relative overflow-hidden">
             <div className="absolute inset-0 flex items-end px-4 pb-4 gap-2 opacity-20">
                {[40, 70, 55, 90, 65, 85, 100, 30, 60].map((h, i) => (
                  <div key={i} className="flex-1 bg-emerald-500 rounded-t-sm" style={{ height: `${h}%` }}></div>
                ))}
             </div>
             <p className="text-slate-400 text-xs font-bold relative z-10">DADOS DINÂMICOS DA API</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6 text-xs uppercase tracking-widest text-slate-400">Últimas Interações</h3>
          <div className="space-y-4">
            {stats.recentActivity.length === 0 ? (
              <p className="text-center text-slate-400 text-[10px] py-10 uppercase font-black">Nenhuma atividade</p>
            ) : (
              stats.recentActivity.map((m, i) => (
                <div key={i} className="flex gap-3 items-center border-b border-slate-50 pb-3 last:border-0">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400">
                    {m.fromName ? m.fromName.charAt(0) : '+'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black text-slate-700 truncate">{m.fromName || `+${m.from}`}</p>
                    <p className="text-[10px] text-slate-400 truncate font-medium">{m.text}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
