import { expect, test } from "bun:test";

import { documentTitleFor } from "../src/hooks/use-document-title";

test("names the tab after the page and the workspace it shows", () => {
	expect(documentTitleFor(["Projects", "octo/notes"])).toBe("Projects · octo/notes - Sketchflow");
	expect(documentTitleFor(["Payments architecture"])).toBe("Payments architecture - Sketchflow");
});

test("ignores parts that are not known yet", () => {
	expect(documentTitleFor(["Projects", undefined])).toBe("Projects - Sketchflow");
	expect(documentTitleFor([null, "  "])).toBe("Sketchflow");
});
