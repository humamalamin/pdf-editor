export default function Slider({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: Readonly<{
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (value: number) => void;
}>) {
  return (
    <label className="block">
      <span className="flex justify-between text-sm font-bold text-slate-700 dark:text-slate-200">
        {label}
        <span className="font-medium text-slate-500">{value}{unit}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full"
      />
    </label>
  );
}
