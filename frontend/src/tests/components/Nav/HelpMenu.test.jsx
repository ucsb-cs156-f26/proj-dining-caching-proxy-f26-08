import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import HelpMenu from "main/components/Nav/HelpMenu";

describe("HelpMenu tests", () => {
  test("About link points to /about", async () => {
    render(
      <MemoryRouter>
        <HelpMenu />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText("Help"));
    const aboutLink = await screen.findByRole("link", { name: "About" });
    expect(aboutLink).toBeInTheDocument();
    expect(aboutLink).toHaveAttribute("href", "/about");
  });

  test("clicking About navigates to the About page", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <HelpMenu />
        <Routes>
          <Route path="/" element={<div>Home</div>} />
          <Route path="/about" element={<div>About page content</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText("Help"));
    fireEvent.click(await screen.findByRole("link", { name: "About" }));
    expect(await screen.findByText("About page content")).toBeInTheDocument();
  });
});