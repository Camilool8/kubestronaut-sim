import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DocsTray } from "./DocsTray";
import { ToastLayer } from "./Toast";
import { toastStore } from "./toastStore";

/** Toasts only reach the DOM through the layer, so tests have to mount it. */
const withToasts = (questionId: string) => (
  <>
    <DocsTray questionId={questionId} />
    <ToastLayer />
  </>
);

const ingress = "https://kubernetes.io/docs/concepts/services-networking/ingress/";
const services = "https://kubernetes.io/docs/concepts/services-networking/service/";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function stub(handler: (url: string, init?: RequestInit) => Response) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return handler(String(input), init);
    }),
  );
  return calls;
}

const twoLinks = () =>
  stub((url, init) => {
    if (url.endsWith("/docs/open") && init?.method === "POST") {
      return new Response(null, { status: 204 });
    }
    return json({
      id: "q01",
      docs: [
        { label: "Ingress", url: ingress },
        { label: "Services", url: services },
      ],
    });
  });

afterEach(() => {
  vi.unstubAllGlobals();
  toastStore.clear();
});

describe("DocsTray", () => {
  test("names the concept, not the URL — the list is things to go and read", async () => {
    twoLinks();
    render(<DocsTray questionId="q01" />);

    expect(await screen.findByRole("button", { name: /Ingress/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Services/ })).toBeInTheDocument();
    expect(screen.queryByText(ingress)).not.toBeInTheDocument();
  });

  test("clicking sends the page to the exam desktop", async () => {
    const user = userEvent.setup();
    const calls = twoLinks();
    render(<DocsTray questionId="q01" />);

    await user.click(await screen.findByRole("button", { name: /Ingress/ }));

    await waitFor(() => {
      const open = calls.find((c) => c.url.endsWith("/api/questions/q01/docs/open"));
      expect(open).toBeDefined();
      expect(JSON.parse(String(open?.init?.body))).toEqual({ url: ingress });
    });
  });

  test("confirms where the page went, because it opens somewhere else", async () => {
    const user = userEvent.setup();
    twoLinks();
    render(withToasts("q01"));

    await user.click(await screen.findByRole("button", { name: /Ingress/ }));

    expect(
      await screen.findByText("Ingress is open in the exam desktop's browser."),
    ).toBeInTheDocument();
  });

  test("says so when the desktop will not take it", async () => {
    const user = userEvent.setup();
    stub((url, init) => {
      if (url.endsWith("/docs/open") && init?.method === "POST") {
        return json({ error: "the exam desktop did not open the page" }, 502);
      }
      return json({ id: "q01", docs: [{ label: "Ingress", url: ingress }] });
    });
    render(withToasts("q01"));

    await user.click(await screen.findByRole("button", { name: /Ingress/ }));

    expect(await screen.findByText(/Couldn't open that page/i)).toBeInTheDocument();
  });

  test("renders nothing at all when the mode refuses the links", async () => {
    stub(() => json({ error: "documentation links are available in Training mode only" }, 403));
    const { container } = render(<DocsTray questionId="q01" />);

    await waitFor(() => expect(container.querySelector(".docs-tray")).toBeNull());
  });

  test("renders nothing when the question names no reading", async () => {
    stub(() => json({ id: "q02", docs: [] }));
    const { container } = render(<DocsTray questionId="q02" />);

    await waitFor(() => expect(container.querySelector(".docs-tray")).toBeNull());
  });
});
