// ABOUTME: entryLiveUrl — where the live site serves an entry, worked out from
// ABOUTME: the record alone (menus need it without the editor open).
import { describe, expect, it } from "vitest";
import { entryLiveUrl } from "./liveUrl";
import { makeEntry } from "./testing/builders";
import { createFakeModel } from "./testing/fakeModel";

const model = createFakeModel();

describe("entryLiveUrl", () => {
  it("gives a published post's dated permalink on the site", () => {
    const post = makeEntry({
      path: "content/blog/2026/2026-03-04-hello-world.md",
      kind: "post",
      date: "2026-03-04",
    });
    expect(entryLiveUrl(model, post)).toBe("https://blog.fsck.com/2026/03/04/hello-world/");
  });

  it("gives nothing for a draft without a secret link", () => {
    const draft = makeEntry({ path: "content/drafts/2026-03-04-wip.md", kind: "draft" });
    expect(entryLiveUrl(model, draft)).toBeNull();
  });

  it("gives a draft's secret link once it has an opaque id", () => {
    const draft = makeEntry({
      path: "content/drafts/2026-03-04-wip.md",
      kind: "draft",
      opaqueId: "abc123",
    });
    expect(entryLiveUrl(model, draft)).toBe("https://blog.fsck.com/private/abc123/");
  });

  it("gives nothing when the entry can't be parsed", () => {
    const broken = {
      ...makeEntry({ path: "content/blog/2026/2026-03-04-x.md", kind: "post" }),
      workingContent: "no front matter here",
    };
    expect(entryLiveUrl(model, broken)).toBeNull();
  });
});
