import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import HomePage from "main/pages/Home/HomePage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";

import { apiCurrentUserFixtures } from "fixtures/currentUserFixtures";
import { systemInfoFixtures } from "fixtures/systemInfoFixtures";
import axios from "axios";
import AxiosMockAdapter from "axios-mock-adapter";
import * as useBackendModule from "main/utils/useBackend";
import { describe, test, expect, afterEach, vi } from "vitest";

const mockToast = vi.fn();

vi.mock("react-toastify", async (importOriginal) => {
  return {
    ...(await importOriginal<typeof import("react-toastify")>()),
    toast: Object.assign((message: string) => mockToast(message), {
      success: (message: string) => mockToast(message),
      error: (message: string) => mockToast(message),
    }),
  };
});

const useBackendSpy = vi.spyOn(useBackendModule, "useBackend");

describe("HomePage tests", () => {
  const axiosMock = new AxiosMockAdapter(axios);
  const statsEndpoint = "/api/stats";
  const hostsEndpoint = "/api/admin/hosts";
  const cachedEndpointsEndpoint = "/api/admin/endpoints";

  const cachedResponses = [
    {
      id: "cache-1",
      requestPath: "/dining/commons/v1/",
      hitCount: 5,
      responseStatus: 200,
      cachedAt: "2026-11-12T20:00:00Z",
      responseBody: '["Carrillo", "De La Guerra"]',
    },
    {
      id: "cache-2",
      requestPath: "/dining/menu/v1/2024-08-16/carrillo",
      hitCount: 1,
      responseStatus: 404,
      cachedAt: null,
      responseBody: '{"error":"Not found"}',
    },
  ];

  const setupUser = () => {
    axiosMock.reset();
    axiosMock.resetHistory();
    axiosMock
      .onGet("/api/currentUser")
      .reply(200, apiCurrentUserFixtures.userOnly);
    axiosMock
      .onGet("/api/systemInfo")
      .reply(200, systemInfoFixtures.showingNeither);
    axiosMock.onGet(statsEndpoint).reply(200, {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      hitRatePercentage: 0,
    });
  };

  const setupAdmin = () => {
    axiosMock.reset();
    axiosMock.resetHistory();
    axiosMock
      .onGet("/api/currentUser")
      .reply(200, apiCurrentUserFixtures.adminUser);
    axiosMock
      .onGet("/api/systemInfo")
      .reply(200, systemInfoFixtures.showingNeither);
    axiosMock.onGet(statsEndpoint).reply(200, {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      hitRatePercentage: 0,
    });
    axiosMock.onGet(hostsEndpoint).reply(200, []);
    axiosMock.onGet(cachedEndpointsEndpoint).reply(200, []);
  };

  const queryClient = new QueryClient();

  afterEach(() => {
    useBackendSpy.mockClear();
    queryClient.clear();
  });

  test("renders the four stats from the backend", async () => {
    setupUser();
    axiosMock.onGet(statsEndpoint).reply(200, {
      totalRequests: 10,
      cacheHits: 7,
      cacheMisses: 3,
      hitRatePercentage: 70,
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("HomePage-totalRequests")).toHaveTextContent(
        "10",
      );
    });
    expect(screen.getByTestId("HomePage-cacheHits")).toHaveTextContent("7");
    expect(screen.getByTestId("HomePage-cacheMisses")).toHaveTextContent("3");
    expect(screen.getByTestId("HomePage-hitRate")).toHaveTextContent("70.0%");
  });
  test("uses default stats when backend returns null", async () => {
    setupUser();
    axiosMock.onGet(statsEndpoint).reply(200, null);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("HomePage-totalRequests")).toHaveTextContent(
        "0",
      );
      expect(screen.getByTestId("HomePage-cacheHits")).toHaveTextContent("0");
      expect(screen.getByTestId("HomePage-cacheMisses")).toHaveTextContent("0");
      expect(screen.getByTestId("HomePage-hitRate")).toHaveTextContent("0.0%");
    });
  });

  test("renders zeroes before the backend responds", async () => {
    setupUser();
    axiosMock.onGet(statsEndpoint).reply(200, {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      hitRatePercentage: 0,
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("HomePage-totalRequests")).toHaveTextContent("0");
    expect(screen.getByTestId("HomePage-hitRate")).toHaveTextContent("0.0%");
  });

  test("useBackend is called with the correct cache query key", async () => {
    setupUser();
    axiosMock.onGet(statsEndpoint).reply(200, {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      hitRatePercentage: 0,
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(useBackendSpy).toHaveBeenCalledWith(
      [statsEndpoint],
      { method: "GET", url: statsEndpoint },
      { totalRequests: 0, cacheHits: 0, cacheMisses: 0, hitRatePercentage: 0 },
    );
  });

  test("regular users do not see the requesting-hosts table", async () => {
    setupUser();
    axiosMock.onGet(statsEndpoint).reply(200, {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      hitRatePercentage: 0,
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("HomePage-totalRequests")).toBeInTheDocument();
    });
    expect(screen.queryByText("Requesting Hosts")).not.toBeInTheDocument();
    expect(
      axiosMock.history.get.filter((r) => r.url === hostsEndpoint),
    ).toHaveLength(0);
    expect(useBackendSpy).toHaveBeenCalledWith(
      [hostsEndpoint],
      { method: "GET", url: hostsEndpoint },
      [],
      false,
      { enabled: false },
    );
  });

  test("a failed hosts fetch surfaces an error the same as any other useBackend call", async () => {
    setupAdmin();
    axiosMock.onGet(statsEndpoint).reply(200, {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      hitRatePercentage: 0,
    });
    axiosMock.onGet(hostsEndpoint).timeout();
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(
        axiosMock.history.get.filter((r) => r.url === hostsEndpoint).length,
      ).toBeGreaterThanOrEqual(1);
    });
    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    consoleErrorSpy.mockRestore();
  });

  test("admins see the requesting-hosts table, with a retry button only for unresolved hosts", async () => {
    setupAdmin();
    axiosMock.onGet(statsEndpoint).reply(200, {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      hitRatePercentage: 0,
    });
    axiosMock.onGet(hostsEndpoint).reply(200, [
      { host: "dining-qa.dokku-00.cs.ucsb.edu", count: 42 },
      // Every segment here has 2-3 digits, so weakening any one segment's quantifier
      // in the retry-eligibility check would break the match.
      { host: "123.45.167.89", count: 3 },
      // A trailing non-digit character - only rejected if the pattern is end-anchored.
      { host: "123.45.167.89x", count: 1 },
      // A non-digit prefix directly before an otherwise-valid address - only rejected
      // if the pattern is start-anchored.
      { host: "prefix123.45.167.89", count: 1 },
    ]);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("HomePage-hosts-table-cell-row-0-col-host"),
      ).toHaveTextContent("dining-qa.dokku-00.cs.ucsb.edu");
    });
    expect(
      screen.getByTestId("HomePage-hosts-table-cell-row-1-col-host"),
    ).toHaveTextContent("123.45.167.89");

    expect(
      screen.getByTestId("HomePage-hosts-table-header-host"),
    ).toHaveTextContent("Host");
    expect(
      screen.getByTestId("HomePage-hosts-table-header-count"),
    ).toHaveTextContent("Count");
    expect(
      screen.getByTestId("HomePage-hosts-table-header-retry"),
    ).toHaveTextContent("");

    expect(
      screen.queryByTestId("HomePage-hosts-table-cell-row-0-col-retry-button"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("HomePage-hosts-table-cell-row-1-col-retry-button"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("HomePage-hosts-table-cell-row-2-col-retry-button"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("HomePage-hosts-table-cell-row-3-col-retry-button"),
    ).not.toBeInTheDocument();
  });

  test("clicking retry posts to the resolve endpoint for that IP", async () => {
    setupAdmin();
    axiosMock.onGet(statsEndpoint).reply(200, {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      hitRatePercentage: 0,
    });
    axiosMock
      .onGet(hostsEndpoint)
      .reply(200, [{ host: "203.0.113.5", count: 3 }]);
    axiosMock.onPost(`${hostsEndpoint}/resolve`).reply(200, {});

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const retryButton = await screen.findByTestId(
      "HomePage-hosts-table-cell-row-0-col-retry-button",
    );
    fireEvent.click(retryButton);

    await waitFor(() => expect(axiosMock.history.post.length).toBe(1));
    expect(axiosMock.history.post[0].url).toBe(`${hostsEndpoint}/resolve`);
    expect(axiosMock.history.post[0].params).toEqual({ ip: "203.0.113.5" });
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith("Requested hostname resolution"),
    );
  });

  test("regular users cannot see cached responses", async () => {
    setupUser();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("HomePage-totalRequests")).toBeInTheDocument();
    });

    expect(screen.queryByText("Cached Responses")).not.toBeInTheDocument();
    expect(
      axiosMock.history.get.filter(
        (request) => request.url === cachedEndpointsEndpoint,
      ),
    ).toHaveLength(0);

    expect(useBackendSpy).toHaveBeenCalledWith(
      [cachedEndpointsEndpoint],
      { method: "GET", url: cachedEndpointsEndpoint },
      [],
      false,
      { enabled: false },
    );
  });

  test("admins can view cached responses and their details", async () => {
    setupAdmin();
    axiosMock.onGet(cachedEndpointsEndpoint).reply(200, cachedResponses);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Cached Responses")).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByTestId("HomePage-cached-table-cell-row-0-col-requestPath"),
      ).toHaveTextContent("/dining/commons/v1/");
    });

    expect(
      screen.getByTestId("HomePage-cached-table-cell-row-0-col-hitCount"),
    ).toHaveTextContent("5");

    expect(
      screen.getByTestId("HomePage-cached-table-cell-row-0-col-responseStatus"),
    ).toHaveTextContent("200");

    expect(
      screen.getByTestId("HomePage-cached-table-cell-row-1-col-responseStatus"),
    ).toHaveTextContent("404");

    expect(
      screen.getByTestId("HomePage-cached-table-cell-row-0-col-cachedAt"),
    ).toHaveTextContent(new Date("2026-11-12T20:00:00Z").toLocaleString());
    expect(
      screen.getByTestId("HomePage-cached-table-cell-row-1-col-cachedAt"),
    ).toHaveTextContent("Unknown");

    const responseDetails = screen.getAllByText("View Response");
    fireEvent.click(responseDetails[0]);

    expect(
      screen.getByText('["Carrillo", "De La Guerra"]'),
    ).toBeInTheDocument();
  });

  test("clicking Purge deletes the correct cached response", async () => {
    setupAdmin();
    axiosMock.onGet(cachedEndpointsEndpoint).reply(200, cachedResponses);
    axiosMock.onDelete(`${cachedEndpointsEndpoint}/cache-1`).reply(204);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const purgeButton = await screen.findByTestId(
      "HomePage-cached-table-cell-row-0-col-purge-button",
    );

    fireEvent.click(purgeButton);

    await waitFor(() => {
      expect(axiosMock.history.delete).toHaveLength(1);
    });

    expect(axiosMock.history.delete[0].url).toBe(
      `${cachedEndpointsEndpoint}/cache-1`,
    );
  });

  test("a failed purge does not remove the cached response", async () => {
    setupAdmin();
    axiosMock.onGet(cachedEndpointsEndpoint).reply(200, cachedResponses);
    axiosMock.onDelete(`${cachedEndpointsEndpoint}/cache-1`).reply(500);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const purgeButton = await screen.findByTestId(
      "HomePage-cached-table-cell-row-0-col-purge-button",
    );

    fireEvent.click(purgeButton);

    await waitFor(() => {
      expect(axiosMock.history.delete).toHaveLength(1);
    });

    expect(
      screen.getByTestId("HomePage-cached-table-cell-row-0-col-requestPath"),
    ).toHaveTextContent("/dining/commons/v1/");
  });
});
