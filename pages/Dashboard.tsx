
import React, { useState, useEffect } from 'react';
import { Campaign } from '../types';

const StatCard: React.FC<{ title: string; value: string | number; trend: string; color: string }> = ({ title, value, trend, color }) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all group">
    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">{title}</p>
    <div className="flex items-end justify-between">
      <h3 className="text-3xl font-black text-slate-800 tracking-tight">{value}</h3>
      <span className={`text-[10px] font-black px-2 py-1 rounded-full ${
        trend === '0%' || trend === '0' ? 'bg-slate-50 text-slate-400' : 
        trend.startsWith('+') || parseFloat(trend) > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
      }`}>
        {trend}
      </span>
    </div>
    <div className={`h-1 w-full mt-4 rounded-full bg-slate-50 overflow-hidden`}>
        <div className={`h-full bg-${color}-500 transition-all duration-1000`} style={{ width: '60%' }}></div>
    </div>
  </div>
);

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({
    totalSent: 0,
    deliveryRate: '0%',
    activeCampaigns: 0,
    failures: 0,
    recentActivity: [] as Campaign[]
  });

  useEffect(() => {
    const loadStats = () => {
      const savedCampaigns = localStorage.getItem('wb_campaigns');
      if (savedCampaigns) {
        const campaigns: Campaign[] = JSON.parse(savedCampaigns);
        
        const totalSent = campaigns.reduce((acc, c) => acc + (c.sentCount || 0), 0);
        const totalPlanned = campaigns.reduce((acc, c) => acc + (c.totalContacts || 0), 0);
        const failures = totalPlanned - totalSent;
        
        const rate = totalPlanned > 0 
          ? ((totalSent / totalPlanned) * 100).toFixed(1) + '%' 
          : '0%';

        setStats({
          totalSent,
          deliveryRate: rate,
          activeCampaigns: campaigns.length,
          failures,
          recentActivity: campaigns.slice(0, 5) // Pega as 5 últimas
        });
      }
    };

    loadStats();
    // Atualiza se houver mudanças no storage (ex: terminou uma campanha em outra aba)
    window.addEventListener('storage', loadStats);
    return () => window.removeEventListener('storage', loadStats);
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Enviado" value={stats.totalSent} trend={`+${stats.totalSent}`} color="emerald" />
        <StatCard title="Taxa de Entrega" value={stats.deliveryRate} trend={parseFloat(stats.deliveryRate) > 90 ? 'Excelente' : 'Normal'} color="blue" />
        <StatCard title="Total Campanhas" value={stats.activeCampaigns} trend={stats.activeCampaigns.toString()} color="amber" />
        <StatCard title="Falhas de Envio" value={stats.failures} trend={stats.failures > 0 ? `-${stats.failures}` : '0'} color="rose" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="font-bold text-slate-800">Desempenho Geral</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Volume de disparos por campanha</p>
            </div>
          </div>
          
          <div className="h-64 flex items-end justify-between gap-2 px-4 pb-4">
            {stats.recentActivity.length > 0 ? (
              stats.recentActivity.reverse().map((c, i) => (
                <div key={c.id} className="flex-1 flex flex-col items-center gap-2 group">
                  <div className="w-full bg-emerald-500/10 rounded-t-lg relative group-hover:bg-emerald-500/20 transition-all" 
                       style={{ height: `${Math.max((c.sentCount / (stats.totalSent || 1)) * 100, 10)}%` }}>
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[9px] px-2 py-1 rounded font-bold whitespace-nowrap">
                      {c.sentCount} envios
                    </div>
                  </div>
                  <span className="text-[8px] text-slate-400 font-bold uppercase truncate w-full text-center">{c.name.split(' ')[0]}</span>
                </div>
              ))
            ) : (
              <div className="w-full h-full bg-slate-50 rounded-xl flex items-center justify-center border border-dashed border-slate-300">
                <div className="text-center">
                  <span className="text-slate-400 block mb-2 text-2xl">📊</span>
                  <p className="text-slate-500 text-xs font-bold uppercase">Aguardando Campanhas</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            Atividade Recente
          </h3>
          <div className="space-y-4 flex-1">
            {stats.recentActivity.length === 0 ? (
              <div className="py-10 text-center text-slate-400 italic text-xs">
                Nenhuma campanha registrada.
              </div>
            ) : (
              stats.recentActivity.map(c => (
                <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm text-sm">
                    {c.status === 'completed' ? '✅' : '⏳'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{c.name}</p>
                    <p className="text-[9px] text-slate-400 font-medium uppercase">
                      {new Date(c.createdAt).toLocaleDateString()} • {c.sentCount} envios
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
          <button 
            disabled={stats.recentActivity.length === 0}
            className={`w-full mt-6 py-3 text-xs font-bold border rounded-xl transition-all ${
              stats.recentActivity.length > 0 
                ? 'border-emerald-100 text-emerald-600 bg-emerald-50 hover:bg-emerald-100' 
                : 'border-slate-100 text-slate-300 cursor-not-allowed'
            }`}
          >
            {stats.recentActivity.length > 0 ? 'Ver Histórico Completo' : 'Sem atividades'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
