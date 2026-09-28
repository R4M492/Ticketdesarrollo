import { useQuery } from "@tanstack/react-query";
import { catalogApi } from "../../api/endpoints";
import { Badge, PageLoader, StatusBadge } from "../../components/ui";

export default function Statuses() {
  const list = useQuery({ queryKey: ["statuses"], queryFn: catalogApi.statuses });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Estados de ticket</h1>
        <p className="text-sm text-slate-500">Catálogo de estados del ciclo de vida</p>
      </div>

      {list.isLoading ? (
        <PageLoader />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Estado</th>
                <th>Código</th>
                <th>Descripción</th>
                <th>Tipo</th>
              </tr>
            </thead>
            <tbody>
              {list.data!.map((s) => (
                <tr key={s.id}>
                  <td><StatusBadge color={s.color}>{s.name}</StatusBadge></td>
                  <td><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{s.code}</code></td>
                  <td className="text-sm text-slate-500">{s.description ?? "—"}</td>
                  <td>
                    <Badge color={s.isClosed ? "#ef4444" : "#16a34a"}>
                      {s.isClosed ? "Estado final" : "Estado abierto"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
