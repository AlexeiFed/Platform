import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { tokens } from "@/lib/design-tokens";
import { measurementFields } from "@/lib/measurement-fields";
import { formatDate } from "@/lib/utils";
import { Ruler } from "lucide-react";

export type HomeworkStudentBodyMetricsMeasurement = {
  id: string;
  date: Date;
} & Record<(typeof measurementFields)[number]["key"], number | null>;

type Props = {
  studentLabel: string;
  heightCm: number | null;
  weightKg: number | null;
  measurements: HomeworkStudentBodyMetricsMeasurement[];
};

export const HomeworkStudentBodyMetrics = ({
  studentLabel,
  heightCm,
  weightKg,
  measurements,
}: Props) => {
  return (
    <section className="min-w-0 space-y-3" aria-labelledby="homework-student-body-heading">
      <Card className="min-w-0">
        <CardHeader className="pb-3">
          <CardTitle
            id="homework-student-body-heading"
            className="flex items-center gap-2 text-base"
          >
            <Ruler className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 truncate">Рост, вес и замеры</span>
          </CardTitle>
          <p className={`${tokens.typography.small} truncate`} title={studentLabel}>
            {studentLabel}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div
              className={`rounded-lg border bg-muted/30 px-4 py-3 ${tokens.typography.small}`}
            >
              <div className="text-xs text-muted-foreground">Рост</div>
              <div className="text-base font-semibold tabular-nums">
                {heightCm != null ? `${heightCm} см` : "—"}
              </div>
            </div>
            <div
              className={`rounded-lg border bg-muted/30 px-4 py-3 ${tokens.typography.small}`}
            >
              <div className="text-xs text-muted-foreground">Вес</div>
              <div className="text-base font-semibold tabular-nums">
                {weightKg != null ? `${weightKg} кг` : "—"}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className={tokens.typography.label}>Таблица замеров (см)</div>
            {measurements.length === 0 ? (
              <p className={tokens.typography.small}>Записей замеров нет.</p>
            ) : (
              <div
                className="-mx-1 overflow-x-auto rounded-lg border sm:mx-0"
                role="region"
                aria-label="Таблица замеров студента"
                tabIndex={0}
              >
                <table className="w-full min-w-[720px] text-xs sm:text-sm">
                  <thead className="text-[10px] text-muted-foreground sm:text-xs">
                    <tr className="border-b">
                      <th className="sticky left-0 z-10 bg-card py-2 pl-3 pr-2 text-left font-medium shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] sm:static sm:bg-transparent sm:shadow-none">
                        Дата
                      </th>
                      {measurementFields.map((f) => (
                        <th
                          key={f.key}
                          className="whitespace-nowrap py-2 px-1.5 text-right font-medium sm:px-2"
                        >
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {measurements.map((m) => (
                      <tr key={m.id} className="border-b last:border-0 hover:bg-accent/30">
                        <td className="sticky left-0 z-10 bg-card py-2 pl-3 pr-2 text-xs font-medium whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] sm:static sm:bg-transparent sm:text-sm sm:shadow-none">
                          {formatDate(m.date)}
                        </td>
                        {measurementFields.map((f) => (
                          <td
                            key={f.key}
                            className="px-1.5 py-2 text-right tabular-nums sm:px-2"
                          >
                            {m[f.key] == null ? "—" : m[f.key]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
};
