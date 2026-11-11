import { useEffect, useState } from 'react';
import ExpiringPanel from '../components/ExpiringPanel.jsx';
import KpiCard from '../components/KpiCard.jsx';
import MovementsChart from '../components/MovementsChart.jsx';
import ReceivedIssuedChart from '../components/ReceivedIssuedChart.jsx';
import TopBar from '../components/TopBar.jsx';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import './Dashboard.css';

const COMPARE_DAYS = 30;
const EXPIRING_DAYS = 30;
const intFmt = new Intl.NumberFormat('en');
const moneyFmt = new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Dashboard() {
  const { org } = useAuth();
  const [kpis, setKpis] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const [daily, setDaily] = useState(null);
  const [expiring, setExpiring] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    api.get('/dashboard/summary', { compareDays: COMPARE_DAYS, expiringDays: EXPIRING_DAYS }, { signal: controller.signal })
      .then((data) => setKpis(data.kpis))
      .catch((err) => err.name !== 'AbortError' && setError(err.message));
    api.get('/dashboard/monthly', { months: 12 }, { signal: controller.signal })
      .then((data) => setMonthly(data.items))
      .catch((err) => err.name !== 'AbortError' && setError(err.message));
    api.get('/dashboard/daily', { days: 14 }, { signal: controller.signal })
      .then((data) => setDaily(data.items))
      .catch((err) => err.name !== 'AbortError' && setError(err.message));
    api.get('/reports/expiring', { days: EXPIRING_DAYS, limit: 6 }, { signal: controller.signal })
      .then(setExpiring).catch((err) => err.name !== 'AbortError' && setError(err.message));
    return () => controller.abort();
  }, []);
  const vs = `vs ${COMPARE_DAYS} days ago`;
  const missing = kpis?.stockValue.missingCost ?? 0;
  return (
    <>
      <TopBar title={org ? `Welcome, ${org.name}` : 'Dashboard'} subtitle="Here is how your stock looks today." />
      {error && <p className="dash__error" role="alert">Could not load the dashboard: {error}</p>}
      <div className="dash__kpis">
        <KpiCard label="Total products" value={kpis && intFmt.format(kpis.totalProducts.value)}
          changePct={kpis?.totalProducts.changePct} note={vs} />
        <KpiCard label="Stock value" value={kpis && moneyFmt.format(Number(kpis.stockValue.value))}
          changePct={kpis?.stockValue.changePct}
          note={missing > 0 ? `${missing} product${missing === 1 ? ' has' : 's have'} no cost price, so this is understated` : vs} />
        <KpiCard label="Low stock" value={kpis && intFmt.format(kpis.lowStock.value)}
          changePct={kpis?.lowStock.changePct} invert note={vs} />
        <KpiCard label="Expiring soon" value={kpis && intFmt.format(kpis.expiringSoon.value)}
          changePct={kpis?.expiringSoon.changePct} invert note={`Within ${EXPIRING_DAYS} days; ${vs}`} />
      </div>
      <div className="dash__charts">
        <ReceivedIssuedChart items={monthly} />
        <MovementsChart items={daily} />
      </div>
      <ExpiringPanel items={expiring?.items ?? null} total={expiring?.total ?? 0} days={EXPIRING_DAYS} />
    </>
  );
}
