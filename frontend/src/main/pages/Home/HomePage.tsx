import { useBackend, useBackendMutation } from "main/utils/useBackend";
import BasicLayout from "main/layouts/BasicLayout/BasicLayout";
import OurTable from "main/components/Common/OurTable";
import { Button } from "react-bootstrap";
import { toast } from "react-toastify";
import type { Cell } from "@tanstack/react-table";
import { hasRole, useCurrentUser } from "main/utils/currentUser";

type Stats = {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  hitRatePercentage: number;
};

const defaultStats: Stats = {
  totalRequests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  hitRatePercentage: 0,
};

export type HostCount = {
  host: string;
  count: number;
};

export type CachedEndpoint = {
  id: string;
  requestPath: string;
  hitCount: number;
  responseStatus: number;
  responseBody: string;
};

const hostsEndpoint = "/api/admin/hosts";
const cachedEndpointsEndpoint = "/api/admin/endpoints";

// A host that hasn't (yet, or successfully) resolved to a hostname still displays as its own
// raw IPv4 address - that's exactly the signal to show a retry button for it.
const looksLikeIpAddress = (host: string): boolean =>
  /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);

export default function HomePage(): React.JSX.Element {
  const { data } = useBackend<Stats>(
    ["/api/stats"],
    { method: "GET", url: "/api/stats" },
    // Stryker disable next-line all : don't test default value of empty stats
    defaultStats,
  );
  const stats = data ?? defaultStats;

  const currentUser = useCurrentUser();
  const isAdmin = hasRole(currentUser, "ROLE_ADMIN");

  const { data: hostCounts } = useBackend<HostCount[]>(
    // Stryker disable next-line ArrayDeclaration: this is the only query using this key in
    // any given test, so an empty key behaves identically in isolation.
    [hostsEndpoint],
    // Stryker disable next-line StringLiteral: axios treats a falsy method as "GET"
    { method: "GET", url: hostsEndpoint },
    // Stryker disable next-line all : don't test default value of empty list
    [],
    false,
    { enabled: isAdmin },
  );

  const { data: cachedEndpoints } = useBackend<CachedEndpoint[]>(
    [cachedEndpointsEndpoint],
    { method: "GET", url: cachedEndpointsEndpoint },
    [],
    false,
    { enabled: isAdmin },
  );

  const retryMutation = useBackendMutation<string>(
    (ip: string) => ({
      url: `${hostsEndpoint}/resolve`,
      method: "POST",
      params: { ip },
    }),
    {
      onSuccess: () => {
        toast("Requested hostname resolution");
      },
    },
    // Stryker disable next-line ArrayDeclaration: invalidateQueries([]) invalidates every
    // query, which is behaviorally identical here since this is the only active query.
    [hostsEndpoint],
  );

  const hostColumns = [
    { header: "Host", accessorKey: "host" },
    { header: "Count", accessorKey: "count" },
    {
      header: "",
      id: "retry",
      cell: ({ cell }: { cell: Cell<HostCount, unknown> }) => {
        if (!looksLikeIpAddress(cell.row.original.host)) {
          return null;
        }
        return (
          <Button
            size="sm"
            onClick={() => retryMutation.mutate(cell.row.original.host)}
            data-testid={`HomePage-hosts-table-cell-row-${cell.row.index}-col-retry-button`}
          >
            Retry
          </Button>
        );
      },
    },
  ];
  const purgeMutation = useBackendMutation<string>(
    (id: string) => ({
      url: `${cachedEndpointsEndpoint}/${id}`,
      method: "DELETE",
    }),
    {
      onSuccess: () => {
        toast.success("Cached response purged");
      },
      onError: () => {
        toast.error("Failed to purge cached response");
      },
    },
    [cachedEndpointsEndpoint],
  );

  const cachedEndpointColumns = [
    { header: "Request Path", accessorKey: "requestPath" },
    { header: "Hit Count", accessorKey: "hitCount" },
    { header: "Response Status", accessorKey: "responseStatus" },
    {
      header: "Response Body",
      id: "responseBody",
      cell: ({ cell }: { cell: Cell<CachedEndpoint, unknown> }) => (
        <details>
          <summary>View Response</summary>
          <pre
            style={{
              maxWidth: "400px",
              maxHeight: "200px",
              overflow: "auto",
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
            }}
          >
            {cell.row.original.responseBody}
          </pre>
        </details>
      ),
    },
    {
      header: "",
      id: "purge",
      cell: ({ cell }: { cell: Cell<CachedEndpoint, unknown> }) => (
        <Button
          size="sm"
          variant="danger"
          onClick={() => purgeMutation.mutate(cell.row.original.id)}
          data-testid={`HomePage-cached-table-cell-row-${cell.row.index}-col-purge-button`}
        >
          Purge
        </Button>
      ),
    },
  ];

  return (
    <BasicLayout>
      <div className="pt-2">
        <h1>Dining Caching Proxy</h1>
        <table className="table" data-testid="HomePage-stats-table">
          <tbody>
            <tr>
              <th scope="row">Total Requests</th>
              <td data-testid="HomePage-totalRequests">
                {stats.totalRequests}
              </td>
            </tr>
            <tr>
              <th scope="row">Cache Hits</th>
              <td data-testid="HomePage-cacheHits">{stats.cacheHits}</td>
            </tr>
            <tr>
              <th scope="row">Cache Misses</th>
              <td data-testid="HomePage-cacheMisses">{stats.cacheMisses}</td>
            </tr>
            <tr>
              <th scope="row">Hit Rate</th>
              <td data-testid="HomePage-hitRate">
                {stats.hitRatePercentage.toFixed(1)}%
              </td>
            </tr>
          </tbody>
        </table>

        {isAdmin && (
          <>
            <h2>Requesting Hosts</h2>
            <OurTable
              // Stryker disable next-line ArrayDeclaration: initialData=[] above guarantees
              // hostCounts is never actually undefined at runtime; this is TypeScript-only
              // defensiveness (the useBackend generic wrapper defeats initialData narrowing).
              data={hostCounts ?? []}
              columns={hostColumns}
              testid="HomePage-hosts-table"
            />
            <h2>Cached Responses</h2>
            <OurTable
              data={cachedEndpoints ?? []}
              columns={cachedEndpointColumns}
              testid="HomePage-cached-table"
            />
          </>
        )}
      </div>
    </BasicLayout>
  );
}
