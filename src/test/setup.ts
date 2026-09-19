import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Vitest runs without globals, so Testing Library can't register its own
// afterEach cleanup — do it here or every test sees the previous renders.
afterEach(() => cleanup());
