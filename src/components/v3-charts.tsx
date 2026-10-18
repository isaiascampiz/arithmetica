'use client';
import { useState } from 'react';
import { dayKey, type Snapshot } from '@/lib/model';
import { addDays } from '@/lib/schedule';
import { centerActivity } from '@/lib/v3-analytics';
export { ProgressCharts } from './v3-progress';
export function CenterActivity({ db }: { db: Snapshot }) {
  const [period, setPeriod] = useState('Daily'),
    [date, setDate] = useState(dayKey(new Date(), db.timezone)),
    [weekday, setWeekday] = useState('All');
  const start =
    period === 'Daily' ? date : period === 'Weekly' ? addDays(date, -6) : date.slice(0, 7) + '-01';
  const result = centerActivity(db, start, date, weekday === 'All' ? null : Number(weekday));
  const hours = result.bins.filter(
    (b) => (b.hour >= 12 && b.hour <= 20) || b.arrivals > 0 || b.occupancy > 0,
  );
  const bars = (metric: 'arrivals' | 'occupancy') => {
    const max = Math.max(1, ...hours.map((b) => b[metric]));
    return (
      <div className="activity-bars">
        {hours.map((b) => (
          <div key={b.hour}>
            <b>{metric === 'arrivals' ? b.arrivals : b.occupancy.toFixed(1)}</b>
            <div>
              <i style={{ height: (b[metric] / max) * 100 + '%' }} />
            </div>
            <span>
              {b.hour % 12 || 12}
              {b.hour < 12 ? 'a' : 'p'}
            </span>
          </div>
        ))}
      </div>
    );
  };
  return (
    <>
      <div className="screen-toolbar">
        <div className="segmented">
          {['Daily', 'Weekly', 'Monthly'].map((p) => (
            <button className={p === period ? 'selected' : ''} key={p} onClick={() => setPeriod(p)}>
              {p}
            </button>
          ))}
        </div>
        <label>
          Period ending
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label>
          Weekday comparison
          <select value={weekday} onChange={(e) => setWeekday(e.target.value)}>
            <option value="All">All weekdays</option>
            {['Monday', 'Tuesday', 'Wednesday', 'Thursday'].map((d, i) => (
              <option value={i + 1} key={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </div>
      <section className="panel chart-card">
        <h2>Student check-ins by hour</h2>
        <p>
          {result.visits} attendance sessions across {result.days} calendar days. Actual arrivals,
          including unresolved departures.
        </p>
        {bars('arrivals')}
      </section>
      <section className="panel chart-card">
        <h2>Average simultaneous occupancy by hour</h2>
        <p>Time-weighted average students present; distinct from arrival count.</p>
        {bars('occupancy')}
        <p className="warning-line">
          {result.excluded} unresolved/unverified visits excluded from occupancy. {result.live}{' '}
          current-day open visits contribute provisional live duration. Historical open visits never
          inflate occupancy.
        </p>
        {!result.visits && <p>No attendance source data in this period.</p>}
      </section>
    </>
  );
}
