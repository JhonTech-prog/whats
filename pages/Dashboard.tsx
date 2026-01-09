
import React from 'react';

const StatCard: React.FC<{ title: string; value: string; trend: string; color: string }> = ({ title, value, trend, color }) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
    <p className="text-slate-500 text-sm font-medium mb-1">{title}</p>
    <div className="flex items-end justify-between">
      <h3 className="text-3xl font-bold text-slate-800">{value}</h3>
      <span className={`text-xs font-bold px-2 py-1 rounded-full ${trend === '0%' ? 'bg-slate-50 text-slate-400' : trend.startsWith('+') ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
        {trend}
      </span>
    </div>
  </div>
);

const Dashboard: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Enviado" value="0" trend="0%" color="emerald" />
        <StatCard title="Taxa de Entrega" value="0%" trend="0%" color="blue" />
        <StatCard title="Campanhas Ativas" value="0" trend="0" color="amber" />
        <StatCard title="Falhas de Envio" value="0" trend="0%" color="rose" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800">Desempenho das Campanhas</h3>
            <select className="bg-slate-50 border border-slate-200 text-sm rounded-lg p-1 text-slate-600">
              <option>Últimos 7 dias</option>
              <option>Últimos 30 dias</option>
            </select>
          </div>
          <div className="h-64 bg-slate-50 rounded-xl flex items-center justify-center border border-dashed border-slate-300">
            <div className="text-center">
              <span className="text-slate-400 block mb-2">📊 Aguardando dados...</span>
              <p className="text-slate-500 text-sm">Inicie uma campanha para ver as análises aqui.</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6">Atividade Recente</h3>
          <div className="space-y-6">
            <div className="py-10 text-center text-slate-400 italic text-xs">
              Nenhuma atividade registrada hoje.
            </div>
          </div>
          <button className="w-full mt-6 py-2 text-sm text-slate-400 font-semibold border border-slate-100 rounded-lg cursor-not-allowed">
            Sem atividades para mostrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
