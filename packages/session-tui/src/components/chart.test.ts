import { test, expect, describe } from "bun:test";
import { columnCells, barFill } from "./chart";

describe("columnCells", () => {
  test("returns one entry per row", () => {
    expect(columnCells(50, 100, 5)).toHaveLength(5);
  });
  test("zero value is all spaces", () => {
    expect(columnCells(0, 100, 4)).toEqual([" ", " ", " ", " "]);
  });
  test("zero max is all spaces", () => {
    expect(columnCells(50, 0, 4)).toEqual([" ", " ", " ", " "]);
  });
  test("full value fills every row with a full block", () => {
    expect(columnCells(100, 100, 3)).toEqual(["█", "█", "█"]);
  });
  test("bar grows from the bottom row upward", () => {
    // half of 4 rows -> bottom two rows full, top two empty
    expect(columnCells(50, 100, 4)).toEqual([" ", " ", "█", "█"]);
  });
  test("tiny non-zero value still shows at least one eighth", () => {
    const cells = columnCells(1, 100000, 5);
    expect(cells[4]).toBe("▁");
  });
});

describe("barFill", () => {
  test("zero value is fully empty", () => {
    expect(barFill(0, 100, 10)).toEqual({ filled: 0, empty: 10 });
  });
  test("full value is fully filled", () => {
    expect(barFill(100, 100, 10)).toEqual({ filled: 10, empty: 0 });
  });
  test("filled and empty always sum to width", () => {
    const { filled, empty } = barFill(37, 100, 10);
    expect(filled + empty).toBe(10);
  });
  test("tiny non-zero value shows at least one filled cell", () => {
    expect(barFill(1, 100000, 10).filled).toBe(1);
  });
});
