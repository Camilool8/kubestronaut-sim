import { describe, expect, it } from "vitest";
import { isTypingTarget } from "./typing";

function make(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host.firstElementChild as HTMLElement;
}

describe("isTypingTarget", () => {
  it("is false for a checkbox — the bug this exists for", () => {
    // An mcq option is a checkbox inside a label. Clicking the answer
    // focuses it, so a guard that treated every <input> as typing killed
    // G, F, [ and ] on the single most ordinary action in the exam.
    const label = make(`<label><input type="checkbox"><span>Annotations</span></label>`);
    expect(isTypingTarget(label.querySelector("input"))).toBe(false);
  });

  it.each(["radio", "button", "submit", "range", "file", "color"])(
    "is false for input[type=%s]",
    (type) => {
      expect(isTypingTarget(make(`<input type="${type}">`))).toBe(false);
    },
  );

  it.each(["text", "search", "email", "password", "number", "url", "tel"])(
    "is true for input[type=%s]",
    (type) => {
      expect(isTypingTarget(make(`<input type="${type}">`))).toBe(true);
    },
  );

  it("is true for a bare input, which defaults to text", () => {
    expect(isTypingTarget(make(`<input>`))).toBe(true);
  });

  it("is true for a textarea", () => {
    expect(isTypingTarget(make(`<textarea></textarea>`))).toBe(true);
  });

  it("is true inside a contenteditable, including a nested child", () => {
    const host = make(`<div contenteditable="true"><span>word</span></div>`);
    document.body.append(host);
    expect(isTypingTarget(host)).toBe(true);
    expect(isTypingTarget(host.querySelector("span"))).toBe(true);
    host.remove();
  });

  it("is false for ordinary content and for null", () => {
    expect(isTypingTarget(make(`<button>Next</button>`))).toBe(false);
    expect(isTypingTarget(make(`<p>text</p>`))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
