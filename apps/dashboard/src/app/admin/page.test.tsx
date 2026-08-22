import { render } from "@testing-library/react";
import useSWR from "swr";
import DashboardPage from "./page";

jest.mock("swr", () => ({
  __esModule: true,
  default: jest.fn(() => ({ data: [], isLoading: false, error: undefined })),
}));

const mockedUseSWR = useSWR as unknown as jest.Mock;

describe("DashboardPage", () => {
  beforeEach(() => {
    mockedUseSWR.mockClear();
  });

  it("polls /sales and /expenses every 15s: la portada se mantiene viva sin recargar", () => {
    render(<DashboardPage />);

    expect(mockedUseSWR).toHaveBeenCalledWith("/sales", { refreshInterval: 15000 });
    expect(mockedUseSWR).toHaveBeenCalledWith("/expenses", { refreshInterval: 15000 });
  });
});
