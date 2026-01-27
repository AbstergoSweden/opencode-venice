import { describe, test, expect, mock } from "bun:test";

// Mock Storage
const mockList = mock(async () => []);
const mockRead = mock(async () => ({}));

mock.module("@/storage/storage", () => {
  return {
    Storage: {
      list: mockList,
      read: mockRead,
    },
  };
});

// Mock Instance
mock.module("@/project/instance", () => {
    return {
        Instance: {
            project: {
                id: "test-project",
            }
        }
    }
});

// Import Session after mocking
import { Session } from "@/session";

describe("Session.children benchmark", () => {
  test("benchmark children retrieval", async () => {
    const sessionCount = 50;
    const readDelay = 10; // ms

    // Mock list to return 50 items
    const items = Array.from({ length: sessionCount }, (_, i) => ["session", "test-project", `session-${i}`]);
    mockList.mockImplementation(async () => items);

    // Mock read to delay
    mockRead.mockImplementation(async (key: string[]) => {
      await new Promise((resolve) => setTimeout(resolve, readDelay));
      // Return a dummy session info
      return {
        id: key[2],
        projectID: "test-project",
        directory: "/tmp",
        parentID: "ses_parentsessionid",
        title: "Test Session",
        version: "1.0.0",
        time: {
          created: Date.now(),
          updated: Date.now(),
        },
      };
    });

    const parentID = "ses_parentsessionid";

    const start = performance.now();
    const children = await Session.children(parentID);
    const end = performance.now();

    console.log(`\n\n[Benchmark] Session.children took ${(end - start).toFixed(2)}ms for ${sessionCount} sessions with ${readDelay}ms delay each.\n\n`);

    expect(children.length).toBe(sessionCount);
  });
});
