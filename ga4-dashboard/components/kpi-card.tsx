type Props = {
  label: string;
  value: string;
  /** 이전 기간 대비 변화율 (%) — null이면 표시 안 함 */
  changePct: number | null;
  /** true면 감소가 좋은 지표 (예: 이탈률) */
  invertColor?: boolean;
};

export function KpiCard({ label, value, changePct, invertColor = false }: Props) {
  const positive = changePct !== null && changePct >= 0;
  const good = invertColor ? !positive : positive;
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {changePct !== null && (
        <p
          className={`mt-1 text-xs font-medium tabular-nums ${
            good ? "text-emerald-600" : "text-red-500"
          }`}
        >
          {positive ? "▲" : "▼"} {Math.abs(changePct).toFixed(1)}%
          <span className="ml-1 font-normal text-zinc-400">vs 이전 기간</span>
        </p>
      )}
    </div>
  );
}
