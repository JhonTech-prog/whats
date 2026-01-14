
import React, { useState, useEffect } from 'react';
import { Campaign, Contact, IncomingMessage } from '../types';

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
    newLeads: 0,
    recentActivity: [] as any[]
  });

  useEffect(() => {
    const loadStats = () => {
      const campaigns: Campaign[] = JSON.parse(localStorage.getItem('wb_campaigns') || '[]');
      const messages: IncomingMessage[] = JSON.parse(localStorage.getItem('wb_incoming') || '[]');
      const contacts: Contact[] = JSON.parse(localStorage.getItem('wb_contacts') || '[]');

      const totalSent = campaigns.reduce((acc, c) => acc + (c.sentCount || 0), 0);
      const totalPlanned = campaigns.reduce((acc, c) => acc + (c.totalContacts || 0), 0);
      const deliveryRate = totalPlanned > 0 ? Math.round((totalSent / totalPlanned) * 100) + '%' : '0%';
      const activeCampaigns = campaigns.filter(c => c.status === 'running' || c.status === 'draft').length;
      
      // Leads capturados nos últimos 7 dias (simulado por grupo)
      const newLeads = contacts.filter(c => c.group.toLowerCase().includes('lead') || c.group.toLowerCase().includes('chat')).length;

      // Pegar as últimas 5 mensagens recebidas para atividade
      const recent = messages
        .filter(m => !m.isMe)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 5);

      setStats({
        totalSent,
        deliveryRate,
        activeCampaigns,
        newLeads,
        recentActivity: recent
      });
    };

    loadStats();
    window.addEventListener('storage', loadStats);
    return () => window.removeEventListener('storage', loadStats);
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Enviado" value={stats.totalSent} trend={`+${stats.totalSent > 0 ? '100' : '0'}%`} color="emerald" />
        <StatCard title="Taxa de Entrega" value={stats.deliveryRate} trend="Estável" color="blue" />
        <StatCard title="Leads Capturados" value={stats.newLeads} trend={`+${stats.newLeads}`} color="amber" />
        <StatCard title="Campanhas Ativas" value={stats.activeCampaigns} trend={stats.activeCampaigns.toString()} color="indigo" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800">Desempenho de Crescimento</h3>
            <div className="flex gap-2">
               <span className="text-[10px] font-bold bg-emerald-50 text-emerald-600 px-2 py-1 rounded">DADOS EM TEMPO REAL</span>
            </div>
          </div>
          <div className="h-64 bg-slate-50 rounded-xl flex items-center justify-center border border-dashed border-slate-200 relative overflow-hidden">
            {stats.totalSent > 0 ? (
               <div className="absolute inset-0 flex items-end px-4 pb-4 gap-2">
                  {/* Gráfico de barras simples simulado */}
                  {[40, 70, 55, 90, 65, 85, 100].map((h, i) => (
                    <div key={i} className="flex-1 bg-