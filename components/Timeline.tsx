import React from 'react';
import { ZabbixEvent } from '../types';
import { AlertTriangle, CheckCircle, UserCheck, Info, Clock } from 'lucide-react';

interface TimelineProps {
  events: ZabbixEvent[];
  loading: boolean;
}

const getEventType = (event: ZabbixEvent) => {
  if (event.value === '1') return { type: 'problem', icon: AlertTriangle, color: 'text-red-400', label: 'PROBLEMA' };
  if (event.value === '0') return { type: 'resolution', icon: CheckCircle, color: 'text-emerald-400', label: 'RESOLUÇÃO' };
  if (event.acknowledges && event.acknowledges.length > 0) return { type: 'ack', icon: UserCheck, color: 'text-blue-400', label: 'RECONHECIDO' };
  return { type: 'info', icon: Info, color: 'text-slate-400', label: 'EVENTO' };
};

const Timeline: React.FC<TimelineProps> = ({ events, loading }) => {
  if (loading) return <div className="text-center p-8 text-slate-500">Carregando timeline...</div>;
  if (events.length === 0) return <div className="text-center p-8 text-slate-500">Nenhum evento no período selecionado.</div>;

  // Group by day
  const eventsByDay: Record<string, ZabbixEvent[]> = {};
  events.forEach(e => {
    const day = new Date(parseInt(e.clock) * 1000).toLocaleDateString();
    if (!eventsByDay[day]) eventsByDay[day] = [];
    eventsByDay[day].push(e);
  });

  return (
    <div className="relative border-l-2 border-slate-700 ml-4 space-y-8">
      {Object.entries(eventsByDay).map(([day, dayEvents]) => (
        <div key={day} className="relative">
          <div className="absolute -left-[21px] top-0 bg-slate-800 border border-slate-600 text-slate-300 text-xs px-2 py-1 rounded-full font-bold">
            {day}
          </div>
          <div className="pt-6 space-y-4">
            {dayEvents.map(event => {
              const { icon: Icon, color, label } = getEventType(event);
              return (
                <div key={event.eventid} className="ml-6 bg-slate-800 p-4 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors relative">
                  <div className="absolute -left-[31px] top-5 w-4 h-4 rounded-full bg-slate-900 border-2 border-slate-600"></div>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2 mb-1">
                       <Clock size={12} className="text-slate-500" />
                       <span className="text-xs text-slate-400 font-mono">
                         {new Date(parseInt(event.clock) * 1000).toLocaleTimeString()}
                       </span>
                       <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 ${color}`}>
                         {label}
                       </span>
                    </div>
                  </div>
                  <div className="text-sm text-slate-200 font-medium">
                    {event.name}
                  </div>
                  {event.hosts && event.hosts.length > 0 && (
                     <div className="text-xs text-blue-400 mt-1">{event.hosts[0].name}</div>
                  )}
                  {event.acknowledges && event.acknowledges.length > 0 && (
                    <div className="mt-2 text-xs bg-slate-900/50 p-2 rounded border-l-2 border-blue-500 text-slate-400">
                      <span className="font-bold">{event.acknowledges[0].alias}:</span> {event.acknowledges[0].message}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default Timeline;
