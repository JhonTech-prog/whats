
import React from 'react';

const StatCard: React.FC<{ title: string; value: string; trend: string; color: string }> = ({ title, value, trend, color }) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
    <p className="text-slate-500 text-sm font-medium mb-1">{title}</p>
    <div className="flex items-end justify-between">
      <h3 className="text-3xl font-bold text-slate-800">{value}</h3>
      <span className={`text-xs font-bold px-2 py-1 rounded-full ${trend.startsWith('+') ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
        {trend}
      </span>
    </div>
  </div>
);

const Dashboard: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Enviado" value="45.2k" trend="+12%" color="emerald" />
        <StatCard title="Taxa de Entrega" value="98.4%" trend="+0.5%" color="blue" />
        <StatCard title="Campanhas Ativas" value="12" trend="+3" color="amber" />
        <StatCard title="Falhas de Envio" value="142" trend="-5%" color="rose" />
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
              <span className="text-slate-400 block mb-2">📊 Visualização de Análise</span>
              <p className="text-slate-500 text-sm">Fluxo de mensagens e tendências de engajamento</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6">Atividade Recente</h3>
          <div className="space-y-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${i % 2 === 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                  {i % 2 === 0 ? '🚀' : '👥'}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {i % 2 === 0 ? 'Campanha Concluída' : 'Contatos Importados'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {i % 2 === 0 ? 'Promoção Verão finalizada.' : '450 contatos adicionados ao grupo "Leads".'}
                  </p>
                  <span className="text-[10px] text-slate-400 font-medium uppercase mt-1 block">HÁ 2 HORAS</span>
                </div>
              </div>
            ))}
          </div>
          <button className="w-full mt-6 py-2 text-sm text-emerald-600 font-semibold border border-emerald-100 rounded-lg hover:bg-emerald-50 transition-colors">
            Ver Toda Atividade
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
