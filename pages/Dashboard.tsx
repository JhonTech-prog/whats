
import React, { useState, useEffect } from 'react';
import { Campaign, Contact, IncomingMessage } from '../types.ts';

const StatCard: React.FC<{ title: string; value: string | number; trend: string; color: string }> = ({ title, value, trend, color }) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
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
    failures: 0,
    recentActivity: [] as any[]
  });

  useEffect(() => {
    const loadStats = () => {
      try {
        const campaignsRaw = localStorage.getItem('wb_campaigns');
        const messagesRaw = localStorage.getItem('wb_incoming');
        const campaigns: Campaign[] = campaignsRaw ? JSON.parse(campaignsRaw) : [];
        const messages: IncomingMessage[] = messagesRaw ? JSON.parse(messagesRaw) : [];

        if (Array.isArray(campaigns)) {
          const totalSent = campaigns.reduce((acc, c) => acc + (Number(c.sentCount) || 0), 0);
          const totalPlanned = campaigns.reduce((acc, c) => acc + (Number(c.totalContacts) || 0), 0);
          const deliveryRate = totalPlanned > 0 ? Math.round((totalSent / totalPlanned) * 100) + '%' : '0%';
          const activeCampaigns = campaigns.filter(c => c.status === 'running' || c.status === 'draft').length;
          
          setStats(prev => ({
            ...prev,
            totalSent,
            deliveryRate,
            activeCampaigns,
            recentActivity: Array.isArray(messages) ? messages.filter(m => !m.isMe).slice(-5).reverse() : []
          }));
        }
      } catch (e) {
        console.error("Dashboard stats error:", e);
      }
    };

    loadStats();
    window.addEventListener('storage', loadStats);
    return () => window.removeEventListener('storage', loadStats);
  }, []);

  return (
    <div className="space-y-6 px-4 md:px-0 pb-10">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Enviado" value={stats.totalSent} trend={`+${stats.totalSent > 0 ? '100' : '0'}%`} color="emerald" />
        <StatCard title="Taxa de Entrega" value={stats.deliveryRate} trend="Estável" color="blue" />
        <StatCard title="Campanhas Ativas" value={stats.activeCampaigns} trend={stats.activeCampaigns.toString()} color="amber" />
        <StatCard title="Mensagens Recebidas" value={stats.recentActivity.length} trend="Ativo" color="indigo" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800">Desempenho das Campanhas</h3>
          </div>
          <div className="h-64 bg-slate-50 rounded-xl flex items-center justify-center border border-dashed border-slate-300">
            {stats.totalSent > 0 ? (
               <div className="w-full px-10 flex items-end justify-between h-40 gap-2">
                 {[40, 70, 45, 90, 65, 80, 100].map((h, i) => (
                   <div key={i} className="flex-1 bg-emerald-100 rounded-t-lg transition-all hover:bg-emerald-500" style={{ height: `${h}%` }}></div>
                 ))}
               </div>
            ) : (
               <div className="text-center">
                 <span className="text-slate-400 block mb-2">📊 Aguardando dados...</span>
                 <p className="text-slate-500 text-sm">Inicie uma campanha para ver as análises aqui.</p>
               </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6">Atividade Recente</h3>
          <div className="space-y-4">
            {stats.recentActivity.length === 0 ? (
              <div className="py-10 text-center text-slate-400 italic text-xs">Nenhuma atividade registrada hoje.</div>
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
