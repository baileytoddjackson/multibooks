import type { APIRequestContext } from "@playwright/test";
import { expect } from "./fixtures";

const seg = (text: string) => ({ text, summary: "So far.", choices: ["Go on", "Turn back"] });
const DAY = 24 * 60 * 60 * 1000;

/** Saves two books read as written, two adventures and a Create Your Own story to the account. */
export async function seedLibrary(request: APIRequestContext, baseURL: string) {
  const now = Date.now();
  const put = async (path: string, data: unknown) => {
    const res = await request.put(`${baseURL}${path}`, { data });
    expect(res.status(), await res.text()).toBe(204);
  };
  await put("/api/me/books/odyssey", {
    bookId: "odyssey",
    position: "c002p001",
    fraction: 0.25,
    wordsRead: 900,
    updatedAt: now - 2 * DAY,
  });
  await put("/api/me/books/alice", {
    bookId: "alice",
    position: "c001p001",
    fraction: 0.05,
    wordsRead: 100,
    updatedAt: now - 5 * DAY,
  });
  const adventure = (id: string, bookId: string, title: string, updatedAt: number) => ({
    id,
    kind: "adventure",
    bookId,
    title,
    segments: [seg("The adventure began."), seg("It went on.")],
    cast: [],
    style: "direct",
    branch: { chapter: 1, cpId: "cp01", optionId: "p1", choice: "Go", perspective: "narrator" },
    status: "active",
    createdAt: updatedAt,
    updatedAt,
  });
  await put(
    "/api/me/stories/11111111-aaaa-4aaa-8aaa-000000000001",
    adventure("11111111-aaaa-4aaa-8aaa-000000000001", "alice", "The Café Under the Hill", now),
  );
  await put(
    "/api/me/stories/11111111-aaaa-4aaa-8aaa-000000000002",
    adventure(
      "11111111-aaaa-4aaa-8aaa-000000000002",
      "moby-dick",
      "Ahab's Second Chance",
      now - DAY,
    ),
  );
  await put("/api/me/stories/11111111-aaaa-4aaa-8aaa-000000000003", {
    id: "11111111-aaaa-4aaa-8aaa-000000000003",
    title: "Mia and the Bell",
    genre: "mystery",
    setting: "A lighthouse",
    segments: [seg("Mia heard a bell.")],
    cast: [],
    style: "direct",
    status: "done",
    createdAt: now - 3 * DAY,
    updatedAt: now - 3 * DAY,
  });
}
