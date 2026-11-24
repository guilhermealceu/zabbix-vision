import React from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  data: number[];
  color: string;
  icon: React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, subtitle, data, color, icon }) => {
  const chartData = data && data.length > 0 ? data.map((val, idx) => ({ i: idx, val })) : [{ i: 0, val: 0 }];

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-lg relative overflow-hidden group hover:border-slate-600 transition-colors flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-start mb-2">
          <div>
            <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">{title}</h3>
            <div className="text-3xl font-bold text-white mt-1">{value}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-opacity-20 shrink-0" style={{ backgroundColor: `${color}25`, color: color }}>
            {icon}
          </div>
        </div>
        
        {subtitle && (
          <div className="text-xs text-slate-500 mb-3">{subtitle}</div>
        )}
      </div>

      <div className="h-14 w-full min-w-0 relative mt-1" style={{ minWidth: 0, minHeight: 48 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={48}>
          <LineChart data={chartData}>
            <Line 
              type="monotone" 
              dataKey="val" 
              stroke={color} 
              strokeWidth={2.5} 
              dot={false} 
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      <div className="absolute bottom-0 left-0 h-1 w-full" style={{ backgroundColor: color }}></div>
    </div>
  );
};

export default StatCard;
