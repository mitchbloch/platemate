// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import NumberField from "../NumberField";

function Harness({ initial = 3, ...props }: { initial?: number | null; min?: number; max?: number; integer?: boolean; allowEmpty?: boolean }) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <>
      <NumberField aria-label="count" value={value} onChange={setValue} {...props} />
      <output data-testid="committed">{value === null ? "null" : String(value)}</output>
    </>
  );
}

describe("NumberField", () => {
  it("lets the user clear the field and type a new number without a leading 0", async () => {
    // The original bug: clearing → 0 → typing 4 shows "04"
    const user = userEvent.setup();
    render(<Harness initial={3} min={0} max={14} integer />);
    const input = screen.getByLabelText("count");

    await user.clear(input);
    expect(input).toHaveValue("");
    await user.type(input, "4");
    expect(input).toHaveValue("4");
    await user.tab();
    expect(screen.getByTestId("committed")).toHaveTextContent("4");
  });

  it("does not commit on every keystroke", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NumberField aria-label="count" value={3} onChange={onChange} integer />);
    await user.clear(screen.getByLabelText("count"));
    await user.type(screen.getByLabelText("count"), "12");
    expect(onChange).not.toHaveBeenCalled();
    await user.tab();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(12);
  });

  it("clamps to min/max on blur", async () => {
    const user = userEvent.setup();
    render(<Harness initial={3} min={0} max={14} integer />);
    const input = screen.getByLabelText("count");
    await user.clear(input);
    await user.type(input, "99");
    await user.tab();
    expect(input).toHaveValue("14");
    expect(screen.getByTestId("committed")).toHaveTextContent("14");
  });

  it("commits on Enter", async () => {
    const user = userEvent.setup();
    render(<Harness initial={3} min={1} integer />);
    const input = screen.getByLabelText("count");
    await user.clear(input);
    await user.type(input, "7{Enter}");
    expect(screen.getByTestId("committed")).toHaveTextContent("7");
  });

  it("reverts an emptied field to the previous value unless allowEmpty", async () => {
    const user = userEvent.setup();
    render(<Harness initial={5} min={1} integer />);
    const input = screen.getByLabelText("count");
    await user.clear(input);
    await user.tab();
    expect(input).toHaveValue("5");
    expect(screen.getByTestId("committed")).toHaveTextContent("5");
  });

  it("commits null for an emptied field when allowEmpty", async () => {
    const user = userEvent.setup();
    render(<Harness initial={30} min={0} integer allowEmpty />);
    const input = screen.getByLabelText("count");
    await user.clear(input);
    await user.tab();
    expect(input).toHaveValue("");
    expect(screen.getByTestId("committed")).toHaveTextContent("null");
  });

  it("accepts decimals (and a comma separator) when not integer", async () => {
    const user = userEvent.setup();
    render(<Harness initial={null} min={0} allowEmpty />);
    const input = screen.getByLabelText("count");
    await user.type(input, "1,5");
    await user.tab();
    expect(screen.getByTestId("committed")).toHaveTextContent("1.5");
  });

  it("strips thousands separators in integer mode instead of turning them into decimals", async () => {
    const user = userEvent.setup();
    render(<Harness initial={1} min={0} max={5000} integer />);
    const input = screen.getByLabelText("count");
    await user.clear(input);
    await user.type(input, "1,234");
    await user.tab();
    expect(screen.getByTestId("committed")).toHaveTextContent("1234");
  });

  it("ignores garbage and keeps the previous value", async () => {
    const user = userEvent.setup();
    render(<Harness initial={2} min={1} integer />);
    const input = screen.getByLabelText("count");
    await user.clear(input);
    await user.type(input, "abc");
    await user.tab();
    expect(input).toHaveValue("2");
  });

  it("uses the numeric keypad for integers and decimal otherwise", () => {
    const { rerender } = render(<NumberField aria-label="count" value={1} onChange={() => {}} integer />);
    expect(screen.getByLabelText("count")).toHaveAttribute("inputmode", "numeric");
    rerender(<NumberField aria-label="count" value={1} onChange={() => {}} />);
    expect(screen.getByLabelText("count")).toHaveAttribute("inputmode", "decimal");
  });
});
